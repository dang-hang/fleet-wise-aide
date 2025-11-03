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

    console.log("Starting manual parsing for:", manualId);

    // Get manual details
    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("*")
      .eq("id", manualId)
      .single();

    if (manualError || !manual) {
      throw new Error("Manual not found");
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
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
      // STUB: Simulate PDF parsing
      // In production, extract actual text spans with bounding boxes
      console.log("PDF detected - using stub parser");
      
      totalPages = 5; // Stub: assume 5 pages
      
      // Create stub spans for each page
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        // Stub: Create 10 text spans per page
        for (let i = 0; i < 10; i++) {
          spans.push({
            manual_id: manualId,
            page_number: pageNum,
            text: `Sample text span ${i + 1} on page ${pageNum}`,
            bbox: { x0: 50 + i * 20, y0: 50 + i * 30, x1: 200 + i * 20, y1: 70 + i * 30 },
            font_name: "Helvetica",
            font_size: 12.0
          });
        }

        // Stub: Create one figure per page
        figures.push({
          manual_id: manualId,
          page_number: pageNum,
          figure_index: 0,
          bbox: { x0: 300, y0: 100, x1: 500, y1: 300 },
          storage_path: `${manualId}/figures/${pageNum}_0.png`,
          caption: `Figure ${pageNum}.1 - Sample diagram`
        });

        // Stub: Create one table per page
        tables.push({
          manual_id: manualId,
          page_number: pageNum,
          table_index: 0,
          bbox: { x0: 50, y0: 400, x1: 550, y1: 550 },
          data: {
            headers: ["Column 1", "Column 2", "Column 3"],
            rows: [
              ["Data 1.1", "Data 1.2", "Data 1.3"],
              ["Data 2.1", "Data 2.2", "Data 2.3"]
            ]
          },
          caption: `Table ${pageNum}.1 - Sample data`
        });
      }

      // Create chunks from spans (group every 20 spans)
      const spanGroups: Array<any[]> = [];
      for (let i = 0; i < spans.length; i += 20) {
        spanGroups.push(spans.slice(i, i + 20));
      }

      for (const spanGroup of spanGroups) {
        const content = spanGroup.map(s => s.text).join(" ");
        chunks.push({
          manual_id: manualId,
          content,
          span_ids: [], // Will be populated after spans are inserted
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
    const { data: insertedSpans, error: spansError } = await supabase
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
    const { error: chunksError } = await supabase
      .from("manual_chunks")
      .insert(chunks);

    if (chunksError) {
      console.error("Error inserting chunks:", chunksError);
      throw chunksError;
    }

    // Insert figures
    if (figures.length > 0) {
      console.log(`Inserting ${figures.length} figures...`);
      const { error: figuresError } = await supabase
        .from("manual_figures")
        .insert(figures);

      if (figuresError) {
        console.error("Error inserting figures:", figuresError);
      }
    }

    // Insert tables
    if (tables.length > 0) {
      console.log(`Inserting ${tables.length} tables...`);
      const { error: tablesError } = await supabase
        .from("manual_tables")
        .insert(tables);

      if (tablesError) {
        console.error("Error inserting tables:", tablesError);
      }
    }

    // Update manual with metadata
    const { error: updateError } = await supabase
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
