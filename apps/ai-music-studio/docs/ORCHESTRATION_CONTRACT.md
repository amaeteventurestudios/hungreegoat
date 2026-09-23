# Durable execution contract (Phase 06 design)

PostgreSQL holds domain jobs and job events. A separate dispatcher process reads
durable pending jobs and submits them to Windmill; FastAPI never performs the long
operation. Windmill runs a fixed packaged handler in tagged worker containers.

## Dispatch and recovery

Persist the execution UUID and attempt before the HTTP dispatch. Submit by pinned
Windmill script hash with that UUID. Reconcile a timeout by querying the same UUID;
do not submit a new paid invocation just because an HTTP response was lost.
Use PostgreSQL locks/leases for multiple dispatcher safety. Job progress is
monotonic within an attempt; terminal completion uses a conditional transaction.
Retry creates a new attempt and preserves prior events. Provider operations with
ambiguous billing outcomes require explicit reconciliation rather than blind retry.
An expired running worker lease is terminally reconciled rather than redispatched:
the deterministic diagnostic is retryable, while provider work is outcome-unknown
until an explicit reconciliation establishes that retrying cannot duplicate billing.
Progress heartbeats retain the exact job percentage but create immutable history
only at stage transitions and five-percent milestones, so terminal state remains
visible in bounded job-history responses.

The browser polls project jobs and individual job status. Closing or refreshing
the browser does not affect execution. Retry and cancel are authenticated commands;
their current availability is derived from the job's durable state. Cancellation
is cooperative for external calls and terminates local child processes safely.

## Worker boundary

Windmill arguments contain only a Studio job UUID and attempt number. A private
worker API claims an attempt, reports progress, retrieves narrowly scoped inputs,
and finalizes/fails it. Use a dedicated server-side authentication token from a
0600 mounted file; internal routes never pass through the web proxy. Worker claims
are attempt-bound, reject stale completions, and never overwrite terminal results.
Provider credentials must never appear in Windmill arguments/results/logs or
public job payloads. Workers use server-only credential access for the claimed job.

Handlers run in a dedicated Python package under `apps/worker/`, with explicit
provider/engine adapters. Windmill's script imports this fixed installed package;
users cannot submit executable code. Containers run without privilege, Docker
socket or published worker ports, and have bounded CPU/memory. The Studio API
remains responsive while audio tools run.

### Internal HTTP interface

Prefix: `/api/v1/internal/jobs/{job_id}/attempts/{attempt}`. All calls use the
service bearer token; after claim, also require `X-Job-Lease`.

- POST `/claim`: `{execution_id,worker_id}` returns job_id, attempt, execution_id,
  lease_token, lease_expires_at, kind, inputs, input_assets, cancel_requested.
- POST `/progress`: `{progress_percent,current_stage}` returns cancel_requested
  and renewed lease_expires_at.
- POST `/complete`: `{outputs:[],result:{...}}` returns state, result_asset_id,
  output_asset_ids. Output descriptors use output_id UUID, kind, parent_asset_ids,
  operation and parameters. No arbitrary filesystem paths.
- POST `/fail`: `{error_code,message,retryable,outcome_unknown:false}` returns state.
- GET `/credentials/{provider}`: only the provider authorized by this claimed job;
  returns api_key for server-only use. No-store and no secret/body logging.

The initial diagnostic kind is `system.verify`, created by a development-only
operator CLI. Its typed inputs allow bounded delay and fail-once verification;
the handler hashes an original packaged fixture. It creates no audio or provider
claims. Completion uses no outputs and a small typed diagnostic result.

Persist job_attempts with unique job/attempt and execution UUID, lease hash/expiry,
state/timestamps/result; job_outbox with dispatch lease and next dispatch time;
job current attempt, cancellation request, retry eligibility and ambiguous-outcome
flag. Active duplicate claims return 409 lease_busy; expired claims may be renewed
for the same execution. Duplicate dispatch verification checks fixed script and
job arguments, not just whether an execution UUID exists.

## Assets

Workers create exclusive immutable output objects in a per-job staging directory.
Finalization verifies metadata, owner/song relationships and storage containment,
then atomically records output assets, domain result and lineage. Repeated
finalization returns the existing result; it never creates duplicate versions.
Failed/cancelled jobs retain sanitized errors and clean unreferenced temporary
files. Immutable source and successful derived assets are never overwritten.

## Verification

Run a real Windmill job using a deterministic local fixture, check tagged routing,
progress and persistence, refresh the browser mid-job, restart the worker and
dispatcher, and verify no duplicate result. Exercise invalid input, safe retry,
cancellation, expired attempts, unauthorized internal calls and secret redaction.
Later provider fixtures must remain visibly separate from real provider evidence.

Phase 06 acceptance verified the restricted runtime token against the source-built
OSS server, a real tagged diagnostic, browser-close persistence, failure/retry,
cancellation, API/PostgreSQL restart persistence, and a forced active-worker kill.
The forced crash was reconciled as a retryable `worker_lease_expired` diagnostic
without a duplicate submission. Full browser regression passed 92 tests.

## Source build preparation

Upstream v1.817.0 source archive SHA256:
`093ba2e8a9d436de80ffaf52bb0abee2998e5fc82d3d646dbbb07d2c89ca84ce`.
`infra/windmill/Dockerfile` builds Python and QuickJS support without proprietary
features or the unused upstream frontend. It retains upstream license notices.
The build is preparatory until the Phase 06 real execution gate passes.

Source inspection of pinned OSS v1.817.0 found that service-account provisioning
and ordinary-user creation are unavailable (`workspaces_oss.rs` and
`users_oss.rs`). Do not mint the dispatcher token from the temporary
`SUPERADMIN_SECRET` identity: it remains a reserved superadmin principal even
when scopes appear narrow.

The local-development provisioner therefore uses the dedicated Windmill database
it owns to mirror the server's hash-only token schema: it creates a non-admin,
non-service-account `studio-dispatcher` membership; gives the immutable fixed
script a read-only RLS key `u/studio-dispatcher: false`; and creates one expiring
`workspace_id=studio` token with the exact scope
`jobs:run:scripts:f/studio/execute`. Its raw value is written only to the
pre-created 0600 `windmill-token` file. The bootstrap also allowlists the single
`studio-ai` tag alongside existing local tags. No password, superadmin token, or
unscoped dispatcher credential is created.

This scope permits exact-script execution and polling its own execution by ID;
it deliberately excludes workspace-wide job enumeration and script mutation.
The source-built runtime has live-verified both allowed dispatch and denied job
listing before worker/dispatcher startup.
