import { apiOrigin } from "@/lib/server-config";
export const dynamic = "force-dynamic";
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 + 64 * 1024;
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
  const upload = request.method === "POST" && path.length === 4 && path[0] === "projects" && path[2] === "assets" && path[3] === "upload";
  let uploadExceeded = false;
  try {
    let body: BodyInit | undefined;
    if (upload) {
      const sessionResponse = await fetch(new URL("/api/v1/auth/session", apiOrigin()), { headers: { cookie: headers.get("cookie") ?? "" }, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) });
      if (!sessionResponse.ok) throw new Error("Session unavailable");
      const session = await sessionResponse.json() as { authenticated: boolean; csrf_token: string | null };
      if (!session.authenticated) return Response.json({ error: { code: "unauthorized", message: "Sign in before uploading audio.", details: {} } }, { status: 401 });
      const publicOrigin = new URL(process.env.STUDIO_PUBLIC_URL ?? "http://localhost:3210").origin;
      if (headers.get("origin") !== publicOrigin || !session.csrf_token || headers.get("x-csrf-token") !== session.csrf_token) return Response.json({ error: { code: "forbidden", message: "The upload request could not be verified.", details: {} } }, { status: 403 });
      if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) throw new RequestTooLarge();
      let bytes = 0;
      body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_UPLOAD_BYTES) { uploadExceeded = true; throw new RequestTooLarge(); }
        controller.enqueue(chunk);
      } }));
    } else body = await boundedBody(request) as BodyInit | undefined;
    const init: RequestInit & { duplex?: "half" } = { method: request.method, headers, body, redirect: "manual", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(upload ? 120000 : 30000)]) };
    if (upload && body) init.duplex = "half";
    const upstream = await fetch(url, init);
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "x-content-type-options", "x-request-id", "content-disposition", "content-range", "accept-ranges", "retry-after"]) {
      const value = upstream.headers.get(name); if (value) responseHeaders.set(name, value);
    }
    if (!upstream.headers.get("content-encoding") && upstream.headers.has("content-length")) responseHeaders.set("content-length", upstream.headers.get("content-length")!);
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof RequestTooLarge || uploadExceeded) return Response.json({ error: { code: "request_too_large", message: upload ? "The upload exceeds the 100 MiB audio limit." : "The request exceeds the 1 MiB limit.", details: {} } }, { status: 413, headers: { "cache-control": "no-store" } });
    console.error(JSON.stringify({ event: "studio_api_proxy_unavailable", error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ error: { code: "api_unavailable", message: "The Studio connection is unavailable. Please try again.", details: {} } }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD };
