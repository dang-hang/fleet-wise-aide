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

    // Get last user message for search
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    
    console.log("Searching for relevant manual content:", lastUserMessage);

    // Call search function to get relevant snippets
    const { data: searchResults, error: searchError } = await supabase.functions.invoke("search", {
      body: { 
        query: lastUserMessage,
        topK: 5
      }
    });

    if (searchError) {
      console.error("Search error:", searchError);
    }

    // Build citation map and context
    const citations: any[] = [];
    let ragContext = "";

    if (searchResults?.results && searchResults.results.length > 0) {
      console.log(`Found ${searchResults.results.length} relevant chunks`);
      
      ragContext = "\n\n=== RELEVANT MANUAL EXCERPTS ===\n\n";
      
      searchResults.results.forEach((result: any, index: number) => {
        const citationId = `c${index + 1}`;
        
        // Build citation entry
        const citation = {
          id: citationId,
          chunkId: result.chunk.id,
          manualId: result.chunk.metadata?.manual_id || result.manual?.id,
          manualTitle: result.manual?.title || "Unknown Manual",
          vehicleType: result.manual?.vehicle_type || "",
          vehicleModel: result.manual?.vehicle_model || "",
          content: result.chunk.content,
          pageNumbers: result.pageNumbers || [],
          similarity: result.chunk.similarity,
          spans: result.spans || [],
          figures: result.figures || [],
          tables: result.tables || []
        };
        
        citations.push(citation);
        
        // Add to context
        ragContext += `[${citationId}] ${citation.manualTitle}`;
        if (citation.vehicleType) {
          ragContext += ` (${citation.vehicleType}`;
          if (citation.vehicleModel) ragContext += ` ${citation.vehicleModel}`;
          ragContext += ")";
        }
        if (citation.pageNumbers.length > 0) {
          ragContext += ` - Pages: ${citation.pageNumbers.join(", ")}`;
        }
        ragContext += `\nSimilarity: ${(citation.similarity * 100).toFixed(1)}%\n`;
        ragContext += `${citation.content}\n`;
        
        // Add figures if present
        if (citation.figures.length > 0) {
          ragContext += `\nFigures: ${citation.figures.map((f: any) => f.caption || `Figure ${f.figure_index}`).join(", ")}\n`;
        }
        
        // Add tables if present
        if (citation.tables.length > 0) {
          ragContext += `\nTables: ${citation.tables.map((t: any) => t.caption || `Table ${t.table_index}`).join(", ")}\n`;
        }
        
        ragContext += "\n---\n\n";
      });
    } else {
      console.log("No search results found");
      ragContext = "\n\n=== NO RELEVANT MANUAL EXCERPTS FOUND ===\nProvide general guidance based on standard automotive repair practices.\n\n";
    }

    const systemPrompt = `You are an expert vehicle maintenance assistant for the PASCO Sheriff Office fleet. You specialize in:
- Diagnosing vehicle issues
- Providing step-by-step repair instructions
- Explaining maintenance procedures
- Recommending preventive maintenance schedules
- Safety protocols for fleet vehicles
- Common issues with police vehicles (Crown Victoria, Tahoe, Charger, F-150, Silverado, Explorer)

CRITICAL INSTRUCTIONS:
1. Use ONLY the information provided in the manual excerpts below
2. When referencing information, cite using citation markers: {{c1}}, {{c2}}, etc.
3. Place citation markers immediately after the relevant statement
4. You may use multiple citations for a single statement if applicable
5. Do NOT make up information not present in the excerpts
6. If the excerpts don't contain enough information, say so explicitly

${ragContext}

RESPONSE FORMAT:
- Provide clear, actionable guidance
- Include: safety precautions, required tools, step-by-step instructions, common mistakes, expected time
- Always cite your sources using {{c#}} markers
- Example: "The recommended oil change interval is 5,000 miles {{c1}}. Use 5W-30 synthetic oil {{c2}}."

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

    // Stream the response and append citations at the end
    const reader = response.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        if (!reader) return;
        
        try {
          let done = false;
          
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            
            if (value) {
              // Forward the chunk as-is
              controller.enqueue(value);
            }
          }
          
          // After stream ends, append citations as a special SSE event
          if (citations.length > 0) {
            const citationsEvent = `data: ${JSON.stringify({
              choices: [{
                delta: {
                  content: "",
                  citations: citations
                }
              }]
            })}\n\n`;
            
            controller.enqueue(encoder.encode(citationsEvent));
          }
          
          // Send final [DONE]
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Streaming error:", error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
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
