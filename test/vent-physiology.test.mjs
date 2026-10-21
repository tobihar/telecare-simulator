import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../public/vent-physiology.js');
await import('../public/vent-waveform-history.js');
await import('../public/vent-vitals-waves.js');
const E = globalThis.GALEN_VENT_ENGINE;
const W = globalThis.GALEN_VENT_WAVEFORMS;

const standardPumps = E.DEFAULT_PUMPS;
const standardSettings = E.DEFAULT_SETTINGS;
const simulate = (settings = standardSettings, pumps = standardPumps, seconds = 60) =>
  E.runFor(E.createInitial(), settings, pumps, seconds, 0.25);

test('Patientendaten und Startwerte entsprechen dem experimentellen Fall', () => {
  assert.equal(E.PATIENT.sex, 'weiblich');
  assert.equal(E.PATIENT.age, 40);
  assert.equal(E.PATIENT.heightCm, 170);
  assert.equal(E.PATIENT.weightKg, 85);
  assert.ok(E.PATIENT.predictedBodyWeightKg > 61 && E.PATIENT.predictedBodyWeightKg < 62);
  assert.deepEqual(E.DEFAULT_SETTINGS, {
    deltaP: 10,
    peep: 5,
    rr: 12,
    fio2: 1,
    ie: '1:1',
    riseTime: 0.2
  });
});

test('Standard-PCV ist bei gesunder Lunge stabil und plausibel', () => {
  const state = simulate();
  const d = state.lastDerived;
  assert.ok(d.tidalVolumeMl > 430 && d.tidalVolumeMl < 550);
  assert.ok(d.vtPerPbw > 7 && d.vtPerPbw < 9);
  assert.ok(d.minuteVolume > 5 && d.minuteVolume < 7);
  assert.equal(d.peakPressure, 15);
  assert.ok(d.intrinsicPeep < 0.5);
  assert.ok(state.paCO2 > 35 && state.paCO2 < 45);
  assert.ok(state.spo2 > 98);
  assert.ok(state.map > 70 && state.map < 85);
  assert.equal(state.alarms.length, 0);
});

test('Lungenprotektives VT hält CO₂ bei AF 18 ohne relevante Auto-PEEP im Gleichgewicht', () => {
  const state = simulate({
    ...standardSettings,
    deltaP: 7.5,
    rr: 18,
    fio2: 0.4
  }, standardPumps, 300);
  const d = state.lastDerived;

  assert.ok(d.tidalVolumeMl > 340 && d.tidalVolumeMl < 380);
  assert.ok(d.vtPerPbw > 5.5 && d.vtPerPbw < 6.2);
  assert.ok(d.minuteVolume > 6 && d.minuteVolume < 7);
  assert.ok(d.deadSpaceMl > 140 && d.deadSpaceMl < 150);
  assert.ok(d.intrinsicPeep < 0.5);
  assert.ok(state.paCO2 > 38 && state.paCO2 < 43);
  assert.ok(state.etCO2 > 35 && state.etCO2 < 40);
  assert.ok(state.pH > 7.37 && state.pH < 7.42);
});

test('ΔP verändert unter PCV Tidalvolumen und Atemwegsdruck in der richtigen Richtung', () => {
  const initial = E.createInitial();
  const low = E.lungMechanics(initial, { ...standardSettings, deltaP: 5 });
  const high = E.lungMechanics(initial, { ...standardSettings, deltaP: 20 });
  assert.ok(high.tidalVolumeMl > low.tidalVolumeMl * 3);
  assert.equal(low.peakPressure, 10);
  assert.equal(high.peakPressure, 25);
});

test('Inverse I:E bei hoher Frequenz erzeugt eine unvollständige Exspiration', () => {
  const state = simulate({ ...standardSettings, deltaP: 18, peep: 12, rr: 40, ie: '4:1' }, standardPumps, 90);
  assert.ok(state.lastDerived.intrinsicPeep > 5);
  assert.ok(state.lastDerived.meanPressure > 20);
  assert.ok(state.alarms.some(alarm => alarm.id === 'auto_peep'));
  assert.ok(state.map < 60);
});

