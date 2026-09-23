import { apiOrigin } from "@/lib/server-config";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 1024 * 1024;
class RequestTooLarge extends Error {}
async function boundedBody(request: Request): Promise<Uint8Array | undefined> {
  if (["GET", "HEAD"].includes(request.method) || !request.body) return undefined;
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) throw new RequestTooLarge();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new RequestTooLarge(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
const forwardedHeaders = ["cookie", "origin", "x-csrf-token", "content-type", "accept", "range", "if-range"];
async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.length === 0 || path.some(segment => !/^[a-zA-Z0-9_-]+$/.test(segment) || segment.toLowerCase() === "internal")) {
    return Response.json({ error: { code: "not_found", message: "This API route is unavailable.", details: {} } }, { status: 404 });
  }
  const headers = new Headers();
  for (const name of forwardedHeaders) { const value = request.headers.get(name); if (value) headers.set(name, value); }
  const url = new URL(`/api/v1/${path.join("/")}`, apiOrigin());
  url.search = new URL(request.url).search;
  try {
    const upstream = await fetch(url, { method: request.method, headers, body: await boundedBody(request) as BodyInit | undefined, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000) });
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "x-request-id", "content-disposition", "content-range", "accept-ranges", "retry-after"]) {
      const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RequestTooLarge) return Response.json({ error: { code: "request_too_large", message: "The request exceeds the 1 MiB limit.", details: {} } }, { status: 413, headers: { "cache-control": "no-store" } });
    console.error(JSON.stringify({ event: "studio_api_proxy_unavailable", error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ error: { code: "api_unavailable", message: "The Studio connection is unavailable. Please try again.", details: {} } }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD };
