#!/bin/sh
set -eu
if [ -z "${SUPERADMIN_SECRET:-}" ]; then
    unset SUPERADMIN_SECRET
fi
exec /usr/local/bin/windmill
