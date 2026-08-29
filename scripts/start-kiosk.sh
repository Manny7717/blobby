#!/bin/sh
set -eu

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

# The Debian launcher currently injects a removed V8 flag on this 16 KiB-page
# kernel. Invoke the packaged binary directly until that launcher bug is fixed.
exec /usr/lib/chromium/chromium \
  --ozone-platform=wayland \
  --kiosk \
  --no-proxy-server \
  --no-first-run \
  --no-default-browser-check \
  --noerrdialogs \
  --disable-session-crashed-bubble \
  --disable-infobars \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --password-store=basic \
  --user-data-dir=/home/terminal/.config/lappy/chromium-kiosk \
  http://127.0.0.1:4318/
