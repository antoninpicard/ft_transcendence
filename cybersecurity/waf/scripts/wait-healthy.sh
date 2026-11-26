#!/usr/bin/env bash
# Wait until a container is healthy (its Docker healthcheck passes).
# Usage: bash cybersecurity/waf/scripts/wait-healthy.sh <container> [timeout in seconds]
# Exit code 0 when healthy; 1, with its last log lines, if it stops or stays unhealthy.
set -u

name="$1"
timeout="${2:-120}"
elapsed=0

while [ "$elapsed" -lt "$timeout" ]; do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null)" || status="missing"
  running="$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" || running="false"
  if [ "$status" = "healthy" ]; then
    echo "$name is healthy"
    exit 0
  fi
  if [ "$running" != "true" ]; then
    echo "$name is not running (status: $status). Last log lines:" >&2
    docker logs --tail 5 "$name" 2>&1 | grep -v '^{' >&2
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

echo "$name is still not healthy after ${timeout}s (status: $status). Last log lines:" >&2
docker logs --tail 5 "$name" 2>&1 | grep -v '^{' >&2
exit 1
