import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2 } from "lucide-react";

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
}

export const PdfViewer = ({ signedUrl, pageNumber = 1, bbox }: PdfViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderPage = async () => {
      if (!canvasRef.current) return;

      try {
        setLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(signedUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNumber);

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        // Calculate scale to fit container
        const containerWidth = containerRef.current?.clientWidth || 800;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        const renderContext: any = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        await page.render(renderContext).promise;

        // Draw bbox highlight if provided
        if (bbox) {
          context.strokeStyle = "rgba(255, 200, 0, 0.8)";
          context.fillStyle = "rgba(255, 200, 0, 0.2)";
          context.lineWidth = 3;

          const x = bbox.x1 * scale;
          const y = bbox.y1 * scale;
          const width = (bbox.x2 - bbox.x1) * scale;
          const height = (bbox.y2 - bbox.y1) * scale;

          context.fillRect(x, y, width, height);
          context.strokeRect(x, y, width, height);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error rendering PDF:", err);
        setError(err instanceof Error ? err.message : "Failed to load PDF");
        setLoading(false);
      }
    };

    renderPage();
  }, [signedUrl, pageNumber, bbox]);

  return (
    <div ref={containerRef} className="relative w-full">
      {loading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      {error && (
        <div className="text-destructive p-4 text-center">{error}</div>
      )}
      <canvas ref={canvasRef} className="w-full h-auto" />
    </div>
  );
};
