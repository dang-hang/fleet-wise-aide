import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, BookOpen, Bot, History, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-secondary/30">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Fleet Maintenance Dashboard</h1>
          <p className="text-muted-foreground">Manage vehicle maintenance and service records</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Vehicles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">24</div>
              <Badge variant="outline" className="mt-2">
                <CheckCircle className="mr-1 h-3 w-3" />
                Operational
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Maintenance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">8</div>
              <Badge variant="outline" className="mt-2 border-yellow-500 text-yellow-700">
                <Clock className="mr-1 h-3 w-3" />
                Scheduled
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-destructive">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Critical Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">3</div>
              <Badge variant="destructive" className="mt-2">
                <AlertCircle className="mr-1 h-3 w-3" />
                Urgent
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">42</div>
              <Badge variant="outline" className="mt-2 border-green-500 text-green-700">
                <CheckCircle className="mr-1 h-3 w-3" />
                Services
              </Badge>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>Repair Manuals</CardTitle>
                  <CardDescription>Access service documentation</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Browse comprehensive repair manuals for all fleet vehicles
              </p>
              <Button asChild className="w-full">
                <Link to="/manuals">
                  <BookOpen className="mr-2 h-4 w-4" />
                  View Manuals
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-accent/10 p-3">
                  <Bot className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <CardTitle>AI Assistant</CardTitle>
                  <CardDescription>Get instant maintenance help</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Ask questions and get AI-powered repair guidance
              </p>
              <Button asChild className="w-full" variant="secondary">
                <Link to="/ai-assistant">
                  <Bot className="mr-2 h-4 w-4" />
                  Open Assistant
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle>Case History</CardTitle>
                  <CardDescription>Review past maintenance cases</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Access historical maintenance records and solutions
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link to="/case-history">
                  <History className="mr-2 h-4 w-4" />
                  View History
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
