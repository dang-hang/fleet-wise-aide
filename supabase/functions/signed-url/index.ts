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

    const body = await req.json();
    const { manualId, path } = body;
    
    if (!manualId && !path) {
      throw new Error("manualId or path is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Validate user authentication
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filePath = path;

    // If manualId provided, look up the file path
    if (manualId) {
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
      const { data: manual, error: manualError } = await supabaseService
        .from("manuals")
        .select("file_path, user_id")
        .eq("id", manualId)
        .single();

      if (manualError || !manual) {
        return new Response(JSON.stringify({ error: "Manual not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify ownership
      if (manual.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      filePath = manual.file_path;
    } else {
      // Validate that the path belongs to the authenticated user
      const pathUserId = path.split('/')[0];
      if (pathUserId !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("Generating signed URL for:", filePath);

    // Use service client for storage operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a signed URL valid for 10 minutes (600 seconds)
    const { data, error } = await supabaseService.storage
      .from("manuals")
      .createSignedUrl(filePath, 600);

    if (error) {
      console.error("Error creating signed URL:", error);
      throw error;
    }

    if (!data || !data.signedUrl) {
      throw new Error("Failed to generate signed URL");
    }

    console.log("Successfully generated signed URL");

    return new Response(
      JSON.stringify({
        success: true,
        signedUrl: data.signedUrl,
        expiresIn: 600,
        path: filePath
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in signed-url function:", error);
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
