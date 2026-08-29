#!/usr/bin/env python3
"""Local streaming "Hey Lappy" detector using sherpa-onnx.

The browser sends 16 kHz mono int16 PCM frames through the localhost Node
service. No microphone audio or wake inference leaves the Raspberry Pi.
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import sherpa_onnx

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4391
ROOT = Path(__file__).resolve().parent
MODEL = Path(os.environ.get(
    "WAKE_MODEL_PATH",
    ROOT / "models" / "sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20",
))
KEYWORD_VARIANTS = (
    "HH EY1 L AE1 P IY0",
    "HH EY1 L AE1 P IY1",
    "HH EY1 L AA1 P IY0",
    "HH EY1 L AH0 P IY0",
    # This bilingual KWS model sometimes maps an English phrase onto its
    # acoustically equivalent pinyin tokens, especially for synthetic voices.
    "h ēi l ā p ī",
    "h ēi l ā d īng",
    "h ēi l án t īng",
)

spotter = None
stream = None
current_sensitivity = 0.5
armed_at = 0.0
last_reset_at = 0.0
lock = threading.Lock()
ready = threading.Event()
load_error = ""
stats = {
    "frames": 0,
    "samples": 0,
    "detections": 0,
    "last_frame_at": 0.0,
    "last_rms": 0.0,
    "max_rms": 0.0,
}


def keyword_for_sensitivity(value: float) -> str:
    sensitivity = max(0.0, min(1.0, value))
    threshold = 0.22 - sensitivity * 0.20
    score = 3.0 + sensitivity * 3.0
    return "/".join(
        f"{tokens} :{score:.2f} #{threshold:.3f} @HEY_LAPPY"
        for tokens in KEYWORD_VARIANTS
    )


def reset_stream(sensitivity: float | None = None, startup_guard: bool = False) -> None:
    global stream, current_sensitivity, armed_at, last_reset_at
    if sensitivity is not None:
        current_sensitivity = max(0.0, min(1.0, sensitivity))
    stream = spotter.create_stream(keyword_for_sensitivity(current_sensitivity))
    last_reset_at = time.time()
    if startup_guard:
        armed_at = last_reset_at + 1.25


def load() -> None:
    global spotter, load_error
    try:
        spotter = sherpa_onnx.KeywordSpotter(
            tokens=str(MODEL / "tokens.txt"),
            encoder=str(MODEL / "encoder-epoch-13-avg-2-chunk-8-left-64.int8.onnx"),
            decoder=str(MODEL / "decoder-epoch-13-avg-2-chunk-8-left-64.onnx"),
            joiner=str(MODEL / "joiner-epoch-13-avg-2-chunk-8-left-64.int8.onnx"),
            keywords_file=str(ROOT / "wake_keywords.txt"),
            num_threads=2,
            max_active_paths=16,
        )
        reset_stream(startup_guard=True)
    except Exception as exc:  # noqa: BLE001 - reported through health endpoint
        load_error = str(exc)
    finally:
        ready.set()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args) -> None:
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
            with lock:
                snapshot = dict(stats)
            self._json(200, {
                "ok": spotter is not None,
                "ready": ready.is_set(),
                "error": load_error,
                **snapshot,
            })
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path not in ("/frame", "/reset"):
            self._json(404, {"error": "not found"})
            return
        ready.wait(timeout=30)
        if spotter is None:
            self._json(503, {"error": load_error or "Wake model failed to load."})
            return
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length) if length else b""
        with lock:
            if self.path == "/reset":
                try:
                    sensitivity = float(json.loads(body or b"{}").get("sensitivity", 0.5))
                except (ValueError, TypeError, json.JSONDecodeError):
                    sensitivity = 0.5
                reset_stream(sensitivity, startup_guard=True)
                self._json(200, {"ok": True})
                return
            if not body or len(body) % 2:
                self._json(400, {"error": "Expected 16-bit PCM audio."})
                return
            samples = np.frombuffer(body, dtype="<i2").astype(np.float32) / 32768.0
            stats["frames"] += 1
            stats["samples"] += len(samples)
            stats["last_frame_at"] = time.time()
            rms = float(np.sqrt(np.mean(np.square(samples)))) if len(samples) else 0.0
            stats["last_rms"] = round(rms, 5)
            stats["max_rms"] = round(max(stats["max_rms"], rms), 5)
            # A fresh decoder recognizes short custom phrases much more
            # reliably than one carrying minutes of ambient hypotheses.
            if time.time() - last_reset_at >= 8 and rms < 0.08:
                reset_stream()
            stream.accept_waveform(16000, samples)
            detected = False
            while spotter.is_ready(stream):
                spotter.decode_stream(stream)
                if spotter.get_result(stream):
                    detected = True
                    break
            if detected and time.time() < armed_at:
                detected = False
                reset_stream()
            if detected:
                stats["detections"] += 1
                reset_stream()
            self._json(200, {"detected": detected})


if __name__ == "__main__":
    threading.Thread(target=load, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
