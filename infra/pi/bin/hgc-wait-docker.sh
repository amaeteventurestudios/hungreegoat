#!/bin/bash
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && exit 0; sleep 2; done
echo "docker not available" >&2; exit 1
