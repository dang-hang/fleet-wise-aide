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

    // Use full-text search on manual_chunks content
    let queryBuilder = supabase
      .from("manual_chunks")
      .select(`
        id,
        content,
        metadata,
        manual_id,
        span_ids,
        manuals!inner(user_id, title, vehicle_type, vehicle_model)
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

    const { data: matchedChunks, error: searchError } = await queryBuilder;

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

        // Generate signed URLs for figures that have storage paths
        const figuresWithUrls = await Promise.all(
          (figures || []).map(async (figure: any) => {
            if (figure.storage_path) {
              const { data: signedUrlData } = await supabase.storage
                .from("manuals")
                .createSignedUrl(figure.storage_path, 3600); // 1 hour expiry
              
              return {
                ...figure,
                signed_url: signedUrlData?.signedUrl || null
              };
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
          chunk: {
            id: chunk.id,
            content: chunk.content,
            similarity: 1.0, // Full-text search doesn't provide similarity score
            metadata: chunk.metadata
          },
          manual: {
            id: chunk.manual_id,
            title: chunk.manuals.title,
            vehicle_type: chunk.manuals.vehicle_type,
            vehicle_model: chunk.manuals.vehicle_model
          },
          spans: spans || [],
          figures: figuresWithUrls,
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
