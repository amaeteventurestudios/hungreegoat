import "server-only";
export function apiOrigin(): string {
  const url = new URL(process.env.STUDIO_API_URL ?? "http://127.0.0.1:8310");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("STUDIO_API_URL must be an HTTP origin without credentials or path");
  }
  return url.origin;
}

