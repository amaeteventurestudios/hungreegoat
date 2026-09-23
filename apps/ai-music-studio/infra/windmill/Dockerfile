# Headless AGPL source build. No proprietary/private/enterprise features.
FROM rust:1.97-slim-trixie AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git pkg-config libssl-dev clang mold cmake protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*
ARG WINDMILL_VERSION=1.817.0
ARG SOURCE_SHA256=093ba2e8a9d436de80ffaf52bb0abee2998e5fc82d3d646dbbb07d2c89ca84ce
RUN curl --fail --location --retry 3 \
    "https://github.com/windmill-labs/windmill/archive/refs/tags/v${WINDMILL_VERSION}.tar.gz" \
    -o /tmp/source.tar.gz \
    && echo "${SOURCE_SHA256}  /tmp/source.tar.gz" | sha256sum -c - \
    && mkdir /source && tar -xzf /tmp/source.tar.gz -C /source --strip-components=1 \
    && rm /tmp/source.tar.gz
WORKDIR /source/backend
ENV SQLX_OFFLINE=true CARGO_BUILD_JOBS=1 CARGO_INCREMENTAL=0 \
    CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_DEBUG=0 \
    CARGO_NET_GIT_FETCH_WITH_CLI=true
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/source/backend/target \
    cargo build --locked --release --no-default-features --features python,quickjs \
    -p windmill --bin windmill && cp target/release/windmill /windmill

FROM python:3.12-slim-trixie
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    libssl3t64 tini git && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv==0.12.18 \
    && useradd --uid 1000 --create-home studio \
    && mkdir -p /tmp/windmill /opt/studio && chown studio:studio /tmp/windmill /opt/studio
COPY --from=builder /windmill /usr/local/bin/windmill
COPY --from=builder /source/LICENSE /usr/share/licenses/windmill/LICENSE
COPY --from=builder /source/LICENSE-AGPL /usr/share/licenses/windmill/LICENSE-AGPL
COPY --from=builder /source/LICENSE-APACHE /usr/share/licenses/windmill/LICENSE-APACHE
COPY start.sh /usr/local/bin/studio-windmill-start
RUN chmod 0755 /usr/local/bin/studio-windmill-start
LABEL org.opencontainers.image.source="https://github.com/windmill-labs/windmill" \
    org.opencontainers.image.version="1.817.0" \
    org.opencontainers.image.licenses="AGPL-3.0-only"
ENV PYTHON_PATH=/usr/local/bin/python3 UV_PATH=/usr/local/bin/uv \
    DISABLE_NSJAIL=true ENABLE_UNSHARE_PID=false FAVOR_UNSHARE_PID=false
USER studio
WORKDIR /opt/studio
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/studio-windmill-start"]
