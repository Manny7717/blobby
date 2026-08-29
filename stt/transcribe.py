#!/usr/bin/env python3
"""Local whisper STT daemon for Lappy.

Binds 127.0.0.1 (no auth: the Node service is the only caller and it enforces
the browser-origin check). POST /transcribe with raw audio bytes (webm/opus,
wav, mp3, ...) -> {"text": "..."}. The model is loaded once at startup.

Run:  stt/.venv/bin/python stt/transcribe.py [port]
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.environ.get("STT_MODEL", "base.en")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4390

from faster_whisper import WhisperModel  # noqa: E402 - import after MODEL/port resolution

model = None
ready = threading.Event()


def load() -> None:
    global model
    try:
        model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    except Exception as exc:  # noqa: BLE001 - report the failure to /health
        print(f"stt: model load failed: {exc}", file=sys.stderr)
    finally:
        ready.set()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args) -> None:  # keep the journal quiet
        pass

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True, "model_loaded": ready.is_set(), "model": MODEL})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/transcribe":
            self._json(404, {"error": "not found"})
            return
        ready.wait(timeout=120)
        if model is None:
            self._json(503, {"error": "Speech recognition model failed to load."})
            return
        length = int(self.headers.get("content-length", "0"))
        audio = self.rfile.read(length) if length else b""
        if not audio:
            self._json(400, {"error": "empty audio"})
            return
        tmp_path = wav_path = ""
        try:
            with tempfile.NamedTemporaryFile(suffix=".in", delete=False) as tmp:
                tmp.write(audio)
                tmp_path = tmp.name
            wav_path = tmp_path + ".wav"
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
                check=True, capture_output=True, timeout=60,
            )
            segments, _info = model.transcribe(wav_path, language="en", beam_size=1)
            text = "".join(segment.text for segment in segments).strip()
            self._json(200, {"text": text})
        except Exception as exc:  # noqa: BLE001 - surface any failure to the caller
            self._json(500, {"error": str(exc)})
        finally:
            for path in (tmp_path, wav_path):
                if path:
                    try:
                        os.unlink(path)
                    except OSError:
                        pass


if __name__ == "__main__":
    threading.Thread(target=load, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
