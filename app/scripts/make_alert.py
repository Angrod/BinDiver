"""Write assets/alert.wav: 0.18 s at 880 Hz then 0.18 s at 1320 Hz, 16-bit mono at 44.1 kHz,
with 10 ms fades on each tone and a peak of -6 dBFS.

Standard library only. Run from app/: python3 scripts/make_alert.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 44100
TONES = [(880.0, 0.18), (1320.0, 0.18)]
FADE = 0.010
AMPLITUDE = 0.5  # of full scale: -6 dBFS

OUT = Path(__file__).resolve().parent.parent / "assets" / "alert.wav"


def tone(freq: float, duration: float) -> list[int]:
    n = round(RATE * duration)
    fade = round(RATE * FADE)
    out = []
    for i in range(n):
        gain = min(1.0, i / fade, (n - 1 - i) / fade)
        value = AMPLITUDE * gain * math.sin(2 * math.pi * freq * i / RATE)
        out.append(round(value * 32767))
    return out


def main() -> None:
    data = [s for freq, duration in TONES for s in tone(freq, duration)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(struct.pack(f"<{len(data)}h", *data))
    print(f"wrote {OUT} ({len(data)} samples)")


if __name__ == "__main__":
    main()
