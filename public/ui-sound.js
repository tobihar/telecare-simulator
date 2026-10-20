(() => {
  'use strict';

  if (window.__GALEN_UI_SOUND_ACTIVE__) return;
  window.__GALEN_UI_SOUND_ACTIVE__ = true;

  const INTERACTIVE_SELECTOR = [
    'button',
    'summary',
    'select',
    'a[href]',
    'input[type="checkbox"]',
    'input[type="radio"]',
    '[role="button"]'
  ].join(',');

  let audioContext = null;
  let noiseBuffer = null;
  let lastClickAt = 0;
  let volumeLevel = 2;
  const LEVEL_GAIN = Object.freeze([0, .28, .5, .75, 1]);

  function soundIsEnabled(source) {
    if (volumeLevel <= 0) return false;
    if (source?.id === 'soundBtn') return true;
    const soundButton = document.getElementById('soundBtn');
    if (!soundButton) return true;
    if (soundButton.getAttribute('aria-pressed') === 'false') return false;
    if (soundButton.classList.contains('off')) return false;
    return !/pulston\s+aus/i.test(soundButton.textContent || '');
  }

  function interactiveFrom(target) {
    if (!(target instanceof Element)) return null;
    const control = target.closest(INTERACTIVE_SELECTOR);
    if (!control) return null;
    if (control.matches(':disabled,[aria-disabled="true"]')) return null;
    return control;
  }

  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }

  function getNoiseBuffer(context) {
    if (noiseBuffer?.sampleRate === context.sampleRate) return noiseBuffer;
    const length = Math.max(1, Math.round(context.sampleRate * .02));
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, 5.2);
      samples[i] = (Math.random() * 2 - 1) * envelope;
    }
    return noiseBuffer;
  }

  function addPlasticSnap(context, master, noise, startedAt, pitchFactor, delay, gain, duration) {
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const resonance = context.createBiquadFilter();
    const volume = context.createGain();
    const at = startedAt + delay;
    source.buffer = noise;
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(1250 * pitchFactor, at);
    resonance.type = 'peaking';
    resonance.frequency.setValueAtTime(3650 * pitchFactor, at);
    resonance.Q.setValueAtTime(1.35, at);
    resonance.gain.setValueAtTime(6.5, at);
    volume.gain.setValueAtTime(gain, at);
    volume.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(highPass).connect(resonance).connect(volume).connect(master);
    source.start(at);
    source.stop(at + duration + .003);
  }

  function playMechanicalClick(source) {
    if (document.hidden || !soundIsEnabled(source)) return;
    const nowMs = performance.now();
    if (nowMs - lastClickAt < 24) return;
    lastClickAt = nowMs;

    const context = ensureAudioContext();
    if (!context) return;
    const startedAt = context.currentTime + .002;
    const pitchFactor = source?.matches('select,input,summary') ? 1.08 : .96;

    try {
      const master = context.createGain();
      master.gain.setValueAtTime(.68 * LEVEL_GAIN[volumeLevel], startedAt);
      master.connect(context.destination);

      const noise = getNoiseBuffer(context);
      addPlasticSnap(context, master, noise, startedAt, pitchFactor, 0, .082, .011);
      addPlasticSnap(context, master, noise, startedAt, pitchFactor * 1.06, .0105, .038, .009);

      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(1180 * pitchFactor, startedAt);
      body.frequency.exponentialRampToValueAtTime(610 * pitchFactor, startedAt + .014);
      bodyGain.gain.setValueAtTime(.018, startedAt);
      bodyGain.gain.exponentialRampToValueAtTime(.0001, startedAt + .016);
      body.connect(bodyGain);
      bodyGain.connect(master);
      body.start(startedAt);
      body.stop(startedAt + .018);
    } catch {
      // Audio feedback is optional; controls must keep working if Web Audio fails.
    }
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const control = interactiveFrom(event.target);
    if (control) playMechanicalClick(control);
  }, { passive: true });

  document.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    const control = interactiveFrom(event.target);
    if (control) playMechanicalClick(control);
  });

  function setLevel(level) {
    volumeLevel = Math.max(0, Math.min(4, Math.round(Number(level) || 0)));
    return volumeLevel;
  }

  window.GalenUiSound = Object.freeze({
    play: playMechanicalClick,
    setLevel,
    getLevel: () => volumeLevel
  });
})();
