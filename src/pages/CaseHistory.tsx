import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileText, Calendar } from "lucide-react";

const CaseHistory = () => {
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

  const cases = [
    {
      id: "CASE-001",
      title: "Engine Oil Leak - Unit 42",
      category: "Engine Issue",
      date: "2025-10-25",
      status: "Resolved",
      vehicle: "Ford Crown Victoria"
    },
    {
      id: "CASE-002",
      title: "Brake System Check - Unit 18",
      category: "Routine Maintenance",
      date: "2025-10-24",
      status: "In Progress",
      vehicle: "Chevrolet Tahoe"
    },
    {
      id: "CASE-003",
      title: "Electrical Fault - Unit 31",
      category: "Electrical",
      date: "2025-10-23",
      status: "Resolved",
      vehicle: "Dodge Charger"
    },
    {
      id: "CASE-004",
      title: "Transmission Service - Unit 09",
      category: "Routine Maintenance",
      date: "2025-10-22",
      status: "Resolved",
      vehicle: "Ford F-150"
    },
    {
      id: "CASE-005",
      title: "AC System Repair - Unit 27",
      category: "HVAC",
      date: "2025-10-21",
      status: "Pending",
      vehicle: "Chevrolet Silverado"
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Resolved":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "In Progress":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      case "Pending":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Case History</h1>
          <p className="text-muted-foreground">Review past maintenance cases and solutions</p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cases by ID, vehicle, or keyword..."
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {cases.map((caseItem) => (
            <Card key={caseItem.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{caseItem.title}</CardTitle>
                      <Badge variant="outline" className={getStatusColor(caseItem.status)}>
                        {caseItem.status}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {caseItem.id}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(caseItem.date).toLocaleDateString()}
                      </span>
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm">View Details</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Badge variant="secondary">{caseItem.category}</Badge>
                  <Badge variant="outline">{caseItem.vehicle}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default CaseHistory;
