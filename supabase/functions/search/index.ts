import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Vehicle extraction with Lovable AI
async function extractVehicleInfo(query: string): Promise<{ year?: string; make?: string; model?: string }> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    console.warn("LOVABLE_API_KEY not found, skipping vehicle extraction");
    return {};
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Extract vehicle year, make, and model from the query. Return ONLY a JSON object with 'year', 'make', 'model' fields. If a field is not mentioned, omit it. Examples: '2023 Tahoe oil change' -> {\"year\":\"2023\",\"make\":\"Chevrolet\",\"model\":\"Tahoe\"}, 'F-150 brake replacement' -> {\"make\":\"Ford\",\"model\":\"F-150\"}"
          },
          { role: "user", content: query }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_vehicle",
            description: "Extract vehicle information",
            parameters: {
              type: "object",
              properties: {
                year: { type: "string" },
                make: { type: "string" },
                model: { type: "string" }
              },
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_vehicle" } }
      }),
    });

    if (!response.ok) {
      console.error("Vehicle extraction failed:", response.status);
      return {};
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const extracted = JSON.parse(toolCall.function.arguments);
      console.log("Extracted vehicle info:", extracted);
      return extracted;
    }
  } catch (error) {
    console.error("Error extracting vehicle info:", error);
  }
  
  return {};
}

