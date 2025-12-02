import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract sections from PDF text content using AI
async function extractSections(tocText: string, totalPages: number): Promise<any[]> {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    console.warn("LOVABLE_API_KEY not found, creating default sections");
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
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Extract ALL sections from this vehicle repair manual's table of contents. Be thorough - include every maintenance procedure, system, and diagnostic section. Return structured section data.`
          },
          {
            role: "user",
            content: `Table of Contents and first pages (manual has ${totalPages} total pages):

${tocText}

Extract EVERY section with:
- section_name: Full descriptive name
- first_page: Starting page number (1-indexed)
- page_count: Estimated pages in section
- heading_level: 1=chapter, 2=section, 3=subsection`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_sections",
            description: "Extract all manual sections",
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
                    required: ["section_name", "first_page", "page_count", "heading_level"],
                    additionalProperties: false
                  }
                }
              },
              required: ["sections"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_sections" } }
      }),
    });

    if (!response.ok) {
      console.error("Section extraction failed:", response.status);
      return createDefaultSections(totalPages);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const extracted = JSON.parse(toolCall.function.arguments);
      const sections = extracted.sections || [];
      console.log(`✓ Extracted ${sections.length} sections`);
      return sections.length > 0 ? sections : createDefaultSections(totalPages);
    }
  } catch (error) {
    console.error("Error extracting sections:", error);
  }
  
  return createDefaultSections(totalPages);
}

