import { supabase } from "@/integrations/supabase/client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  // TEMPORARY: Bypass auth check
  // const { data: { session } } = await supabase.auth.getSession();
  // const token = session?.access_token;
  const token = "dummy-token";

  // if (!token) {
  //   throw new Error("No authenticated session");
  // }

  const headers = {
    "Authorization": `Bearer ${token}`,
    ...options.headers,
  };

  // Only set Content-Type if not FormData (which sets it automatically with boundary)
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response;
}
