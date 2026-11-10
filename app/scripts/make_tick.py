"""Write assets/tick.wav: a 40 ms, 1 kHz tone, 16-bit mono at 44.1 kHz, with 5 ms fades.

Standard library only. Run from app/: python3 scripts/make_tick.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 44100
FREQ = 1000.0
DURATION = 0.040
FADE = 0.005
AMPLITUDE = 0.5  # of full scale

OUT = Path(__file__).resolve().parent.parent / "assets" / "tick.wav"


def samples() -> list[int]:
    n = round(RATE * DURATION)
    fade = round(RATE * FADE)
    out = []
    for i in range(n):
        gain = min(1.0, i / fade, (n - 1 - i) / fade)
        value = AMPLITUDE * gain * math.sin(2 * math.pi * FREQ * i / RATE)
        out.append(round(value * 32767))
    return out


def main() -> None:
    data = samples()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(struct.pack(f"<{len(data)}h", *data))
    print(f"wrote {OUT} ({len(data)} samples)")


if __name__ == "__main__":
    main()
