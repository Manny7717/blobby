# Lappy terminal inspection — 2026-08-25

This is the read-only Stage 1 machine and repository inspection completed before
hardware-dependent implementation or kiosk changes.

## Host and desktop

- Hardware/kernel: Raspberry Pi 5 class (`aarch64`, `rpi-2712`), Linux
  `6.18.34+rpt-rpi-2712`.
- OS: Debian GNU/Linux 13.5 (trixie).
- Display manager: LightDM 1.32, enabled and active.
- Desktop/compositor: Raspberry Pi Desktop using labwc 0.9.7 on Wayland.
- Login: LightDM already auto-logs in the `terminal` user to `rpd-labwc`.
- Display: NewTek HDMI display on `HDMI-A-2`, current/preferred mode
  `1024×600 @ 59.993 Hz`, scale 1.0. The framebuffer also reports 1024×600.
- Backlight: no device exists under `/sys/class/backlight`; real OS brightness
  control is therefore unavailable for this display at present.

## Audio

- PipeWire 1.4.2 and WirePlumber are active.
- Current output: `Built-in Audio Digital Stereo (HDMI)`, PipeWire node 56,
  volume observed at 0.90.
- ALSA playback exposes two HDMI devices (`vc4-hdmi-0` and `vc4-hdmi-1`).
- No PipeWire or ALSA audio capture source is currently exposed. The intended
  microphone is disconnected, disabled, unsupported, or not enumerating.
- A deeper USB/kernel audit found only the touchscreen and the Suyin camera.
  The camera exposes two UVC video interfaces and no USB Audio Class interface;
  `/sys/class/sound` contains only the two HDMI playback cards. This is not a
  PipeWire profile-selection issue: the kernel has no capture device to expose.
- The `terminal` user belongs to the `audio` group.

No device names are hard-coded in the application. Browser media devices are
enumerated at runtime and selected by stable device ID when available.

## Camera

- A UVC device named `HD Camera: HD Camera` is present on USB at `/dev/video0`
  (video) and `/dev/video1` (metadata), with `/dev/media3`.
- `/dev/video0` reports capture/streaming support and formats including MJPEG
  1280×720 at 30 fps and YUYV 640×480 at 30 fps.
- `rpicam-hello --list-cameras` reports no camera because this is a USB UVC
  camera rather than a connected CSI/libcamera camera.
- The `terminal` user belongs to the `video` group.

## Runtime and installed tools

- Node.js 22.23.1, npm 10.9.8, Python 3.13.5.
- No global pnpm, Yarn, or Bun command was found.
- Chromium 149.0.7827.196, Git 2.47.3, FFmpeg 7.1.5, v4l-utils 1.30.1,
  ALSA utilities 1.2.14, and rpicam tools 1.12.0 are installed.
- `unclutter` is not installed; Lappy handles cursor hiding in the UI.

## Repository and Bloub

- `/home/terminal/Lappy` was empty and was not a Git repository at inspection
  time. No user files existed to preserve in the project directory.
- Bloub was inspected from `jeremy-prt/bloub` at commit
  `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`.
- Upstream is Vue 3 + Vite + TypeScript, MIT licensed, and implements its SVG
  animation without a general animation library. Its engine exposes the exact
  states and measured morphing required by the brief.

## Lappy/Hermes/Codex configuration

- No running Lappy or Hermes process, systemd unit, container, listening port,
  or configuration file was found in the inspected home, systemd, `/opt`, or
  `/srv` paths.
- No Hermes-related variable name is present in the current environment.
- No locally documented Hermes endpoint or schema was found, so no endpoint
  path has been guessed. The OpenAI-compatible adapter requires the documented
  chat and health paths to be configured explicitly.
- Codex has `/home/terminal/Lappy` marked trusted. Its inspected configuration
  contains model/trust settings only; no Hermes gateway entry was found. Secret
  stores were not printed or copied.
- Nothing was listening locally except SSH/RPC-related system services at
  inspection time.

### Configuration verified after the initial inspection

A private project `.env` subsequently appeared with the existing LAN gateway
origin, agent/session identifiers, credential, and explicit OpenAI-compatible
chat and health paths. Its secret was never printed or copied. The completed
local service has since verified gateway health, streamed an exact requested
response, and cancelled an in-flight response without emitting a false error.
The real endpoint did not emit structured tool-call deltas during the attempted
tool test, so real tool-event rendering remains unproven even though the adapter
and mock path support those events.

## Existing kiosk/autostart state

- No Lappy, Hermes, Chromium kiosk, or custom kiosk systemd unit exists.
- No user autostart or user systemd files were present for Lappy.
- LightDM auto-login is an existing machine setting and has not been changed.
- Standard Raspberry Pi Desktop autostart entries are present under
  `/etc/xdg/autostart`; none launch Lappy.

### Kiosk state after implementation

The two reviewed user units were installed and enabled on 2026-08-25 after the
dry-run showed their exact destinations. They are active under the existing
auto-login user manager and have passed deliberate service/Chromium crash
restart, in-app restart, confirmed kiosk exit, command-line restore, and journal
inspection. No system, LightDM, labwc, `/etc`, or boot configuration was edited.

## Constraints and current limitations

- Physical microphone tests cannot pass until a capture device enumerates.
- A custom offline “Hey Lappy” model is not installed. The implementation must
  expose an honest provider boundary and keep tap-to-talk independent.
- Gateway health, text streaming, and cancellation are proven. Structured tool
  events from the real gateway remain unproven because none were emitted in the
  attempted request.
- This display exposes no Linux backlight device. The UI reports brightness as
  unsupported rather than pretending to dim only the web page.
- No operating-system, LightDM, labwc, systemd, or autostart configuration has
  been replaced or enabled during inspection or visual development.

## Planned project files

- `src/`: Vue terminal UI, explicit state machine, provider interfaces,
  browser audio/camera providers, settings drawer, and vendored Bloub engine.
- `server/`: localhost-only Node service, typed gateway adapters, validated
  settings, and allow-listed hardware operations.
- `third_party/bloub/`: upstream license, attribution, and pinned source note.
- `deploy/systemd/` and `scripts/`: reviewable kiosk units/install helpers;
  they will remain disabled until the exact changes are reviewed.
- `.env.example`, `README.md`, and `RECOVERY.md`: configuration, installation,
  operation, security, and recovery documentation.
- `artifacts/`: exact-resolution visual verification screenshots.

## Implementation sequence

1. Verify the visual shell and all mocked states at 1024×600.
2. Verify the pinned Bloub state/expression mapping and reduced motion.
3. Exercise the local service and mock streaming conversation end to end.
4. Configure and test the real documented gateway adapter when connection
   details exist.
5. Test tap-to-talk, STT/TTS, interruption, and audio selection once a
   microphone source exists.
6. Test explicit camera preview/capture with `/dev/video0` and settings
   persistence.
7. Prepare, review, then optionally install/enable kiosk services.
8. Complete physical-device, offline-boot, and recovery verification.
