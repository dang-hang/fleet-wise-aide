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
    const { manualId } = await req.json();
    
    if (!manualId) {
      throw new Error("Manual ID is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get manual details
    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
      .eq("id", manualId)
      .single();

    if (manualError || !manual) {
      throw new Error("Manual not found");
    }

    console.log("Processing manual:", manual.title);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("manuals")
      .download(manual.file_path);

    if (downloadError || !fileData) {
      throw new Error("Failed to download file");
    }

    // For PDF files, we'll extract text content
    // For other files, we'll store them as single page
    let parsedContent = "";
    let totalPages = 1;
    const pages: Array<{ page_number: number; content: string }> = [];

    if (manual.file_type === "application/pdf") {
      // Note: In a production environment, you would use a PDF parsing library
      // For now, we'll store a placeholder that indicates manual review is needed
      parsedContent = `Document: ${manual.title}\nType: PDF\nNote: PDF content extraction requires manual processing or specialized tools.`;
      pages.push({
        page_number: 1,
        content: parsedContent
      });
    } else if (manual.file_type === "text/plain") {
      // For text files, read the content directly
      const text = await fileData.text();
      parsedContent = text;
      
      // Split into pages (every 2000 characters as a "page")
      const chunkSize = 2000;
      for (let i = 0; i < text.length; i += chunkSize) {
        pages.push({
          page_number: Math.floor(i / chunkSize) + 1,
          content: text.slice(i, i + chunkSize)
        });
      }
      totalPages = pages.length;
    } else if (manual.file_type.startsWith("image/")) {
      parsedContent = `Document: ${manual.title}\nType: Image\nNote: Image content requires OCR for text extraction.`;
      pages.push({
        page_number: 1,
        content: parsedContent
      });
    } else {
      parsedContent = `Document: ${manual.title}\nType: ${manual.file_type}\nNote: This file type requires specialized processing.`;
      pages.push({
        page_number: 1,
        content: parsedContent
      });
    }

    // Update manual with parsed content
    const { error: updateError } = await supabase
      .from("manuals")
      .update({
        parsed_content: parsedContent,
        total_pages: totalPages
      })
      .eq("id", manualId);

    if (updateError) {
      console.error("Error updating manual:", updateError);
    }

    // Insert page data
    if (pages.length > 0) {
      const { error: pagesError } = await supabase
        .from("manual_pages")
        .insert(
          pages.map(page => ({
            manual_id: manualId,
            page_number: page.page_number,
            content: page.content
          }))
        );

      if (pagesError) {
        console.error("Error inserting pages:", pagesError);
      }
    }

    console.log(`Successfully parsed ${totalPages} pages from manual`);

    return new Response(
      JSON.stringify({
        success: true,
        totalPages,
        message: "Manual parsed successfully"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in parse-manual function:", error);
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
