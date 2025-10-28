import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface DocumentViewerProps {
  filePath: string;
  fileName: string;
  fileType: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentViewer = ({ filePath, fileName, fileType, isOpen, onClose }: DocumentViewerProps) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && filePath) {
      loadFile();
    }
    
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [isOpen, filePath]);

  const loadFile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("manuals")
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      setFileUrl(url);
    } catch (error) {
      console.error("Error loading file:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!fileUrl) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          Failed to load document
        </div>
      );
    }

    if (fileType === "application/pdf") {
      return (
        <embed
          src={fileUrl}
          type="application/pdf"
          className="w-full h-[80vh] border-0"
          title={fileName}
        />
      );
    }

    if (fileType.startsWith("image/")) {
      return (
        <img
          src={fileUrl}
          alt={fileName}
          className="w-full h-auto max-h-[80vh] object-contain"
        />
      );
    }

    if (fileType === "text/plain") {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-[80vh] border-0"
          title={fileName}
        />
      );
    }

    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">
          Preview not available for this file type
        </p>
        <a
          href={fileUrl}
          download={fileName}
          className="text-primary underline"
        >
          Download to view
        </a>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};
