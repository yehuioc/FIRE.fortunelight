"""Align generated voices to the existing picture, and export dry WAVs and previews."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave
import numpy as np
from audio import build_music, read_wave, srt_time, write_wave, RATE, DURATION


def call(ffmpeg, args):
    return subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)],
                          check=True, capture_output=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--manifest', type=Path, action='append', required=True)
    args = parser.parse_args()
    demo = Path(__file__).resolve().parent
    work = demo / '.work' / 'gptsovits'
    output = demo / 'output'
    jobs = {}
    sources = []
    for path in args.manifest:
        source = json.loads(path.read_text(encoding='utf-8'))
        sources.append(source)
        jobs.update({job['id']: job for job in source['jobs']})
    timings = json.loads((demo / '.work' / 'captions.json').read_text(encoding='utf-8'))
    assert len(timings) == 14
    original = output / 'Fortune-Light-60s-1080p.mp4'
    original_hash = hashlib.sha256(original.read_bytes()).hexdigest()
    music = build_music()
    results = []
    for language in ['zh', 'ja']:
        voice = np.zeros(RATE * DURATION, dtype=np.float64)
        clips = []
        for i, timing in enumerate(timings):
            job = jobs['%s-%02d' % (language, i)]
            sound, sample_rate = read_wave(job['file'])
            block = max(1, sample_rate // 100)
            rms = np.array([np.sqrt(np.mean(sound[j:j+block] ** 2)) for j in range(0, len(sound), block)])
            active = np.flatnonzero(rms > max(0.002, float(rms.max()) * 0.018))
            if not len(active):
                raise ValueError('Silent clip: ' + job['id'])
            trim_start = max(0, active[0] * block / sample_rate - 0.075)
            trim_end = min(len(sound) / sample_rate, (active[-1] + 1) * block / sample_rate + 0.11)
            duration = trim_end - trim_start
            available = timing['end'] - timing['start'] - 0.035
            speed = max(1.0, duration / available)
            if speed > 1.50:
                raise ValueError('Regenerate or shorten %s: requires %.3fx speed' % (job['id'], speed))
            target = work / (job['id'] + '-aligned.wav')
            call(args.ffmpeg, ['-ss', trim_start, '-t', duration, '-i', job['file'], '-af',
                              'atempo=%.7f,highpass=f=65,afade=t=in:d=0.008' % speed,
                              '-ar', RATE, '-ac', 1, '-c:a', 'pcm_s16le', target])
            adjusted, actual_rate = read_wave(target)
            assert actual_rate == RATE
            start = round(timing['start'] * RATE)
            end = start + len(adjusted)
            if end > round(timing['end'] * RATE) + round(.02 * RATE):
                raise ValueError('Speech exceeds subtitle slot: ' + job['id'])
            peak = np.max(np.abs(adjusted))
            adjusted *= 0.60 / peak
            voice[start:end] += adjusted
            clips.append(dict(id=job['id'], text=job['text'], start=timing['start'], end=round(end / RATE, 4),
                              trim_start=round(trim_start, 4), trim_end=round(trim_end, 4), tempo=round(speed, 4),
                              input=job['file']))
        name = 'Fortune-Light-60s-GPTSoVITS-' + language
        raw_voice = work / (language + '-voice-raw.wav')
        write_wave(raw_voice, voice)
        dry = output / (name + '.wav')
        call(args.ffmpeg, ['-i', raw_voice, '-af', 'loudnorm=I=-18:TP=-2:LRA=8', '-ar', RATE,
                          '-ac', 1, '-c:a', 'pcm_s24le', dry])
        pcm = call(args.ffmpeg, ['-i', dry, '-ar', RATE, '-ac', 1, '-f', 'f64le', 'pipe:1']).stdout
        normalized = np.frombuffer(pcm, dtype='<f8')
        if len(normalized) != RATE * DURATION:
            raise ValueError('Dry narration is not exactly 60 seconds.')
        mix_raw = work / (language + '-mix-raw.wav')
        mix = music + normalized[:, None]
        if np.max(np.abs(mix)) >= .999:
            raise ValueError('Premix would clip.')
        write_wave(mix_raw, mix)
        soundtrack = work / (language + '-soundtrack.wav')
        call(args.ffmpeg, ['-i', mix_raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', RATE,
                          '-c:a', 'pcm_s24le', soundtrack])
        movie = output / (name + '.mp4')
        call(args.ffmpeg, ['-i', original, '-i', soundtrack, '-map', '0:v:0', '-map', '1:a:0',
                          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', 60, '-movflags', '+faststart',
                          '-metadata', 'title=Fortune Light - GPT-SoVITS ' + language,
                          '-metadata', 'comment=AI-generated narration using user-provided local models and reference audio; original Chinese UI and graphics.',
                          movie])
        subtitles = output / (name + '.srt')
        subtitles.write_text('\n'.join('%s\n%s --> %s\n%s\n' % (i+1, srt_time(c['start']), srt_time(c['end']), c['text'])
                                        for i, c in enumerate(clips)), encoding='utf-8')
        results.append({'language': language, 'dry_wav': str(dry), 'preview_mp4': str(movie),
                        'subtitle_srt': str(subtitles), 'duration': DURATION, 'sample_rate': RATE,
                        'clips': clips, 'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [dry, movie, subtitles]}})
    if hashlib.sha256(original.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError('Original video changed unexpectedly.')
    evidence = {'producer': 'codex', 'reference': sources[0]['reference'],
                'model_version_detected': sources[0]['model_version_detected'],
                'peak_allocated_mib': max(s.get('peak_allocated_mib', 0) for s in sources),
                'peak_reserved_mib': max(s.get('peak_reserved_mib', 0) for s in sources),
                'original_video_sha256': original_hash, 'outputs': results}
    (output / 'gptsovits-verification.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'complete': True, 'languages': [r['language'] for r in results],
                      'peak_reserved_mib': evidence['peak_reserved_mib']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
