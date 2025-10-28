import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Upload, FileText } from "lucide-react";

const Manuals = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

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
                  placeholder="Search manuals by vehicle type, model, or issue..."
                  className="pl-10"
                />
              </div>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Manual
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Ford Crown Victoria", subtitle: "Police Interceptor", year: "2010-2012" },
            { title: "Chevrolet Tahoe", subtitle: "Law Enforcement Package", year: "2015-2020" },
            { title: "Dodge Charger", subtitle: "Pursuit AWD", year: "2018-2023" },
            { title: "Ford F-150", subtitle: "Utility Truck", year: "2019-2024" },
            { title: "Chevrolet Silverado", subtitle: "Service Vehicle", year: "2017-2022" },
            { title: "Ford Explorer", subtitle: "Police Interceptor Utility", year: "2020-2024" },
          ].map((manual, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="rounded-lg bg-primary/10 p-3">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">{manual.year}</span>
                </div>
                <CardTitle className="mt-4">{manual.title}</CardTitle>
                <CardDescription>{manual.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  <BookOpen className="mr-2 h-4 w-4" />
                  View Manual
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Manuals;
