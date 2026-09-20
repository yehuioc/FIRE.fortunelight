"""Build timed Chinese narration, original ambient sound and matching subtitles."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parent
WORK = ROOT / ".work"
OUTPUT = ROOT / "output"
RATE = 48000
DURATION = 60


def read_wave(path):
    with wave.open(str(path), "rb") as f:
        assert f.getsampwidth() == 2
        rate, channels = f.getframerate(), f.getnchannels()
        audio = np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype(np.float64) / 32768
    return audio.reshape(-1, channels).mean(axis=1), rate


def write_wave(path, data):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1 if data.ndim == 1 else data.shape[1])
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes((np.clip(data, -1, 1) * 32767).astype("<i2").tobytes())


def srt_time(value):
    milliseconds = round(value * 1000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def build_music():
    count = RATE * DURATION
    # Original generative ambient bed: slow open chords, no samples or external music.
    music = np.zeros((count, 2), dtype=np.float64)
    chords = [([146.832, 220.0, 277.183, 329.628], 0),
              ([123.471, 184.997, 246.942, 293.665], 7),
              ([97.999, 146.832, 195.998, 246.942], 13),
              ([146.832, 220.0, 293.665, 369.994], 22),
              ([123.471, 184.997, 246.942, 329.628], 33),
              ([97.999, 146.832, 220.0, 293.665], 43),
              ([146.832, 220.0, 277.183, 329.628], 52)]
    for index, (frequencies, start_sec) in enumerate(chords):
        end_sec = min(60, (chords[index + 1][1] if index+1 < len(chords) else 60) + 2)
        n = round((end_sec-start_sec)*RATE)
        time = np.arange(n)/RATE
        env = np.minimum(1, time/2.3) * np.minimum(1, (end_sec-start_sec-time)/2.4)
        for k, hz in enumerate(frequencies):
            for channel, detune in enumerate([.9993, 1.0007]):
                tone = (np.sin(2*np.pi*hz*detune*time + k*.21) + .18*np.sin(2*np.pi*2*hz*time))
                wobble = .88 + .12*np.sin(time*.43+k)
                music[round(start_sec*RATE):round(start_sec*RATE)+n, channel] += tone*env*wobble*.0075

    # Soft high bells for gain, low warm bells for exchanged days.
    def bell(at, hz, amp=.025):
        n=min(round(2.8*RATE),count-round(at*RATE));t=np.arange(n)/RATE
        envelope=(1-np.exp(-t*140))*np.exp(-t*2.2)
        sample=(np.sin(2*np.pi*hz*t)+.26*np.sin(2*np.pi*hz*2.01*t))*envelope*amp
        pan=.13*np.sin(at)
        for channel in range(2):
            music[round(at*RATE):round(at*RATE)+n,channel]+=sample*(.8+(-pan if channel else pan))
    for at,hz in [(7,587.33),(13,440),(24.2,659.26),(26.7,783.99),(29.0,880),
                  (35.0,329.63),(37,293.66),(39,246.94),(43,392),(52,440),(52.13,554.37),(52.27,659.26)]:
        bell(at,hz)
    fade=np.minimum(1,np.arange(count)/RATE/1.2)*np.minimum(1,(DURATION-np.arange(count)/RATE)/1.2)
    music*=fade[:,None]
    return music


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    story = json.loads((ROOT / "story.json").read_text(encoding="utf-8"))
    count = RATE * DURATION
    voice = np.zeros(count, dtype=np.float64)
    captions, pacing = [], []

    for i, scene in enumerate(story["scenes"]):
        durations = [len(read_wave(WORK / f"voice-{i:02}-{j}.wav")[0]) / read_wave(WORK / f"voice-{i:02}-{j}.wav")[1]
                     for j in range(len(scene["subtitle"]))]
        gap, onset, margin = .14, .23, .30
        available = scene["end"] - scene["start"] - onset - margin
        speed = max(1.0, sum(durations) / (available - gap * (len(durations) - 1)))
        assert speed < 1.30, (scene["id"], "Narration too dense", speed)
        cursor = scene["start"] + onset
        for j, caption in enumerate(scene["subtitle"]):
            adjusted = WORK / f"voice-adjusted-{i:02}-{j}.wav"
            subprocess.run([args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(WORK / f"voice-{i:02}-{j}.wav"),
                            "-af", f"atempo={speed:.6f},highpass=f=90,lowpass=f=7800,afade=t=in:d=0.02,afade=t=out:st={max(.1, durations[j]/speed-.04):.6f}:d=0.04",
                            "-ar", str(RATE), "-ac", "1", "-c:a", "pcm_s16le", str(adjusted)], check=True)
            sound, _ = read_wave(adjusted)
            peak = np.max(np.abs(sound))
            if peak:
                sound *= .49 / peak
            start = round(cursor * RATE)
            voice[start:start + len(sound)] += sound[:max(0, min(len(sound), count-start))]
            end = cursor + len(sound) / RATE
            captions.append({"start": round(cursor, 4), "end": round(end, 4), "text": caption})
            cursor = end + gap
        pacing.append({"scene": scene["id"], "tempo": round(speed, 4), "end": round(cursor-gap, 3)})

    music = build_music()
    mix=music+voice[:,None]
    assert np.max(np.abs(mix)) < .98
    write_wave(WORK / "soundtrack-raw.wav", mix)
    subprocess.run([args.ffmpeg,"-hide_banner","-loglevel","error","-y","-i",str(WORK/"soundtrack-raw.wav"),
                    "-af","loudnorm=I=-16:TP=-1.5:LRA=9","-ar",str(RATE),"-c:a","pcm_s16le",str(WORK/"soundtrack.wav")],check=True)
    (WORK/"captions.json").write_text(json.dumps(captions,ensure_ascii=False,indent=2),encoding="utf-8")
    (WORK/"audio-evidence.json").write_text(json.dumps({"duration":60,"sample_rate":RATE,"channels":2,"source":"Windows SAPI Chinese + original synthesized ambient score","segments":pacing},indent=2),encoding="utf-8")
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT/"Fortune-Light-60s.zh.srt").write_text("\n".join(f"{i+1}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}\n" for i,c in enumerate(captions)),encoding="utf-8")
    print(json.dumps({"audio_ready":True,"seconds":60,"pacing":pacing},ensure_ascii=False))


if __name__ == "__main__":
    main()