test('Schwere Hypoventilation führt dynamisch zu Hyperkapnie, Hypoxämie und Kreislaufstillstand', () => {
  const state = simulate({ ...standardSettings, deltaP: 3, peep: 0, rr: 6, fio2: 0.21 }, standardPumps, 180);
  assert.ok(state.paCO2 > 100);
  assert.ok(state.paO2 < 40);
  assert.ok(state.spo2 < 60);
  assert.equal(state.cardiacArrest, true);
});

test('Hyperventilation wird in etCO₂ und BGA ohne zusätzliche Ergebnislatenz sichtbar', () => {
  const state = simulate({ ...standardSettings, deltaP: 18, rr: 35, fio2: 0.4, ie: '1:2' }, standardPumps, 45);
  const bga = E.sampleBga(state);
  assert.ok(bga.paCO2 < 25);
  assert.ok(bga.pH > 7.5);
  assert.ok(state.etCO2 < 25);
});

test('Anhaltend hoher Druck belastet Kreislauf und Lunge', () => {
  const state = simulate({ ...standardSettings, deltaP: 35, peep: 20, rr: 25, fio2: 0.5 }, standardPumps, 300);
  assert.ok(state.lastDerived.peakPressure >= 50);
  assert.ok(state.map < 50);
  assert.ok(state.lungInjury > 0.35);
  assert.ok(state.alarms.some(alarm => alarm.id === 'pressure_high'));
  assert.ok(state.alarms.some(alarm => alarm.id === 'lung_injury'));
});

test('Perfusoränderungen wirken zeitverzögert und beeinflussen Hämodynamik und Narkosetiefe', () => {
  const pumpsOff = {
    propofol: { running: false, rate: 6 },
    remifentanil: { running: false, rate: 0.15 }
  };
  const overdose = {
    propofol: { running: true, rate: 12 },
    remifentanil: { running: true, rate: 0.5 }
  };
  const awake = simulate(standardSettings, pumpsOff, 180);
  const deep = simulate(standardSettings, overdose, 180);
  assert.ok(awake.awareness > 0.55);
  assert.equal(awake.anesthesiaStatus, 'unzureichend');
  assert.ok(awake.hr > 95);
  assert.ok(deep.map < 60);
  assert.ok(deep.hr < 55);
  assert.ok(awake.map > deep.map + 40);
});

test('Wiederverwendete Medikamentenwirkungen und Noradrenalin beeinflussen die Hämodynamik', () => {
  let atropineState = E.addMedicationEffect(E.createInitial(), 'atropine', {
    label: 'Atropin',
    effect: { duration: 120, hr: 38 }
  });
  atropineState = E.runFor(atropineState, standardSettings, standardPumps, 30);
  assert.ok(atropineState.hr > 90);

  let norepiState = E.addNorepiBolus(E.createInitial());
  norepiState = E.runFor(norepiState, standardSettings, standardPumps, 40);
  assert.ok(norepiState.map > 94 && norepiState.map < 102);
});

test('Isolierte extreme Hyperkapnie wird auch bei hoher FiO₂ hämodynamisch gefährlich', () => {
  const state = simulate({ ...standardSettings, rr: 2, deltaP: 10, fio2: 1 }, standardPumps, 600);
  assert.ok(state.paCO2 > 140);
  assert.ok(state.pH < 7);
  assert.equal(state.cardiacArrest, true);
});

