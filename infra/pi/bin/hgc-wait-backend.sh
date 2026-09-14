#!/bin/bash
# Wait (up to 60s) for the control backend so Liquidsoap's first fetch succeeds.
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:8090/api/health && exit 0; sleep 2; done
echo "control backend not answering; starting anyway (backup playlist will carry)" >&2
exit 0
