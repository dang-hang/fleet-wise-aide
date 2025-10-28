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
    const { data, error } = await supabase
      .from("manuals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load manuals",
        variant: "destructive",
      });
    } else {
      setManuals(data || []);
    }
    setLoading(false);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload file to storage
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("manuals")
        .upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { error: dbError } = await supabase
        .from("manuals")
        .insert({
          user_id: user.id,
          title: title.trim(),
          vehicle_type: vehicleType.trim(),
          vehicle_model: vehicleModel.trim() || null,
          year_range: yearRange.trim() || null,
          file_path: fileName,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Manual uploaded successfully",
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
      const { data, error } = await supabase.storage
        .from("manuals")
        .download(manual.file_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = manual.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download manual",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (manual: Manual) => {
    if (!confirm("Are you sure you want to delete this manual?")) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Delete file from storage
      const { error: storageError } = await supabase.storage
        .from("manuals")
        .remove([manual.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("manuals")
        .delete()
        .eq("id", manual.id);

      if (dbError) throw dbError;

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