test('Fortlaufende Beatmungskurven bewahren alte Atemzüge bei Parameteränderungen', () => {
  let state = E.step(E.createInitial(), standardSettings, standardPumps, 0.01);
  const recorder = W.create(E, standardSettings, state, { historySeconds: 12, sampleRate: 50 });
  const historicalBefore = recorder.samples
    .filter(sample => sample.time >= -2 && sample.time <= -1)
    .map(sample => ({ ...sample }));

  const highPressureSettings = { ...standardSettings, deltaP: 20 };
  state = E.runFor(state, highPressureSettings, standardPumps, 6, 0.05);
  W.advance(recorder, state.elapsed, highPressureSettings, state);

  const historicalAfter = recorder.samples
    .filter(sample => sample.time >= -2 && sample.time <= -1)
    .map(sample => ({ ...sample }));
  assert.deepEqual(historicalAfter, historicalBefore, 'Bereits geschriebene Kurvenpunkte dürfen nicht rückwirkend verändert werden');

  const finishingOldBreath = recorder.samples.filter(sample => sample.time > 0.1 && sample.time < 4.9);
  const firstNewBreath = recorder.samples.filter(sample => sample.time > 5.1);
  assert.ok(Math.max(...finishingOldBreath.map(sample => sample.pressure)) < 16);
  assert.ok(Math.max(...firstNewBreath.map(sample => sample.pressure)) > 24);
  assert.ok(recorder.samples.length <= 610, 'Der Kurvenpuffer muss zeitlich begrenzt bleiben');
});

test('Ein kurzer Löschspalt läuft über die ansonsten feste Kurvenfläche', () => {
  let state = E.step(E.createInitial(), standardSettings, standardPumps, 0.01);
  const recorder = W.create(E, standardSettings, state, { historySeconds: 12, sampleRate: 50 });
  const initialSweep = W.sweep(recorder, state.elapsed, 1200);

  state = E.runFor(state, standardSettings, standardPumps, 1, 0.05);
  W.advance(recorder, state.elapsed, standardSettings, state);
  const laterSweep = W.sweep(recorder, state.elapsed, 1200);

  assert.ok(laterSweep.cursorX > initialSweep.cursorX + 95 && laterSweep.cursorX < initialSweep.cursorX + 105);
  assert.ok(laterSweep.eraseWidth > 30 && laterSweep.eraseWidth < 45);
  assert.ok(laterSweep.points.some(point => point.breakBefore), 'Beim Bildschirmumlauf muss der Linienpfad getrennt werden');
  assert.ok(laterSweep.points.every(point => {
    const forwardDistance = (point.x - laterSweep.cursorX + 1200) % 1200;
    return forwardDistance < 0.001 || forwardDistance >= laterSweep.eraseWidth - 2;
  }), 'Vor der Schreiblinie muss der definierte Löschspalt frei bleiben');
});

