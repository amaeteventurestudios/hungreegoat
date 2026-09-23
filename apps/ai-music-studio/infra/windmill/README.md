# Studio Windmill source image

```sh
docker build -t hg-studio-windmill:1.817.0-source -f infra/windmill/Dockerfile infra/windmill
```

This builds the pinned upstream source with Python and QuickJS features, one
Cargo compile job, no LTO/debug symbols, and cached compilation. The first build
is substantial; monitor host memory/disk and keep existing broadcast services
healthy. It does not install packages on the host or change existing containers.

Upstream's [versioned license](https://github.com/windmill-labs/windmill/blob/v1.817.0/LICENSE)
distinguishes its AGPL source build from its published Community Edition binary.
This image compiles without private/enterprise features and retains the AGPL,
Apache and repository license notices. Source archive version and SHA256 are
pinned in the Dockerfile. The unmodified source is available from the linked
repository tag; retain source and this build recipe with deployed artifacts.

No upstream frontend is bundled: the Studio API is the only control plane used
by end users. Only packaged Studio Python handlers are dispatched. The runtime
uses a non-root user with container resource limits, no Docker socket and no
privileged Linux namespaces. Windmill's nested nsjail is disabled; container
isolation is the execution boundary. Do not expose this worker to user-submitted
scripts or mount unrelated host paths.

Runtime provisioning and real execution verification are tracked in
`docs/ORCHESTRATION_CONTRACT.md` and the active execution plan. Building an image
alone is not evidence of a working orchestration integration.
