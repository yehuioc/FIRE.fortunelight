const assert = require('assert');
const audioLib = require('../utils/ritual_audio');

function makeParam() {
  return {
    value: 0,
    setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; }
  };
}

let oscillators = 0;
let starts = 0;
let stops = 0;
const ctx = {
  currentTime: 1,
  destination: {},
  state: 'running',
  createGain() { return { gain: makeParam(), connect() {} }; },
  createOscillator() {
    oscillators += 1;
    return {
      type: 'sine',
      frequency: makeParam(),
      connect() { return this; },
      start() { starts += 1; },
      stop() { stops += 1; }
    };
  }
};
const wxFake = { createWebAudioContext() { return ctx; } };
const audio = new audioLib.RitualAudio(wxFake);
assert(audio.ensure() === ctx);
assert.strictEqual(audioLib.audioStride(12), 1);
assert.strictEqual(audioLib.audioStride(1000), 20);
assert(audioLib.audioStride(20000) >= Math.ceil(20000/120));
assert.strictEqual(audio.playCell('ignite', 0, 12), true);
assert.strictEqual(audio.playCell('ignite', 0, 12), false, 'same cell must not double sound');
assert(oscillators >= 4 && starts === oscillators && stops === oscillators);
const beforeLarge = oscillators;
audio.resetSequence();
for (let i = 0; i < 1000; i += 1) audio.playCell('ignite', i, 1000);
const largePlayed = oscillators - beforeLarge;
assert(largePlayed > 0 && largePlayed < 300, 'large delta must sample audio events rather than create 1000 notes');
const beforeHuge = oscillators;
audio.resetSequence();
for (let i = 0; i < 20000; i += 1) audio.playCell('ignite', i, 20000);
const hugeOsc = oscillators - beforeHuge;
assert(hugeOsc <= 520, 'extreme delta must cap sampled cell sound nodes');
const beforeCelebrate = oscillators;
assert.strictEqual(audio.celebrateChord(), true);
assert(oscillators > beforeCelebrate + 10, 'celebration should schedule a chord, not one beep');

const unavailable = new audioLib.RitualAudio({});
assert.strictEqual(unavailable.ensure(), null);
assert.strictEqual(unavailable.playCell('ignite', 0, 1), false);

// Repeated synthesis failures disable audio rather than throwing hundreds of exceptions.
let badOscAttempts = 0;
const badCtx = {
  currentTime: 0, destination: {}, state: 'running',
  createGain() { return { gain: makeParam(), connect() {} }; },
  createOscillator() { badOscAttempts += 1; throw new Error('OSC_FAIL'); },
  close() {}
};
const broken = new audioLib.RitualAudio({ createWebAudioContext() { return badCtx; } });
assert.strictEqual(broken.playCell('ignite', 0, 1), false);
assert.strictEqual(broken.available, false);
assert(badOscAttempts <= 3, 'broken WebAudio should be circuit-broken after repeated failures');

console.log('ritual_audio.test.js: PASS');
