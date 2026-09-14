#!/bin/bash
# Copies the shared brand assets into the control app's static folder (run before deploying to the Pi).
set -e; H=$(cd "$(dirname "$0")/../../.." && pwd)
mkdir -p "$H/apps/control/static/assets/img" "$H/apps/control/static/assets/fonts"
cp "$H"/packages/brand/assets/img/{hungree-goat-logo*.png,hungree-goat-logo.svg,sidebar-art*.webp,dashboard-hero*.webp,default-track-art*} "$H/apps/control/static/assets/img/"
cp "$H"/packages/brand/fonts/*.ttf "$H/apps/control/static/assets/fonts/"
echo "brand assets synced into apps/control/static/assets"
