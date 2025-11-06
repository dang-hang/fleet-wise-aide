import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.worker.mjs";

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
      console.log("PDF detected - parsing with pdfjs-dist");
      
      // Parse PDF with pdfjs-dist
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      console.log(`PDF has ${totalPages} pages, extracting text...`);
      
      // Extract text from each page
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
        
        // Check for diagram keywords to create figure placeholders
        const pageText = textContent.items.map((i: any) => i.str).join(' ').toLowerCase();
        const figureKeywords = ['figure', 'diagram', 'illustration', 'image', 'fig.', 'schematic', 'coolant', 'engine', 'component'];
        const hasFigure = figureKeywords.some(kw => pageText.includes(kw));
        
        if (hasFigure) {
          figures.push({
            manual_id: manualId,
            page_number: pageNum,
            figure_index: 0,
            bbox: { x0: 100, y0: 200, x1: 500, y1: 500 },
            storage_path: null,
            caption: pageText.match(/(figure|fig\.|diagram|schematic|illustration)\s+[\d.]+[^\n.]*/i)?.[0] || `Diagram on page ${pageNum}`
          });
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

      // Generate embeddings and create chunks
      console.log(`Generating embeddings for ${spanGroups.length} chunks...`);
      for (const spanGroup of spanGroups) {
        const content = spanGroup.map(s => s.text).join(" ");
        
        // Generate embedding using Lovable AI
        try {
          const embeddingResponse = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: content,
              model: "google/gemini-2.5-flash"
            }),
          });

          if (embeddingResponse.ok) {
            const embeddingData = await embeddingResponse.json();
            const embedding = embeddingData.data[0].embedding;
            
            chunks.push({
              manual_id: manualId,
              content,
              embedding, // Include the embedding vector
              span_ids: [], // Will be populated after spans are inserted
              metadata: {
                page_numbers: [...new Set(spanGroup.map(s => s.page_number))],
                char_count: content.length
              }
            });
          } else {
            console.warn("Failed to generate embedding, creating chunk without embedding");
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
        } catch (embError) {
          console.error("Error generating embedding:", embError);
          // Create chunk without embedding
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

    // Insert figures
    if (figures.length > 0) {
      console.log(`Inserting ${figures.length} figures...`);
      const { error: figuresError } = await supabaseService
        .from("manual_figures")
        .insert(figures);

      if (figuresError) {
        console.error("Error inserting figures:", figuresError);
      }
    }

    // Insert tables
    if (tables.length > 0) {
      console.log(`Inserting ${tables.length} tables...`);
      const { error: tablesError } = await supabaseService
        .from("manual_tables")
        .insert(tables);

      if (tablesError) {
        console.error("Error inserting tables:", tablesError);
      }
    }

    // Update manual with metadata
    const { error: updateError } = await supabaseService
      .from("manuals")
      .update({
        sha256,
        total_pages: totalPages,
        parsed_content: `Parsed ${spans.length} spans, ${chunks.length} chunks, ${figures.length} figures, ${tables.length} tables`
      })
      .eq("id", manualId);

    if (updateError) {
      console.error("Error updating manual:", updateError);
    }

    console.log(`Successfully parsed manual: ${totalPages} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        manualId,
        stats: {
          totalPages,
          spans: spans.length,
          chunks: chunks.length,
          figures: figures.length,
          tables: tables.length
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
