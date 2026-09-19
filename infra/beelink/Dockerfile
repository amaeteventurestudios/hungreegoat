# HUNGREE Goat Control + Stream image (Beelink, x86_64/AMD VAAPI).
# Shared by both the control (API+dashboard) and stream (ffmpeg) containers —
# only the runtime command differs. App code (app/hgc, app/static, app/dj-studio)
# and data/secrets/media are bind-mounted at the SAME host paths the code already
# expects (see hgc/config.py), so no container-specific path overrides are needed.
FROM ubuntu:26.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    ffmpeg mesa-va-drivers vainfo libva2 \
    curl ca-certificates fonts-dejavu-core \
    systemd dbus \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2t64 libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/hgc
COPY requirements.txt /srv/hgc/requirements.txt
# Runtime containers run as uid 1000 (aumanah), not root, so the Playwright browser
# cache must live somewhere that uid can read+execute regardless of build-time owner.
ENV PLAYWRIGHT_BROWSERS_PATH=/srv/hgc/pw-browsers
RUN python3 -m venv /srv/hgc/venv \
  && /srv/hgc/venv/bin/pip install --no-cache-dir -r requirements.txt playwright \
  && /srv/hgc/venv/bin/playwright install --with-deps chromium \
  && chmod -R a+rX /srv/hgc/pw-browsers

ENV HGC_HW_BACKEND=vaapi
ENV HGC_VAAPI_DEVICE=/dev/dri/renderD128
ENV HGC_CHROMIUM_NO_SANDBOX=1
