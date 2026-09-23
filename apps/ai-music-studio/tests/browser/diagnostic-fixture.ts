import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const studioRoot = path.resolve(__dirname, "../..");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Uses only the uniquely marked, generated-audio browser fixture project. */
export async function diagnosticProject(): Promise<string> {
  const directory = path.join(studioRoot, "test-results/domain-fixtures");
  const files = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".json")).map(async name => {
    const filename = path.join(directory, name);
    return { filename, modified: (await stat(filename)).mtimeMs };
  }));
  for (const file of files.sort((a, b) => b.modified - a.modified)) {
    const fixture = JSON.parse(await readFile(file.filename, "utf8"));
    if (uuid.test(fixture.project_id) && uuid.test(fixture.asset_id) && fixture.description?.startsWith("Generated original one-second")) return fixture.project_id;
  }
  throw new Error("Run the domain browser journey first to create an isolated diagnostic fixture project.");
}

export async function createDiagnostic(projectId: string, seconds: number, failFirst = false): Promise<string> {
  if (!uuid.test(projectId)) throw new Error("Invalid diagnostic fixture project ID.");
  const args = ["scripts/create-diagnostic-job.py", "--project-id", projectId, "--idempotency-key", randomUUID(), "--duration-seconds", String(seconds), "--payload", "Original Studio browser diagnostic fixture"];
  if (failFirst) args.push("--fail-first-attempt");
  let stdout: string;
  try {
    ({ stdout } = await execute("python3", args, { cwd: studioRoot, timeout: 30000, maxBuffer: 65536 }));
  } catch {
    // Avoid including subprocess output or private runtime configuration in reports.
    throw new Error("Private diagnostic creation failed; inspect the operator helper without exposing credentials.");
  }
  const created = JSON.parse(stdout);
  if (!uuid.test(created.job_id)) throw new Error("Diagnostic helper did not return a logical job ID.");
  return created.job_id;
}
