import { supabase } from "@/integrations/supabase/client";

// Helper to get auth token
async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("No authenticated session");
  }
  return session.access_token;
}

// List all manuals for the current user
export async function listManuals() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("manuals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Upload a new manual
export async function uploadManual(file: File, metadata: {
  title: string;
  vehicleType: string;
  vehicleModel?: string;
  yearRange?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Upload file to storage
  const fileExt = file.name.split('.').pop();
  const fileName = `${user.id}/${Date.now()}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from("manuals")
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  // Create manual record
  const { data: manual, error: insertError } = await supabase
    .from("manuals")
    .insert({
      user_id: user.id,
      title: metadata.title,
      vehicle_type: metadata.vehicleType,
      vehicle_model: metadata.vehicleModel || null,
      year_range: metadata.yearRange || null,
      file_path: fileName,
      file_type: file.type,
      file_size: file.size,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  // Trigger parsing via edge function
  const token = await getAuthToken();
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-manual`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ manualId: manual.id }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Parse manual error:", errorData);
    // Don't throw - manual is uploaded, parsing can be retried
  }

  return manual;
}

// Reprocess an existing manual
export async function reprocessManual(manualId: string) {
  const token = await getAuthToken();
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-manual`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ manualId }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(errorData.error || "Failed to reprocess manual");
  }

  return response.json();
}

// Delete a manual
export async function deleteManual(manualId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get the manual first to get the file path
  const { data: manual, error: fetchError } = await supabase
    .from("manuals")
    .select("file_path")
    .eq("id", manualId)
    .eq("user_id", user.id)
    .single();

  if (fetchError) throw fetchError;

  // Delete related data
  await supabase.from("manual_chunks").delete().eq("manual_id", manualId);
  await supabase.from("manual_spans").delete().eq("manual_id", manualId);
  await supabase.from("manual_sections").delete().eq("manual_id", manualId);
  await supabase.from("manual_figures").delete().eq("manual_id", manualId);
  await supabase.from("manual_tables").delete().eq("manual_id", manualId);
  await supabase.from("manual_pages").delete().eq("manual_id", manualId);

  // Delete the file from storage
  if (manual?.file_path) {
    await supabase.storage.from("manuals").remove([manual.file_path]);
  }

  // Delete the manual record
  const { error: deleteError } = await supabase
    .from("manuals")
    .delete()
    .eq("id", manualId)
    .eq("user_id", user.id);

  if (deleteError) throw deleteError;
}

// Get signed URL for manual PDF
export async function getManualPdfUrl(manualId: string) {
  const token = await getAuthToken();
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signed-url`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ manualId }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to get signed URL");
  }

  const data = await response.json();
  return data.signedUrl;
}

// Search manuals using RAG
export async function searchManuals(query: string, manualId?: string) {
  const token = await getAuthToken();
  
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, manualId }),
    }
  );

  if (!response.ok) {
    throw new Error("Search failed");
  }

  return response.json();
}

// Legacy fetchWithAuth for backwards compatibility
export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
  };

  // Only set Content-Type if not FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response;
}
