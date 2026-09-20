'use strict';

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function audioVolumePer(deltaInput) {
  const delta = Math.max(1, Number(deltaInput || 1));
  if (delta <= 3) return 0.34;
  if (delta <= 10) return 0.24;
  if (delta <= 30) return 0.15;
  if (delta <= 100) return 0.085;
  if (delta <= 400) return 0.045;
  return 0.025;
}

function audioStride(deltaInput) {
  const delta = Math.max(1, Number(deltaInput || 1));
  let base = 20;
  if (delta <= 20) base = 1;
  else if (delta <= 60) base = 2;
  else if (delta <= 200) base = 4;
  else if (delta <= 800) base = 10;
  // Hard-cap per-cell sound events for extreme deltas. Ignite uses four oscillators per
  // sampled cell, so keeping sampled cells <=120 avoids thousands of scheduled nodes.
  return Math.max(base, Math.ceil(delta / 120));
}

class RitualAudio {
  constructor(wxLike) {
    this.wx = wxLike || (typeof wx !== 'undefined' ? wx : null);
    this.ctx = null;
    this.master = null;
    this.available = null;
    this.lastPlayedOrder = { ignite: -1, extinguish: -1 };
    this.toneFailures = 0;
  }

  ensure() {
    if (this.available === false) return null;
    if (this.ctx) {
      try { if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume(); } catch (e) {}
      return this.ctx;
    }
    if (!this.wx || typeof this.wx.createWebAudioContext !== 'function') {
      this.available = false;
      return null;
    }
    try {
      const ctx = this.wx.createWebAudioContext();
      if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
        this.available = false;
        return null;
      }
      const master = ctx.createGain();
      if (master && master.gain) master.gain.value = 0.82;
      if (master && master.connect && ctx.destination) master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.available = true;
      try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {}
      return ctx;
    } catch (e) {
      this.available = false;
      this.ctx = null;
      this.master = null;
      return null;
    }
  }

  resetSequence() {
    this.lastPlayedOrder.ignite = -1;
    this.lastPlayedOrder.extinguish = -1;
  }

  playCell(kind, orderInput, deltaInput) {
    const kindKey = kind === 'extinguish' ? 'extinguish' : 'ignite';
    const order = Math.max(0, Math.floor(Number(orderInput || 0)));
    const delta = Math.max(1, Math.floor(Number(deltaInput || 1)));
    const stride = audioStride(delta);
    const isLast = order === delta - 1;
    if (!isLast && order % stride !== 0) return false;
    if (this.lastPlayedOrder[kindKey] === order) return false;
    this.lastPlayedOrder[kindKey] = order;
    const volume = audioVolumePer(delta);
    return kindKey === 'ignite' ? this.ignite(volume) : this.extinguish(volume);
  }

  _ramp(gainParam, now, peak, end, decay) {
    if (!gainParam) return;
    try {
      if (gainParam.setValueAtTime) gainParam.setValueAtTime(0.0001, now);
      else gainParam.value = 0.0001;
      if (gainParam.linearRampToValueAtTime) gainParam.linearRampToValueAtTime(Math.max(0.0001, peak), now + 0.008);
      else gainParam.value = Math.max(0.0001, peak);
      if (gainParam.exponentialRampToValueAtTime) gainParam.exponentialRampToValueAtTime(Math.max(0.0001, end), now + decay);
    } catch (e) {
      try { gainParam.value = Math.max(0.0001, peak); } catch (err) {}
    }
  }

  _tone(freq, type, volume, decay, delay) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return false;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      if (!osc || !gain) return false;
      const now = Number(ctx.currentTime || 0) + Math.max(0, Number(delay || 0));
      osc.type = type || 'sine';
      if (osc.frequency) {
        if (osc.frequency.setValueAtTime) osc.frequency.setValueAtTime(freq, now);
        else osc.frequency.value = freq;
      }
      this._ramp(gain.gain, now, clamp(volume, 0.0001, 0.7), 0.00012, decay);
      if (osc.connect) osc.connect(gain);
      if (gain.connect) gain.connect(this.master);
      if (osc.start) osc.start(now);
      if (osc.stop) osc.stop(now + decay + 0.06);
      this.toneFailures = 0;
      return true;
    } catch (e) {
      this.toneFailures += 1;
      if (this.toneFailures >= 3) {
        try { if (this.ctx && this.ctx.close) this.ctx.close(); } catch (err) {}
        this.ctx = null;
        this.master = null;
        this.available = false;
      }
      return false;
    }
  }

  ignite(volumeInput) {
    const volume = clamp(Number(volumeInput || 0.18), 0.01, 0.5);
    const jitter = 1 + (Math.random() - 0.5) * 0.035;
    const base = 880 * jitter;
    const partials = [
      [1.00, 1.00, 1.60],
      [2.76, 0.50, 1.00],
      [5.40, 0.22, 0.60],
      [8.93, 0.10, 0.32]
    ];
    let played = false;
    partials.forEach(p => { played = this._tone(base * p[0], 'sine', volume * p[1], p[2], 0) || played; });
    return played;
  }

  extinguish(volumeInput) {
    const volume = clamp(Number(volumeInput || 0.20), 0.01, 0.5);
    const jitter = 1 + (Math.random() - 0.5) * 0.045;
    const base = 220 * jitter;
    const partials = [
      [1.00, 1.00, 1.40, 'triangle'],
      [0.50, 0.55, 1.80, 'sine'],
      [1.59, 0.35, 0.90, 'sine']
    ];
    let played = false;
    partials.forEach(p => { played = this._tone(base * p[0], p[3], volume * p[1], p[2], 0) || played; });
    return played;
  }

  celebrateChord(volumeInput) {
    const volume = clamp(Number(volumeInput || 0.30), 0.02, 0.5);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const partials = [
      [1.00, 0.40, 4.8],
      [2.00, 0.22, 3.2],
      [3.01, 0.12, 2.0],
      [5.40, 0.06, 1.2]
    ];
    let played = false;
    notes.forEach(note => partials.forEach(p => {
      played = this._tone(note * p[0], 'sine', volume * p[1], p[2], 0) || played;
    }));
    played = this._tone(130.81, 'triangle', volume * 0.55, 5.0, 0.02) || played;
    return played;
  }

  destroy() {
    try { if (this.ctx && this.ctx.close) this.ctx.close(); } catch (e) {}
    this.ctx = null;
    this.master = null;
    this.toneFailures = 0;
  }
}

module.exports = { RitualAudio, audioVolumePer, audioStride };
