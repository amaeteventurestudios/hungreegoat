import { request } from "@playwright/test";
import { access, rm } from "node:fs/promises";
import { authStatePath, baseURL } from "./auth-state";

export default async function teardown() {
  try {
    await access(authStatePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const context = await request.newContext({ baseURL, storageState: authStatePath });
  let cleanupFailed = false;
  try {
    const response = await context.get("/api/v1/auth/session");
    if (!response.ok()) throw new Error("Session cleanup could not inspect the session.");
    const session = await response.json();
    if (session.authenticated) {
      const logout = await context.post("/api/v1/auth/logout", {
        headers: { Origin: baseURL, "X-CSRF-Token": session.csrf_token },
      });
      if (logout.status() !== 204) throw new Error("Session cleanup could not revoke the session.");
    }
  } catch {
    cleanupFailed = true;
  } finally {
    await context.dispose();
    await rm(authStatePath, { force: true });
  }
  if (cleanupFailed) throw new Error("Browser shared session cleanup failed; the local state was removed, but server revocation was not confirmed.");
}
