# Blobby verification record — 2026-08-25

This record separates what has been exercised on the target Raspberry Pi from
what still depends on missing hardware, an unavailable model, or an actual
reboot/offline-boot window.

## Passed on the target Pi

- `npm test`: 12 files and 109 tests passed, including the pinned Bloub engine,
  Blobby interaction reducer, hidden-page animation lifecycle, and gateway stream
  termination/tool-event behavior. Isolated persistence tests prove corrupt JSON
  is backed up and invalid writes create no replacement file. The application
  shell/state switcher mounts under test, and the speech-envelope parser tracks
  PCM energy while rejecting invalid audio.
- `npm run build`: Vue/TypeScript type-check, production Vite build, and Node
  service compilation passed.
- Production Chromium at 1024×600: no overflow, browser console errors, Vite
  overlay, or clipped controls; all four main targets are 58×58 CSS pixels and
  Settings actions are at least 56 pixels high.
- Visual states: idle, listening, thinking, browser/tool activity, speaking,
  muted, camera active, microphone unavailable, and error were captured at the
  physical display resolution in `artifacts/`.
- Local service: localhost binding, root/static assets, health, validated
  settings, WebSocket conversation, cancellation, security headers, graceful
  static-file errors, and clean SIGTERM shutdown with connected clients were
  exercised.
- Browser-origin enforcement: a forged cross-origin settings mutation returned
  HTTP 403 and a forged WebSocket origin was rejected; the same-origin request
  succeeded. Local CLI requests without an Origin header remain available for
  recovery.
- Hermes gateway: real health check and streamed text response passed; cancelling
  an active stream emitted neither an error nor a false completion. A synthetic
  one-pixel PNG attachment passed through the real adapter and received the exact
  requested response. An isolated health simulation emitted disconnected and
  then reconnected after the gateway returned. The configurable response-
  inactivity timeout and premature stream-closure errors are covered by tests.
- Speech output: the production-built, lazy eSpeak-NG WebAssembly asset generated
  a valid RIFF/WAV and played to completion through Chromium. Its narrow CSP
  permission is `wasm-unsafe-eval`; general JavaScript eval remains disallowed.
  Speaking-scale updates are derived from that WAV's 16-bit PCM RMS envelope at
  roughly 30 Hz rather than from a decorative fixed loop.
- Interruption and controls: speaker mute stops speech immediately; microphone
  activation interrupts speech and an in-flight request. A trusted 750 ms press
  muted the microphone, and the next normal tap unmuted it.
- Camera: `/dev/video0` captured a physical frame; Chromium preview reported
  1280×720 video, capture stopped every active track, and the retained frame was
  cleared after the test. Camera preview is an explicit state, can be tested from
  the settings draft before saving, and remains disabled by default.
- Settings: save/read round-trip passed; invalid data returns HTTP 400 without
  replacing valid settings. Files are mode 0600. Gateway origin is display-only
  in the browser to prevent credential redirection.
- Hot-plug and display lifecycle: media-device lists refresh on `devicechange`,
  unexpected input-track termination reports microphone disconnection, the
  selected output is used for the speaker test when Chromium supports sink
  routing, and Bloub stops requesting frames while the document is hidden.
- Pi performance: the original full-rate SVG plus per-frame drop-shadow consumed
  about 200% renderer CPU at idle. Adaptive Bloub sampling and a static restrained
  glow reduced the measured settled renderer to about 35% of one core while
  preserving faster processing-state sampling and independently responsive halo
  and speech-envelope motion.
- Kiosk: both user units pass `systemd-analyze --user verify` and are installed,
  enabled, and active. Deliberately killing each main process produced a new PID
  and one successful automatic restart. The in-app restart and confirmed exit
  endpoints both returned 202; restart shut down cleanly, and the documented
  start command restored the kiosk after exit. Journald contains no credential or
  request-body output. No LightDM, labwc, `/etc`, or boot file was changed.

## Not yet passable on this hardware/configuration

- No PipeWire or ALSA capture source enumerates. Physical tap-to-talk, partial
  transcription, input selection, echo cancellation behavior, and microphone
  meter response cannot be signed off until a microphone appears. USB topology
  contains only the touchscreen and a video-only UVC camera; the kernel sound
  tree contains only HDMI playback cards, so there is no hidden capture profile
  that software can enable.
- The browser STT provider is replaceable but is not guaranteed to operate
  offline. A measured local Pi-compatible STT model/provider is still required
  for a fully offline speech-input guarantee.
- No licensed compatible “Hey Blobby” wake model is installed. The provider
  honestly reports `needs-model`; it neither opens the microphone nor fakes wake
  detection. Tap-to-talk remains independent.
- The real Hermes endpoint did not emit structured tool-call events in the test
  request. Mock tool states and OpenAI `tool_calls` parsing pass, but the live
  event shape still needs an observed sample before sign-off.
- Fresh-boot and real network-offline boot have not been exercised because they
  require a disruptive reboot/network window. Service and Chromium crash restart,
  isolated gateway loss/recovery, in-app exit, and command-line restore have
  passed. The attached-keyboard VT recovery sequence remains documented but has
  not been physically exercised.

## Safe next hardware step

Connect or enable the intended microphone and verify that it appears in both
`wpctl status` and `arecord -l`; then rerun the normal-browser microphone and
offline speech-input tests. Kiosk startup is already enabled and can be disabled
with the commands in `RECOVERY.md` before hardware work if desired.