// Search sections by vehicle and query
async function searchSections(supabase: any, vehicleInfo: any, query: string, userId: string) {
  let sectionQuery = supabase
    .from("manual_sections")
    .select(`
      id,
      section_name,
      first_page,
      page_count,
      heading_level,
      manuals!inner(id, title, vehicle_year, vehicle_make, vehicle_model, user_id)
    `)
    .eq("manuals.user_id", userId)
    .limit(5);

  // Apply vehicle filters
  if (vehicleInfo.year) {
    sectionQuery = sectionQuery.eq("manuals.vehicle_year", vehicleInfo.year);
  }
  if (vehicleInfo.make) {
    sectionQuery = sectionQuery.ilike("manuals.vehicle_make", `%${vehicleInfo.make}%`);
  }
  if (vehicleInfo.model) {
    sectionQuery = sectionQuery.ilike("manuals.vehicle_model", `%${vehicleInfo.model}%`);
  }

  const { data: sections, error } = await sectionQuery;
  
  if (error) {
    console.error("Section search error:", error);
    return [];
  }

  // Filter sections by query keywords
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const filtered = (sections || []).filter((sec: any) => {
    const sectionText = sec.section_name.toLowerCase();
    return queryTerms.some(term => sectionText.includes(term));
  });

  return filtered.slice(0, 3);
}

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

    const { query, manualId, topK = 5, extractVehicle = true } = await req.json();
    
    if (!query) {
      throw new Error("Query is required");
    }

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

    // If manualId is provided, verify ownership
    if (manualId) {
      const { data: manual, error: manualError } = await supabase
        .from("manuals")
        .select("user_id")
        .eq("id", manualId)
        .single();

      if (manualError || !manual) {
        return new Response(JSON.stringify({ error: "Manual not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (manual.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("Searching for:", query, "in manual:", manualId || "all");

    // Step 1: Extract vehicle info from query (if enabled)
    let vehicleInfo: any = {};
    if (extractVehicle && !manualId) {
      vehicleInfo = await extractVehicleInfo(query);
      console.log("Vehicle info extracted:", vehicleInfo);
    }

    // Step 2: Try section-based retrieval first (hybrid approach)
    let enrichedResults: any[] = [];
    
    if (Object.keys(vehicleInfo).length > 0 || manualId) {
      console.log("Attempting section-based retrieval...");
      const sections = await searchSections(supabase, vehicleInfo, query, user.id);
      
      if (sections.length > 0) {
        console.log(`Found ${sections.length} relevant sections`);
        
        // Enrich sections with content from those page ranges
        for (const section of sections) {
          const pageRange = Array.from(
            { length: section.page_count },
            (_, i) => section.first_page + i
          );

          // Get spans from those pages
          const { data: spans } = await supabase
            .from("manual_spans")
            .select("*")
            .eq("manual_id", section.manuals.id)
            .in("page_number", pageRange)
            .order("page_number", { ascending: true })
            .limit(50);

          // Get figures from those pages
          const { data: figures } = await supabase
            .from("manual_figures")
            .select("*")
            .eq("manual_id", section.manuals.id)
            .in("page_number", pageRange);

          // Generate signed URLs for figures
          const figuresWithUrls = await Promise.all(
            (figures || []).map(async (figure: any) => {
              if (figure.storage_path) {
                const { data: signedUrlData } = await supabase.storage
                  .from("manuals")
                  .createSignedUrl(figure.storage_path, 3600);
                return { ...figure, signed_url: signedUrlData?.signedUrl || null };
              }
              return figure;
            })
          );

          enrichedResults.push({
            type: "section",
            section: {
              id: section.id,
              name: section.section_name,
              first_page: section.first_page,
              page_count: section.page_count,
              heading_level: section.heading_level
            },
            manual: {
              id: section.manuals.id,
              title: section.manuals.title,
              vehicle_year: section.manuals.vehicle_year,
              vehicle_make: section.manuals.vehicle_make,
              vehicle_model: section.manuals.vehicle_model
            },
            spans: spans || [],
            figures: figuresWithUrls,
            pageNumbers: pageRange
          });
        }
      }
    }

    // Step 3: Fall back to full-text search if no section results
    if (enrichedResults.length === 0) {
      console.log("Falling back to full-text search on chunks...");
      
      let queryBuilder = supabase
        .from("manual_chunks")
        .select(`
          id,
          content,
          metadata,
          manual_id,
          span_ids,
          manuals!inner(user_id, title, vehicle_type, vehicle_model, vehicle_year, vehicle_make)
        `)
        .eq("manuals.user_id", user.id)
        .textSearch("content", query.split(/\s+/).join(" | "), {
          type: "websearch",
          config: "english"
        })
        .limit(topK);

      if (manualId) {
        queryBuilder = queryBuilder.eq("manual_id", manualId);
      }

      // Apply vehicle filters if extracted
      if (vehicleInfo.year) {
        queryBuilder = queryBuilder.eq("manuals.vehicle_year", vehicleInfo.year);
      }
      if (vehicleInfo.make) {
        queryBuilder = queryBuilder.ilike("manuals.vehicle_make", `%${vehicleInfo.make}%`);
      }
      if (vehicleInfo.model) {
        queryBuilder = queryBuilder.ilike("manuals.vehicle_model", `%${vehicleInfo.model}%`);
      }

      const { data: matchedChunks, error: searchError } = await queryBuilder;

      if (searchError) {
        console.error("Search error:", searchError);
        throw searchError;
      }

      console.log(`Found ${matchedChunks?.length || 0} matching chunks`);

      // Enrich chunk results with spans, figures, and tables
      enrichedResults = await Promise.all(
        (matchedChunks || []).map(async (chunk: any) => {
          // Fetch spans for this chunk
          const { data: spans } = await supabase
            .from("manual_spans")
            .select("*")
            .in("id", chunk.span_ids || [])
            .order("page_number", { ascending: true });

          // Get page numbers from spans
          const pageNumbers = spans ? [...new Set(spans.map((s: any) => s.page_number))] : [];

          // Fetch figures on those pages
          const { data: figures } = await supabase
            .from("manual_figures")
            .select("*")
            .eq("manual_id", chunk.manual_id)
            .in("page_number", pageNumbers.length > 0 ? pageNumbers : [0]);

          // Generate signed URLs for figures
          const figuresWithUrls = await Promise.all(
            (figures || []).map(async (figure: any) => {
              if (figure.storage_path) {
                const { data: signedUrlData } = await supabase.storage
                  .from("manuals")
                  .createSignedUrl(figure.storage_path, 3600);
                return { ...figure, signed_url: signedUrlData?.signedUrl || null };
              }
              return figure;
            })
          );

          // Fetch tables on those pages
          const { data: tables } = await supabase
            .from("manual_tables")
            .select("*")
            .eq("manual_id", chunk.manual_id)
            .in("page_number", pageNumbers.length > 0 ? pageNumbers : [0]);

          return {
            type: "chunk",
            chunk: {
              id: chunk.id,
              content: chunk.content,
              similarity: 1.0,
              metadata: chunk.metadata
            },
            manual: {
              id: chunk.manual_id,
              title: chunk.manuals.title,
              vehicle_type: chunk.manuals.vehicle_type,
              vehicle_model: chunk.manuals.vehicle_model,
              vehicle_year: chunk.manuals.vehicle_year,
              vehicle_make: chunk.manuals.vehicle_make
            },
            spans: spans || [],
            figures: figuresWithUrls,
            tables: tables || [],
            pageNumbers
          };
        })
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        query,
        vehicleInfo,
        results: enrichedResults,
        count: enrichedResults.length,
        searchType: enrichedResults[0]?.type || "none"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in search function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
