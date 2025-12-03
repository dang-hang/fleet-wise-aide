import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PdfViewerProps {
  signedUrl: string;
  pageNumber?: number;
  bbox?: BBox;
  onPageChange?: (page: number) => void;
}

export const PdfViewer = ({ signedUrl, pageNumber = 1, bbox, onPageChange }: PdfViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(pageNumber);
  const [scale, setScale] = useState(1.5);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageHeight, setPageHeight] = useState(0);

  // Load PDF document
  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        const loadingTask = pdfjsLib.getDocument(signedUrl);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setLoading(false);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError(err instanceof Error ? err.message : "Failed to load PDF");
        setLoading(false);
      }
    };

    loadPdf();
  }, [signedUrl]);

  // Render page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      const viewport = page.getViewport({ scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setPageHeight(viewport.height);

      const renderContext: any = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Draw bbox highlight overlay if provided and on correct page
      if (bbox && currentPage === pageNumber) {
        // PDF coordinates are from bottom-left, need to transform
        // The bbox from manual_spans should already be in PDF coordinates
        const pdfWidth = page.getViewport({ scale: 1 }).width;
        const pdfHeight = page.getViewport({ scale: 1 }).height;

        // Transform coordinates: PDF uses bottom-left origin
        // If bbox values are in PDF coordinates (0-based from bottom-left)
        const x = bbox.x1 * scale;
        // For PDF coords where y increases upward, transform to canvas coords
        const y = (pdfHeight - bbox.y2) * scale;
        const width = (bbox.x2 - bbox.x1) * scale;
        const height = (bbox.y2 - bbox.y1) * scale;

        // Update highlight overlay position
        if (highlightRef.current) {
          highlightRef.current.style.left = `${x}px`;
          highlightRef.current.style.top = `${y}px`;
          highlightRef.current.style.width = `${width}px`;
          highlightRef.current.style.height = `${height}px`;
          highlightRef.current.style.display = "block";

          // Scroll to highlighted area
          setTimeout(() => {
            highlightRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "center",
            });
          }, 100);
        }
      } else if (highlightRef.current) {
        highlightRef.current.style.display = "none";
      }
    } catch (err) {
      console.error("Error rendering page:", err);
    }
  }, [pdfDoc, currentPage, scale, bbox, pageNumber]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Update current page when prop changes
  useEffect(() => {
    setCurrentPage(pageNumber);
  }, [pageNumber]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      onPageChange?.(page);
    }
  };

  const adjustZoom = (delta: number) => {
    setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 p-2 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => adjustZoom(-0.25)}
            disabled={scale <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => adjustZoom(0.25)}
            disabled={scale >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Container */}
      <div
        ref={containerRef}
        className="relative overflow-auto max-h-[70vh] border border-border rounded-lg bg-muted/20"
      >
        {loading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {error && (
          <div className="text-destructive p-4 text-center">{error}</div>
        )}
        <div className="relative inline-block">
          <canvas ref={canvasRef} />
          {/* Highlight overlay with animation */}
          <div
            ref={highlightRef}
            className={cn(
              "absolute pointer-events-none border-2 border-yellow-500 bg-yellow-400/30",
              "animate-pulse shadow-lg shadow-yellow-500/50",
              "hidden"
            )}
            style={{
              boxShadow: "0 0 20px rgba(234, 179, 8, 0.6), inset 0 0 10px rgba(234, 179, 8, 0.3)",
            }}
          />
        </div>
      </div>
    </div>
  );
};
