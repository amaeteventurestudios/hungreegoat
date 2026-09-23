import path from "node:path";

export const authStatePath = path.resolve(__dirname, "../../test-results/auth/session.json");
export const baseURL = process.env.STUDIO_TEST_BASE_URL ?? "http://localhost:3210";

export function ownerCredentials() {
  const email = process.env.STUDIO_TEST_EMAIL;
  const password = process.env.STUDIO_TEST_PASSWORD;
  if (!email || !password) throw new Error("STUDIO_TEST_EMAIL and STUDIO_TEST_PASSWORD are required for browser verification.");
  return { email, password };
}
