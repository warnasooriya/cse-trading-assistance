export type HttpClient = {
  getJson: <T>(url: string) => Promise<T>;
  requestJson: <T>(url: string, init: RequestInit) => Promise<T>;
};

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("cse_ai_token");
  } catch {
    return null;
  }
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const token = getAuthToken();
  const base: Record<string, string> = { Accept: "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return { ...base, ...(extra as Record<string, string> | undefined) };
}

export const httpClient: HttpClient = {
  getJson: async <T>(url: string) => {
    const res = await fetch(url, { headers: buildHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  },
  requestJson: async <T>(url: string, init: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: buildHeaders(init.headers)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text.trim()) return undefined as T;
    return JSON.parse(text) as T;
  }
};
