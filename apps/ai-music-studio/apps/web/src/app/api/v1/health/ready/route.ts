import { apiOrigin } from "@/lib/server-config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const response = await fetch(`${apiOrigin()}/api/v1/health/ready`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return Response.json(await response.json(), { status: response.status });
  } catch (error) {
    console.error(JSON.stringify({ event: "api_health_unavailable", error: error instanceof Error ? error.name : "UnknownError" }));
    return Response.json({ status: "unavailable", service: "studio-api" }, { status: 503 });
  }
}

