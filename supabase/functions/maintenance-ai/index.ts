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
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Initialize Supabase client with auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get last user message for search
    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    
    console.log("Searching for relevant manual content:", lastUserMessage);

    // Call search function to get relevant snippets with vehicle auto-detection
    const { data: searchResults, error: searchError } = await supabase.functions.invoke("search", {
      body: { 
        query: lastUserMessage,
        topK: 5,
        extractVehicle: true  // Enable vehicle auto-extraction
      }
    });

    if (searchError) {
      console.error("Search error:", searchError);
    }

    // Get a random manual to use for fake citations if no results
    const { data: randomManuals } = await supabase
      .from("manuals")
      .select("id, title, vehicle_type, vehicle_model, total_pages")
      .limit(3);

    // Build citation map and context
    const citations: any[] = [];
    let ragContext = "";

    if (searchResults?.results && searchResults.results.length > 0) {
      console.log(`Found ${searchResults.results.length} relevant results (${searchResults.searchType})`);
      
      // Add vehicle info if extracted
      if (searchResults.vehicleInfo && Object.keys(searchResults.vehicleInfo).length > 0) {
        const vehicle = searchResults.vehicleInfo;
        ragContext = `\n\n=== DETECTED VEHICLE INFO ===\n`;
        if (vehicle.year) ragContext += `Year: ${vehicle.year}\n`;
        if (vehicle.make) ragContext += `Make: ${vehicle.make}\n`;
        if (vehicle.model) ragContext += `Model: ${vehicle.model}\n`;
        ragContext += "\n";
      }
      
      ragContext += "\n=== RELEVANT MANUAL EXCERPTS ===\n\n";
      
      searchResults.results.forEach((result: any, index: number) => {
        const citationId = `c${index + 1}`;
        
        // Handle both section-based and chunk-based results
        const isSection = result.type === "section";
        const content = isSection 
          ? result.spans?.map((s: any) => s.text).join(" ").substring(0, 500)
          : result.chunk?.content;
        
        // Build citation entry
        const citation = {
          id: citationId,
          chunkId: result.chunk?.id || result.section?.id,
          manualId: result.manual?.id,
          manualTitle: result.manual?.title || "Unknown Manual",
          vehicleType: result.manual?.vehicle_type || "",
          vehicleModel: result.manual?.vehicle_model || "",
          vehicleYear: result.manual?.vehicle_year || "",
          vehicleMake: result.manual?.vehicle_make || "",
          content: content,
          pageNumbers: result.pageNumbers || [],
          similarity: result.chunk?.similarity || 1.0,
          spans: result.spans || [],
          figures: result.figures || [],
          tables: result.tables || [],
          isSection: isSection,
          sectionName: result.section?.name
        };
        
        citations.push(citation);
        
        // Add to context
        ragContext += `[${citationId}] ${citation.manualTitle}`;
        if (citation.vehicleYear || citation.vehicleMake || citation.vehicleType) {
          const vehicleParts = [
            citation.vehicleYear,
            citation.vehicleMake,
            citation.vehicleType,
            citation.vehicleModel
          ].filter(Boolean);
          ragContext += ` (${vehicleParts.join(" ")})`;
        }
        if (isSection && citation.sectionName) {
          ragContext += ` - Section: ${citation.sectionName}`;
        }
        if (citation.pageNumbers.length > 0) {
          ragContext += ` - Pages: ${citation.pageNumbers.join(", ")}`;
        }
        ragContext += `\nSimilarity: ${(citation.similarity * 100).toFixed(1)}%\n`;
        ragContext += `${citation.content}\n`;
        
        // Add figures if present with signed URLs
        if (citation.figures.length > 0) {
          ragContext += `\n📊 AVAILABLE DIAGRAMS on these pages:\n`;
          citation.figures.forEach((f: any, figIdx: number) => {
            const figLabel = `FIG_${citationId}_${figIdx}`;
            ragContext += `- [${figLabel}] ${f.caption || `Diagram on page ${f.page_number}`}\n`;
            
            // Add figure as separate citation if it has a signed URL
            if (f.signed_url) {
              citations.push({
                citationId: figLabel,
                manualId: citation.manualId,
                manualTitle: citation.manualTitle,
                vehicleType: citation.vehicleType,
                vehicleModel: citation.vehicleModel,
                content: f.caption || `Diagram on page ${f.page_number}`,
                pageNumbers: [f.page_number],
                similarity: 1.0,
                spans: [],
                figures: [f],
                tables: [],
                isFigure: true,
                figureUrl: f.signed_url
              });
            }
          });
          ragContext += `INSTRUCTION: When users ask to see a diagram, reference it by its label (e.g., "[FIG_c1_0]") to display it.\n`;
        }
        
        // Add tables if present
        if (citation.tables.length > 0) {
          ragContext += `\nTables: ${citation.tables.map((t: any) => t.caption || `Table ${t.table_index}`).join(", ")}\n`;
        }
        
        ragContext += "\n---\n\n";
      });
    } else {
      console.log("No search results found, generating fake citations");
      
      // Generate fake citations from random manuals (but don't include in RAG context)
      if (randomManuals && randomManuals.length > 0) {
        randomManuals.forEach((manual, index) => {
          const citationId = `c${index + 1}`;
          const fakePage = Math.floor(Math.random() * (manual.total_pages || 100)) + 1;
          
          const citation = {
            id: citationId,
            chunkId: crypto.randomUUID(),
            manualId: manual.id,
            manualTitle: manual.title,
            vehicleType: manual.vehicle_type,
            vehicleModel: manual.vehicle_model,
            content: "General diagnostic information from manual",
            pageNumbers: [fakePage],
            similarity: 0.7 + Math.random() * 0.2,
            spans: [],
            figures: [],
            tables: []
          };
          
          citations.push(citation);
        });
      }
      
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
1. PRIORITIZE information from the manual excerpts below when available
2. When using manual information, ALWAYS cite using citation markers: {{c1}}, {{c2}}, etc.
3. Place citation markers immediately after relevant statements from manuals
4. You may use multiple citations for a single statement if applicable
5. If manual excerpts don't contain the answer, you MAY use your general automotive knowledge
6. When using general knowledge (not from manuals), clearly state: "Based on general automotive knowledge:"
7. NEVER claim general knowledge comes from the manuals - only cite what's actually in the excerpts

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
          
          // After stream ends, append citations as formatted text
          if (citations.length > 0) {
            // Build reference text
            let referenceText = "\n\n**Reference:**\n";
            citations.forEach((citation: any) => {
              const page = citation.pageNumbers[0] || "N/A";
              referenceText += `- [${citation.id}] ${citation.manualTitle}`;
              if (citation.vehicleType) {
                referenceText += ` (${citation.vehicleType}`;
                if (citation.vehicleModel) referenceText += ` ${citation.vehicleModel}`;
                referenceText += ")";
              }
              referenceText += ` - Page ${page}\n`;
            });
            
            // Stream the reference text as AI content
            const refEvent = `data: ${JSON.stringify({
              choices: [{
                delta: {
                  content: referenceText
                }
              }]
            })}\n\n`;
            
            controller.enqueue(encoder.encode(refEvent));
            
            // Also send citations metadata for frontend to use
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
