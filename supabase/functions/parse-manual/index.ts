import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constants for memory management
const PAGES_PER_BATCH = 10; // Process 10 pages at a time
const MAX_SPANS_PER_INSERT = 500; // Insert spans in batches
const SKIP_AI_FIGURE_DETECTION = true; // Skip AI calls to save memory/time

// Create default sections if extraction fails
function createDefaultSections(totalPages: number): any[] {
  const chapters = [
    "General Information", "Maintenance Schedule", "Engine",
    "Transmission", "Brakes", "Electrical System", "Diagnostics"
  ];
  
  return chapters.map((name, i) => ({
    section_name: name,
    first_page: Math.floor((i * totalPages) / chapters.length) + 1,
    page_count: Math.ceil(totalPages / chapters.length),
    heading_level: 1
  }));
}

// Extract sections from first few pages using AI (limited scope)
async function extractSections(tocText: string, totalPages: number): Promise<any[]> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey || tocText.length < 100) {
    return createDefaultSections(totalPages);
  }

  try {
    console.log(`Extracting sections from ${totalPages}-page manual...`);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite", // Use lite model for speed
        messages: [
          {
            role: "system",
            content: `Extract sections from this vehicle repair manual's table of contents. Return structured section data.`
          },
          {
            role: "user",
            content: `Table of Contents (manual has ${totalPages} pages):\n\n${tocText.substring(0, 3000)}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_sections",
            description: "Extract manual sections",
            parameters: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      section_name: { type: "string" },
                      first_page: { type: "integer", minimum: 1 },
                      page_count: { type: "integer", minimum: 1 },
                      heading_level: { type: "integer", minimum: 1, maximum: 3 }
                    },
                    required: ["section_name", "first_page", "page_count", "heading_level"]
                  }
                }
              },
              required: ["sections"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_sections" } }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const extracted = JSON.parse(toolCall.function.arguments);
        if (extracted.sections?.length > 0) {
          console.log(`✓ Extracted ${extracted.sections.length} sections`);
          return extracted.sections;
        }
      }
    }
  } catch (error) {
    console.error("Error extracting sections:", error);
  }
  
  return createDefaultSections(totalPages);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { manualId } = await req.json();
    
    if (!manualId) {
      throw new Error("Manual ID is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
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

    console.log("Starting manual parsing for:", manualId);

    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
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

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Clean up old data
    console.log("Cleaning up old data...");
    await Promise.all([
      supabaseService.from("manual_sections").delete().eq("manual_id", manualId),
      supabaseService.from("manual_chunks").delete().eq("manual_id", manualId),
      supabaseService.from("manual_spans").delete().eq("manual_id", manualId),
      supabaseService.from("manual_figures").delete().eq("manual_id", manualId),
      supabaseService.from("manual_tables").delete().eq("manual_id", manualId),
    ]);

    // Download file
    const { data: fileData, error: downloadError } = await supabaseService.storage
      .from("manuals")
      .download(manual.file_path);

    if (downloadError || !fileData) {
      throw new Error("Failed to download file");
    }

    const arrayBuffer = await fileData.arrayBuffer();
    
    // Calculate hash
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log("File hash:", sha256);

    let totalPages = 1;
    let tocText = "";

    if (manual.file_type === "application/pdf") {
      console.log("Parsing PDF with memory-efficient batching...");
      
      const pdfDoc = await getDocument(new Uint8Array(arrayBuffer)).promise;
      totalPages = pdfDoc.numPages;
      console.log(`PDF has ${totalPages} pages - processing in batches of ${PAGES_PER_BATCH}`);

      // First pass: Extract TOC from first few pages only
      const tocPages = Math.min(5, totalPages);
      for (let pageNum = 1; pageNum <= tocPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          textContent.items.forEach((item: any) => {
            if (item.str) tocText += item.str + " ";
          });
        } catch (e) {
          console.warn(`Error reading TOC page ${pageNum}:`, e);
        }
      }

      // Extract sections from TOC
      const sections = await extractSections(tocText, totalPages);
      
      // Insert sections
      if (sections.length > 0) {
        const sectionInserts = sections.map(s => ({
          manual_id: manualId,
          section_name: s.section_name,
          first_page: s.first_page,
          page_count: s.page_count,
          heading_level: s.heading_level
        }));
        await supabaseService.from("manual_sections").insert(sectionInserts);
        console.log(`✓ Inserted ${sections.length} sections`);
      }

      // Process pages in batches
      let totalSpans = 0;
      let totalChunks = 0;
      
      for (let batchStart = 1; batchStart <= totalPages; batchStart += PAGES_PER_BATCH) {
        const batchEnd = Math.min(batchStart + PAGES_PER_BATCH - 1, totalPages);
        console.log(`Processing pages ${batchStart}-${batchEnd}...`);
        
        const batchSpans: any[] = [];
        const batchChunks: any[] = [];
        
        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          try {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            const pageHeight = viewport.height;
            const pageWidth = viewport.width;
            
            let pageText = "";
            const pageSpanIds: string[] = [];
            
            textContent.items.forEach((item: any) => {
              if (item.str && item.str.trim().length > 0) {
                pageText += item.str + " ";
                
                // Create span with proper bbox
                const spanId = crypto.randomUUID();
                pageSpanIds.push(spanId);
                
                batchSpans.push({
                  id: spanId,
                  manual_id: manualId,
                  page_number: pageNum,
                  text: item.str.trim(),
                  bbox: item.transform ? {
                    x0: item.transform[4],
                    y0: pageHeight - item.transform[5] - (item.height || 12),
                    x1: item.transform[4] + (item.width || 50),
                    y1: pageHeight - item.transform[5],
                    page_width: pageWidth,
                    page_height: pageHeight
                  } : { x0: 0, y0: 0, x1: 0, y1: 0 },
                  font_name: item.fontName || "Default",
                  font_size: item.height || 12.0
                });
              }
            });
            
            // Create chunk for this page
            if (pageText.trim().length > 0) {
              batchChunks.push({
                manual_id: manualId,
                content: pageText.trim().substring(0, 4000), // Limit chunk size
                metadata: { page: pageNum, source: "pdf" },
                span_ids: pageSpanIds.slice(0, 100) // Limit span references
              });
            }
          } catch (pageError) {
            console.warn(`Error processing page ${pageNum}:`, pageError);
          }
        }
        
        // Insert batch spans (in sub-batches if needed)
        for (let i = 0; i < batchSpans.length; i += MAX_SPANS_PER_INSERT) {
          const spanBatch = batchSpans.slice(i, i + MAX_SPANS_PER_INSERT);
          const { error: spanError } = await supabaseService.from("manual_spans").insert(spanBatch);
          if (spanError) console.warn(`Span insert error:`, spanError.message);
        }
        totalSpans += batchSpans.length;
        
        // Insert batch chunks
        if (batchChunks.length > 0) {
          const { error: chunkError } = await supabaseService.from("manual_chunks").insert(batchChunks);
          if (chunkError) console.warn(`Chunk insert error:`, chunkError.message);
          totalChunks += batchChunks.length;
        }
        
        console.log(`✓ Batch complete: ${batchSpans.length} spans, ${batchChunks.length} chunks`);
      }
      
      console.log(`✓ Total: ${totalSpans} spans, ${totalChunks} chunks across ${totalPages} pages`);
    }

    // Update manual record
    await supabaseService
      .from("manuals")
      .update({
        sha256: sha256,
        total_pages: totalPages,
        updated_at: new Date().toISOString()
      })
      .eq("id", manualId);

    console.log("✓ Manual parsing complete!");

    return new Response(
      JSON.stringify({
        success: true,
        totalPages,
        sha256,
        message: `Parsed ${totalPages} pages successfully`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Parse error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
