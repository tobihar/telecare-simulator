(function (root) {
  'use strict';

  // Synthetische Kurven für den Patientenmonitor (EKG, Pleth, arterieller Druck).
  // Die Formen sind didaktisch vereinfacht, folgen aber Herzfrequenz, Blutdruck
  // und Perfusion aus der Simulation.

  const DEFAULT_HISTORY_SECONDS = 8;
  const DEFAULT_SAMPLE_RATE = 100;
  const EPSILON = 1e-9;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const gauss = (t, center, width) => Math.exp(-(((t - center) / width) ** 2));

  // EKG in mV, t = Sekunden seit Beginn des Herzschlags. QRS-Breite bleibt
  // unabhängig von der Frequenz; die T-Welle rückt bei Tachykardie nach vorn.
  function ecgAt(t, beatSeconds) {
    const tWave = Math.min(0.36, beatSeconds * 0.5);
    return 0.12 * gauss(t, 0.08, 0.025) -
      0.1 * gauss(t, 0.165, 0.008) +
      1.05 * gauss(t, 0.185, 0.011) -
      0.25 * gauss(t, 0.205, 0.011) +
      0.26 * gauss(t, 0.185 + tWave * 0.62, 0.045);
  }

  // Plethysmogramm normiert auf 0–1, f = Anteil des Herzzyklus.
  function plethAt(f) {
    const systolic = gauss(f, 0.24, 0.1);
    const dicrotic = 0.3 * gauss(f, 0.5, 0.07);
    return clamp((systolic + dicrotic) / 1.02, 0, 1);
  }

  // Arterielle Druckkurve normiert auf 0 (diastolisch) bis 1 (systolisch).
  const ART_PEAK = 0.16;
  const ART_DECAY = 0.28;
  const ART_TAIL = Math.exp(-(1 - ART_PEAK) / ART_DECAY);
  function arterialShapeAt(f) {
    if (f < ART_PEAK) return 0.5 - 0.5 * Math.cos(Math.PI * f / ART_PEAK);
    const decay = Math.exp(-(f - ART_PEAK) / ART_DECAY) - ART_TAIL * (f - ART_PEAK) / (1 - ART_PEAK);
    const notch = -0.1 * gauss(f, 0.36, 0.022) + 0.07 * gauss(f, 0.41, 0.04);
    return clamp(decay + notch, 0, 1);
  }

  function create(vitals, options = {}) {
    const historySeconds = Math.max(4, Number(options.historySeconds) || DEFAULT_HISTORY_SECONDS);
    const sampleRate = Math.max(50, Number(options.sampleRate) || DEFAULT_SAMPLE_RATE);
    const sampleInterval = 1 / sampleRate;
    const endTime = Math.max(0, Number(vitals?.elapsed) || 0);
    const recorder = {
      historySeconds,
      sampleInterval,
      samples: [],
      beatTime: 0,
      lastSampleAt: endTime - historySeconds,
      nextSampleAt: endTime - historySeconds + sampleInterval
    };
    return advance(recorder, endTime, vitals);
  }

  function sample(recorder, time, vitals) {
    const hr = Number(vitals.hr) || 0;
    const pulsatile = hr >= 15 && !vitals.cardiacArrest;
    const beatSeconds = pulsatile ? 60 / hr : 1;
    recorder.beatTime += recorder.sampleInterval;
    if (recorder.beatTime >= beatSeconds) recorder.beatTime -= beatSeconds;
    const f = recorder.beatTime / beatSeconds;
    const sys = Number(vitals.sys) || 0;
    const dia = Number(vitals.dia) || 0;
    const perfusion = clamp(((Number(vitals.map) || 0) - 25) / 55, 0, 1);
    recorder.samples.push({
      time,
      ecg: pulsatile ? ecgAt(recorder.beatTime, beatSeconds) : 0,
      pleth: pulsatile ? 0.08 + 0.84 * perfusion * plethAt(f) : 0.08,
      art: pulsatile ? dia + (sys - dia) * arterialShapeAt(f) : (sys + 2 * dia) / 3
    });
  }

  function advance(recorder, targetTime, vitals) {
    const endTime = Number(targetTime) || 0;
    if (endTime + EPSILON < recorder.lastSampleAt) return recorder;
    while (recorder.nextSampleAt <= endTime + EPSILON) {
      sample(recorder, recorder.nextSampleAt, vitals);
      recorder.lastSampleAt = recorder.nextSampleAt;
      recorder.nextSampleAt += recorder.sampleInterval;
    }
    const cutoff = endTime - recorder.historySeconds - recorder.sampleInterval;
    const firstVisible = recorder.samples.findIndex(item => item.time >= cutoff);
    if (firstVisible > 0) recorder.samples.splice(0, firstVisible);
    return recorder;
  }

  root.GALEN_VITAL_WAVES = Object.freeze({
    DEFAULT_HISTORY_SECONDS,
    DEFAULT_SAMPLE_RATE,
    ecgAt,
    plethAt,
    arterialShapeAt,
    create,
    advance
  });
})(globalThis);
