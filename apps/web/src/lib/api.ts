const API = process.env.NEXT_PUBLIC_API ?? "";
export async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json() as Promise<T>;
}
