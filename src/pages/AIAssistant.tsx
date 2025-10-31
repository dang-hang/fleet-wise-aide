import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Car } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const AIAssistant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [savedCaseNumber, setSavedCaseNumber] = useState("");
  const [savedCaseId, setSavedCaseId] = useState("");
  const [caseStatus, setCaseStatus] = useState("In Progress");
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [currentMessage, setCurrentMessage] = useState("");

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

  const { data: savedVehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const vehicle = savedVehicles?.find(v => v.id === vehicleId);
    if (vehicle) {
      setVehicleYear(vehicle.year);
      setVehicleMake(vehicle.make);
      setVehicleModel(vehicle.model);
    }
  };

  const handleManualInput = () => {
    setSelectedVehicleId("");
    setVehicleYear("");
    setVehicleMake("");
    setVehicleModel("");
  };

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

      // Create initial user message
      const initialPrompt = `Vehicle: ${vehicleYear} ${vehicleMake} ${vehicleModel}\nProblem: ${problemDescription}`;
      const initialMessages = [{ role: 'user' as const, content: initialPrompt }];
      
      // Get diagnostic from AI
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maintenance-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          messages: initialMessages
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get diagnostic");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullDiagnostic = "";

      // Add user message to chat
      setMessages([...initialMessages]);

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
                  // Update assistant message in real-time
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.content = fullDiagnostic;
                    } else {
                      newMessages.push({ role: 'assistant', content: fullDiagnostic });
                    }
                    return newMessages;
                  });
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
      const { data: insertData, error: insertError } = await supabase
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
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      setSavedCaseNumber(caseNumber);
      setSavedCaseId(insertData.id);
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

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isLoading) return;

    const userMessage = { role: 'user' as const, content: currentMessage };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setCurrentMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/maintenance-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ 
          messages: updatedMessages
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = "";

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
                  assistantResponse += content;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      lastMsg.content = assistantResponse;
                    } else {
                      newMessages.push({ role: 'assistant', content: assistantResponse });
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }
          }
        }
      }

      // Update the case in database with new conversation
      const fullConversation = [...updatedMessages, { role: 'assistant', content: assistantResponse }]
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
        .join('\n\n');

      await supabase
        .from('cases')
        .update({ diagnostic_result: fullConversation })
        .eq('id', savedCaseId);

    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message",
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

  const handleStatusChange = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from('cases')
        .update({ status: newStatus })
        .eq('id', savedCaseId);

      if (error) throw error;

      setCaseStatus(newStatus);
      toast({
        title: "Status Updated",
        description: `Case status changed to ${newStatus}`,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update case status",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-500';
      case 'In Progress':
        return 'bg-blue-500';
      case 'On Hold':
        return 'bg-yellow-500';
      case 'Pending':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
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
                {savedVehicles && savedVehicles.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="saved-vehicle">Quick Select Saved Vehicle</Label>
                    <div className="flex gap-2">
                      <Select value={selectedVehicleId} onValueChange={handleVehicleSelect}>
                        <SelectTrigger id="saved-vehicle">
                          <SelectValue placeholder="Select a saved vehicle..." />
                        </SelectTrigger>
                        <SelectContent>
                          {savedVehicles.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              <div className="flex items-center gap-2">
                                <Car className="h-4 w-4" />
                                {vehicle.year} {vehicle.make} {vehicle.model}
                                {vehicle.license_plate && ` - ${vehicle.license_plate}`}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedVehicleId && (
                        <Button variant="outline" onClick={handleManualInput}>
                          Clear
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Or enter vehicle details manually below
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="text"
                      placeholder="e.g. 2020"
                      value={vehicleYear}
                      onChange={(e) => setVehicleYear(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="make">Make</Label>
                    <Input
                      id="make"
                      type="text"
                      placeholder="e.g. Toyota"
                      value={vehicleMake}
                      onChange={(e) => setVehicleMake(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Input
                      id="model"
                      type="text"
                      placeholder="e.g. Camry"
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                    />
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
              <div className="flex items-center gap-4">
                <p className="text-muted-foreground">Case Number: {savedCaseNumber}</p>
                <Badge className={getStatusColor(caseStatus)}>{caseStatus}</Badge>
              </div>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Vehicle Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
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
                  <div className="space-y-2 pt-4 border-t">
                    <Label htmlFor="status">Case Status</Label>
                    <Select value={caseStatus} onValueChange={handleStatusChange}>
                      <SelectTrigger id="status">
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
                  <CardTitle>AI Interactive Diagnostic & Troubleshooting</CardTitle>
                  <CardDescription>Chat with AI to get detailed diagnostics and answers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 max-h-[500px] overflow-y-auto space-y-4 bg-secondary/20">
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-3 ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card border'
                            }`}
                          >
                            {message.role === 'user' ? (
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            ) : (
                              <MarkdownRenderer content={message.content} />
                            )}
                          </div>
                        </div>
                      ))}
                      {isLoading && messages[messages.length - 1]?.role === 'user' && (
                        <div className="flex justify-start">
                          <div className="bg-card border rounded-lg px-4 py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Ask for more details or provide additional information..."
                        value={currentMessage}
                        onChange={(e) => setCurrentMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="min-h-[60px]"
                        disabled={isLoading}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={isLoading || !currentMessage.trim()}
                        size="icon"
                        className="h-[60px] w-[60px]"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => {
                  setShowResults(false);
                  setMessages([]);
                  setCurrentMessage("");
                  setVehicleYear("");
                  setVehicleMake("");
                  setVehicleModel("");
                  setProblemDescription("");
                  setSavedCaseId("");
                  setSavedCaseNumber("");
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
