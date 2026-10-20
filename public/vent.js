(function () {
  'use strict';

  if (window.__GALEN_VENT_APP_ACTIVE__) return;
  window.__GALEN_VENT_APP_ACTIVE__ = true;

  const E = window.GALEN_VENT_ENGINE;
  if (!E) throw new Error('Beatmungs-Engine konnte nicht geladen werden.');
  const W = window.GALEN_VENT_WAVEFORMS;
  if (!W) throw new Error('Kurvenpuffer konnte nicht geladen werden.');

  const $ = id => document.getElementById(id);
  const number = (value, decimals = 0) => Number(value).toFixed(decimals).replace('.', ',');
  const formatTime = seconds => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const STAFF_TEMPLATE = Object.freeze([
    { id: 'anesthesiologist', name: 'Dr. Lea Hartmann', role: 'doctor', roleLabel: 'Anästhesistin', icon: '🩺' },
    { id: 'ata', name: 'Jonas Richter', role: 'ata', roleLabel: 'ATA', icon: '👨‍⚕️' }
  ]);
  const ACCESS_DEFINITIONS = Object.freeze({
    pvk_pink: { label: 'PVK rosa', duration: 45, roles: ['doctor', 'ata'], vascular: true },
    pvk_green: { label: 'PVK grün', duration: 55, roles: ['doctor', 'ata'], vascular: true },
    pvk_orange: { label: 'PVK orange', duration: 70, roles: ['doctor', 'ata'], vascular: true },
    artery: { label: 'Arterielle Kanüle', duration: 90, roles: ['doctor'], vascular: false },
    zvk: { label: 'ZVK', duration: 120, roles: ['doctor'], vascular: true },
    bladder: { label: 'Blasenkatheter', duration: 60, roles: ['ata'], vascular: false }
  });
  const FIO2_OPTIONS = Object.freeze([.21, .25, .3, .35, .4, .45, .5, .55, .6, .65, .7, .75, .8, .85, .9, .95, 1]);
  const SOUND_STORAGE_KEY = 'galenVentSoundLevels';
  const SOUND_LEVEL_GAIN = Object.freeze([0, .28, .5, .75, 1]);
  const SOUND_LEVEL_LABELS = Object.freeze(['Stumm', 'Leise', 'Mittel', 'Laut', 'Maximal']);
  const SOUND_CHANNELS = Object.freeze([
    { id: 'alarm', label: 'Alarme', defaultLevel: 3 },
    { id: 'pulse', label: 'Pulston', defaultLevel: 2 },
    { id: 'ventilator', label: 'Beatmungston', defaultLevel: 2 },
    { id: 'interface', label: 'Interface', defaultLevel: 2 }
  ]);
  const LAB_DEFINITIONS = Object.freeze({
    hemoglobin: { label: 'Hämoglobin', value: '13,4 g/dl', norm: '12,0–16,0 g/dl' },
    hematocrit: { label: 'Hämatokrit', value: '40 %', norm: '36–46 %' },
    leukocytes: { label: 'Leukozyten', value: '6,8 /nl', norm: '4,0–10,0 /nl' },
    platelets: { label: 'Thrombozyten', value: '245.000/µl', norm: '150.000–400.000/µl' },
    sodium: { label: 'Natrium', value: '138 mmol/l', norm: '135–145 mmol/l' },
    potassium: { label: 'Kalium', value: '4,1 mmol/l', norm: '3,5–5,1 mmol/l' },
    calcium: { label: 'Calcium gesamt', value: '2,31 mmol/l', norm: '2,15–2,55 mmol/l' },
    creatinine: { label: 'Kreatinin', value: '0,8 mg/dl', norm: '0,6–1,1 mg/dl' },
    urea: { label: 'Harnstoff', value: '28 mg/dl', norm: '17–43 mg/dl' },
    ast: { label: 'AST (GOT)', value: '22 U/l', norm: '<35 U/l' },
    alt: { label: 'ALT (GPT)', value: '24 U/l', norm: '<35 U/l' },
    bilirubin: { label: 'Bilirubin gesamt', value: '0,7 mg/dl', norm: '<1,2 mg/dl' },
    crp: { label: 'CRP', value: '1,8 mg/l', norm: '<5 mg/l' },
    inr: { label: 'INR', value: '1,0', norm: '0,9–1,2' },
    aptt: { label: 'aPTT', value: '29 s', norm: '25–35 s' },
    fibrinogen: { label: 'Fibrinogen', value: '310 mg/dl', norm: '200–400 mg/dl' },
    glucose: { label: 'Glukose', value: '96 mg/dl', norm: '70–110 mg/dl' }
  });

  let settings;
  let pumps;
  let state;
  let running;
  let lastFrameAt;
  let bgaTask;
  let bgaHistory;
  let nibp;
  let events;
  let priorAlarmIds;
  let priorCardiacArrest;
  let audioContext;
  let soundLevels;
  let nextPulseAt;
  let nextAlarmToneAt;
  let lastPulseAudioAt = Number.NEGATIVE_INFINITY;
  let ventilatorNoiseBuffer;
  const activeVentilatorNodes = new Set();
  let lastSoundElapsed;
  let lastRenderAt;
  let staff;
  let access;
  let assignedTasks;
  let backgroundTasks;
  let taskCounter;
  let labHistory;
  let medicationsGiven;
  let timeScale;
  let selectedSetting;
  let lastSettingWheelAt;
  let chatMessages;
  let chatAutoFollow;
  let aiAvailable;
  let ecgResult;
  let sonoResult;
  let noStaffFlashUntil;
  let noStaffRoles;
  let selectedPumpDose;
  let lastPumpWheelAt;
  let ventValuesPage;
  let waveformRecorder;
  // Endtidales CO₂ wird wie am echten Monitor nur am Ende jeder Ausatmung aktualisiert.
  let measuredEtco2;
  let measuredBreathCount;

  function freshSession() {
    stopVentilatorSound();
    settings = { ...E.DEFAULT_SETTINGS };
    pumps = {
      propofol: { ...E.DEFAULT_PUMPS.propofol },
      remifentanil: { ...E.DEFAULT_PUMPS.remifentanil }
    };
    state = E.step(E.createInitial(), settings, pumps, 0.01);
    waveformRecorder = W.create(E, settings, state);
    measuredEtco2 = state.etCO2;
    measuredBreathCount = waveformRecorder.completedBreaths;
    running = true;
    lastFrameAt = performance.now();
    bgaTask = null;
    bgaHistory = [];
    labHistory = [];
    medicationsGiven = [];
    timeScale = 1;
    selectedSetting = 'deltaP';
    lastSettingWheelAt = Number.NEGATIVE_INFINITY;
    chatMessages = [];
    chatAutoFollow = true;
    aiAvailable = false;
    ecgResult = null;
    sonoResult = null;
    noStaffFlashUntil = 0;
    noStaffRoles = [];
    selectedPumpDose = null;
    lastPumpWheelAt = Number.NEGATIVE_INFINITY;
    ventValuesPage = 0;
    staff = STAFF_TEMPLATE.map(person => ({ ...person, busyUntil: 0, taskLabel: '' }));
    access = new Set(['pvk_green_initial']);
    assignedTasks = [];
    backgroundTasks = [];
    taskCounter = 0;
    nibp = {
      interval: 180,
      nextAt: 180,
      measuringUntil: null,
      last: { sys: Math.round(state.sys), dia: Math.round(state.dia), map: Math.round(state.map), time: 0 }
    };
    events = [];
    priorAlarmIds = new Set();
    priorCardiacArrest = false;
    nextPulseAt = 0;
    nextAlarmToneAt = 0;
    lastSoundElapsed = Number.NEGATIVE_INFINITY;
    lastRenderAt = 0;
    setVentValuesPage(0);
    addEvent('Sandbox gestartet: PCV und beide Perfusoren laufen mit den Startwerten.');
    addChat('Jonas Richter', 'Patientin zur elektiven Gallenblasenentfernung. Gerade intubiert, bitte übernehmen. Lass einen Propofol- und einen Remifentanil-Perfusor laufen, Remifentanil in µg/kg/min und Propofol in mg/kg/h.');
  }

  function defaultSoundLevels() {
    return Object.fromEntries(SOUND_CHANNELS.map(channel => [channel.id, channel.defaultLevel]));
  }

  function loadSoundLevels() {
    const levels = defaultSoundLevels();
    try {
      const saved = JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY) || 'null');
      SOUND_CHANNELS.forEach(channel => {
        if (Number.isFinite(Number(saved?.[channel.id]))) levels[channel.id] = E.clamp(Math.round(Number(saved[channel.id])), 0, 4);
      });
    } catch {}
    return levels;
  }

  function persistSoundLevels() {
    try { localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(soundLevels)); } catch {}
  }

  function channelGain(channel) {
    return SOUND_LEVEL_GAIN[E.clamp(Math.round(Number(soundLevels?.[channel]) || 0), 0, 4)] || 0;
  }

  function renderSoundMixer() {
    const mixer = $('soundMixer');
    if (!mixer) return;
    mixer.innerHTML = SOUND_CHANNELS.map(channel => {
      const level = soundLevels[channel.id];
      const buttons = SOUND_LEVEL_LABELS.map((label, value) => `
        <button type="button" class="sound-level${level === value ? ' active' : ''}" data-sound-channel="${channel.id}" data-sound-level="${value}" aria-label="${channel.label}: ${label}" aria-pressed="${level === value}" title="${label}"></button>
      `).join('');
      return `<div class="sound-channel"><strong>${channel.label}</strong><output>${SOUND_LEVEL_LABELS[level]}</output><div class="sound-levels" role="group" aria-label="${channel.label} Lautstärke">${buttons}</div></div>`;
    }).join('');
    window.GalenUiSound?.setLevel(soundLevels.interface);
  }

  async function setSoundLevel(channel, rawLevel) {
    if (!SOUND_CHANNELS.some(item => item.id === channel)) return;
    const level = E.clamp(Math.round(Number(rawLevel) || 0), 0, 4);
    soundLevels[channel] = level;
    persistSoundLevels();
    renderSoundMixer();
    if (channel === 'interface') window.GalenUiSound?.setLevel(level);
    if (channel === 'ventilator' && level === 0) stopVentilatorSound();
    if (channel === 'ventilator' && level > 0) lastSoundElapsed = Number.NEGATIVE_INFINITY;
    if (channel === 'pulse' && level > 0) nextPulseAt = state.elapsed;
    if (channel === 'alarm' && level > 0) nextAlarmToneAt = state.elapsed;
    if (channel !== 'interface' && level > 0) await ensureAudioContext();
  }

  function addEvent(text) {
    events.push({ time: state?.elapsed || 0, text: String(text) });
    if (events.length > 120) events.shift();
    renderEvents();
  }

  function renderEvents() {
    const log = $('eventLog');
    if (!log) return;
    log.innerHTML = events.length
      ? events.slice().reverse().map(event => `<div><time>${formatTime(event.time)}</time><span>${escapeHtml(event.text)}</span></div>`).join('')
      : '<div><span>Der Verlauf ist leer.</span></div>';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function addChat(sender, text, className = 'team') {
    chatMessages.push({ time: state?.elapsed || 0, sender: String(sender), text: String(text), className });
    if (chatMessages.length > 120) chatMessages.shift();
    renderChat();
  }

  function renderChat() {
    const log = $('chatLog');
    if (!log) return;
    const wasNearBottom = chatAutoFollow || log.scrollHeight - log.scrollTop - log.clientHeight < 50;
    log.innerHTML = chatMessages.map(message => `<div class="message ${escapeHtml(message.className)}"><div class="message-meta">${escapeHtml(message.sender)} · ${formatTime(message.time)}</div><div>${escapeHtml(message.text)}</div></div>`).join('');
    if (wasNearBottom) log.scrollTop = log.scrollHeight;
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function medicationFromText(text) {
    const q = normalizeText(text);
    const definitions = window.GALEN_MEDICATIONS || {};
    return Object.entries(definitions).find(([id, definition]) => {
      const aliases = [id, definition.label, ...(definition.aliases || [])].map(normalizeText).filter(Boolean);
      return aliases.some(alias => new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`).test(q));
    })?.[0] || null;
  }

  function isOrder(text) {
    return /\b(gib|geben|gebe|verabreich|verabreichen|spritze|spritz|starte|starten|anlegen|lege|hang|anhaengen|bolus)\b/.test(normalizeText(text));
  }

  function visibleVentState() {
    return {
      heartRate: Math.round(state.hr),
      spo2: Math.round(state.spo2),
      etCO2: Math.round(measuredEtco2),
      arterialPressure: hasAccess('artery') ? `${Math.round(state.sys)}/${Math.round(state.dia)}` : null,
      lastNibp: nibp.last,
      temperature: hasAccess('bladder') ? Number(state.temp.toFixed(1)) : null,
      access: [...access].map(accessType),
      settings: { ...settings },
      pumps: structuredClone(pumps),
      patient: { ...E.PATIENT }
    };
  }

  async function checkAiStatus() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      aiAvailable = Boolean(data.enabled);
    } catch {
      aiAvailable = false;
    }
    $('aiStatus').textContent = aiAvailable ? 'Gemini aktiv' : 'Regel-Fallback';
    $('aiStatus').className = `status-pill ${aiAvailable ? 'live' : 'idle'}`;
  }

  async function handleChat(text) {
    const raw = String(text || '').trim();
    if (!raw) return;
    addChat('Telekonsultation', raw, 'user');
    const q = normalizeText(raw);

    const medicationId = medicationFromText(raw);
    if (medicationId && (isOrder(raw) || /\b\d+(?:[.,]\d+)?\s*(?:mg|g|µg|ug|ml)\b/i.test(raw))) {
      giveMedicationById(medicationId);
      return;
    }
    if (isOrder(raw) && /\b(kristalloid|ringer|vollelektrolyt|500 ml|500 ve|volumen)\b/.test(q)) {
      giveFluid();
      return;
    }
    if (isOrder(raw) && /\b(noradrenalin|norepi|nor bolus)\b/.test(q)) {
      giveNorepiBolus();
      return;
    }
    if (isOrder(raw) && /\b(arterie|arterielle kanule)\b/.test(q)) {
      insertAccess('artery');
      return;
    }
    if (isOrder(raw) && /\b(zvk|zentralven)\b/.test(q)) {
      insertAccess('zvk');
      return;
    }
    if (isOrder(raw) && /\b(blasenkatheter|dauerkatheter|\bdk\b)\b/.test(q)) {
      insertAccess('bladder');
      return;
    }
    if (/\b(wer|patientin|alter|gross|gewicht|anamnese|vorgeschichte)\b/.test(q)) {
      addChat('Dr. Lea Hartmann', `40-jährige Patientin, 170 cm groß und 85 kg schwer, ohne bekannte Vorerkrankungen. Sie ist für eine elektive Gallenblasenentfernung intubiert worden.`);
      return;
    }
    if (/\b(welche|was fur).{0,20}\b(zugang|katheter)\b|\bzugange\b/.test(q)) {
      const labels = [...access].map(item => ACCESS_DEFINITIONS[accessType(item)]?.label).filter(Boolean);
      addChat('Jonas Richter', `Es liegen ein Tubus 7,0 sowie ${labels.length ? labels.join(', ') : 'keine Gefäßzugänge'}.`);
      return;
    }
    if (/\b(beatmung|einstellung|pcv)\b/.test(q) && /\b(wie|welche|aktuell|steht|lauft)\b/.test(q)) {
      addChat('Jonas Richter', `PCV mit ΔP ${settings.deltaP} mbar, PEEP ${settings.peep} mbar, AF ${settings.rr}/min, FiO₂ ${number(settings.fio2, 2)}, I:E ${settings.ie} und Anstiegszeit ${number(settings.riseTime, 2)} s.`);
      return;
    }
    if (/\b(vital|blutdruck|sattigung|spo2|etco2|herzfrequenz)\b/.test(q)) {
      addChat('Jonas Richter', `HF ${Math.round(state.hr)}/min, SpO₂ ${number(state.spo2, 0)} %, etCO₂ ${number(measuredEtco2, 0)} mmHg und letzter NIBP ${nibp.last.sys}/${nibp.last.dia} mmHg (MAP ${nibp.last.map}).`);
      return;
    }

    if (aiAvailable) {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: raw,
            state: {
              elapsed: state.elapsed,
              visiblePatient: visibleVentState(),
              knownLabs: labHistory.at(-1)?.values || [],
              bgaHistory,
              access: [...access],
              staff: staff.map(person => ({ name: person.name, role: person.roleLabel, available: person.busyUntil <= state.elapsed })),
              caseFacts: {
                sex: 'weiblich',
                age: E.PATIENT.age,
                history: 'Keine bekannten Vorerkrankungen.',
                briefing: { text: 'Elektive Gallenblasenentfernung, Patientin gerade intubiert und zur weiteren Narkoseführung übernommen.' },
                initial: visibleVentState(),
                chatFacts: { airway: 'Endotrachealtubus 7,0, 21 cm ab Zahnreihe', auscultation: 'beidseits vesikuläres Atemgeräusch' }
              }
            }
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'KI nicht erreichbar');
        if (data.reply) {
          addChat('Team vor Ort', data.reply);
          return;
        }
      } catch {
        aiAvailable = false;
        $('aiStatus').textContent = 'Regel-Fallback';
        $('aiStatus').className = 'status-pill idle';
      }
    }
    addChat('Team vor Ort', 'Bitte formulieren Sie die Frage oder den Auftrag etwas konkreter. Medikamente können mit Name und dem Auftrag „geben“ angeordnet werden.');
  }

  function readSettings() {
    settings = E.normalizeSettings({
      deltaP: $('deltaPInput').value,
      peep: $('peepInput').value,
      rr: $('rrInput').value,
      fio2: Number($('fio2Input').value) / 100,
      ie: $('ieInput').value,
      riseTime: $('riseTimeInput').value
    });
    updateSettingOutputs();
  }

  function writeSettings() {
    $('deltaPInput').value = settings.deltaP;
    $('peepInput').value = settings.peep;
    $('rrInput').value = settings.rr;
    $('fio2Input').value = Math.round(settings.fio2 * 100);
    $('ieInput').value = settings.ie;
    $('riseTimeInput').value = settings.riseTime;
    updateSettingOutputs();
  }

  function updateSettingOutputs() {
    const d = E.lungMechanics(state, settings);
    $('deltaPOutput').textContent = `${number(settings.deltaP)} mbar`;
    $('peepOutput').textContent = `${number(settings.peep)} mbar`;
    $('rrOutput').textContent = `${number(settings.rr)} /min`;
    $('fio2Output').textContent = number(settings.fio2, 2);
    $('ieOutput').textContent = settings.ie;
    $('riseTimeOutput').textContent = `${number(settings.riseTime, 2)} s`;
    $('absolutePinsp').textContent = `${number(settings.peep + settings.deltaP)} mbar`;
    $('calculatedTi').textContent = `${number(d.ti, 2)} s`;
  }

  function selectSetting(id) {
    if (!['deltaP', 'peep', 'rr', 'fio2', 'ie', 'riseTime'].includes(id)) return;
    selectedSetting = id;
    document.querySelectorAll('.setting-key').forEach(button => {
      const active = button.dataset.setting === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-setting-control]').forEach(control => control.classList.toggle('active', control.dataset.settingControl === id));
    updateSettingOutputs();
  }

  function adjustSelectedSetting(direction) {
    const before = JSON.stringify(settings);
    if (selectedSetting === 'deltaP') settings.deltaP = E.clamp(settings.deltaP + direction, ...E.LIMITS.deltaP);
    if (selectedSetting === 'peep') settings.peep = E.clamp(settings.peep + direction, ...E.LIMITS.peep);
    if (selectedSetting === 'rr') settings.rr = E.clamp(settings.rr + direction, ...E.LIMITS.rr);
    if (selectedSetting === 'fio2') {
      let index = FIO2_OPTIONS.findIndex(value => Math.abs(value - settings.fio2) < .001);
      if (index < 0) index = FIO2_OPTIONS.reduce((best, value, candidate) => Math.abs(value - settings.fio2) < Math.abs(FIO2_OPTIONS[best] - settings.fio2) ? candidate : best, 0);
      settings.fio2 = FIO2_OPTIONS[E.clamp(index + direction, 0, FIO2_OPTIONS.length - 1)];
    }
    if (selectedSetting === 'ie') {
      const index = E.IE_OPTIONS.indexOf(settings.ie);
      settings.ie = E.IE_OPTIONS[E.clamp(index + direction, 0, E.IE_OPTIONS.length - 1)];
    }
    if (selectedSetting === 'riseTime') {
      const values = [.05, .1, .2, .4, .6, .8];
      const index = values.findIndex(value => Math.abs(value - settings.riseTime) < .001);
      settings.riseTime = values[E.clamp(index + direction, 0, values.length - 1)];
    }
    settings = E.normalizeSettings(settings);
    writeSettings();
    if (before !== JSON.stringify(settings)) {
      stopVentilatorSound();
      lastSoundElapsed = Number.NEGATIVE_INFINITY;
      const d = E.lungMechanics(state, settings);
      addEvent(`PCV geändert: ΔP ${settings.deltaP} mbar, PEEP ${settings.peep} mbar, AF ${settings.rr}/min, FiO₂ ${number(settings.fio2, 2)}, I:E ${settings.ie}; erwartetes VTe ${Math.round(d.tidalVolumeMl)} ml.`);
    }
  }

  function updatePumpOutputs() {
    $('propofolInput').value = pumps.propofol.rate;
    $('remifentanilInput').value = pumps.remifentanil.rate;
    $('propofolOutput').textContent = `${number(pumps.propofol.rate, 2)} mg/kg/h`;
    $('remifentanilOutput').textContent = `${number(pumps.remifentanil.rate, 2)} µg/kg/min`;
    $('propofolTotal').textContent = `${number(pumps.propofol.rate * E.PATIENT.weightKg, 0)} mg/h bei ${E.PATIENT.weightKg} kg`;
    $('remifentanilTotal').textContent = `${number(pumps.remifentanil.rate * E.PATIENT.weightKg, 2)} µg/min bei ${E.PATIENT.weightKg} kg`;
    renderPump('propofol');
    renderPump('remifentanil');
  }

  function adjustPump(id, direction) {
    const step = id === 'propofol' ? .25 : .01;
    pumps[id].rate = E.clamp(Math.round((pumps[id].rate + direction * step) * 100) / 100, ...E.LIMITS[id]);
    updatePumpOutputs();
    addEvent(`${id === 'propofol' ? 'Propofol' : 'Remifentanil'} auf ${number(pumps[id].rate, 2)} ${id === 'propofol' ? 'mg/kg/h' : 'µg/kg/min'} eingestellt.`);
  }

  function selectPumpDose(id) {
    if (!['propofol', 'remifentanil'].includes(id)) return;
    selectedPumpDose = id;
    document.querySelectorAll('[data-pump-dose]').forEach(button => {
      const active = button.dataset.pumpDose === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderPump(id) {
    const pump = pumps[id];
    $(`${id}Pump`).classList.toggle('running', pump.running);
    $(`${id}Pump`).classList.toggle('stopped', !pump.running);
    $(`${id}Toggle`).textContent = pump.running ? 'Stop' : 'Start';
  }

  function accessType(value) {
    const key = String(value);
    if (key.startsWith('pvk_pink')) return 'pvk_pink';
    if (key.startsWith('pvk_green')) return 'pvk_green';
    if (key.startsWith('pvk_orange')) return 'pvk_orange';
    if (key.startsWith('artery')) return 'artery';
    if (key.startsWith('zvk')) return 'zvk';
    if (key.startsWith('bladder')) return 'bladder';
    return key;
  }

  function hasAccess(type) {
    return [...access].some(item => accessType(item) === type);
  }

  function hasVascularAccess() {
    return [...access].some(item => ACCESS_DEFINITIONS[accessType(item)]?.vascular);
  }

  function showToast(text) {
    let toast = $('toastMessage');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastMessage';
      toast.className = 'toast-message';
    }
    const host = document.querySelector('dialog[open]') || document.body;
    if (toast.parentElement !== host) host.appendChild(toast);
    toast.style.left = '50%';
    toast.style.top = '24px';
    toast.textContent = String(text);
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function flashNoStaff(roles) {
    noStaffRoles = [...roles];
    noStaffFlashUntil = performance.now() + 700;
    showToast('Das benötigte Personal ist gerade nicht verfügbar.');
    const panel = $('staffPanel');
    if (panel) {
      panel.classList.remove('no-staff-flash');
      void panel.offsetWidth;
      panel.classList.add('no-staff-flash');
      setTimeout(() => panel.classList.remove('no-staff-flash'), 700);
    }
    renderClinical();
  }

  function assignTask(label, duration, roles, onComplete, kind = 'clinical') {
    const person = staff.find(candidate => roles.includes(candidate.role) && candidate.busyUntil <= state.elapsed);
    if (!person) {
      flashNoStaff(roles);
      addEvent(`Auftrag nicht gestartet: Für „${label}“ ist kein geeignetes Personal frei.`);
      addChat('Team vor Ort', `Der Auftrag „${label}“ kann noch nicht starten, weil kein geeignetes Personal frei ist.`);
      return null;
    }
    const task = {
      id: ++taskCounter,
      label,
      personId: person.id,
      personName: person.name,
      startedAt: state.elapsed,
      completeAt: state.elapsed + duration,
      onComplete,
      kind,
      done: false
    };
    person.busyUntil = task.completeAt;
    person.taskLabel = label;
    assignedTasks.push(task);
    addEvent(`${person.name} übernimmt: ${label} (${duration} s).`);
    renderClinical();
    return task;
  }

  function addBackgroundTask(label, duration, onComplete, kind = 'diagnostic') {
    const task = {
      id: ++taskCounter,
      label,
      startedAt: state.elapsed,
      completeAt: state.elapsed + duration,
      onComplete,
      kind,
      done: false
    };
    backgroundTasks.push(task);
    addEvent(`${label} läuft im Hintergrund (${duration} s).`);
    return task;
  }

  function updateAssignedTasks() {
    assignedTasks.forEach(task => {
      if (task.done || state.elapsed < task.completeAt) return;
      task.done = true;
      const person = staff.find(candidate => candidate.id === task.personId);
      if (person) {
        person.busyUntil = state.elapsed;
        person.taskLabel = '';
      }
      task.onComplete?.();
      addEvent(`${task.label} abgeschlossen.`);
    });
    backgroundTasks.forEach(task => {
      if (task.done || state.elapsed < task.completeAt) return;
      task.done = true;
      task.onComplete?.();
      addEvent(`${task.label} abgeschlossen.`);
    });
    assignedTasks = assignedTasks.filter(task => !task.done);
    backgroundTasks = backgroundTasks.filter(task => !task.done);
  }

  function renderClinical() {
    const grid = $('staffGrid');
    if (!grid) return;
    const flashActive = performance.now() < noStaffFlashUntil;
    grid.innerHTML = staff.map(person => {
      const busy = person.busyUntil > state.elapsed;
      const denied = flashActive && noStaffRoles.includes(person.role);
      return `<article data-staff-id="${person.id}" class="staff-card ${busy ? 'busy' : 'available'}${denied ? ' deny-flash' : ''}">
        <div class="staff-avatar"><span class="staff-icon">${person.icon}</span><span class="availability-dot"></span></div>
        <div class="staff-identity"><div class="staff-name">${escapeHtml(person.name)}</div><div class="staff-role">${escapeHtml(person.roleLabel)}</div></div>
        <div class="staff-status-badge">${busy ? 'BESCHÄFTIGT' : 'VERFÜGBAR'}</div>
        <div class="staff-task"><span>${busy ? escapeHtml(person.taskLabel) : 'Bereit für Auftrag'}</span>${busy ? `<strong>${formatTime(Math.max(0, person.busyUntil - state.elapsed))}</strong>` : ''}</div>
      </article>`;
    }).join('');

    const accessLabels = ['Tubus 7,0 · 21 cm', ...[...access].map(item => ACCESS_DEFINITIONS[accessType(item)]?.label || item)];
    const therapies = [
      `PCV: ΔP ${settings.deltaP}, PEEP ${settings.peep}, AF ${settings.rr}, FiO₂ ${number(settings.fio2, 2)}`,
      pumps.propofol.running ? `Propofol ${number(pumps.propofol.rate, 2)} mg/kg/h` : 'Propofol gestoppt',
      pumps.remifentanil.running ? `Remifentanil ${number(pumps.remifentanil.rate, 2)} µg/kg/min` : 'Remifentanil gestoppt'
    ];
    if (state.crystalloidMl) therapies.push(`Kristalloid ${state.crystalloidMl} ml`);
    if (state.norepiBolusUntil > state.elapsed) therapies.push('Noradrenalin-Bolus wirksam');
    const markers = ['T', ...[...access].map(item => {
      const type = accessType(item);
      return type === 'artery' ? 'A' : type === 'zvk' ? 'Z' : type === 'bladder' ? 'DK' : 'P';
    })].slice(0, 5);
    $('patientMap').innerHTML = `<div class="body-figure">
      <div class="head"></div><div class="torso"></div><div class="arm left"></div><div class="arm right"></div><div class="leg left"></div><div class="leg right"></div>
      ${markers.map((marker, index) => `<span class="access-marker marker-${index}">${marker}</span>`).join('')}
    </div><div class="patient-lines"><div><strong>Zugänge/Katheter</strong>${accessLabels.map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div><div><strong>Laufende Therapie</strong>${therapies.map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div></div>`;

    const active = [...assignedTasks, ...backgroundTasks];
    const list = $('activeOrders');
    list.classList.toggle('empty', active.length === 0);
    list.innerHTML = active.length
      ? active.map(task => `<div class="active-task"><strong>${escapeHtml(task.label)}</strong><span>${Math.max(0, Math.ceil(task.completeAt - state.elapsed))} s</span><small>${escapeHtml(task.personName || 'Hintergrundprozess')}</small></div>`).join('')
      : 'Keine aktiven Maßnahmen.';
  }

  function beginNibpMeasurement(source = 'manuell') {
    if (nibp.measuringUntil !== null) return;
    nibp.measuringUntil = state.elapsed + 20;
    $('measureNibpBtn').disabled = true;
    addEvent(`NIBP-Messung ${source} gestartet.`);
  }

  function finishNibpMeasurement() {
    nibp.last = {
      sys: Math.round(state.sys),
      dia: Math.round(state.dia),
      map: Math.round(state.map),
      time: state.elapsed
    };
    nibp.measuringUntil = null;
    nibp.nextAt = nibp.interval > 0 ? state.elapsed + nibp.interval : null;
    $('measureNibpBtn').disabled = false;
    addEvent(`NIBP ${nibp.last.sys}/${nibp.last.dia} mmHg, MAP ${nibp.last.map} mmHg.`);
  }

  function updateTasks() {
    updateAssignedTasks();
    if (nibp.measuringUntil !== null && state.elapsed >= nibp.measuringUntil) finishNibpMeasurement();
    if (nibp.measuringUntil === null && nibp.interval > 0 && nibp.nextAt !== null && state.elapsed >= nibp.nextAt) {
      beginNibpMeasurement('automatisch');
    }
  }

  function insertAccess(type) {
    const definition = ACCESS_DEFINITIONS[type];
    if (!definition) return;
    if (!type.startsWith('pvk_') && hasAccess(type)) {
      addEvent(`${definition.label} liegt bereits.`);
      return;
    }
    const task = assignTask(`${definition.label} legen`, definition.duration, definition.roles, () => {
      access.add(`${type}_${Date.now()}`);
      if (type === 'artery') addEvent('Die arterielle Druckkurve ist aufgeschaltet.');
      addChat('Team vor Ort', `${definition.label} liegt und ist angeschlossen.`);
      renderClinical();
    });
    if (task) {
      $('accessDialog').close();
      addChat('Team vor Ort', `${definition.label} wird angelegt.`);
    }
  }

  function requestBga(type) {
    if (bgaTask) {
      addEvent('Es läuft bereits eine BGA-Abnahme.');
      return;
    }
    const arterial = type === 'arterial';
    const viaArtery = arterial && hasAccess('artery');
    const duration = arterial ? (viaArtery ? 15 : 45) : 30;
    const roles = arterial && !viaArtery ? ['doctor'] : ['doctor', 'ata'];
    const label = arterial
      ? (viaArtery ? 'Arterielle BGA über liegende Arterie' : 'Arterielle BGA per Einmalpunktion')
      : 'Venöse BGA';
    const task = assignTask(label, duration, roles, () => completeBga(type), 'diagnostic');
    if (!task) return;
    bgaTask = { ...task, type };
    $('bgaRequestDialog')?.close();
    renderDiagnostics();
  }

  function completeBga(type) {
    const arterial = E.sampleBga(state);
    const sample = type === 'venous'
      ? {
        ...arterial,
        pH: E.clamp(Math.round((arterial.pH - 0.02) * 100) / 100, 6.6, 7.8),
        paCO2: Math.round((arterial.paCO2 + 5) * 10) / 10,
        paO2: Math.round(E.clamp(38 + (state.spo2 - 95) * 0.55 - Math.max(0, state.lactate - 1) * 1.2, 22, 52)),
        saturation: Math.round(E.clamp(74 + (state.spo2 - 95) * 0.65, 55, 86) * 10) / 10
      }
      : arterial;
    bgaHistory.push({ time: state.elapsed, type, settings: { ...settings }, values: sample });
    bgaTask = null;
    $('bgaHistoryBtn').disabled = false;
    addEvent(`${type === 'venous' ? 'Venöse' : 'Arterielle'} BGA: pH ${number(sample.pH, 2)}, pCO₂ ${number(sample.paCO2, 1)} mmHg, pO₂ ${number(sample.paO2, 0)} mmHg.`);
    addChat('Team vor Ort', `${type === 'venous' ? 'Die venöse' : 'Die arterielle'} BGA ist verfügbar: pH ${number(sample.pH, 2)}, pCO₂ ${number(sample.paCO2, 1)} mmHg, pO₂ ${number(sample.paO2, 0)} mmHg.`);
    renderDiagnostics();
  }

  function renderLabOptions() {
    $('labCheckboxes').innerHTML = Object.entries(LAB_DEFINITIONS).map(([id, definition]) =>
      `<label><input type="checkbox" value="${id}"><span>${escapeHtml(definition.label)}</span></label>`
    ).join('');
  }

  function requestLabs() {
    const selected = [...$('labCheckboxes').querySelectorAll('input:checked')].map(input => input.value);
    if (!selected.length) {
      addEvent('Laboranforderung nicht gestartet: keine Parameter ausgewählt.');
      return;
    }
    const task = assignTask(`Blutentnahme für ${selected.length} Laborparameter`, 20, ['doctor', 'ata'], () => {
      addBackgroundTask('Zentrallabor analysiert die Probe', 120, () => {
        labHistory.push({
          time: state.elapsed,
          values: selected.map(id => ({ id, ...LAB_DEFINITIONS[id] }))
        });
        $('labHistoryBtn').disabled = false;
        addEvent('Neue Laborergebnisse sind verfügbar.');
        addChat('Zentrallabor', 'Die angeforderten Laborergebnisse sind jetzt verfügbar.');
        renderDiagnostics();
      }, 'diagnostic');
    }, 'diagnostic');
    if (!task) return;
    $('labDialog').close();
    renderDiagnostics();
  }

  function buildTrendTable(history, title) {
    if (!history.length) return '<p>Keine Ergebnisse verfügbar.</p>';
    const all = [];
    const seen = new Set();
    history.forEach(entry => (entry.values || []).forEach(value => {
      const key = value.id || value[0];
      if (!seen.has(key)) {
        seen.add(key);
        all.push(key);
      }
    }));
    const findValue = (key, entry) => (entry.values || []).find(value => (value.id || value[0]) === key);
    const labelFor = key => {
      for (const entry of history) {
        const value = findValue(key, entry);
        if (value) return value.label || value[0] || key;
      }
      return key;
    };
    const normFor = key => {
      for (const entry of history) {
        const value = findValue(key, entry);
        if (value) return value.norm || value[2] || '—';
      }
      return '—';
    };
    const headers = history.map((entry, index) =>
      `<th>${title} ${index + 1}<small>${formatTime(entry.time)}${entry.type ? ` · ${escapeHtml(entry.type)}` : ''}</small></th>`
    ).join('');
    const rows = all.map(key =>
      `<tr><th>${escapeHtml(labelFor(key))}<small>${escapeHtml(normFor(key))}</small></th>${history.map(entry => {
        const value = findValue(key, entry);
        if (!value) return '<td class="trend-missing">—</td>';
        const result = value.value ?? value[1];
        const abnormal = value.abnormal ?? value[3];
        return `<td class="${abnormal ? 'abnormal' : ''}">${escapeHtml(result)}</td>`;
      }).join('')}</tr>`
    ).join('');
    return `<div class="trend-table-wrap"><table class="result-table trend-table"><thead><tr><th>Parameter<small>Normbereich</small></th>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderLabHistory() {
    $('resultsTitle').textContent = 'Laborverlauf';
    $('resultsContent').innerHTML = buildTrendTable(labHistory, 'Labor');
    $('resultsDialog').showModal();
  }

  function valueClass(id, value, type = 'arterial') {
    const arterialRanges = {
      pH: [7.35, 7.45], paCO2: [35, 45], paO2: [75, 100], bicarbonate: [22, 26],
      baseExcess: [-2, 2], saturation: [94, 100], lactate: [0.5, 2]
    };
    const venousRanges = {
      pH: [7.31, 7.41], paCO2: [38, 50], paO2: [30, 50], bicarbonate: [22, 26],
      baseExcess: [-2, 2], saturation: [65, 85], lactate: [0.5, 2]
    };
    const range = (type === 'venous' ? venousRanges : arterialRanges)[id];
    return range && (value < range[0] || value > range[1]) ? 'abnormal' : '';
  }

  function latestBgaHtml(entry) {
    if (!entry) return 'Noch keine BGA abgenommen.';
    const v = entry.values;
    return [
      [entry.type === 'venous' ? 'pH venös' : 'pH art.', v.pH, '', 'pH'],
      ['pCO₂', number(v.paCO2, 1), 'mmHg', 'paCO2'],
      ['pO₂', number(v.paO2), 'mmHg', 'paO2'],
      ['Laktat', number(v.lactate, 1), 'mmol/l', 'lactate']
    ].map(([label, value, unit, id]) =>
      `<div><span>${label}</span><strong class="${valueClass(id, Number(String(value).replace(',', '.')), entry.type)}">${value}</strong><small>${unit}</small></div>`
    ).join('');
  }

  function renderDiagnostics() {
    $('requestArterialBgaBtn').disabled = Boolean(bgaTask);
    $('requestVenousBgaBtn').disabled = Boolean(bgaTask);
    $('labHistoryBtn').disabled = labHistory.length === 0;
    $('ecgResultBtn').disabled = !ecgResult;
    $('sonoResultBtn').disabled = !sonoResult;
    const latest = bgaHistory.at(-1);
    const container = $('latestBga');
    container.classList.toggle('empty', !latest);
    container.innerHTML = latestBgaHtml(latest);
  }

  function renderBgaHistory() {
    const rows = [
      ['pH', 'pH', '', 'art. 7,35–7,45 · ven. 7,31–7,41'],
      ['pCO₂', 'paCO2', 'mmHg', 'art. 35–45 · ven. 38–50'],
      ['pO₂', 'paO2', 'mmHg', 'art. 75–100 · ven. 30–50'],
      ['HCO₃⁻', 'bicarbonate', 'mmol/l', '22–26'],
      ['BE', 'baseExcess', 'mmol/l', '−2 bis +2'],
      ['sO₂', 'saturation', '%', 'art. 94–100 · ven. 65–85'],
      ['Laktat', 'lactate', 'mmol/l', '0,5–2,0'],
      ['Natrium', 'sodium', 'mmol/l', '135–145'],
      ['Kalium', 'potassium', 'mmol/l', '3,5–5,1'],
      ['iCa', 'ionizedCalcium', 'mmol/l', '1,12–1,32'],
      ['Glukose', 'glucose', 'mg/dl', '70–110'],
      ['Hb', 'hemoglobin', 'g/dl', '12–16']
    ];
    const history = bgaHistory.map(entry => ({
      time: entry.time,
      type: entry.type === 'venous' ? 'venös' : 'arteriell',
      values: rows.map(([label, id, unit, norm]) => {
        const value = entry.values[id];
        const decimals = id === 'pH' ? 2 : ['paCO2', 'bicarbonate', 'baseExcess', 'saturation', 'lactate', 'potassium', 'ionizedCalcium', 'hemoglobin'].includes(id) ? 1 : 0;
        return {
          id,
          label,
          norm: `${norm}${unit ? ` ${unit}` : ''}`,
          value: `${number(value, decimals)}${unit ? ` ${unit}` : ''}`,
          abnormal: Boolean(valueClass(id, value, entry.type))
        };
      })
    }));
    $('resultsTitle').textContent = 'BGA-Verlauf';
    $('resultsContent').innerHTML = buildTrendTable(history, 'BGA');
    $('resultsDialog').showModal();
  }

  function giveMedicationById(id) {
    const definition = window.GALEN_MEDICATIONS?.[id];
    if (!definition) {
      addChat('Team vor Ort', 'Dieses Medikament ist im Simulator nicht verfügbar.');
      return;
    }
    if (definition.requiresAccess && !hasVascularAccess()) {
      addChat('Team vor Ort', `${definition.label} kann ohne geeigneten Gefäßzugang nicht gegeben werden.`);
      return;
    }
    const task = assignTask(`${definition.label} verabreichen`, Number(definition.taskSeconds || 20), ['doctor', 'ata'], () => {
      state = E.addMedicationEffect(state, id, definition);
      medicationsGiven.push({ id, label: definition.label, time: state.elapsed });
      addEvent(`${definition.label} wurde gegeben; das hinterlegte Wirkprofil ist aktiv.`);
      addChat('Team vor Ort', `${definition.label} wurde verabreicht.`);
      renderClinical();
    });
    if (task) addChat('Team vor Ort', `${definition.label} wird vorbereitet und verabreicht.`);
  }

  function giveFluid() {
    if (!hasVascularAccess()) {
      addChat('Team vor Ort', 'Kristalloid kann ohne geeigneten Gefäßzugang nicht gegeben werden.');
      return;
    }
    const definition = window.GALEN_INTERVENTIONS?.fluid_500;
    const task = assignTask(definition?.label || '500 ml Kristalloid', Number(definition?.taskSeconds || 60), ['doctor', 'ata'], () => {
      state = E.addFluidEffect(state, 500);
      addEvent(`500 ml Kristalloid verabreicht; Gesamtmenge ${state.crystalloidMl} ml.`);
      addChat('Team vor Ort', '500 ml Kristalloid sind vollständig verabreicht.');
      renderClinical();
    });
    if (task) addChat('Team vor Ort', '500 ml Kristalloid werden verabreicht.');
  }

  function giveNorepiBolus() {
    if (!hasVascularAccess()) {
      addChat('Team vor Ort', 'Noradrenalin kann ohne geeigneten Gefäßzugang nicht gegeben werden.');
      return;
    }
    const definition = window.GALEN_INTERVENTIONS?.norepi_bolus;
    const task = assignTask(definition?.label || 'Noradrenalin 5 µg i.v. als Bolus geben', Number(definition?.taskSeconds || 15), ['doctor', 'ata'], () => {
      state = E.addNorepiBolus(state);
      addEvent('Noradrenalin 5 µg i.v. gegeben; der simulierte MAP-Effekt läuft etwa eine Minute.');
      addChat('Team vor Ort', 'Noradrenalin 5 µg wurde i.v. als Bolus gegeben.');
      beginNibpMeasurement('nach Noradrenalin-Bolus');
      renderClinical();
    });
    if (task) addChat('Team vor Ort', 'Noradrenalin 5 µg i.v. wird vorbereitet.');
  }

  function requestEcg() {
    if (ecgResult) {
      showSimpleResult('12-Kanal-EKG', ecgResult);
      return;
    }
    const task = assignTask('12-Kanal-EKG schreiben', 45, ['doctor', 'ata'], () => {
      ecgResult = 'Sinusrhythmus, Herzfrequenz im Verlauf entsprechend dem Monitor. Normale elektrische Herzachse, regelrechte Intervalle, keine akuten Ischämiezeichen.';
      addEvent('12-Kanal-EKG abgeschlossen.');
      addChat('Team vor Ort', 'Das 12-Kanal-EKG ist geschrieben und kann geöffnet werden.');
      renderDiagnostics();
    }, 'diagnostic');
    if (task) addChat('Team vor Ort', 'Das 12-Kanal-EKG wird geschrieben.');
  }

  function requestSono() {
    if (sonoResult) {
      showSimpleResult('POCUS / Sono', sonoResult);
      return;
    }
    const task = assignTask('POCUS durchführen', 60, ['doctor'], () => {
      sonoResult = 'Gute globale linksventrikuläre Funktion, kein Perikarderguss. Rechte Herzhöhlen nicht dilatiert. Vena cava inferior atemvariabel. Beidseits Lungengleiten, keine B-Linien.';
      addEvent('POCUS abgeschlossen.');
      addChat('Dr. Lea Hartmann', 'Der POCUS-Befund ist verfügbar.');
      renderDiagnostics();
    }, 'diagnostic');
    if (task) addChat('Dr. Lea Hartmann', 'Ich führe den POCUS durch.');
  }

  function showSimpleResult(title, content) {
    $('simpleResultsTitle').textContent = title;
    $('simpleResultsContent').textContent = content || 'Noch kein Befund vorhanden.';
    $('simpleResultsDialog').showModal();
  }

  function currentAlarms() {
    return [
      ...state.alarms.filter(alarm => alarm.id !== 'co2_high' && alarm.id !== 'co2_low'),
      ...E.etco2Alarms(measuredEtco2)
    ];
  }

  function highestAlarmPriority() {
    const alarms = currentAlarms();
    return alarms.some(alarm => alarm.priority === 'critical')
      ? 'critical'
      : alarms.length ? 'warning' : 'stable';
  }

  function renderAlarms() {
    const alarms = currentAlarms();
    const alarmIds = new Set(alarms.map(alarm => alarm.id));
    alarms.forEach(alarm => {
      if (!priorAlarmIds.has(alarm.id)) addEvent(`Alarm: ${alarm.label}.`);
    });
    priorAlarmIds = alarmIds;
    const visibleAlarmIds = alarmIds;
    const monitorAlarmMap = {
      hr: ['hr_low', 'hr_high', 'arrest'],
      map: ['map_low', 'arrest'],
      spo2: ['spo2_low', 'arrest'],
      co2: ['co2_low', 'co2_high', 'arrest']
    };
    document.querySelectorAll('[data-monitor-alarm]').forEach(tile => {
      const ids = monitorAlarmMap[tile.dataset.monitorAlarm] || [];
      tile.classList.toggle('vital-alarm', ids.some(id => visibleAlarmIds.has(id)));
    });
    const ventAlarmMap = {
      vt: ['vt_low', 'vt_high'],
      mv: ['mv_low', 'mv_high'],
      pressure: ['pressure_high'],
      autoPeep: ['auto_peep']
    };
    document.querySelectorAll('[data-vent-alarm]').forEach(tile => {
      const ids = ventAlarmMap[tile.dataset.ventAlarm] || [];
      tile.classList.toggle('vent-value-alarm', ids.some(id => visibleAlarmIds.has(id)));
    });
  }

  function renderOverallStatus() {
    const badge = $('anesthesiaBadge');
    if (badge) {
      badge.className = `status-pill ${state.anesthesiaStatus === 'unzureichend' ? 'critical' : state.anesthesiaStatus === 'oberflächlich' ? 'warning' : 'live'}`;
      badge.textContent = `Narkose ${state.anesthesiaStatus}`;
    }
  }

  function renderMonitor() {
    const arterialConnected = hasAccess('artery');
    const temperatureConnected = hasAccess('bladder');
    document.querySelector('.monitor-vital.art')?.classList.toggle('hidden', !arterialConnected);
    document.querySelector('.monitor-vital.temp')?.classList.toggle('hidden', !temperatureConnected);
    document.querySelector('.monitor-strip')?.style.setProperty('--monitor-vitals', String(4 + Number(arterialConnected) + Number(temperatureConnected)));
    $('monitorHr').textContent = Math.max(0, Math.round(state.hr));
    $('monitorNibp').textContent = `${nibp.last.sys}/${nibp.last.dia}`;
    $('monitorMap').textContent = `MAP ${nibp.last.map} mmHg · ${formatTime(state.elapsed - nibp.last.time)} alt`;
    $('monitorArt').textContent = arterialConnected ? `${Math.round(state.sys)}/${Math.round(state.dia)}` : 'kein Signal';
    $('monitorArtMap').textContent = arterialConnected ? `MAP ${Math.round(state.map)} mmHg · kontinuierlich` : 'Arterie erforderlich';
    $('monitorSpo2').textContent = number(state.spo2, state.spo2 < 95 ? 1 : 0);
    $('monitorEtco2').textContent = number(measuredEtco2, 0);
    if (temperatureConnected) $('monitorTemp').textContent = number(state.temp, 1);

    if (nibp.measuringUntil !== null) {
      const remaining = Math.max(0, Math.ceil(nibp.measuringUntil - state.elapsed));
      $('nibpCountdown').textContent = `Messung läuft · ${remaining} s`;
      $('measureNibpBtn').textContent = `Messung · ${remaining} s`;
    } else {
      $('measureNibpBtn').textContent = 'Start · 20 s';
      $('nibpCountdown').textContent = nibp.interval > 0 && nibp.nextAt !== null
        ? `Nächste Messung ${formatTime(Math.max(0, nibp.nextAt - state.elapsed))}`
        : 'Automatik aus';
    }
  }

  function renderVentValues() {
    const d = state.lastDerived;
    if (!d) return;
    $('vteValue').textContent = number(d.tidalVolumeMl, 0);
    $('vtPbwValue').textContent = number(d.vtPerPbw, 1);
    $('mveValue').textContent = number(d.minuteVolume, 1);
    $('ppeakValue').textContent = number(d.peakPressure, 0);
    $('pmeanValue').textContent = number(d.meanPressure, 1);
    $('complianceValue').textContent = number(d.complianceMlPerMbar, 0);
    $('autoPeepValue').textContent = number(d.intrinsicPeep, 1);
    $('timesValue').textContent = `${number(d.ti, 1)} / ${number(d.te, 1)}`;
  }

  function setVentValuesPage(page) {
    const pages = [...document.querySelectorAll('[data-vent-values-page]')];
    if (!pages.length) return;
    ventValuesPage = (Number(page) + pages.length) % pages.length;
    pages.forEach((node, index) => {
      const active = index === ventValuesPage;
      node.hidden = !active;
      node.classList.toggle('active', active);
    });
    $('ventValuesPageIndicator').textContent = `${ventValuesPage + 1} / ${pages.length}`;
  }

  function render(now = performance.now()) {
    $('simTime').textContent = formatTime(state.elapsed);
    $('runState').textContent = running ? (timeScale === 1 ? 'läuft in Echtzeit' : `Zeitraffer ${timeScale}×`) : 'Simulation pausiert';
    $('pauseBtn').textContent = running ? 'Pause' : 'Fortsetzen';
    renderMonitor();
    renderVentValues();
    renderAlarms();
    renderOverallStatus();
    renderDiagnostics();
    renderClinical();
    updateSettingOutputs();
    updatePumpOutputs();
    lastRenderAt = now;
  }

  function tone(frequency, duration, gain = 0.035, channel = 'pulse', type = 'sine', delay = 0) {
    const levelGain = channelGain(channel);
    if (!levelGain || document.hidden || !audioContext || audioContext.state !== 'running') return false;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    const startedAt = audioContext.currentTime + Math.max(0, delay);
    const attackEndsAt = startedAt + Math.min(0.005, duration / 3);
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, startedAt);
    volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * levelGain), attackEndsAt);
    volume.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    if (channel === 'ventilator') trackVentilatorNode(oscillator);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + duration);
    return true;
  }

  function pulseTone(frequency) {
    if (!channelGain('pulse') || !audioContext || audioContext.state !== 'running') return false;
    const now = audioContext.currentTime;
    if (now - lastPulseAudioAt < 0.18) return true;
    lastPulseAudioAt = now;
    return tone(frequency, 0.045, 0.025, 'pulse');
  }

  async function ensureAudioContext() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') await audioContext.resume();
    } catch {
      audioContext = null;
    }
  }

  function getVentilatorNoiseBuffer() {
    if (!audioContext) return null;
    if (ventilatorNoiseBuffer?.sampleRate === audioContext.sampleRate) return ventilatorNoiseBuffer;
    const length = Math.max(1, Math.round(audioContext.sampleRate * 2));
    ventilatorNoiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const samples = ventilatorNoiseBuffer.getChannelData(0);
    let smoothed = 0;
    for (let i = 0; i < length; i += 1) {
      smoothed = smoothed * .54 + (Math.random() * 2 - 1) * .46;
      samples[i] = smoothed * .9 + (Math.random() * 2 - 1) * .1;
    }
    return ventilatorNoiseBuffer;
  }

  function trackVentilatorNode(node) {
    activeVentilatorNodes.add(node);
    node.addEventListener('ended', () => activeVentilatorNodes.delete(node), { once: true });
    return node;
  }

  function stopVentilatorSound() {
    activeVentilatorNodes.forEach(node => {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    });
    activeVentilatorNodes.clear();
  }

  function scheduleVentilatorValveClick(startedAt, levelGain, pitch = 1, strength = 1) {
    const noise = getVentilatorNoiseBuffer();
    if (!noise) return;

    const snap = trackVentilatorNode(audioContext.createBufferSource());
    const snapHighPass = audioContext.createBiquadFilter();
    const snapResonance = audioContext.createBiquadFilter();
    const snapGain = audioContext.createGain();
    snap.buffer = noise;
    snapHighPass.type = 'highpass';
    snapHighPass.frequency.setValueAtTime(820 * pitch, startedAt);
    snapResonance.type = 'peaking';
    snapResonance.frequency.setValueAtTime(2050 * pitch, startedAt);
    snapResonance.Q.setValueAtTime(1.1, startedAt);
    snapResonance.gain.setValueAtTime(5, startedAt);
    snapGain.gain.setValueAtTime(.016 * levelGain * strength, startedAt);
    snapGain.gain.exponentialRampToValueAtTime(.0001, startedAt + .014);
    snap.connect(snapHighPass).connect(snapResonance).connect(snapGain).connect(audioContext.destination);
    snap.start(startedAt);
    snap.stop(startedAt + .018);

    const body = trackVentilatorNode(audioContext.createOscillator());
    const bodyGain = audioContext.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(430 * pitch, startedAt);
    body.frequency.exponentialRampToValueAtTime(220 * pitch, startedAt + .019);
    bodyGain.gain.setValueAtTime(.0032 * levelGain * strength, startedAt);
    bodyGain.gain.exponentialRampToValueAtTime(.0001, startedAt + .021);
    body.connect(bodyGain).connect(audioContext.destination);
    body.start(startedAt);
    body.stop(startedAt + .023);
  }

  function scheduleVentilatorBreath(derived) {
    const levelGain = channelGain('ventilator');
    if (!levelGain || !running || state.cardiacArrest || document.hidden || !audioContext || audioContext.state !== 'running') return false;
    const noise = getVentilatorNoiseBuffer();
    if (!noise) return false;

    const playbackScale = Math.max(1, timeScale);
    const ti = E.clamp(derived.ti / playbackScale, .04, 15);
    const te = E.clamp(derived.te / playbackScale, .04, 15);
    const startedAt = audioContext.currentTime + .004;
    const inspirationEndsAt = startedAt + ti;
    const breathEndsAt = inspirationEndsAt + te;
    const rise = Math.min(Math.max(.012, settings.riseTime / playbackScale), Math.max(.014, ti * .72));
    const peakFlow = Math.max(0, Number(derived.peakInspiratoryFlowLMin) || 0);
    const flowIntensity = E.clamp(.62 + peakFlow / 180, .68, 1.35);
    const inspirationPeakAt = startedAt + Math.min(Math.max(.014, rise * .35), ti * .36);
    const inspirationTailAt = Math.max(inspirationPeakAt + .012, inspirationEndsAt - .014);
    const inspirationPeakGain = .027 * levelGain * flowIntensity;
    const inspirationTailGain = Math.max(.0007, inspirationPeakGain * .16);

    const inspiration = trackVentilatorNode(audioContext.createBufferSource());
    const inspirationHighPass = audioContext.createBiquadFilter();
    const inspirationLowPass = audioContext.createBiquadFilter();
    const inspirationGain = audioContext.createGain();
    inspiration.buffer = noise;
    inspiration.loop = true;
    inspirationHighPass.type = 'highpass';
    inspirationHighPass.frequency.setValueAtTime(260, startedAt);
    inspirationLowPass.type = 'lowpass';
    inspirationLowPass.frequency.setValueAtTime(3900 + Math.min(900, settings.deltaP * 28), startedAt);
    inspirationLowPass.Q.setValueAtTime(.55, startedAt);
    inspirationLowPass.frequency.exponentialRampToValueAtTime(1450, inspirationTailAt);
    inspirationGain.gain.setValueAtTime(.0001, startedAt);
    inspirationGain.gain.exponentialRampToValueAtTime(inspirationPeakGain, inspirationPeakAt);
    inspirationGain.gain.exponentialRampToValueAtTime(inspirationTailGain, inspirationTailAt);
    inspirationGain.gain.exponentialRampToValueAtTime(.0001, inspirationEndsAt);
    inspiration.connect(inspirationHighPass).connect(inspirationLowPass).connect(inspirationGain).connect(audioContext.destination);
    inspiration.start(startedAt);
    inspiration.stop(inspirationEndsAt + .004);

    const turbine = trackVentilatorNode(audioContext.createOscillator());
    const turbineGain = audioContext.createGain();
    turbine.type = 'sine';
    turbine.frequency.setValueAtTime(86 + settings.deltaP * .7, startedAt);
    turbine.frequency.exponentialRampToValueAtTime(122 + settings.deltaP * .9, inspirationPeakAt);
    turbine.frequency.exponentialRampToValueAtTime(92, inspirationTailAt);
    turbineGain.gain.setValueAtTime(.0001, startedAt);
    turbineGain.gain.exponentialRampToValueAtTime(.0017 * levelGain * flowIntensity, inspirationPeakAt);
    turbineGain.gain.exponentialRampToValueAtTime(.00035 * levelGain, inspirationTailAt);
    turbineGain.gain.exponentialRampToValueAtTime(.0001, inspirationEndsAt);
    turbine.connect(turbineGain).connect(audioContext.destination);
    turbine.start(startedAt);
    turbine.stop(inspirationEndsAt + .004);

    const expiration = trackVentilatorNode(audioContext.createBufferSource());
    const expirationHighPass = audioContext.createBiquadFilter();
    const expirationLowPass = audioContext.createBiquadFilter();
    const expirationGain = audioContext.createGain();
    const lungTau = Math.max(.15, Number(derived.tau) || .8) / playbackScale;
    const expirationAttackAt = inspirationEndsAt + Math.min(.012, te * .18);
    const expirationDecayAt = Math.min(breathEndsAt - .012, inspirationEndsAt + Math.max(.09, Math.min(te * .82, lungTau * 3.1)));
    const expirationIntensity = E.clamp(.7 + derived.tidalVolumeMl / 950, .72, 1.45);
    const expirationPeakGain = .028 * levelGain * expirationIntensity;
    expiration.buffer = noise;
    expiration.loop = true;
    expirationHighPass.type = 'highpass';
    expirationHighPass.frequency.setValueAtTime(170, inspirationEndsAt);
    expirationLowPass.type = 'lowpass';
    expirationLowPass.frequency.setValueAtTime(2850 + Math.min(950, derived.tidalVolumeMl * 1.4), inspirationEndsAt);
    expirationLowPass.Q.setValueAtTime(.48, inspirationEndsAt);
    expirationLowPass.frequency.exponentialRampToValueAtTime(720, expirationDecayAt);
    expirationGain.gain.setValueAtTime(.0001, inspirationEndsAt);
    expirationGain.gain.exponentialRampToValueAtTime(expirationPeakGain, expirationAttackAt);
    expirationGain.gain.exponentialRampToValueAtTime(.0011 * levelGain, expirationDecayAt);
    expirationGain.gain.exponentialRampToValueAtTime(.0001, breathEndsAt);
    expiration.connect(expirationHighPass).connect(expirationLowPass).connect(expirationGain).connect(audioContext.destination);
    expiration.start(inspirationEndsAt);
    expiration.stop(breathEndsAt + .004);

    scheduleVentilatorValveClick(startedAt, levelGain, 1.08, .86);
    scheduleVentilatorValveClick(inspirationEndsAt, levelGain, .88, 1);
    return true;
  }

  function updateVentilatorSound() {
    if (!running || state.cardiacArrest || !channelGain('ventilator')) {
      stopVentilatorSound();
      lastSoundElapsed = state.elapsed;
      return;
    }
    const derived = state.lastDerived || E.lungMechanics(state, settings);
    if (!Number.isFinite(lastSoundElapsed)) {
      scheduleVentilatorBreath(derived);
      lastSoundElapsed = state.elapsed;
      return;
    }
    const previousElapsed = lastSoundElapsed;
    const previousBreath = Math.floor(Math.max(0, previousElapsed) / derived.cycleSeconds);
    const currentBreath = Math.floor(Math.max(0, state.elapsed) / derived.cycleSeconds);
    if (state.elapsed < previousElapsed || currentBreath > previousBreath) scheduleVentilatorBreath(derived);
    lastSoundElapsed = state.elapsed;
  }

  function updateSound() {
    if (!running) {
      stopVentilatorSound();
      lastSoundElapsed = Number.NEGATIVE_INFINITY;
      return;
    }
    updateVentilatorSound();
    if (!state.cardiacArrest && state.elapsed >= nextPulseAt && state.hr > 0) {
      const spo2Frequency = E.clamp(430 + (state.spo2 - 80) * 16, 260, 760);
      if (pulseTone(spo2Frequency)) nextPulseAt = state.elapsed + 60 / Math.max(20, state.hr);
    }
    const alarms = currentAlarms();
    if (alarms.length && state.elapsed >= nextAlarmToneAt) {
      const critical = alarms.some(alarm => alarm.priority === 'critical');
      tone(critical ? 930 : 720, critical ? 0.16 : 0.11, 0.045, 'alarm');
      nextAlarmToneAt = state.elapsed + (critical ? 0.7 : 1.4);
    }
  }

  function resizeCanvas(canvas) {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.round(rect.width * ratio));
    const height = Math.max(250, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { ratio, width, height };
  }

  function drawWaveforms() {
    const canvas = $('waveCanvas');
    const ctx = canvas.getContext('2d');
    const { ratio, width, height } = resizeCanvas(canvas);
    const cssWidth = width / ratio;
    const cssHeight = height / ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#010608';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const rowHeight = cssHeight / 3;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(45, 86, 108, .34)';
    for (let row = 0; row < 3; row += 1) {
      const top = row * rowHeight;
      for (let x = 55; x < cssWidth; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + rowHeight); ctx.stroke();
      }
      for (let y = top; y <= top + rowHeight; y += rowHeight / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#23485b';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, rowHeight); ctx.lineTo(cssWidth, rowHeight); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, rowHeight * 2); ctx.lineTo(cssWidth, rowHeight * 2); ctx.stroke();

    const sweep = W.sweep(waveformRecorder, state.elapsed, cssWidth);
    const drawLine = (key, row, min, max, color) => {
      ctx.beginPath();
      sweep.points.forEach(point => {
        const normalized = E.clamp((point[key] - min) / (max - min), 0, 1);
        const y = row * rowHeight + rowHeight - 7 - normalized * (rowHeight - 14);
        if (point.breakBefore) ctx.moveTo(point.x, y);
        else ctx.lineTo(point.x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    drawLine('pressure', 0, 0, 50, '#54e7ef');
    drawLine('flow', 1, -160, 160, '#ffd25c');
    drawLine('volume', 2, 0, 1600, '#35e58a');
  }

  function frame(now) {
    const rawDt = Math.max(0, Math.min(0.5, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    if (running && !state.cardiacArrest) {
      state = E.step(state, settings, pumps, (rawDt || 0.016) * timeScale);
    } else if (running && state.cardiacArrest) {
      state = E.step(state, settings, pumps, (rawDt || 0.016) * timeScale);
    }
    W.advance(waveformRecorder, state.elapsed, settings, state);
    if (waveformRecorder.completedBreaths !== measuredBreathCount) {
      measuredBreathCount = waveformRecorder.completedBreaths;
      measuredEtco2 = state.etCO2;
    }
    updateTasks();
    if (state.cardiacArrest && !priorCardiacArrest) {
      priorCardiacArrest = true;
      addEvent('Kreislaufstillstand nach anhaltend extremer Hypoxie oder Hypotonie. Für einen neuen Versuch Sandbox zurücksetzen.');
    }
    updateSound();
    if (now - lastRenderAt >= 200) render(now);
    drawWaveforms();
    requestAnimationFrame(frame);
  }

  function bindControls() {
    document.querySelectorAll('.setting-key').forEach(button => {
      button.addEventListener('click', () => selectSetting(button.dataset.setting));
      button.addEventListener('wheel', event => {
        if (selectedSetting !== button.dataset.setting) return;
        event.preventDefault();
        const now = performance.now();
        if (now - lastSettingWheelAt < 90 || event.deltaY === 0) return;
        lastSettingWheelAt = now;
        adjustSelectedSetting(event.deltaY < 0 ? 1 : -1);
      }, { passive: false });
    });
    document.querySelectorAll('[data-setting-step]').forEach(button => button.addEventListener('click', () => {
      const control = button.closest('[data-setting-control]');
      if (!control || control.dataset.settingControl !== selectedSetting) return;
      adjustSelectedSetting(Number(button.dataset.settingStep));
    }));

    $('propofolDown').addEventListener('click', () => adjustPump('propofol', -1));
    $('propofolUp').addEventListener('click', () => adjustPump('propofol', 1));
    $('remifentanilDown').addEventListener('click', () => adjustPump('remifentanil', -1));
    $('remifentanilUp').addEventListener('click', () => adjustPump('remifentanil', 1));
    $('ventValuesPrev').addEventListener('click', () => setVentValuesPage(ventValuesPage - 1));
    $('ventValuesNext').addEventListener('click', () => setVentValuesPage(ventValuesPage + 1));
    document.querySelectorAll('[data-pump-dose]').forEach(button => {
      button.addEventListener('click', () => selectPumpDose(button.dataset.pumpDose));
      button.addEventListener('wheel', event => {
        if (selectedPumpDose !== button.dataset.pumpDose) return;
        event.preventDefault();
        const now = performance.now();
        if (now - lastPumpWheelAt < 90 || event.deltaY === 0) return;
        lastPumpWheelAt = now;
        adjustPump(button.dataset.pumpDose, event.deltaY < 0 ? 1 : -1);
      }, { passive: false });
    });
    ['propofol', 'remifentanil'].forEach(id => {
      $(`${id}Toggle`).addEventListener('click', () => {
        pumps[id].running = !pumps[id].running;
        renderPump(id);
        addEvent(`${id === 'propofol' ? 'Propofol' : 'Remifentanil'}-Perfusor ${pumps[id].running ? 'gestartet' : 'gestoppt'}.`);
      });
    });

    $('nibpInterval').addEventListener('change', event => {
      nibp.interval = Number(event.target.value);
      nibp.nextAt = nibp.interval > 0 ? state.elapsed + nibp.interval : null;
      addEvent(`NIBP-Intervall ${nibp.interval > 0 ? `auf ${nibp.interval / 60} min gesetzt` : 'ausgeschaltet'}.`);
    });
    $('speedSelect').addEventListener('change', event => {
      timeScale = [1, 5, 10].includes(Number(event.target.value)) ? Number(event.target.value) : 1;
      stopVentilatorSound();
      lastSoundElapsed = Number.NEGATIVE_INFINITY;
      addEvent(`Simulationsgeschwindigkeit auf ${timeScale}× gesetzt.`);
      render();
    });
    $('soundMixer').addEventListener('click', event => {
      const button = event.target.closest('[data-sound-channel][data-sound-level]');
      if (!button) return;
      setSoundLevel(button.dataset.soundChannel, button.dataset.soundLevel);
    });
    $('measureNibpBtn').addEventListener('click', () => beginNibpMeasurement());
    $('accessBtn').addEventListener('click', () => $('accessDialog').showModal());
    document.querySelectorAll('[data-access-type]').forEach(button => button.addEventListener('click', () => insertAccess(button.dataset.accessType)));
    $('bgaBtn').addEventListener('click', () => $('bgaRequestDialog').showModal());
    $('requestArterialBgaBtn').addEventListener('click', () => requestBga('arterial'));
    $('requestVenousBgaBtn').addEventListener('click', () => requestBga('venous'));
    $('bgaHistoryBtn').addEventListener('click', renderBgaHistory);
    $('labBtn').addEventListener('click', () => $('labDialog').showModal());
    $('submitLabBtn').addEventListener('click', requestLabs);
    $('labHistoryBtn').addEventListener('click', renderLabHistory);
    $('ecgBtn').addEventListener('click', requestEcg);
    $('sonoBtn').addEventListener('click', requestSono);
    $('ecgResultBtn').addEventListener('click', () => showSimpleResult('12-Kanal-EKG', ecgResult));
    $('sonoResultBtn').addEventListener('click', () => showSimpleResult('POCUS / Sono', sonoResult));
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
    $('closeResultsBtn').addEventListener('click', () => $('resultsDialog').close());

    $('chatLog').addEventListener('scroll', () => {
      const log = $('chatLog');
      chatAutoFollow = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
    });
    $('chatForm').addEventListener('submit', event => {
      event.preventDefault();
      const input = $('chatInput');
      handleChat(input.value);
      input.value = '';
    });

    $('pauseBtn').addEventListener('click', () => {
      running = !running;
      lastFrameAt = performance.now();
      if (running) lastSoundElapsed = Number.NEGATIVE_INFINITY;
      addEvent(running ? 'Simulation fortgesetzt.' : 'Simulation pausiert.');
      render();
    });
    $('resetBtn').addEventListener('click', () => {
      freshSession();
      writeSettings();
      updatePumpOutputs();
      $('nibpInterval').value = '180';
      $('speedSelect').value = '1';
      $('requestArterialBgaBtn').disabled = false;
      $('requestVenousBgaBtn').disabled = false;
      $('bgaHistoryBtn').disabled = true;
      $('labHistoryBtn').disabled = true;
      $('ecgResultBtn').disabled = true;
      $('sonoResultBtn').disabled = true;
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      renderSoundMixer();
      render();
      checkAiStatus();
    });
    document.addEventListener('pointerdown', async () => {
      if (channelGain('alarm') || channelGain('pulse') || channelGain('ventilator')) await ensureAudioContext();
      if (channelGain('ventilator')) lastSoundElapsed = Number.NEGATIVE_INFINITY;
    }, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopVentilatorSound();
      if (!document.hidden) {
        nextPulseAt = state.elapsed;
        nextAlarmToneAt = state.elapsed;
        lastSoundElapsed = Number.NEGATIVE_INFINITY;
      }
    });
  }

  function init() {
    let participant = '';
    try {
      const launchConfig = JSON.parse(sessionStorage.getItem('galenLaunchConfig') || 'null');
      if (launchConfig?.version === 1 && launchConfig.module === 'anesthesia' && Date.now() - Number(launchConfig.createdAt || 0) <= 30 * 60 * 1000) {
        participant = String(launchConfig.username || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        sessionStorage.setItem('galenParticipant', participant);
        sessionStorage.removeItem('galenLaunchConfig');
      } else {
        participant = String(sessionStorage.getItem('galenParticipant') || '').trim().slice(0, 80);
      }
    } catch {}
    if ($('participantName')) $('participantName').textContent = participant || '–';
    soundLevels = loadSoundLevels();
    window.GalenUiSound?.setLevel(soundLevels.interface);
    freshSession();
    writeSettings();
    updatePumpOutputs();
    renderLabOptions();
    renderSoundMixer();
    bindControls();
    setVentValuesPage(0);
    render();
    checkAiStatus();
    requestAnimationFrame(frame);
  }

  init();
})();
