import { request } from "@playwright/test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { authStatePath, baseURL, ownerCredentials } from "./auth-state";

export default async function setup() {
  const context = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const artifactRoot = path.dirname(path.dirname(authStatePath));
    await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
    await chmod(artifactRoot, 0o700);
    const response = await context.post("/api/v1/auth/login", { data: ownerCredentials() });
    if (!response.ok()) throw new Error(`Browser owner login failed with HTTP ${response.status()}.`);
    const directory = path.dirname(authStatePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    await writeFile(authStatePath, JSON.stringify(await context.storageState()), { mode: 0o600 });
    await chmod(authStatePath, 0o600);
  } finally {
    await context.dispose();
  }
}
