# eSpeak-NG WebAssembly attribution

Lappy lazy-loads the `espeak-ng` npm package version 1.0.2 as its offline speech
fallback. The package contains eSpeak-NG compiled to JavaScript and WebAssembly
by Ian Armour.

- Package source: https://github.com/ianmarmour/espeak-ng.js
- Upstream synthesizer: https://github.com/espeak-ng/espeak-ng
- License: GPL-3.0-or-later; see `LICENSE` in this directory.

The WebAssembly payload is delivered locally with the Lappy frontend and is not
used for microphone capture, transcription, or network communication.
