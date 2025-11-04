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

    const { query, manualId, topK = 5 } = await req.json();
    
    if (!query) {
      throw new Error("Query is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
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

    // Generate embedding for the query using Lovable AI
    const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: query,
        model: "google/gemini-2.5-flash"
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error("Embedding API error:", embeddingResponse.status, errorText);
      throw new Error("Failed to generate query embedding");
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    console.log("Generated embedding, dimensions:", queryEmbedding.length);

    // Search using match_chunks function
    const { data: matchedChunks, error: searchError } = await supabase
      .rpc("match_chunks", {
        query_embedding: queryEmbedding,
        match_count: topK,
        manual_filter: manualId || null
      });

    if (searchError) {
      console.error("Search error:", searchError);
      throw searchError;
    }

    console.log(`Found ${matchedChunks?.length || 0} matching chunks`);

    // Enrich results with spans, figures, and tables
    const enrichedResults = await Promise.all(
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

        // Fetch tables on those pages
        const { data: tables } = await supabase
          .from("manual_tables")
          .select("*")
          .eq("manual_id", chunk.manual_id)
          .in("page_number", pageNumbers.length > 0 ? pageNumbers : [0]);

        // Get manual info
        const { data: manual } = await supabase
          .from("manuals")
          .select("title, vehicle_type, vehicle_model")
          .eq("id", chunk.manual_id)
          .single();

        return {
          chunk: {
            id: chunk.id,
            content: chunk.content,
            similarity: chunk.similarity,
            metadata: chunk.metadata
          },
          manual: manual || null,
          spans: spans || [],
          figures: figures || [],
          tables: tables || [],
          pageNumbers
        };
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        query,
        results: enrichedResults,
        count: enrichedResults.length
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
