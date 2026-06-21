const API = process.env.NEXT_PUBLIC_API ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "demo-key";

export async function getJSON<T>(path: string): Promise<T> {
  const url = API ? `${API}${path.replace(/^\/api/, "")}` : path;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const url = API ? `${API}${path.replace(/^\/api/, "")}` : path;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<T>;
}
