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
import { Loader2, Send, Car, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { fetchWithAuth } from "@/lib/api";

interface Citation {
  label: string;
  manualId: string;
  page: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  snippet?: string;
  manualTitle?: string;
  figureUrl?: string;
  isFigure?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Record<string, Citation>;
}

// Validation schemas
const problemDescriptionSchema = z.string()
  .trim()
  .min(10, "Please provide more detail (at least 10 characters)")
  .max(5000, "Description must be less than 5000 characters");

const chatMessageSchema = z.string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(2000, "Message must be less than 2000 characters");

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [citations, setCitations] = useState<Record<string, Citation>>({});

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
    // Validate problem description
    const validation = problemDescriptionSchema.safeParse(problemDescription);
    if (!validation.success) {
      toast({
        title: "Invalid Input",
        description: validation.error.errors[0].message,
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

      // Create initial user message - include vehicle info if provided
      let initialPrompt = `Problem: ${problemDescription}`;
      if (vehicleYear && vehicleMake && vehicleModel) {
        initialPrompt = `Vehicle: ${vehicleYear} ${vehicleMake} ${vehicleModel}\n${initialPrompt}`;
      }
      const initialMessages = [{ role: 'user' as const, content: initialPrompt }];
      
      // Get diagnostic from AI with proper authentication
      const response = await fetchWithAuth("/api/answer", {
        method: "POST",
        body: JSON.stringify({ 
          query: initialPrompt,
          max_sections: 5
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get diagnostic");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullDiagnostic = "";
      let accumulatedCitations: Record<string, Citation> = {};
      let textBuffer = "";

      // Add user message to chat
      setMessages([...initialMessages]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });
          
          // Process line by line
          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            
            // Check for citations
            if (jsonStr.includes('"citations"')) {
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.citations) {
                  accumulatedCitations = parsed.citations;
                  continue;
                }
              } catch (e) {
                // Not citations JSON
              }
            }

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
                    lastMsg.citations = accumulatedCitations;
                  } else {
                    newMessages.push({ role: 'assistant', content: fullDiagnostic, citations: accumulatedCitations });
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              // Incomplete JSON, will be completed in next chunk
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
      }
      
      // Store citations for rendering
      if (Object.keys(accumulatedCitations).length > 0) {
        setCitations(accumulatedCitations);
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
    if (isLoading) return;

    // Validate chat message
    const validation = chatMessageSchema.safeParse(currentMessage);
    if (!validation.success) {
      toast({
        title: "Invalid Message",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    const userMessage = { role: 'user' as const, content: validation.data };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setCurrentMessage("");
    setIsLoading(true);

    try {
      const response = await fetchWithAuth("/api/answer", {
        method: "POST",
        body: JSON.stringify({ 
          query: validation.data, // Send only the current message as query
          max_sections: 3
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = "";
      let accumulatedCitations: Record<string, Citation> = {};
      let textBuffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });
          
          // Process line by line
          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            
            // Check for citations
            if (jsonStr.includes('"citations"')) {
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.citations) {
                  accumulatedCitations = parsed.citations;
                  continue;
                }
              } catch (e) {
                // Not citations JSON
              }
            }

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
                    lastMsg.citations = accumulatedCitations;
                  } else {
                    newMessages.push({ role: 'assistant', content: assistantResponse, citations: accumulatedCitations });
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              // Incomplete JSON, will be completed in next chunk
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
      }
      
      // Store citations for rendering
      if (Object.keys(accumulatedCitations).length > 0) {
        setCitations(accumulatedCitations);
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
                <CardDescription>
                  Describe your vehicle problem - we'll auto-detect the vehicle from your description, or you can specify it manually
                </CardDescription>
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
                  </div>
                )}
                
                <div className="space-y-3">
                  <Label>Vehicle Details (Optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    💡 Tip: You can mention the vehicle in your problem description (e.g., "My 2020 Ford F-150 won't start") and we'll detect it automatically
                  </p>
                </div>
                
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
                  <Label htmlFor="problem" className="flex items-center gap-1">
                    Problem Description
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="problem"
                    placeholder="Describe the issue... e.g., 'My 2019 Tahoe makes a grinding noise when braking' or 'The F-150 check engine light is on and it's running rough'"
                    value={problemDescription}
                    onChange={(e) => setProblemDescription(e.target.value)}
                    className="min-h-[150px]"
                    required
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
                              <MarkdownRenderer content={message.content} citations={message.citations || citations} />
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

                    {/* Sources Drawer */}
                    {Object.keys(citations).length > 0 && (
                      <div className="border-t pt-4">
                        <Drawer>
                          <DrawerTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full">
                              <FileText className="h-4 w-4 mr-2" />
                              View Sources ({Object.keys(citations).length})
                            </Button>
                          </DrawerTrigger>
                          <DrawerContent>
                            <DrawerHeader>
                              <DrawerTitle>Sources Used</DrawerTitle>
                              <DrawerDescription>
                                Manual excerpts and references used in this diagnostic
                              </DrawerDescription>
                            </DrawerHeader>
                            <div className="max-h-[400px] overflow-y-auto px-4">
                              <div className="space-y-4 pb-4">
                                 {Object.entries(citations).map(([key, citation]) => (
                                  <Card key={key} className="p-4">
                                    {citation.isFigure && citation.figureUrl ? (
                                      <div>
                                        <div className="flex items-center gap-2 mb-3">
                                          <Badge variant="secondary">{key}</Badge>
                                          <span className="text-xs text-muted-foreground">Figure</span>
                                        </div>
                                        {citation.manualTitle && (
                                          <p className="text-sm font-medium mb-2">{citation.manualTitle}</p>
                                        )}
                                        <img 
                                          src={citation.figureUrl}
                                          alt={citation.snippet || "Diagram"}
                                          className="w-full rounded-lg border mb-2"
                                        />
                                        {citation.snippet && (
                                          <p className="text-sm text-muted-foreground">{citation.snippet}</p>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="secondary">{key}</Badge>
                                            <span className="text-sm text-muted-foreground">
                                              Page {citation.page}
                                            </span>
                                          </div>
                                          {citation.manualTitle && (
                                            <p className="text-sm font-medium mb-2">{citation.manualTitle}</p>
                                          )}
                                          {citation.snippet && (
                                            <p className="text-sm text-muted-foreground line-clamp-3">
                                              {citation.snippet}
                                            </p>
                                          )}
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            let url = `/manual/${citation.manualId}?page=${citation.page}`;
                                            if (citation.bbox) {
                                              url += `&x1=${citation.bbox.x1}&y1=${citation.bbox.y1}&x2=${citation.bbox.x2}&y2=${citation.bbox.y2}`;
                                            }
                                            navigate(url);
                                          }}
                                        >
                                          Open
                                        </Button>
                                      </div>
                                    )}
                                  </Card>
                                 ))}
                              </div>
                            </div>
                          </DrawerContent>
                        </Drawer>
                      </div>
                    )}

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
