import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const AIAssistant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [savedCaseNumber, setSavedCaseNumber] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => (currentYear - i).toString());
  
  const makes = ["Ford", "Chevrolet", "Dodge", "Toyota", "Honda", "Nissan", "GMC", "Ram"];
  
  const models: Record<string, string[]> = {
    Ford: ["Crown Victoria", "F-150", "Explorer", "Expedition", "Taurus"],
    Chevrolet: ["Tahoe", "Silverado", "Impala", "Suburban", "Malibu"],
    Dodge: ["Charger", "Durango", "Ram 1500", "Grand Caravan"],
    Toyota: ["Camry", "Corolla", "Highlander", "Tundra", "4Runner"],
    Honda: ["Accord", "Civic", "CR-V", "Pilot", "Odyssey"],
    Nissan: ["Altima", "Maxima", "Pathfinder", "Titan", "Rogue"],
    GMC: ["Sierra", "Yukon", "Terrain", "Acadia"],
    Ram: ["1500", "2500", "3500", "ProMaster"]
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();
  }, [navigate]);

  const handleContinue = async () => {
    if (!vehicleYear || !vehicleMake || !vehicleModel || !problemDescription.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields before continuing",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Get diagnostic from AI
      const prompt = `Vehicle: ${vehicleYear} ${vehicleMake} ${vehicleModel}\nProblem: ${problemDescription}`;
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maintenance-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          messages: [{ role: "user", content: prompt }]
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get diagnostic");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullDiagnostic = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullDiagnostic += content;
                  setDiagnosticResult(fullDiagnostic);
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
        }
      }

      // Generate case number
      const { data: caseNumberData } = await supabase
        .rpc('generate_case_number');
      
      const caseNumber = caseNumberData || `CASE-${Date.now()}`;

      // Determine category based on problem description
      const category = determineCategoryFromProblem(problemDescription);

      // Save to database
      const { error: insertError } = await supabase
        .from('cases')
        .insert({
          user_id: user.id,
          case_number: caseNumber,
          title: `${problemDescription.substring(0, 50)}${problemDescription.length > 50 ? '...' : ''}`,
          vehicle_year: vehicleYear,
          vehicle_make: vehicleMake,
          vehicle_model: vehicleModel,
          problem_description: problemDescription,
          diagnostic_result: fullDiagnostic,
          category: category,
          status: 'In Progress'
        });

      if (insertError) {
        throw insertError;
      }

      setSavedCaseNumber(caseNumber);
      setShowResults(true);

      toast({
        title: "Success",
        description: "Diagnostic case created successfully",
      });
    } catch (error) {
      console.error("Error creating case:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create diagnostic case",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const determineCategoryFromProblem = (problem: string): string => {
    const lowerProblem = problem.toLowerCase();
    
    if (lowerProblem.includes('engine') || lowerProblem.includes('oil') || lowerProblem.includes('cooling')) {
      return 'Engine Issue';
    } else if (lowerProblem.includes('brake') || lowerProblem.includes('braking')) {
      return 'Brake System';
    } else if (lowerProblem.includes('electric') || lowerProblem.includes('battery') || lowerProblem.includes('alternator')) {
      return 'Electrical';
    } else if (lowerProblem.includes('transmission') || lowerProblem.includes('gear')) {
      return 'Transmission';
    } else if (lowerProblem.includes('ac') || lowerProblem.includes('heat') || lowerProblem.includes('hvac')) {
      return 'HVAC';
    } else if (lowerProblem.includes('tire') || lowerProblem.includes('wheel') || lowerProblem.includes('suspension')) {
      return 'Suspension/Tires';
    } else {
      return 'General Maintenance';
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        {!showResults ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-bold text-primary mb-2">Vehicle Diagnostics Intake</h1>
              <p className="text-muted-foreground">Provide vehicle details and describe the problem to get started</p>
            </div>

            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Vehicle Information & Problem Description</CardTitle>
                <CardDescription>Fill in all fields to receive AI-powered diagnostics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Select value={vehicleYear} onValueChange={setVehicleYear}>
                      <SelectTrigger id="year">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Select value={vehicleMake} onValueChange={(value) => {
                      setVehicleMake(value);
                      setVehicleModel("");
                    }}>
                      <SelectTrigger id="make">
                        <SelectValue placeholder="Select make" />
                      </SelectTrigger>
                      <SelectContent>
                        {makes.map((make) => (
                          <SelectItem key={make} value={make}>
                            {make}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Select value={vehicleModel} onValueChange={setVehicleModel} disabled={!vehicleMake}>
                      <SelectTrigger id="model">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleMake && models[vehicleMake]?.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="problem">Problem Description</Label>
                  <Textarea
                    id="problem"
                    placeholder="Describe the issue you're experiencing with the vehicle..."
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    className="min-h-[150px]"
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <Button
                    onClick={handleContinue}
                    disabled={isLoading || !vehicleYear || !vehicleMake || !vehicleModel || !problemDescription.trim()}
                    className="min-w-[120px]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-primary mb-2">AI Diagnostic Results</h1>
              <p className="text-muted-foreground">Case Number: {savedCaseNumber}</p>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Vehicle Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Year</p>
                      <p className="font-medium">{vehicleYear}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Make</p>
                      <p className="font-medium">{vehicleMake}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Model</p>
                      <p className="font-medium">{vehicleModel}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Problem Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{problemDescription}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>AI Generated Diagnostic Plan & Troubleshooting</CardTitle>
                  <CardDescription>AI-powered analysis and recommendations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{diagnosticResult}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => {
                  setShowResults(false);
                  setDiagnosticResult("");
                  setVehicleYear("");
                  setVehicleMake("");
                  setVehicleModel("");
                  setProblemDescription("");
                }}>
                  New Diagnosis
                </Button>
                <Button onClick={() => navigate("/case-history")}>
                  View Case History
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AIAssistant;