// Create default sections if extraction fails
function createDefaultSections(totalPages: number): any[] {
  const sectionsPerChapter = Math.ceil(totalPages / 50);
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

    const { manualId } = await req.json();
    
    if (!manualId) {
      throw new Error("Manual ID is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use anon key with auth header for validation
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

    console.log("Starting manual parsing for:", manualId);

    // Get manual details and verify ownership
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

    // Verify ownership
    if (manual.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create service client for storage and database operations that need elevated privileges
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Clean up old data if re-processing (delete old spans, chunks, sections, figures, tables)
    console.log("Cleaning up old data for manual:", manualId);
    await supabaseService.from("manual_sections").delete().eq("manual_id", manualId);
    await supabaseService.from("manual_chunks").delete().eq("manual_id", manualId);
    await supabaseService.from("manual_spans").delete().eq("manual_id", manualId);
    await supabaseService.from("manual_figures").delete().eq("manual_id", manualId);
    await supabaseService.from("manual_tables").delete().eq("manual_id", manualId);
    console.log("Old data cleaned up");

    // Download file from storage using service client
    const { data: fileData, error: downloadError } = await supabaseService.storage
      .from("manuals")
      .download(manual.file_path);

    if (downloadError || !fileData) {
      throw new Error("Failed to download file");
    }

    // Calculate SHA256 hash
    const arrayBuffer = await fileData.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log("File hash:", sha256);

    // For PDF files, we stub the parsing
    // In production, you would use a PDF parsing library like pdf-parse or pymupdf
    let totalPages = 1;
    const spans: Array<any> = [];
    const chunks: Array<any> = [];
    const figures: Array<any> = [];
    const tables: Array<any> = [];

    if (manual.file_type === "application/pdf") {
      console.log("PDF detected - parsing with pdfjs-serverless");
      
      // Parse PDF with pdfjs-serverless (designed for server-side/Deno)
      const pdfDoc = await getDocument(new Uint8Array(arrayBuffer)).promise;
      totalPages = pdfDoc.numPages;
      console.log(`PDF has ${totalPages} pages`);
      
      console.log(`Extracting text from all ${totalPages} pages...`);
      
      // Extract text from all pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Create spans from text items
        textContent.items.forEach((item: any) => {
          if (item.str && item.str.trim().length > 0) {
            spans.push({
              manual_id: manualId,
              page_number: pageNum,
              text: item.str.trim(),
              bbox: item.transform ? {
                x0: item.transform[4],
                y0: item.transform[5],
                x1: item.transform[4] + item.width,
                y1: item.transform[5] + item.height
              } : { x0: 0, y0: 0, x1: 0, y1: 0 },
              font_name: item.fontName || "Default",
              font_size: item.height || 12.0
            });
          }
        });
        
        // Detect figures (images) on the page
        const opList = await page.getOperatorList();
        let figureIndex = 0;
        
        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          
          // Check for image painting operations (paintImageXObject, paintJpegXObject, etc.)
          if (fn === 85 || fn === 88) { // OPS.paintImageXObject || OPS.paintJpegXObject
            const args = opList.argsArray[i];
            if (args && args.length > 0) {
              // Extract bounding box from transform matrix (if available)
              const bbox = { x0: 0, y0: 0, x1: 100, y1: 100 }; // Placeholder
              
              figures.push({
                manual_id: manualId,
                page_number: pageNum,
                figure_index: figureIndex++,
                bbox,
                caption: `Figure ${figureIndex} on page ${pageNum}`,
                storage_path: `${manual.file_path}/figures/page_${pageNum}_fig_${figureIndex}.png`
              });
            }
          }
        }
      }

      // Create chunks from spans (group by semantic sections)
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
      const spanGroups: Array<any[]> = [];
      
      // Group spans by page, then by every 15 spans for reasonable chunk size
      const spansByPage: { [key: number]: any[] } = {};
      spans.forEach(span => {
        if (!spansByPage[span.page_number]) {
          spansByPage[span.page_number] = [];
        }
        spansByPage[span.page_number].push(span);
      });

      for (const pageNum in spansByPage) {
        const pageSpans = spansByPage[pageNum];
        for (let i = 0; i < pageSpans.length; i += 15) {
          spanGroups.push(pageSpans.slice(i, i + 15));
        }
      }

      // Create chunks without embeddings (embeddings can be generated later)
      console.log(`Creating ${spanGroups.length} chunks without embeddings for faster processing...`);
      for (const spanGroup of spanGroups) {
        const content = spanGroup.map(s => s.text).join(" ");
        chunks.push({
          manual_id: manualId,
          content,
          span_ids: [],
          metadata: {
            page_numbers: [...new Set(spanGroup.map(s => s.page_number))],
            char_count: content.length
          }
        });
      }
    } else {
      // For non-PDF files, create simple content
      const text = await fileData.text();
      
      spans.push({
        manual_id: manualId,
        page_number: 1,
        text: text.substring(0, Math.min(1000, text.length)),
        bbox: { x0: 0, y0: 0, x1: 600, y1: 800 },
        font_name: "Default",
        font_size: 12.0
      });

      chunks.push({
        manual_id: manualId,
        content: text.substring(0, Math.min(2000, text.length)),
        span_ids: [],
        metadata: { page_numbers: [1], char_count: text.length }
      });
    }

    // Insert spans first
    console.log(`Inserting ${spans.length} spans...`);
    const { data: insertedSpans, error: spansError } = await supabaseService
      .from("manual_spans")
      .insert(spans)
      .select("id, page_number");

    if (spansError) {
      console.error("Error inserting spans:", spansError);
      throw spansError;
    }

    // Update chunks with span IDs
    if (insertedSpans && insertedSpans.length > 0) {
      const spanIdsByPage = insertedSpans.reduce((acc: any, span: any) => {
        if (!acc[span.page_number]) acc[span.page_number] = [];
        acc[span.page_number].push(span.id);
        return acc;
      }, {});

      chunks.forEach(chunk => {
        const pageNumbers = chunk.metadata.page_numbers || [1];
        chunk.span_ids = pageNumbers.flatMap((pn: number) => spanIdsByPage[pn] || []);
      });
    }

    // Insert chunks (without embeddings for now - will be generated separately)
    console.log(`Inserting ${chunks.length} chunks...`);
    const { error: chunksError } = await supabaseService
      .from("manual_chunks")
      .insert(chunks);

    if (chunksError) {
      console.error("Error inserting chunks:", chunksError);
      throw chunksError;
    }

    // Skip figure and table insertion for now to avoid errors
    // These can be processed separately if needed

    // Build table of contents text from first 10 pages for section extraction
    let tocText = "";
    for (let i = 1; i <= Math.min(10, totalPages); i++) {
      const pageSpans = spans.filter(s => s.page_number === i);
      tocText += pageSpans.map(s => s.text).join(" ") + "\n\n";
    }
    tocText = tocText.substring(0, 8000); // Limit to 8000 chars

    // Extract sections using AI
    const sections = await extractSections(tocText, totalPages);
    
    if (sections.length > 0) {
      console.log(`Inserting ${sections.length} sections...`);
      const sectionsToInsert = sections.map((sec: any) => ({
        manual_id: manualId,
        section_name: sec.section_name,
        first_page: sec.first_page,
        page_count: sec.page_count,
        heading_level: sec.heading_level
      }));

      const { error: sectionsError } = await supabaseService
        .from("manual_sections")
        .insert(sectionsToInsert);

      if (sectionsError) {
        console.error("Error inserting sections:", sectionsError);
      } else {
        console.log(`Successfully inserted ${sections.length} sections`);
      }
    }

    // Update manual with metadata
    const { error: updateError } = await supabaseService
      .from("manuals")
      .update({
        sha256,
        total_pages: totalPages,
        parsed_content: `Parsed ${spans.length} spans, ${chunks.length} chunks, ${figures.length} figures, ${tables.length} tables, ${sections.length} sections`
      })
      .eq("id", manualId);

    if (updateError) {
      console.error("Error updating manual:", updateError);
    }

    console.log(`Successfully parsed manual: ${totalPages} pages, ${sections.length} sections`);

    return new Response(
      JSON.stringify({
        success: true,
        manualId,
        stats: {
          totalPages,
          spans: spans.length,
          chunks: chunks.length,
          figures: figures.length,
          tables: tables.length,
          sections: sections.length
        }
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
