(function () {
  'use strict';

  const E = window.TELECARE_VENT_ENGINE;
  if (!E) throw new Error('Beatmungs-Engine konnte nicht geladen werden.');

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
  let alarmSilencedUntil;
  let bgaTask;
  let bgaHistory;
  let nibp;
  let events;
  let priorAlarmIds;
  let priorCardiacArrest;
  let audioContext;
  let soundEnabled;
  let nextPulseAt;
  let nextAlarmToneAt;
  let lastRenderAt;
  let staff;
  let access;
  let assignedTasks;
  let backgroundTasks;
  let taskCounter;
  let labHistory;
  let medicationsGiven;
  let timeScale;

  function freshSession() {
    settings = { ...E.DEFAULT_SETTINGS };
    pumps = {
      propofol: { ...E.DEFAULT_PUMPS.propofol },
      remifentanil: { ...E.DEFAULT_PUMPS.remifentanil }
    };
    state = E.step(E.createInitial(), settings, pumps, 0.01);
    running = true;
    lastFrameAt = performance.now();
    alarmSilencedUntil = 0;
    bgaTask = null;
    bgaHistory = [];
    labHistory = [];
    medicationsGiven = [];
    timeScale = 1;
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
    lastRenderAt = 0;
    addEvent('Sandbox gestartet: PCV und beide Perfusoren laufen mit den Startwerten.');
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
    $('absolutePinsp').textContent = `${number(settings.peep + settings.deltaP)} mbar`;
    $('calculatedTi').textContent = `${number(d.ti, 2)} s`;
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

  function assignTask(label, duration, roles, onComplete, kind = 'clinical') {
    const person = staff.find(candidate => roles.includes(candidate.role) && candidate.busyUntil <= state.elapsed);
    if (!person) {
      addEvent(`Auftrag nicht gestartet: Für „${label}“ ist kein geeignetes Personal frei.`);
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
    grid.innerHTML = staff.map(person => {
      const busy = person.busyUntil > state.elapsed;
      return `<article class="staff-card ${busy ? 'busy' : ''}"><span class="staff-icon">${person.icon}</span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.roleLabel)} · ${busy ? `belegt: ${person.taskLabel}` : 'verfügbar'}</small></article>`;
    }).join('');

    const accessItems = ['endotracheal_tube', ...access];
    $('accessList').innerHTML = accessItems.map(item => {
      if (item === 'endotracheal_tube') return '<span class="access-chip">Tubus 7,0 · 21 cm</span>';
      return `<span class="access-chip">${escapeHtml(ACCESS_DEFINITIONS[accessType(item)]?.label || item)}</span>`;
    }).join('');
    $('lineMonitoring').innerHTML = `<span>ART <strong>${hasAccess('artery') ? 'aktiv' : '–'}</strong></span><span>ZVD <strong>${hasAccess('zvk') ? '5 mmHg' : '–'}</strong></span><span>Temperatur <strong>${hasAccess('bladder') ? 'über DK' : 'Ösophagus'}</strong></span><span>Medikamente <strong>${medicationsGiven.length}</strong></span>`;
    $('therapySummary').textContent = `Kristalloide: ${Number(state.crystalloidMl || 0)} ml${state.norepiBolusUntil > state.elapsed ? ' · Noradrenalin-Bolus aktiv' : ''}`;

    const active = [...assignedTasks, ...backgroundTasks];
    const list = $('activeTasks');
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
      renderClinical();
    });
    if (task) $('accessDialog').close();
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
        renderDiagnostics();
      }, 'diagnostic');
    }, 'diagnostic');
    if (!task) return;
    $('labDialog').close();
    renderDiagnostics();
  }

  function renderLabHistory() {
    $('labResultsContent').innerHTML = labHistory.length
      ? labHistory.map((entry, index) => `<section class="result-group"><h3>Labor ${index + 1} · ${formatTime(entry.time)}</h3><table class="result-table"><thead><tr><th>Parameter</th><th>Wert</th><th>Norm</th></tr></thead><tbody>${entry.values.map(value => `<tr><td>${escapeHtml(value.label)}</td><td>${escapeHtml(value.value)}</td><td>${escapeHtml(value.norm)}</td></tr>`).join('')}</tbody></table></section>`).join('')
      : '<p>Noch keine Laborergebnisse vorhanden.</p>';
    $('labResultsDialog').showModal();
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
    const activeDiagnostics = [...assignedTasks, ...backgroundTasks].filter(item => item.kind === 'diagnostic');
    const task = $('diagnosticTasks');
    task.classList.toggle('hidden', activeDiagnostics.length === 0);
    task.innerHTML = activeDiagnostics.map(item => `${escapeHtml(item.label)} · noch ${Math.max(0, Math.ceil(item.completeAt - state.elapsed))} s`).join('<br>');
    $('requestArterialBgaBtn').disabled = Boolean(bgaTask);
    $('requestVenousBgaBtn').disabled = Boolean(bgaTask);
    $('requestArterialBgaBtn').textContent = hasAccess('artery') ? 'Arteriell über Arterie · 15 s' : 'Arteriell punktieren · 45 s';
    $('labHistoryBtn').disabled = labHistory.length === 0;
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
    $('bgaDialogContent').innerHTML = bgaHistory.length
      ? `<div class="bga-table-wrap"><table class="bga-table"><thead><tr><th>Parameter</th><th>Norm</th>${bgaHistory.map((entry, index) => `<th>${entry.type === 'venous' ? 'venöse' : 'arterielle'} BGA ${index + 1}<br><small>${formatTime(entry.time)} · FiO₂ ${number(entry.settings.fio2, 2)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(([label, id, unit, norm]) => `<tr><th>${label}<br><small>${unit}</small></th><td>${norm}</td>${bgaHistory.map(entry => {
          const value = entry.values[id];
          const decimals = id === 'pH' ? 2 : ['paCO2', 'bicarbonate', 'baseExcess', 'saturation', 'lactate', 'potassium', 'ionizedCalcium', 'hemoglobin'].includes(id) ? 1 : 0;
          return `<td class="${valueClass(id, value, entry.type)}">${number(value, decimals)}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`
      : '<p>Noch keine BGA vorhanden.</p>';
    $('bgaDialog').showModal();
  }

  function setupMedicationOptions() {
    const definitions = window.TELECARE_MEDICATIONS || {};
    $('medicationSelect').innerHTML = Object.entries(definitions)
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'de'))
      .map(([id, definition]) => `<option value="${escapeHtml(id)}">${escapeHtml(definition.label)}</option>`)
      .join('');
    if (definitions.rocuronium) $('medicationSelect').value = 'rocuronium';
  }

  function giveSelectedMedication() {
    const id = $('medicationSelect').value;
    const definition = window.TELECARE_MEDICATIONS?.[id];
    if (!definition) {
      addEvent('Das ausgewählte Medikament ist nicht verfügbar.');
      return;
    }
    if (definition.requiresAccess && !hasVascularAccess()) {
      addEvent(`${definition.label} kann ohne geeigneten Gefäßzugang nicht gegeben werden.`);
      return;
    }
    assignTask(`${definition.label} verabreichen`, Number(definition.taskSeconds || 20), ['doctor', 'ata'], () => {
      state = E.addMedicationEffect(state, id, definition);
      medicationsGiven.push({ id, label: definition.label, time: state.elapsed });
      addEvent(`${definition.label} wurde gegeben; das bestehende TeleCare-Wirkprofil ist aktiv.`);
      renderClinical();
    });
  }

  function giveFluid() {
    if (!hasVascularAccess()) {
      addEvent('Kristalloid kann ohne geeigneten Gefäßzugang nicht gegeben werden.');
      return;
    }
    const definition = window.TELECARE_INTERVENTIONS?.fluid_500;
    assignTask(definition?.label || '500 ml Kristalloid', Number(definition?.taskSeconds || 60), ['doctor', 'ata'], () => {
      state = E.addFluidEffect(state, 500);
      addEvent(`500 ml Kristalloid verabreicht; Gesamtmenge ${state.crystalloidMl} ml.`);
      renderClinical();
    });
  }

  function giveNorepiBolus() {
    if (!hasVascularAccess()) {
      addEvent('Noradrenalin kann ohne geeigneten Gefäßzugang nicht gegeben werden.');
      return;
    }
    const definition = window.TELECARE_INTERVENTIONS?.norepi_bolus;
    assignTask(definition?.label || 'Noradrenalin 5 µg i.v. als Bolus geben', Number(definition?.taskSeconds || 15), ['doctor', 'ata'], () => {
      state = E.addNorepiBolus(state);
      addEvent('Noradrenalin 5 µg i.v. gegeben; der simulierte MAP-Effekt läuft etwa eine Minute.');
      beginNibpMeasurement('nach Noradrenalin-Bolus');
      renderClinical();
    });
  }

  function highestAlarmPriority() {
    return state.alarms.some(alarm => alarm.priority === 'critical')
      ? 'critical'
      : state.alarms.length ? 'warning' : 'stable';
  }

  function renderAlarms() {
    const alarms = state.alarms;
    const alarmIds = new Set(alarms.map(alarm => alarm.id));
    alarms.forEach(alarm => {
      if (!priorAlarmIds.has(alarm.id)) addEvent(`Alarm: ${alarm.label}.`);
    });
    priorAlarmIds = alarmIds;
    $('alarmSummary').textContent = alarms.length
      ? `${alarms.length} aktive${alarms.length === 1 ? 'r Alarm' : ' Alarme'}`
      : 'Keine aktiven Alarme';
    const list = $('alarmList');
    list.classList.toggle('empty', alarms.length === 0);
    list.innerHTML = alarms.length
      ? alarms.map(alarm => `<span class="alarm-item ${alarm.priority}">${escapeHtml(alarm.label)}</span>`).join('')
      : 'Beatmung und Patientenzustand innerhalb der Alarmgrenzen.';
    const silenced = alarmSilencedUntil > state.elapsed;
    $('silenceAlarmBtn').textContent = silenced
      ? `pausiert · ${Math.ceil(alarmSilencedUntil - state.elapsed)} s`
      : 'Alarm 2 min pausieren';
  }

  function renderOverallStatus() {
    const priority = highestAlarmPriority();
    const status = $('overallStatus');
    status.className = `overall-status ${priority}`;
    status.querySelector('strong').textContent = state.cardiacArrest
      ? 'Kreislaufstillstand'
      : priority === 'critical' ? 'kritisch' : priority === 'warning' ? 'auffällig' : 'stabil';
    const badge = $('anesthesiaBadge');
    badge.className = `status-badge ${state.anesthesiaStatus === 'unzureichend' ? 'critical' : state.anesthesiaStatus === 'oberflächlich' ? 'warning' : 'stable'}`;
    badge.textContent = `Narkose ${state.anesthesiaStatus}`;
  }

  function renderMonitor() {
    $('monitorHr').textContent = Math.max(0, Math.round(state.hr));
    $('monitorNibp').textContent = `${nibp.last.sys}/${nibp.last.dia}`;
    $('monitorMap').textContent = `MAP ${nibp.last.map} mmHg · ${formatTime(state.elapsed - nibp.last.time)} alt`;
    $('monitorArt').textContent = hasAccess('artery') ? `${Math.round(state.sys)}/${Math.round(state.dia)}` : 'kein Signal';
    $('monitorArtMap').textContent = hasAccess('artery') ? `MAP ${Math.round(state.map)} mmHg · kontinuierlich` : 'Arterie erforderlich';
    $('monitorSpo2').textContent = number(state.spo2, state.spo2 < 95 ? 1 : 0);
    $('monitorEtco2').textContent = number(state.etCO2, 0);
    $('monitorTemp').textContent = number(state.temp, 1);

    if (nibp.measuringUntil !== null) {
      const remaining = Math.max(0, Math.ceil(nibp.measuringUntil - state.elapsed));
      $('nibpCountdown').textContent = `Messung läuft · ${remaining} s`;
      $('measureNibpBtn').textContent = `Messung · ${remaining} s`;
    } else {
      $('measureNibpBtn').textContent = 'Jetzt messen · 20 s';
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

  function tone(frequency, duration, gain = 0.035) {
    if (!soundEnabled || !audioContext) return;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function updateSound() {
    if (!soundEnabled || !running || state.cardiacArrest) return;
    if (state.elapsed >= nextPulseAt && state.hr > 0) {
      const spo2Frequency = E.clamp(430 + (state.spo2 - 80) * 16, 260, 760);
      tone(spo2Frequency, 0.07, 0.025);
      nextPulseAt = state.elapsed + 60 / Math.max(20, state.hr);
    }
    if (state.alarms.length && alarmSilencedUntil <= state.elapsed && state.elapsed >= nextAlarmToneAt) {
      const critical = state.alarms.some(alarm => alarm.priority === 'critical');
      tone(critical ? 930 : 720, critical ? 0.16 : 0.11, 0.045);
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

    const secondsVisible = 12;
    const samples = Math.max(320, Math.round(cssWidth));
    const drawLine = (key, row, min, max, color) => {
      ctx.beginPath();
      for (let i = 0; i < samples; i += 1) {
        const x = i / (samples - 1) * cssWidth;
        const sampleTime = state.elapsed - secondsVisible + i / (samples - 1) * secondsVisible;
        const wave = E.waveformAt(sampleTime, settings, state);
        const normalized = E.clamp((wave[key] - min) / (max - min), 0, 1);
        const y = row * rowHeight + rowHeight - 7 - normalized * (rowHeight - 14);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    const pressureMax = Math.max(40, (state.lastDerived?.peakPressure || 30) + 8);
    const flowAbs = Math.max(80, Math.abs(state.lastDerived?.peakInspiratoryFlowLMin || 60) * 1.1);
    const volumeMax = Math.max(800, (state.lastDerived?.tidalVolumeMl || 500) * 1.25);
    drawLine('pressure', 0, 0, pressureMax, '#54e7ef');
    drawLine('flow', 1, -flowAbs, flowAbs, '#ffd25c');
    drawLine('volume', 2, 0, volumeMax, '#35e58a');
  }

  function frame(now) {
    const rawDt = Math.max(0, Math.min(0.5, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    if (running && !state.cardiacArrest) {
      state = E.step(state, settings, pumps, (rawDt || 0.016) * timeScale);
    } else if (running && state.cardiacArrest) {
      state = E.step(state, settings, pumps, (rawDt || 0.016) * timeScale);
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
    document.querySelectorAll('.dock-tab').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.dock-tab').forEach(tabButton => tabButton.classList.toggle('active', tabButton === button));
        document.querySelectorAll('.dock-view').forEach(view => view.classList.toggle('active', view.id === button.dataset.dockTarget));
      });
    });
    ['deltaPInput', 'peepInput', 'rrInput', 'fio2Input', 'ieInput', 'riseTimeInput'].forEach(id => {
      $(id).addEventListener('input', readSettings);
      $(id).addEventListener('change', () => {
        readSettings();
        const d = E.lungMechanics(state, settings);
        addEvent(`PCV geändert: ΔP ${settings.deltaP} mbar, PEEP ${settings.peep} mbar, AF ${settings.rr}/min, FiO₂ ${number(settings.fio2, 2)}, I:E ${settings.ie}; erwartetes VTe ${Math.round(d.tidalVolumeMl)} ml.`);
      });
    });
    $('restoreVentBtn').addEventListener('click', () => {
      settings = { ...E.DEFAULT_SETTINGS };
      writeSettings();
      addEvent('PCV-Einstellungen auf Startwerte zurückgesetzt.');
    });

    $('propofolInput').addEventListener('input', event => {
      pumps.propofol.rate = E.clamp(event.target.value, ...E.LIMITS.propofol);
      updatePumpOutputs();
    });
    $('propofolInput').addEventListener('change', () => addEvent(`Propofol auf ${number(pumps.propofol.rate, 2)} mg/kg/h eingestellt.`));
    $('remifentanilInput').addEventListener('input', event => {
      pumps.remifentanil.rate = E.clamp(event.target.value, ...E.LIMITS.remifentanil);
      updatePumpOutputs();
    });
    $('remifentanilInput').addEventListener('change', () => addEvent(`Remifentanil auf ${number(pumps.remifentanil.rate, 2)} µg/kg/min eingestellt.`));
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
      addEvent(`Simulationsgeschwindigkeit auf ${timeScale}× gesetzt.`);
      render();
    });
    $('measureNibpBtn').addEventListener('click', () => beginNibpMeasurement());
    $('openAccessBtn').addEventListener('click', () => $('accessDialog').showModal());
    document.querySelectorAll('[data-access-type]').forEach(button => button.addEventListener('click', () => insertAccess(button.dataset.accessType)));
    $('giveMedicationBtn').addEventListener('click', giveSelectedMedication);
    $('giveFluidBtn').addEventListener('click', giveFluid);
    $('giveNorepiBtn').addEventListener('click', giveNorepiBolus);
    $('requestArterialBgaBtn').addEventListener('click', () => requestBga('arterial'));
    $('requestVenousBgaBtn').addEventListener('click', () => requestBga('venous'));
    $('bgaHistoryBtn').addEventListener('click', renderBgaHistory);
    $('openLabBtn').addEventListener('click', () => $('labDialog').showModal());
    $('submitLabBtn').addEventListener('click', requestLabs);
    $('labHistoryBtn').addEventListener('click', renderLabHistory);
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
    $('closeBgaDialog').addEventListener('click', () => $('bgaDialog').close());
    $('clearLogBtn').addEventListener('click', () => { events = []; renderEvents(); });

    $('pauseBtn').addEventListener('click', () => {
      running = !running;
      lastFrameAt = performance.now();
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
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      render();
    });
    $('silenceAlarmBtn').addEventListener('click', () => {
      alarmSilencedUntil = state.elapsed + 120;
      addEvent('Akustischer Alarm für 2 Minuten pausiert.');
    });
    $('soundBtn').addEventListener('click', async () => {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') await audioContext.resume();
      soundEnabled = !soundEnabled;
      $('soundBtn').textContent = soundEnabled ? '🔊 Ton an' : '🔇 Ton aus';
      $('soundBtn').setAttribute('aria-pressed', String(soundEnabled));
      if (soundEnabled) tone(620, 0.08, 0.03);
    });
  }

  function init() {
    soundEnabled = false;
    $('pbwHeader').textContent = number(E.PATIENT.predictedBodyWeightKg, 1);
    freshSession();
    writeSettings();
    updatePumpOutputs();
    renderLabOptions();
    setupMedicationOptions();
    bindControls();
    render();
    requestAnimationFrame(frame);
  }

  init();
})();