test('Beatmungs-Sandbox ist von den bestehenden Schock-Modulen getrennt', async () => {
  for (const file of ['../public/app.js', '../public/cases.js', '../public/physiology.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(source.includes('GALEN_VENT_ENGINE'), false, `${file} darf die Beatmungs-Engine nicht importieren`);
    assert.equal(source.includes('vent.html'), false, `${file} darf nicht zur Sandbox verzweigen`);
  }
});

test('Experimenteller Einstieg und Sandbox-Ressourcen sind vollständig verdrahtet', async () => {
  const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const hub = await readFile(new URL('../public/simulator-hub.html', import.meta.url), 'utf8');
  const hubApp = await readFile(new URL('../public/simulator-hub.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../public/vent.html', import.meta.url), 'utf8');
  assert.match(index, /href="\/simulator\?module=anesthesia"/);
  assert.match(index, /Experimenteller Bereich/);
  assert.match(hub, /Was simulierst[\s\S]*du[\s\S]*heute/);
  assert.match(hub, /data-module="shock"/);
  assert.match(hub, /data-module="anesthesia"/);
  assert.match(hub, /id="participantInput"[\s\S]*required/);
  assert.match(hubApp, /'\/shock\?launch=1'/);
  assert.match(hubApp, /'\/vent\.html\?launch=1'/);
  assert.match(page, /src="vent-physiology\.js"/);
  assert.match(page, /src="vent-waveform-history\.js"/);
  assert.match(page, /src="vent\.js"/);
  assert.match(page, /src="medications\.js"/);
  assert.match(page, /src="interventions\.js"/);
  assert.match(page, /Beatmung bei elektiver OP/);
  assert.match(page, /Team vor Ort/);
  assert.match(page, /Chat mit dem Team vor Ort/);
  assert.match(page, /Diagnostik &amp; Organisation|Diagnostik & Organisation/);
  assert.match(page, /Aktive Maßnahmen/);
  assert.match(page, /Blutprodukte/);
});

test('Beatmungsoberfläche nutzt das Schock-Layout ohne verschachtelte Gerätemenüs', async () => {
  const [page, app, styles] = await Promise.all([
    readFile(new URL('../public/vent.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent.css', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(page, /experimental-ribbon|Übergabe aus der Einleitung|Patientenzustand|Alarmzentrale|dock-tabs|eventPanel|medicationSelect/);
  assert.doesNotMatch(page, /type="range"/);
  assert.match(page, /data-setting="deltaP"/);
  assert.doesNotMatch(page, /id="settingDownBtn"|id="settingUpBtn"|class="setting-adjuster"/);
  assert.doesNotMatch(page, /id="selectedSettingLabel"|id="restoreVentBtn"|>Einstellungen<|>Startwerte</);
  assert.doesNotMatch(app, /selectedSettingLabel|restoreVentBtn/);
  assert.match(page, /data-setting="ie"[\s\S]*id="ieOutput"[\s\S]*class="setting-calculated"[\s\S]*id="calculatedTi"/);
  assert.doesNotMatch(page, /class="calculated-settings"/);
  assert.match(page, /data-setting-control="fio2"[\s\S]*data-setting-step="-1"[\s\S]*data-setting-step="1"[\s\S]*data-setting="fio2"/);
  assert.match(page, /data-vent-values-page="0"[\s\S]*>Pmean<[\s\S]*>VT<[\s\S]*>MV<[\s\S]*>Pinsp<[\s\S]*>Ppeak</);
  assert.match(page, /data-vent-values-page="1"[\s\S]*>VT\/PBW<[\s\S]*>Cdyn<[\s\S]*>PEEPi<[\s\S]*>Ti \/ Te</);
  assert.match(page, /id="ventValuesPrev"[\s\S]*id="ventValuesPageIndicator"[\s\S]*id="ventValuesNext"/);
  assert.doesNotMatch(page, /class="vent-mode"/);
  assert.doesNotMatch(page, /id="anesthesiaBadge"|Narkose ausreichend/);
  assert.match(page, /id="propofolDown"/);
  assert.match(page, /id="remifentanilUp"/);
  const workspaceStart = page.indexOf('<div class="center-workspace">');
  const pumpRack = page.indexOf('<section class="pump-rack panel"');
  const rightColumn = page.indexOf('<aside class="right-column">');
  assert.ok(workspaceStart >= 0 && pumpRack > workspaceStart && pumpRack < rightColumn, 'Perfusoren müssen im zentralen Arbeitsbereich statt unterhalb davon liegen');
  assert.match(page, /id="propofolPump" class="strip-perfusor propofol-label running"[\s\S]*id="propofolDown"[\s\S]*class="pump-dose"[\s\S]*data-pump-dose="propofol"[\s\S]*id="propofolOutput"[\s\S]*id="propofolUp"[\s\S]*id="propofolToggle"/);
  assert.match(page, /id="remifentanilPump" class="strip-perfusor opioid-label running"/);
  assert.match(page, /data-pump-dose="remifentanil"[\s\S]*id="remifentanilOutput"/);
  assert.match(page, /id="staffPanel" class="staff panel"/);
  assert.match(page, /id="resultsDialog"[\s\S]*id="resultsTitle"[\s\S]*id="closeResultsBtn"[\s\S]*id="resultsContent"/);
  assert.doesNotMatch(page, /id="labResultsDialog"|id="bgaDialog"|id="labResultsContent"|id="bgaDialogContent"/);
  assert.match(styles, /grid-template-areas:\s*"chat vent"\s*"pumps vent"/);
  assert.match(styles, /\.strip-perfusor\.propofol-label\s*\{[^}]*background:\s*rgb\(255,\s*255,\s*0\)/s);
  assert.match(styles, /\.strip-perfusor\.opioid-label\s*\{[^}]*background:\s*rgb\(133,\s*199,\s*227\)/s);
  assert.doesNotMatch(page, /class="nibp-controls"/);
  assert.match(page, /class="monitor-vital nibp"[\s\S]*class="nibp-inline-controls"[\s\S]*id="nibpInterval"[\s\S]*id="measureNibpBtn"[\s\S]*id="nibpCountdown"/);
  assert.match(styles, /grid-template-columns:\s*repeat\(var\(--monitor-vitals,\s*4\),\s*minmax\(105px,\s*1fr\)\)/);
  assert.match(app, /function handleChat/);
  assert.match(app, /giveMedicationById/);
  assert.match(app, /function showToast\(text\)/);
  assert.match(app, /function flashNoStaff\(roles\)/);
  assert.match(app, /showToast\('Das benötigte Personal ist gerade nicht verfügbar\.'\)/);
  assert.match(app, /data-staff-id="\$\{person\.id\}"[\s\S]*deny-flash/);
  assert.match(app, /function buildTrendTable\(history, title\)/);
  assert.match(app, /buildTrendTable\(labHistory, 'Labor'\)/);
  assert.match(app, /buildTrendTable\(history, 'BGA'\)/);
  assert.match(app, /function selectPumpDose\(id\)/);
  assert.match(app, /function setVentValuesPage\(page\)/);
  assert.match(app, /W\.advance\(waveformRecorder, state\.elapsed, settings, state\)/);
  assert.match(app, /W\.sweep\(waveformRecorder, state\.elapsed, cssWidth\)/);
  assert.doesNotMatch(app, /cursorGradient|ctx\.lineTo\(sweep\.cursorX, cssHeight\)/);
  assert.doesNotMatch(app, /E\.waveformAt\(sampleTime, settings, state\)/);
  assert.match(app, /ventValuesPrev'\)\.addEventListener\('click'/);
  assert.match(app, /ventValuesNext'\)\.addEventListener\('click'/);
  assert.match(app, /selectedPumpDose !== button\.dataset\.pumpDose/);
  assert.match(app, /adjustPump\(button\.dataset\.pumpDose, event\.deltaY < 0 \? 1 : -1\)/);
  assert.match(app, /const FIO2_OPTIONS = Object\.freeze\(\[\.21, \.25, \.3,[^\]]*1\]\)/);
  assert.match(app, /button\.addEventListener\('wheel'/);
  assert.match(app, /\{ passive: false \}/);
  assert.match(app, /event\.deltaY < 0 \? 1 : -1/);
  assert.match(app, /soundLevels = loadSoundLevels\(\)/);
  assert.match(app, /if \(window\.__GALEN_VENT_APP_ACTIVE__\) return/);
  assert.match(app, /function pulseTone\(frequency\)/);
  assert.match(app, /now - lastPulseAudioAt < 0\.18/);
  assert.match(app, /setValueAtTime\(0\.0001, startedAt\)/);
  assert.match(app, /pulseTone\(spo2Frequency\)/);
  assert.match(app, /!levelGain \|\| document\.hidden/);
  assert.match(app, /document\.addEventListener\('visibilitychange'/);
  assert.doesNotMatch(app, /if \(soundEnabled\) tone\(620/);
  assert.match(styles, /\.vent-app\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s);
  assert.doesNotMatch(styles, /\.vent-app\s*\{[^}]*max-width:\s*1900px/s);
  assert.match(styles, /\.setting-inline-adjuster\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*calc\(100% \+ 8px\)/s);
  assert.match(styles, /\.setting-key\s*\{[^}]*height:\s*100%[^}]*min-height:\s*88px/s);
  assert.match(styles, /\.toast-message\s*\{[^}]*background:\s*#651621/s);
  assert.match(styles, /\.staff-card\.deny-flash\s*\{[^}]*animation:\s*denyFlash/s);
  assert.match(styles, /\.trend-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(styles, /\.pump-dose\s*\{[^}]*border:\s*2px solid/s);
  assert.match(styles, /\.pump-dose\.active\s*\{[^}]*background:\s*#123b55/s);
  assert.match(styles, /\.vent-values\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto/s);
  assert.match(styles, /\.vent-values-nav\s*\{[^}]*grid-template-columns:\s*30px minmax\(0,\s*1fr\) 30px/s);
  assert.match(styles, /\.vent-values-page\s*\{[^}]*grid-template-columns:\s*1fr[^}]*grid-auto-rows:\s*minmax\(0,\s*1fr\)[^}]*gap:\s*0[^}]*align-content:\s*stretch/s);
  assert.match(styles, /\.vent-values-page > div\s*\{[^}]*grid-template-areas:\s*"label" "value" "unit"[^}]*justify-items:\s*center/s);
  assert.match(styles, /\.vent-values-page > div \+ div\s*\{[^}]*border-top:\s*0/s);
  assert.match(styles, /\.vent-values-page span\s*\{[^}]*font-size:\s*11px/s);
  assert.match(styles, /\.vent-values-page strong\s*\{[^}]*font-family:\s*var\(--mono\)[^}]*font-size:\s*18px[^}]*text-align:\s*center/s);
  assert.match(styles, /\.setting-key > span\s*\{[^}]*font-size:\s*11px/s);
  assert.match(styles, /\.setting-key output\s*\{[^}]*font-family:\s*var\(--mono\)[^}]*font-size:\s*15px/s);
});

test('Invasive Monitorwerte erscheinen nur bei angeschlossenem Zugang', async () => {
  const [index, app, styles, ventPage, ventApp, ventStyles] = await Promise.all([
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent.css', import.meta.url), 'utf8')
  ]);

  assert.match(index, /strip-vital art hidden/);
  assert.match(index, /strip-vital cvp hidden/);
  assert.match(app, /strip-vital\.art'\)\?\.classList\.toggle\('hidden',!arterial\)/);
  assert.match(app, /strip-vital\.cvp'\)\?\.classList\.toggle\('hidden',!cvpAvailable\)/);
  assert.match(app, /--visible-vitals',String\(5\+Number\(arterial\)\+Number\(cvpAvailable\)\)/);
  assert.match(styles, /repeat\(var\(--visible-vitals,5\)/);

  assert.match(ventPage, /monitor-vital art hidden/);
  assert.match(ventPage, /monitor-vital temp hidden/);
  assert.match(ventApp, /monitor-vital\.art'\)\?\.classList\.toggle\('hidden', !arterialConnected\)/);
  assert.match(ventApp, /monitor-vital\.temp'\)\?\.classList\.toggle\('hidden', !temperatureConnected\)/);
  assert.match(ventStyles, /repeat\(var\(--monitor-vitals, 4\)/);
});

test('Kurvenpuffer zählt abgeschlossene Atemzüge für die etCO₂-Messung', () => {
  const E = globalThis.GALEN_VENT_ENGINE;
  const W = globalThis.GALEN_VENT_WAVEFORMS;
  const settings = { ...E.DEFAULT_SETTINGS, rr: 12 };
  const state = E.step(E.createInitial(), settings, E.DEFAULT_PUMPS, 0.01);
  const recorder = W.create(E, settings, state);
  const before = recorder.completedBreaths;
  W.advance(recorder, state.elapsed + 4.9, settings, state);
  assert.ok(recorder.completedBreaths - before <= 1, 'Innerhalb eines 5-s-Zyklus höchstens ein Atemzugende');
  W.advance(recorder, state.elapsed + 30, settings, state);
  assert.equal(recorder.completedBreaths - before, 6, 'Bei AF 12 enden in 30 s genau sechs Atemzüge');
});

test('etCO₂-Alarmgrenzen sind unverändert', () => {
  const E = globalThis.GALEN_VENT_ENGINE;
  assert.deepEqual(E.etco2Alarms(37), []);
  assert.deepEqual(E.etco2Alarms(25).map(a => [a.id, a.priority]), [['co2_low', 'warning']]);
  assert.deepEqual(E.etco2Alarms(20).map(a => [a.id, a.priority]), [['co2_low', 'critical']]);
  assert.deepEqual(E.etco2Alarms(55).map(a => [a.id, a.priority]), [['co2_high', 'warning']]);
  assert.deepEqual(E.etco2Alarms(65).map(a => [a.id, a.priority]), [['co2_high', 'critical']]);
});

test('Fenster im Anästhesie-Simulator sind skalier- und minimierbar verdrahtet', async () => {
  const [page, layout, styles] = await Promise.all([
    readFile(new URL('../public/vent.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent-layout.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/vent.css', import.meta.url), 'utf8')
  ]);
  for (const key of ['vitals', 'staff', 'patient', 'inventory', 'chat', 'ventilator', 'pumps', 'actions', 'orders']) {
    assert.match(page, new RegExp(`data-window="${key}"`), `Fenster ${key} fehlt`);
  }
  assert.match(page, /src="vent-waveform-history\.js"><\/script>\s*<script src="vent-vitals-waves\.js">/);
  assert.match(page, /src="vent\.js"><\/script>\s*<script src="vent-vitals\.js"><\/script>\s*<script src="vent-layout\.js">/);
  assert.match(page, /id="resetLayoutBtn"/);
  assert.match(layout, /localStorage/);
  assert.match(styles, /var\(--left-w, 250px\)/);
  assert.match(styles, /var\(--chat-w, minmax\(340px, \.85fr\)\) var\(--vent-w, minmax\(520px, 1\.15fr\)\)/);
  assert.match(styles, /\.panel\.window-minimized > :not\(\.panel-title-row\) \{ display: none !important; \}/);
});

test('Kapnogramm: null in der Inspiration, Plateau am Ende der Exspiration', () => {
  const E = globalThis.GALEN_VENT_ENGINE;
  const settings = { ...E.DEFAULT_SETTINGS, rr: 12 };
  const state = { ...E.step(E.createInitial(), settings, E.DEFAULT_PUMPS, 0.01), etCO2: 40 };
  const d = E.lungMechanics(state, settings);
  assert.ok(E.waveformAtPhase(d.ti * 0.8, settings, state).co2 < 1, 'Inspiration ohne CO₂');
  assert.ok(E.waveformAtPhase(d.ti + 0.02, settings, state).co2 < 1, 'Totraum zu Beginn der Exspiration');
  const end = E.waveformAtPhase(d.cycleSeconds - 0.001, settings, state).co2;
  assert.ok(Math.abs(end - 40) < 0.5, `Endtidal ${end} statt 40`);
  const midPlateau = E.waveformAtPhase(d.ti + d.te * 0.6, settings, state).co2;
  assert.ok(midPlateau > 36 && midPlateau < end, 'Plateau steigt leicht an');
});

test('Gemessenes etCO₂ entspricht dem Kurvenende des letzten Atemzugs', () => {
  const E = globalThis.GALEN_VENT_ENGINE;
  const W = globalThis.GALEN_VENT_WAVEFORMS;
  const settings = { ...E.DEFAULT_SETTINGS, rr: 12 };
  const state = { ...E.step(E.createInitial(), settings, E.DEFAULT_PUMPS, 0.01), etCO2: 42 };
  const recorder = W.create(E, settings, state);
  W.advance(recorder, state.elapsed + 10, settings, state);
  assert.ok(Math.abs(recorder.lastEndTidalCO2 - 42) < 0.5);
  assert.ok(recorder.samples.every(sample => Number.isFinite(sample.co2)));
});

test('Vitalkurven folgen Herzfrequenz und Blutdruck', () => {
  const V = globalThis.GALEN_VITAL_WAVES;
  const vitals = { elapsed: 0, hr: 60, sys: 120, dia: 60, map: 80, spo2: 98 };
  const recorder = V.create(vitals);
  V.advance(recorder, 6, { ...vitals, elapsed: 6 });
  const lastSeconds = recorder.samples.filter(s => s.time > 1);
  const art = lastSeconds.map(s => s.art);
  assert.ok(Math.max(...art) > 117 && Math.max(...art) <= 120.5, 'Systole erreicht');
  assert.ok(Math.min(...art) >= 59.5 && Math.min(...art) < 63, 'Diastole erreicht');
  const rPeaks = lastSeconds.filter((s, i, all) => s.ecg > 0.8 && (i === 0 || all[i - 1].ecg <= 0.8)).length;
  assert.ok(rPeaks >= 4 && rPeaks <= 6, `${rPeaks} R-Zacken in 5 s bei HF 60`);

  const arrest = V.create({ ...vitals, hr: 0, cardiacArrest: true, map: 5, sys: 6, dia: 4 });
  assert.ok(arrest.samples.every(s => s.ecg === 0), 'Asystolie ohne Ausschläge');
});

test('Arterie und Pleth folgen der R-Zacke mit Pulswellenlaufzeit', () => {
  const V = globalThis.GALEN_VITAL_WAVES;
  const vitals = { elapsed: 0, hr: 60, sys: 120, dia: 60, map: 80, spo2: 98 };
  const recorder = V.create(vitals);
  V.advance(recorder, 8, { ...vitals, elapsed: 8 });
  const beat = recorder.samples.filter(s => s.time > 4 && s.time <= 5);
  const rTime = beat.reduce((best, s) => (s.ecg > best.ecg ? s : best)).time;
  const after = key => {
    const next = recorder.samples.filter(s => s.time > rTime && s.time < rTime + 0.9);
    return next.reduce((best, s) => (s[key] > best[key] ? s : best)).time - rTime;
  };
  const artDelay = after('art');
  const plethDelay = after('pleth');
  assert.ok(artDelay > 0.15 && artDelay < 0.45, `Arterienspitze ${artDelay.toFixed(2)} s nach R`);
  assert.ok(plethDelay > artDelay + 0.05 && plethDelay < 0.75, `Pleth-Spitze ${plethDelay.toFixed(2)} s nach R`);
});

test('Kurvenskala wechselt erst nach anhaltend anderem Wert', () => {
  const V = globalThis.GALEN_VITAL_WAVES;
  const co2 = V.createScale([50, 75, 100, 150], 20);
  assert.equal(V.updateScale(co2, 38, 0), 50);
  assert.equal(V.updateScale(co2, 58, 10), 50, 'kurzer Anstieg ändert die Skala nicht');
  assert.equal(V.updateScale(co2, 40, 15), 50);
  assert.equal(V.updateScale(co2, 58, 20), 50);
  assert.equal(V.updateScale(co2, 60, 39), 50, 'noch keine 20 s');
  assert.equal(V.updateScale(co2, 61, 41), 75, 'nach 20 s über 50 auf 0–75');
  assert.equal(V.updateScale(co2, 45, 50), 75, 'knapp unter 50 bleibt die größere Skala');
  assert.equal(V.updateScale(co2, 35, 60), 75);
  assert.equal(V.updateScale(co2, 35, 81), 50, 'nach 20 s deutlich darunter zurück auf 0–50');
});

test('SpO₂ wird im Beatmungsmonitor ohne Nachkommastellen angezeigt', async () => {
  const app = await readFile(new URL('../public/vent.js', import.meta.url), 'utf8');
  assert.match(app, /\$\('monitorSpo2'\)\.textContent = String\(Math\.round\(state\.spo2\)\)/);
});
