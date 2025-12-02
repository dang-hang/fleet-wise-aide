import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PdfViewer } from "@/components/PdfViewer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { fetchWithAuth } from "@/lib/api";

export default function ManualViewer() {
  const { manualId } = useParams<{ manualId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageNumber = parseInt(searchParams.get("page") || "1");
  const x1 = parseFloat(searchParams.get("x1") || "0");
  const y1 = parseFloat(searchParams.get("y1") || "0");
  const x2 = parseFloat(searchParams.get("x2") || "0");
  const y2 = parseFloat(searchParams.get("y2") || "0");

  const bbox = x1 || y1 || x2 || y2 ? { x1, y1, x2, y2 } : undefined;

  useEffect(() => {
    const fetchManualAndUrl = async () => {
      if (!manualId) return;

      try {
        setLoading(true);
        setError(null);

        // Fetch manual details
        const detailsResponse = await fetchWithAuth(`/api/manuals/${manualId}`);
        const manual = await detailsResponse.json();
        setManualTitle(manual.file_name || `${manual.year} ${manual.make} ${manual.model}`);

        // Fetch PDF blob
        const pdfResponse = await fetchWithAuth(`/api/manuals/${manualId}/pdf`);
        const blob = await pdfResponse.blob();
        const url = URL.createObjectURL(blob);

        setSignedUrl(url);
        setLoading(false);
      } catch (err) {
        console.error("Error loading manual:", err);
        setError(err instanceof Error ? err.message : "Failed to load manual");
        setLoading(false);
      }
    };

    fetchManualAndUrl();
  }, [manualId]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{manualTitle}</h1>
            <p className="text-sm text-muted-foreground">Page {pageNumber}</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="text-destructive text-center p-8">{error}</div>
        )}

        {signedUrl && !loading && (
          <div className="bg-card rounded-lg shadow-lg p-4">
            <PdfViewer
              signedUrl={signedUrl}
              pageNumber={pageNumber}
              bbox={bbox}
            />
          </div>
        )}
      </div>
    </div>
  );
}
