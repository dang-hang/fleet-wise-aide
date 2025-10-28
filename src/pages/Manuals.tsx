import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookOpen, Search, Upload, FileText, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

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

const uploadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  vehicleType: z.string().trim().min(1, "Vehicle type is required").max(100),
  vehicleModel: z.string().trim().max(100).optional(),
  yearRange: z.string().trim().max(50).optional(),
  file: z.instanceof(File).refine((file) => file.size <= 50 * 1024 * 1024, "File size must be less than 50MB")
});

const Manuals = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Upload form state
  const [title, setTitle] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [yearRange, setYearRange] = useState("");
  const [file, setFile] = useState<File | null>(null);

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
    try {
      const { data, error } = await supabase
        .from('manuals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setManuals(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load manuals",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      toast({
        title: "Error",
        description: "Please select a file",
        variant: "destructive",
      });
      return;
    }

    try {
      const validatedData = uploadSchema.parse({
        title,
        vehicleType,
        vehicleModel: vehicleModel || undefined,
        yearRange: yearRange || undefined,
        file,
      });

      setUploading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('manuals')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('manuals')
        .insert({
          user_id: user.id,
          title: validatedData.title,
          vehicle_type: validatedData.vehicleType,
          vehicle_model: validatedData.vehicleModel || null,
          year_range: validatedData.yearRange || null,
          file_path: fileName,
          file_type: file.type,
          file_size: file.size,
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Manual uploaded successfully",
      });

      // Reset form
      setTitle("");
      setVehicleType("");
      setVehicleModel("");
      setYearRange("");
      setFile(null);
      setDialogOpen(false);
      
      // Refresh manuals list
      fetchManuals();
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to upload manual",
          variant: "destructive",
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (manual: Manual) => {
    try {
      const { data, error } = await supabase.storage
        .from('manuals')
        .download(manual.file_path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = manual.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download manual",
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
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Upload Repair Manual</DialogTitle>
                    <DialogDescription>
                      Add a new vehicle repair manual to the library
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleUpload} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Manual Title *</Label>
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
                        placeholder="e.g., Patrol Car, SUV, Truck"
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleModel">Vehicle Model</Label>
                      <Input
                        id="vehicleModel"
                        placeholder="e.g., Crown Victoria Police Interceptor"
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
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Supported formats: PDF, DOC, DOCX, TXT (Max 50MB)
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={uploading}>
                      {uploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload Manual
                        </>
                      )}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredManuals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
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
                    {manual.year_range && (
                      <span className="text-xs text-muted-foreground">{manual.year_range}</span>
                    )}
                  </div>
                  <CardTitle className="mt-4">{manual.title}</CardTitle>
                  <CardDescription>
                    {manual.vehicle_type}
                    {manual.vehicle_model && ` - ${manual.vehicle_model}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground mb-3">
                    Uploaded {new Date(manual.created_at).toLocaleDateString()}
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleDownload(manual)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Manuals;
