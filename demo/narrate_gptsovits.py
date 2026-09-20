"""Use the authorized local GPT-SoVITS installation, with a bounded GPU budget."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--gsv-root', type=Path, required=True)
    parser.add_argument('--gpt-weight', default='GPT_weights_v2ProPlus/圣娅-e10.ckpt')
    parser.add_argument('--sovits-weight', default='SoVITS_weights_v2ProPlus/圣娅_e10_s200_l32.pth')
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--prompt-json', type=Path, required=True)
    parser.add_argument('--only', default='', help='Optional comma-separated job IDs, e.g. zh-00,ja-00')
    parser.add_argument('--seed', type=int, default=20260921)
    parser.add_argument('--temperature', type=float, default=1.0)
    parser.add_argument('--speech-overrides', type=Path)
    args = parser.parse_args()
    demo = Path(__file__).resolve().parent
    work = demo / '.work' / 'gptsovits'
    work.mkdir(parents=True, exist_ok=True)
    install = args.gsv_root.resolve()
    reference = args.reference.resolve()
    prompt = json.loads(args.prompt_json.read_text(encoding='utf-8'))
    prompt_text = ''.join(s['text'] for s in prompt['segments']).strip()
    speech_overrides = json.loads(args.speech_overrides.read_text(encoding='utf-8')) if args.speech_overrides else {}
    if not prompt_text or not reference.is_file():
        raise ValueError('A real reference recording and its transcript are required.')
    for key, relative in [('TEMP', 'temp'), ('TMP', 'temp'), ('HF_HOME', 'hf-cache'),
                          ('TORCH_HOME', 'torch-cache'), ('NUMBA_CACHE_DIR', 'numba-cache')]:
        location = work / relative
        location.mkdir(exist_ok=True)
        os.environ[key] = str(location)
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', PYTHONDONTWRITEBYTECODE='1')
    os.environ['PATH'] = str(install / 'runtime') + os.pathsep + os.environ['PATH']
    sys.dont_write_bytecode = True
    os.chdir(install)
    sys.path.insert(0, str(install))
    sys.path.insert(0, str(install / 'GPT_SoVITS'))
    import numpy as np
    import soundfile as sf
    import torch
    from GPT_SoVITS.TTS_infer_pack.TTS import TTS, TTS_Config

    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is unavailable; do not silently run a different configuration.')
    torch.set_num_threads(6)
    # 5 GiB allocator ceiling leaves room for the CUDA context below the user's 6 GB budget.
    allocator_budget = 5 * 1024 ** 3
    torch.cuda.set_per_process_memory_fraction(allocator_budget / torch.cuda.get_device_properties(0).total_memory)
    torch.cuda.reset_peak_memory_stats()
    stop = threading.Event()
    samples = []

    def sample_gpu():
        while not stop.is_set():
            try:
                raw = subprocess.check_output(['nvidia-smi', '--query-gpu=memory.used', '--format=csv,noheader,nounits'],
                                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=4)
                samples.append({'time': time.time(), 'whole_gpu_used_mib': int(raw.decode().strip().splitlines()[0])})
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
            stop.wait(0.75)

    sampler = threading.Thread(target=sample_gpu, daemon=True)
    sampler.start()
    config_path = work / 'tts-config.yaml'
    config_path.write_text(json.dumps({'custom': {
        'device': 'cuda', 'is_half': True,
        't2s_weights_path': str(install / args.gpt_weight),
        'vits_weights_path': str(install / args.sovits_weight),
        'bert_base_path': str(install / 'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large'),
        'cnhuhbert_base_path': str(install / 'GPT_SoVITS/pretrained_models/chinese-hubert-base')
    }}, ensure_ascii=False, indent=2), encoding='utf-8')
    config = TTS_Config(str(config_path))
    pipeline = TTS(config)
    story = json.loads((demo / 'story.json').read_text(encoding='utf-8'))
    japanese = json.loads((demo / 'narration.ja.json').read_text(encoding='utf-8'))
    jobs = []
    for language in ['zh', 'ja']:
        for scene in story['scenes']:
            lines = scene['subtitle'] if language == 'zh' else japanese['scenes'][scene['id']]
            for text in lines:
                index = sum(1 for j in jobs if j['language'] == language)
                jobs.append({'id': '%s-%02d' % (language, index), 'language': language, 'scene': scene['id'], 'text': text})
    # Exercise both languages before continuing with the whole narration.
    jobs.sort(key=lambda j: (int(j['id'][-2:]) != 0, j['language'] != 'zh', j['id']))
    if args.only:
        selected = set(args.only.split(','))
        jobs = [j for j in jobs if j['id'] in selected]
    evidence = {'producer': 'codex', 'reference': str(reference), 'reference_sha256': hashlib.sha256(reference.read_bytes()).hexdigest(),
                'prompt_text': prompt_text, 'prompt_language': 'ja', 'model_version_detected': pipeline.configs.version,
                'gpt_weights': pipeline.configs.t2s_weights_path, 'sovits_weights': pipeline.configs.vits_weights_path,
                'allocator_budget_mib': 5120, 'jobs': []}
    manifest = work / ('synthesis-%s.json' % args.seed)
    try:
        for job in jobs:
            target = work / ('%s-%s.wav' % (job['id'], args.seed))
            spoken_text = speech_overrides.get(job['id'], job['text'])
            params = dict(text=spoken_text, text_lang='all_' + job['language'], ref_audio_path=str(reference),
                          prompt_text=prompt_text, prompt_lang='ja', text_split_method='cut0',
                          top_k=5, top_p=1.0, temperature=args.temperature, batch_size=1, split_bucket=False,
                          speed_factor=1.0, fragment_interval=0.12, seed=args.seed + int(job['id'][-2:]),
                          parallel_infer=False, repetition_penalty=1.35, sample_steps=32, super_sampling=False)
            begin = time.monotonic()
            chunks = list(pipeline.run(params))
            if not chunks or len({rate for rate, _ in chunks}) != 1:
                raise RuntimeError('Invalid audio response: ' + job['id'])
            rate = chunks[0][0]
            audio = np.concatenate([a for _, a in chunks])
            if len(audio) / rate < 0.5 or np.max(np.abs(audio.astype(np.float64))) < 10:
                raise RuntimeError('Empty/silent synthesis: ' + job['id'])
            sf.write(str(target), audio, rate, subtype='PCM_16')
            info = sf.info(str(target))
            row = dict(job, file=str(target), duration=info.duration, sample_rate=info.samplerate,
                       inference_text=spoken_text, temperature=args.temperature, seed=args.seed + int(job['id'][-2:]),
                       wall_seconds=round(time.monotonic() - begin, 3),
                       peak_allocated_mib=round(torch.cuda.max_memory_allocated() / 1024 ** 2, 1),
                       peak_reserved_mib=round(torch.cuda.max_memory_reserved() / 1024 ** 2, 1))
            evidence['jobs'].append(row)
            evidence['whole_gpu_samples'] = samples
            manifest.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
            print('JOB_COMPLETE ' + json.dumps(row, ensure_ascii=False), flush=True)
    finally:
        stop.set()
        sampler.join(timeout=5)
        evidence['whole_gpu_samples'] = samples
        evidence['peak_allocated_mib'] = round(torch.cuda.max_memory_allocated() / 1024 ** 2, 1)
        evidence['peak_reserved_mib'] = round(torch.cuda.max_memory_reserved() / 1024 ** 2, 1)
        manifest.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
