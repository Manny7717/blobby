#!/bin/sh
set -eu

# Do not block the graphical session forever when networking or the service is down.
attempt=0
while [ "$attempt" -lt 30 ]; do
  if /usr/bin/curl --fail --silent --max-time 1 http://127.0.0.1:4318/api/health >/dev/null; then
    exit 0
  fi
  attempt=$((attempt + 1))
  /usr/bin/sleep 1
done

# Chromium still starts and displays its own reconnect/offline state.
exit 0
