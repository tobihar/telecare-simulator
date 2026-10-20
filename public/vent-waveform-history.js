(function (root) {
  'use strict';

  const DEFAULT_HISTORY_SECONDS = 12;
  const DEFAULT_SAMPLE_RATE = 50;
  const DEFAULT_ERASE_SECONDS = 0.38;
  const EPSILON = 1e-9;

  function normalizedSettings(engine, settings) {
    return { ...engine.normalizeSettings(settings) };
  }

  function sampleCurrentWave(recorder, time, state) {
    const wave = recorder.engine.waveformAtPhase(
      recorder.phaseSeconds,
      recorder.activeSettings,
      state
    );
    recorder.samples.push({
      time,
      pressure: wave.pressure,
      flow: wave.flow,
      volume: wave.volume
    });
  }

  function advancePhase(recorder, seconds, desiredSettings, state) {
    let remaining = Math.max(0, Number(seconds) || 0);
    while (remaining > EPSILON) {
      const mechanics = recorder.engine.lungMechanics(state, recorder.activeSettings);
      const cycleSeconds = Math.max(0.1, mechanics.cycleSeconds);
      const toNextBreath = Math.max(EPSILON, cycleSeconds - recorder.phaseSeconds);
      if (remaining + EPSILON >= toNextBreath) {
        remaining = Math.max(0, remaining - toNextBreath);
        recorder.phaseSeconds = 0;
        recorder.activeSettings = normalizedSettings(recorder.engine, desiredSettings);
      } else {
        recorder.phaseSeconds += remaining;
        remaining = 0;
      }
    }
  }

  function advance(recorder, targetTime, desiredSettings, state) {
    const endTime = Math.max(recorder.lastSampleAt, Number(targetTime) || 0);
    const desired = normalizedSettings(recorder.engine, desiredSettings);
    while (recorder.nextSampleAt <= endTime + EPSILON) {
      const sampleTime = recorder.nextSampleAt;
      advancePhase(recorder, sampleTime - recorder.lastSampleAt, desired, state);
      sampleCurrentWave(recorder, sampleTime, state);
      recorder.lastSampleAt = sampleTime;
      recorder.nextSampleAt += recorder.sampleInterval;
    }

    const cutoff = endTime - recorder.historySeconds - recorder.sampleInterval;
    const firstVisible = recorder.samples.findIndex(sample => sample.time >= cutoff);
    if (firstVisible > 0) recorder.samples.splice(0, firstVisible);
    return recorder;
  }

  function create(engine, settings, state, options = {}) {
    if (!engine?.waveformAtPhase || !engine?.lungMechanics) {
      throw new Error('Beatmungs-Engine für den Kurvenpuffer fehlt.');
    }
    const historySeconds = Math.max(4, Number(options.historySeconds) || DEFAULT_HISTORY_SECONDS);
    const sampleRate = Math.max(20, Number(options.sampleRate) || DEFAULT_SAMPLE_RATE);
    const sampleInterval = 1 / sampleRate;
    const endTime = Math.max(0, Number(state?.elapsed) || 0);
    const startTime = endTime - historySeconds;
    const activeSettings = normalizedSettings(engine, settings);
    const cycleSeconds = engine.lungMechanics(state, activeSettings).cycleSeconds;
    const recorder = {
      engine,
      historySeconds,
      sampleInterval,
      samples: [],
      activeSettings,
      phaseSeconds: ((startTime % cycleSeconds) + cycleSeconds) % cycleSeconds,
      lastSampleAt: startTime,
      nextSampleAt: startTime + sampleInterval
    };
    sampleCurrentWave(recorder, startTime, state);
    return advance(recorder, endTime, activeSettings, state);
  }

  function visible(recorder, endTime) {
    const cutoff = Number(endTime) - recorder.historySeconds - recorder.sampleInterval;
    return recorder.samples.filter(sample => sample.time >= cutoff && sample.time <= Number(endTime) + EPSILON);
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function sweep(recorder, endTime, width, options = {}) {
    const time = Number(endTime) || 0;
    const displayWidth = Math.max(1, Number(width) || 1);
    const eraseSeconds = Math.max(
      recorder.sampleInterval * 2,
      Math.min(recorder.historySeconds / 4, Number(options.eraseSeconds) || DEFAULT_ERASE_SECONDS)
    );
    const cursorX = positiveModulo(time, recorder.historySeconds) / recorder.historySeconds * displayWidth;
    const points = [];
    let previousX = null;
    let previousTime = null;

    visible(recorder, time).forEach(sample => {
      const age = time - sample.time;
      if (age > recorder.historySeconds - eraseSeconds) return;
      const x = positiveModulo(sample.time, recorder.historySeconds) / recorder.historySeconds * displayWidth;
      const breakBefore = previousX === null ||
        x + EPSILON < previousX ||
        sample.time - previousTime > recorder.sampleInterval * 2.5;
      points.push({ ...sample, x, breakBefore });
      previousX = x;
      previousTime = sample.time;
    });

    return {
      cursorX,
      eraseWidth: eraseSeconds / recorder.historySeconds * displayWidth,
      points
    };
  }

  root.GALEN_VENT_WAVEFORMS = Object.freeze({
    DEFAULT_HISTORY_SECONDS,
    DEFAULT_SAMPLE_RATE,
    DEFAULT_ERASE_SECONDS,
    create,
    advance,
    visible,
    sweep
  });
})(globalThis);
