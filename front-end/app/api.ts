const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/** POSTs JSON to the Express API. A non-JSON reply (e.g. a proxy error page) comes back as `{}`. */
export async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Without this, a cross-origin response can't store the httpOnly refresh cookie.
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}
