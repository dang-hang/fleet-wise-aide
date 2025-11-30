import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, FileText, Calendar, Loader2, Trash2, Save } from "lucide-react";
import { z } from "zod";

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
  problem_description: string;
  diagnostic_result: string | null;
  notes: string | null;
}

// Validation schema for notes
const notesSchema = z.string()
  .max(10000, "Notes must be less than 10000 characters");

const CaseHistory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<CaseType | null>(null);
  const [notes, setNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

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

  const handleDeleteCase = async (caseId: string) => {
    try {
      const { error } = await supabase
        .from('cases')
        .delete()
        .eq('id', caseId);

      if (error) throw error;

      setCases(cases.filter(c => c.id !== caseId));
      setSelectedCase(null);
      
      toast({
        title: "Success",
        description: "Case deleted successfully",
      });
    } catch (error) {
      console.error('Error deleting case:', error);
      toast({
        title: "Error",
        description: "Failed to delete case",
        variant: "destructive",
      });
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedCase) return;

    // Validate notes
    const validation = notesSchema.safeParse(notes);
    if (!validation.success) {
      toast({
        title: "Invalid Input",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsSavingNotes(true);
    try {
      const { error } = await supabase
        .from('cases')
        .update({ notes: validation.data })
        .eq('id', selectedCase.id);

      if (error) throw error;

      // Update local state
      setCases(cases.map(c => 
        c.id === selectedCase.id ? { ...c, notes } : c
      ));
      setSelectedCase({ ...selectedCase, notes });

      toast({
        title: "Success",
        description: "Notes saved successfully",
      });
    } catch (error) {
      console.error('Error saving notes:', error);
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive",
      });
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedCase) return;

    try {
      const { error } = await supabase
        .from('cases')
        .update({ status: newStatus })
        .eq('id', selectedCase.id);

      if (error) throw error;

      // Update local state
      setCases(cases.map(c => 
        c.id === selectedCase.id ? { ...c, status: newStatus } : c
      ));
      setSelectedCase({ ...selectedCase, status: newStatus });

      toast({
        title: "Status Updated",
        description: `Case status changed to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update case status",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (selectedCase) {
      setNotes(selectedCase.notes || "");
    }
  }, [selectedCase]);

  const filteredCases = cases.filter(caseItem => 
    caseItem.case_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    caseItem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `${caseItem.vehicle_year} ${caseItem.vehicle_make} ${caseItem.vehicle_model}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "In Progress":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "On Hold":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      case "Pending":
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
      default:
        return "";
    }
  };

  const groupedCases = {
    'Pending': filteredCases.filter(c => c.status === 'Pending'),
    'In Progress': filteredCases.filter(c => c.status === 'In Progress'),
    'On Hold': filteredCases.filter(c => c.status === 'On Hold'),
    'Completed': filteredCases.filter(c => c.status === 'Completed'),
  };

  if (selectedCase) {
    return (
      <div className="min-h-screen bg-secondary/30">
        <Navbar />
        
        <main className="container mx-auto px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <Button variant="ghost" onClick={() => setSelectedCase(null)} className="mb-4">
                ← Back to Case History
              </Button>
              <h1 className="text-3xl font-bold text-primary mb-2">Case Details</h1>
              <p className="text-muted-foreground">{selectedCase.case_number}</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Case
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this case. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteCase(selectedCase.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="max-w-4xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedCase.title}</CardTitle>
                    <CardDescription>
                      Created: {new Date(selectedCase.created_at).toLocaleDateString()}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  {selectedCase.category && <Badge variant="secondary">{selectedCase.category}</Badge>}
                  <Badge variant="outline">
                    {`${selectedCase.vehicle_year} ${selectedCase.vehicle_make} ${selectedCase.vehicle_model}`}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="case-status">Case Status</Label>
                  <Select value={selectedCase.status} onValueChange={handleStatusChange}>
                    <SelectTrigger id="case-status" className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="On Hold">On Hold</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Problem Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{selectedCase.problem_description}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mechanic Notes</CardTitle>
                <CardDescription>Add or update notes about this case</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add notes about repairs, parts needed, progress updates..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[150px]"
                  />
                </div>
                <Button onClick={handleSaveNotes} disabled={isSavingNotes}>
                  {isSavingNotes ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Notes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI Diagnostic Plan & Troubleshooting</CardTitle>
                <CardDescription>AI-generated analysis and recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedCase.diagnostic_result || "No diagnostic information available"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

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
          <Tabs defaultValue="Pending" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="Pending">
                Pending ({groupedCases['Pending'].length})
              </TabsTrigger>
              <TabsTrigger value="In Progress">
                In Progress ({groupedCases['In Progress'].length})
              </TabsTrigger>
              <TabsTrigger value="On Hold">
                On Hold ({groupedCases['On Hold'].length})
              </TabsTrigger>
              <TabsTrigger value="Completed">
                Completed ({groupedCases['Completed'].length})
              </TabsTrigger>
            </TabsList>

            {Object.entries(groupedCases).map(([status, statusCases]) => (
              <TabsContent key={status} value={status} className="space-y-4">
                {statusCases.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No cases with status: {status}
                    </CardContent>
                  </Card>
                ) : (
                  statusCases.map((caseItem) => (
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
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedCase(caseItem)}>
                              View Details
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete case {caseItem.case_number}. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteCase(caseItem.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2">
                          {caseItem.category && <Badge variant="secondary">{caseItem.category}</Badge>}
                          <Badge variant="outline">{`${caseItem.vehicle_year} ${caseItem.vehicle_make} ${caseItem.vehicle_model}`}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default CaseHistory;
