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
    const { path } = await req.json();
    
    if (!path) {
      throw new Error("Path is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Generating signed URL for:", path);

    // Generate a signed URL valid for 10 minutes (600 seconds)
    const { data, error } = await supabase.storage
      .from("manuals")
      .createSignedUrl(path, 600);

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
        path
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
