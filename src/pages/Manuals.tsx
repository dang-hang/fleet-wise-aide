import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen, Search, Upload, FileText, Download, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { DocumentViewer } from "@/components/DocumentViewer";
import { fetchWithAuth } from "@/lib/api";

const uploadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  vehicleType: z.string().trim().min(1, "Vehicle type is required").max(100, "Vehicle type must be less than 100 characters"),
  vehicleModel: z.string().trim().max(100, "Vehicle model must be less than 100 characters").optional(),
  yearRange: z.string().trim().max(50, "Year range must be less than 50 characters").optional(),
});

interface Manual {
  id: string;
  title: string;
  vehicle_type: string;
  vehicle_model: string | null;
  year_range: string | null;
  file_path: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
}

const Manuals = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewingManual, setViewingManual] = useState<Manual | null>(null);
  
  // Form state
  const [title, setTitle] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [yearRange, setYearRange] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      } else {
        fetchManuals();
      }
    };
    checkAuth();
  }, [navigate]);

  const fetchManuals = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/manuals");
      const data = await response.json();
      
      // Map backend response to frontend Manual interface
      const mappedManuals: Manual[] = data.map((m: any) => ({
        id: m.manual_id.toString(),
        title: m.file_name || `${m.year} ${m.make} ${m.model}`,
        vehicle_type: m.make,
        vehicle_model: m.model,
        year_range: m.year.toString(),
        file_path: m.file_name, // Not used for download in new system, but kept for compatibility
        file_type: "application/pdf",
        file_size: 0, // Not returned by backend list
        created_at: m.created_at
      }));
      
      setManuals(mappedManuals);
    } catch (error) {
      console.error("Error fetching manuals:", error);
      toast({
        title: "Error",
        description: "Failed to load manuals",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 50MB",
          variant: "destructive",
        });
        return;
      }
      
      // Check file type
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Only PDF, images, and text documents are allowed",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    try {
      uploadSchema.parse({
        title: title.trim(),
        vehicleType: vehicleType.trim(),
        vehicleModel: vehicleModel.trim() || undefined,
        yearRange: yearRange.trim() || undefined,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
      return;
    }

    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("year", yearRange.trim()); // Backend expects int, but FormData sends string. Backend should handle or I parse.
      formData.append("make", vehicleType.trim());
      formData.append("model", vehicleModel.trim());
      // formData.append("uplifted", "false"); // Optional

      await fetchWithAuth("/api/manuals/upload", {
        method: "POST",
        body: formData,
      });

      toast({
        title: "Success",
        description: "Manual uploaded and processed successfully.",
      });

      // Reset form and refresh list
      setTitle("");
      setVehicleType("");
      setVehicleModel("");
      setYearRange("");
      setSelectedFile(null);
      setDialogOpen(false);
      fetchManuals();

    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload manual",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (manual: Manual) => {
    try {
      const response = await fetchWithAuth(`/api/manuals/${manual.id}/pdf`);
      const blob = await response.blob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = manual.title + ".pdf"; // Ensure extension
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description: "Failed to download manual",
        variant: "destructive",
      });
    }
  };

  const handleReprocess = async (manualId: string) => {
    try {
      toast({
        title: "Processing",
        description: "Re-processing manual with new RAG system (sections + diagrams)...",
      });

      await fetchWithAuth(`/api/manuals/${manualId}/reprocess`, {
        method: "POST",
      });

      toast({
        title: "Success",
        description: "Manual re-processed! Now includes sections and diagrams for AI reference.",
      });

      fetchManuals();
    } catch (error: any) {
      console.error("Error re-processing manual:", error);
      toast({
        title: "Re-processing failed",
        description: error.message || "Failed to re-process manual",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (manual: Manual) => {
    if (!confirm("Are you sure you want to delete this manual?")) return;

    try {
      await fetchWithAuth(`/api/manuals/${manual.id}`, {
        method: "DELETE",
      });

      toast({
        title: "Success",
        description: "Manual deleted successfully",
      });

      fetchManuals();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete manual",
        variant: "destructive",
      });
    }
  };

  const filteredManuals = manuals.filter(manual =>
    manual.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    manual.vehicle_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    manual.vehicle_model?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-secondary/30">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Repair Manuals</h1>
          <p className="text-muted-foreground">Access and manage vehicle repair documentation</p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search manuals by vehicle type, model, or title..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Manual
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Repair Manual</DialogTitle>
                    <DialogDescription>
                      Add a new repair manual to the library. Accepted formats: PDF, images, text documents (max 50MB)
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleUpload} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        placeholder="e.g., Ford Crown Victoria Service Manual"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleType">Vehicle Type *</Label>
                      <Input
                        id="vehicleType"
                        placeholder="e.g., Ford Crown Victoria"
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleModel">Vehicle Model</Label>
                      <Input
                        id="vehicleModel"
                        placeholder="e.g., Police Interceptor"
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="yearRange">Year Range</Label>
                      <Input
                        id="yearRange"
                        placeholder="e.g., 2010-2012"
                        value={yearRange}
                        onChange={(e) => setYearRange(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="file">File *</Label>
                      <Input
                        id="file"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx"
                        onChange={handleFileChange}
                        required
                      />
                      {selectedFile && (
                        <p className="text-xs text-muted-foreground">
                          Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      )}
                    </div>
                    <Button type="submit" className="w-full" disabled={uploading}>
                      {uploading ? "Uploading..." : "Upload Manual"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading manuals...</p>
          </div>
        ) : filteredManuals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? "No manuals found matching your search" : "No manuals uploaded yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredManuals.map((manual) => (
              <Card key={manual.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="rounded-lg bg-primary/10 p-3">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {manual.year_range || "N/A"}
                    </span>
                  </div>
                  <CardTitle className="mt-4 line-clamp-2">{manual.title}</CardTitle>
                  <CardDescription>
                    {manual.vehicle_type}
                    {manual.vehicle_model && ` - ${manual.vehicle_model}`}
                  </CardDescription>
                  <div className="text-xs text-muted-foreground pt-2">
                    {manual.file_size && `${(manual.file_size / 1024 / 1024).toFixed(2)} MB`}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    variant="default" 
                    className="w-full" 
                    onClick={() => setViewingManual(manual)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => handleDownload(manual)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="w-full" 
                    onClick={() => handleReprocess(manual.id)}
                    title="Re-process with GPT-4o Vision to extract sections and diagrams"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Re-process with RAG
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground" 
                    onClick={() => handleDelete(manual)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {viewingManual && (
        <DocumentViewer
          filePath={viewingManual.file_path}
          fileName={viewingManual.title}
          fileType={viewingManual.file_type}
          isOpen={!!viewingManual}
          onClose={() => setViewingManual(null)}
        />
      )}
    </div>
  );
};

export default Manuals;
