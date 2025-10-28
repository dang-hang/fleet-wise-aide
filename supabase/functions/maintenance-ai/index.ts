import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract vehicle information from the first user message
    let vehicleContext = "";
    const firstMessage = messages.find((m: any) => m.role === "user")?.content || "";
    
    // Try to extract vehicle make/model from the message
    const vehicleMatch = firstMessage.match(/Vehicle:\s*(\d+)\s+([A-Za-z]+)\s+([A-Za-z\s]+)/);
    
    if (vehicleMatch) {
      const [, year, make, model] = vehicleMatch;
      console.log(`Searching for manuals: ${make} ${model}`);
      
      // Query relevant manuals from the database
      const { data: manuals, error } = await supabase
        .from("manuals")
        .select("*")
        .or(`vehicle_type.ilike.%${make}%,vehicle_model.ilike.%${model}%`)
        .limit(5);

      if (!error && manuals && manuals.length > 0) {
        vehicleContext = "\n\nRELEVANT REPAIR MANUALS IN DATABASE:\n";
        
        // Get page content for each manual
        for (const manual of manuals) {
          vehicleContext += `\n--- ${manual.title} (${manual.vehicle_type}${manual.vehicle_model ? ' - ' + manual.vehicle_model : ''})`;
          if (manual.year_range) {
            vehicleContext += ` [Years: ${manual.year_range}]`;
          }
          vehicleContext += " ---\n";
          
          // Get pages for this manual
          const { data: pages } = await supabase
            .from("manual_pages")
            .select("page_number, content")
            .eq("manual_id", manual.id)
            .order("page_number")
            .limit(10); // Limit to first 10 pages to avoid token limits
          
          if (pages && pages.length > 0) {
            for (const page of pages) {
              vehicleContext += `[Page ${page.page_number}]\n${page.content.substring(0, 500)}...\n\n`;
            }
          } else if (manual.parsed_content) {
            vehicleContext += `${manual.parsed_content.substring(0, 1000)}...\n\n`;
          }
        }
        
        vehicleContext += "\nIMPORTANT: When referencing information from these manuals, ALWAYS cite the specific document name and page number (e.g., 'According to Ford Crown Victoria Service Manual, Page 3...').\n";
        console.log("Found manuals with content:", manuals.length);
      } else {
        console.log("No manuals found or error:", error);
      }
    }

    const systemPrompt = `You are an expert vehicle maintenance assistant for the PASCO Sheriff Office fleet. You specialize in:
- Diagnosing vehicle issues
- Providing step-by-step repair instructions
- Explaining maintenance procedures
- Recommending preventive maintenance schedules
- Safety protocols for fleet vehicles
- Common issues with police vehicles (Crown Victoria, Tahoe, Charger, F-150, Silverado, Explorer)
${vehicleContext}
Always provide clear, actionable guidance. When discussing repairs, include:
1. Safety precautions
2. Required tools
3. Step-by-step instructions
4. Common mistakes to avoid
5. Expected time to complete

CRITICAL: When you use information from the repair manuals provided above, you MUST cite your sources by mentioning:
1. The exact manual name (e.g., "Ford Crown Victoria Service Manual")
2. The specific page number where you found the information (e.g., "Page 5")

Example: "According to the Ford Crown Victoria Service Manual (Page 5), the recommended oil change interval is..."

Be concise but thorough. If you need more information to provide accurate guidance, ask specific questions.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Error in maintenance-ai function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
