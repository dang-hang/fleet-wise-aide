import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    } else {
      navigate("/auth");
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="border-b bg-card shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="rounded-full bg-primary p-2">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-primary">PASCO Sheriff</span>
              <span className="text-xs text-muted-foreground">Fleet Maintenance</span>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant={isActive("/dashboard") ? "default" : "ghost"}
              asChild
              className="font-medium"
            >
              <Link to="/dashboard">Dashboard</Link>
            </Button>
            <Button
              variant={isActive("/manuals") ? "default" : "ghost"}
              asChild
              className="font-medium"
            >
              <Link to="/manuals">Manuals</Link>
            </Button>
            <Button
              variant={isActive("/vehicles") ? "default" : "ghost"}
              asChild
              className="font-medium"
            >
              <Link to="/vehicles">Vehicles</Link>
            </Button>
            <Button
              variant={isActive("/ai-assistant") ? "default" : "ghost"}
              asChild
              className="font-medium"
            >
              <Link to="/ai-assistant">AI Assistant</Link>
            </Button>
            <Button
              variant={isActive("/case-history") ? "default" : "ghost"}
              asChild
              className="font-medium"
            >
              <Link to="/case-history">Case History</Link>
            </Button>
          </div>

          <Button onClick={handleLogout} variant="ghost" size="icon">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
};
