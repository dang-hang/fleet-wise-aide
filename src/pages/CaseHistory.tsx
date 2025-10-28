import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileText, Calendar, Loader2 } from "lucide-react";

interface CaseType {
  id: string;
  case_number: string;
  title: string;
  category: string | null;
  created_at: string;
  status: string;
  vehicle_year: string;
  vehicle_make: string;
  vehicle_model: string;
}

const CaseHistory = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCases(data || []);
    } catch (error) {
      console.error('Error fetching cases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredCases = cases.filter(caseItem => 
    caseItem.case_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    caseItem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${caseItem.vehicle_year} ${caseItem.vehicle_make} ${caseItem.vehicle_model}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredCases.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchQuery ? 'No cases found matching your search' : 'No cases yet. Create your first diagnostic case!'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredCases.map((caseItem) => (
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
                          {caseItem.case_number}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(caseItem.created_at).toLocaleDateString()}
                        </span>
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm">View Details</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {caseItem.category && <Badge variant="secondary">{caseItem.category}</Badge>}
                    <Badge variant="outline">{`${caseItem.vehicle_year} ${caseItem.vehicle_make} ${caseItem.vehicle_model}`}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default CaseHistory;
