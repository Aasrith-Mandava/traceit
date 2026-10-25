// Client helper for the JSON account routes: POST/PATCH a body, get `{ ok, status, data }` back with
// a readable `error` (the route's own message, or a network fallback). Never throws.
export interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string;
}

export async function sendJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<JsonResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
    const message = data && typeof data.error === "string" ? data.error : "";
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? data : null,
      error: res.ok ? "" : message || "Something went wrong. Please try again.",
    };
  } catch {
    return { ok: false, status: 0, data: null, error: "Couldn’t reach TraceIt. Check your connection and try again." };
  }
}
