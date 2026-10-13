(function (root) {
  'use strict';

  const PATIENT = Object.freeze({
    sex: 'weiblich',
    age: 40,
    heightCm: 170,
    weightKg: 85,
    predictedBodyWeightKg: 45.5 + 0.91 * (170 - 152.4),
    bmi: 85 / (1.70 * 1.70)
  });

  const DEFAULT_SETTINGS = Object.freeze({
    deltaP: 10,
    peep: 5,
    rr: 12,
    fio2: 1,
    ie: '1:1',
    riseTime: 0.2
  });

  const DEFAULT_PUMPS = Object.freeze({
    propofol: { running: true, rate: 6 },
    remifentanil: { running: true, rate: 0.15 }
  });

  const INTUBATED_AIRWAY_DEAD_SPACE_ML_PER_KG_PBW = 1.95;
  const APPARATUS_DEAD_SPACE_ML = 25;

  const LIMITS = Object.freeze({
    deltaP: [0, 40],
    peep: [0, 25],
    rr: [2, 40],
    fio2: [0.21, 1],
    riseTime: [0.05, 0.8],
    propofol: [0, 12],
    remifentanil: [0, 0.5]
  });

  const IE_OPTIONS = Object.freeze(['1:4', '1:3', '1:2', '1:1.5', '1:1', '1.5:1', '2:1', '3:1', '4:1']);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function approach(current, target, dt, tauSeconds) {
    if (tauSeconds <= 0) return target;
    return current + (target - current) * (1 - Math.exp(-dt / tauSeconds));
  }

  function round(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  function mapPressure(sys, dia) {
    return (sys + 2 * dia) / 3;
  }

  function parseIe(value) {
    const match = String(value || '1:1').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return { inspiration: 1, expiration: 1, label: '1:1' };
    const inspiration = clamp(match[1], 0.25, 4);
    const expiration = clamp(match[2], 0.25, 4);
    return { inspiration, expiration, label: `${inspiration}:${expiration}` };
  }

  function normalizeSettings(input = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...input };
    const ie = IE_OPTIONS.includes(String(merged.ie)) ? String(merged.ie) : DEFAULT_SETTINGS.ie;
    return {
      deltaP: clamp(merged.deltaP, ...LIMITS.deltaP),
      peep: clamp(merged.peep, ...LIMITS.peep),
      rr: clamp(merged.rr, ...LIMITS.rr),
      fio2: clamp(merged.fio2, ...LIMITS.fio2),
      ie,
      riseTime: clamp(merged.riseTime, ...LIMITS.riseTime)
    };
  }

  function normalizePumps(input = {}) {
    const propofol = input.propofol || DEFAULT_PUMPS.propofol;
    const remifentanil = input.remifentanil || DEFAULT_PUMPS.remifentanil;
    return {
      propofol: {
        running: propofol.running !== false,
        rate: clamp(propofol.rate, ...LIMITS.propofol)
      },
      remifentanil: {
        running: remifentanil.running !== false,
        rate: clamp(remifentanil.rate, ...LIMITS.remifentanil)
      }
    };
  }

  function createInitial() {
    return {
      elapsed: 0,
      recruitment: 0.965,
      absorptionAtelectasis: 0.005,
      lungInjury: 0,
      airwayResistance: 8,
      paCO2: 40,
      paO2: 510,
      etCO2: 37,
      spo2: 100,
      bicarbonate: 24,
      pH: 7.4,
      baseExcess: 0,
      lactate: 0.9,
      hr: 65,
      sys: 105,
      dia: 63,
      map: 77,
      temp: 36.5,
      propofolEffect: DEFAULT_PUMPS.propofol.rate,
      remifentanilEffect: DEFAULT_PUMPS.remifentanil.rate,
      awareness: 0,
      anesthesiaStatus: 'ausreichend',
      medicationEffects: [],
      fluidEffects: [],
      crystalloidMl: 0,
      norepiBolusUntil: 0,
      criticalDose: 0,
      cardiacArrest: false,
      lastDerived: null,
      alarms: []
    };
  }

  function lungMechanics(state, rawSettings) {
    const settings = normalizeSettings(rawSettings);
    const ie = parseIe(settings.ie);
    const cycleSeconds = 60 / settings.rr;
    const inspiratoryFraction = ie.inspiration / (ie.inspiration + ie.expiration);
    const ti = cycleSeconds * inspiratoryFraction;
    const te = Math.max(0.05, cycleSeconds - ti);

    const peepOverdistension = Math.max(0, settings.peep - 10) * 0.018;
    const peakOverdistension = Math.max(0, settings.peep + settings.deltaP - 30) * 0.018;
    const injuryPenalty = state.lungInjury * 0.48;
    const complianceMlPerMbar = clamp(
      51 * state.recruitment * (1 - peepOverdistension - peakOverdistension - injuryPenalty),
      9,
      55
    );
    const complianceLPerMbar = complianceMlPerMbar / 1000;
    const resistance = clamp(state.airwayResistance + state.lungInjury * 5, 5, 22);
    const tau = clamp(resistance * complianceLPerMbar, 0.12, 1.1);

    const inspiratoryDecay = Math.exp(-ti / tau);
    const expiratoryDecay = Math.exp(-te / tau);
    const denominator = Math.max(0.001, 1 - inspiratoryDecay * expiratoryDecay);
    const tidalVolumeMl = clamp(
      complianceMlPerMbar * settings.deltaP *
      (1 - inspiratoryDecay) * (1 - expiratoryDecay) / denominator,
      0,
      1800
    );
    const intrinsicPeep = clamp(
      settings.deltaP * expiratoryDecay * (1 - inspiratoryDecay) / denominator,
      0,
      30
    );
    const peakPressure = settings.peep + settings.deltaP;
    const effectiveRise = Math.min(settings.riseTime, ti);
    const meanPressure = settings.peep +
      settings.deltaP * clamp((ti - effectiveRise * 0.5) / cycleSeconds, 0, 1) +
      intrinsicPeep * clamp(te / cycleSeconds, 0, 1) * 0.35;
    const peakInspiratoryFlowLMin = settings.deltaP / resistance * 60;
    const minuteVolume = tidalVolumeMl * settings.rr / 1000;
    const deadSpaceMl = INTUBATED_AIRWAY_DEAD_SPACE_ML_PER_KG_PBW * PATIENT.predictedBodyWeightKg +
      APPARATUS_DEAD_SPACE_ML +
      Math.max(0, settings.peep - 12) * 2.5 +
      state.lungInjury * 70;
    const alveolarMinuteVolume = Math.max(0.08, (tidalVolumeMl - deadSpaceMl) * settings.rr / 1000);
    const vtPerPbw = tidalVolumeMl / PATIENT.predictedBodyWeightKg;

    return {
      ...settings,
      cycleSeconds,
      inspiratoryFraction,
      ti,
      te,
      complianceMlPerMbar,
      resistance,
      tau,
      tidalVolumeMl,
      intrinsicPeep,
      peakPressure,
      meanPressure,
      peakInspiratoryFlowLMin,
      minuteVolume,
      deadSpaceMl,
      alveolarMinuteVolume,
      vtPerPbw
    };
  }

  function oxygenSaturation(paO2) {
    const p = Math.max(0.1, Number(paO2));
    const hill = 2.7;
    return 100 * (p ** hill) / (p ** hill + 26.8 ** hill);
  }

  function acidBase(paCO2) {
    const bicarbonate = clamp(24 + 0.1 * (paCO2 - 40), 14, 34);
    const pH = clamp(6.1 + Math.log10(bicarbonate / (0.03 * Math.max(5, paCO2))), 6.65, 7.8);
    const baseExcess = clamp((bicarbonate - 24.4) + 2.3 * (pH - 7.4), -20, 15);
    return { bicarbonate, pH, baseExcess };
  }

  function alarmList(state, d) {
    const alarms = [];
    const push = (id, priority, label) => alarms.push({ id, priority, label });
    if (state.cardiacArrest) push('arrest', 'critical', 'Kreislaufstillstand');
    if (d.peakPressure >= 35) push('pressure_high', 'critical', 'Atemwegsdruck sehr hoch');
    else if (d.peakPressure >= 30) push('pressure_high', 'warning', 'Atemwegsdruck hoch');
    if (d.tidalVolumeMl < 250) push('vt_low', 'critical', 'VTe sehr niedrig');
    else if (d.tidalVolumeMl < 350) push('vt_low', 'warning', 'VTe niedrig');
    if (d.tidalVolumeMl > 800 || d.vtPerPbw > 11) push('vt_high', 'critical', 'VTe sehr hoch');
    else if (d.tidalVolumeMl > 650 || d.vtPerPbw > 9) push('vt_high', 'warning', 'VTe hoch');
    if (d.minuteVolume < 3) push('mv_low', 'critical', 'Minutenvolumen sehr niedrig');
    else if (d.minuteVolume < 4) push('mv_low', 'warning', 'Minutenvolumen niedrig');
    if (d.minuteVolume > 13) push('mv_high', 'warning', 'Minutenvolumen hoch');
    if (d.intrinsicPeep >= 5) push('auto_peep', 'critical', 'Ausgeprägte intrinsische PEEP');
    else if (d.intrinsicPeep >= 2) push('auto_peep', 'warning', 'Exspiration unvollständig');
    if (state.spo2 < 88) push('spo2_low', 'critical', 'SpO₂ kritisch niedrig');
    else if (state.spo2 < 94) push('spo2_low', 'warning', 'SpO₂ niedrig');
    if (state.etCO2 > 60) push('co2_high', 'critical', 'etCO₂ sehr hoch');
    else if (state.etCO2 > 50) push('co2_high', 'warning', 'etCO₂ hoch');
    if (state.etCO2 < 22) push('co2_low', 'critical', 'etCO₂ sehr niedrig');
    else if (state.etCO2 < 30) push('co2_low', 'warning', 'etCO₂ niedrig');
    if (state.pH < 7.1) push('ph_low', 'critical', 'Schwere respiratorische Azidose');
    else if (state.pH < 7.25) push('ph_low', 'warning', 'Respiratorische Azidose');
    if (state.pH > 7.58) push('ph_high', 'critical', 'Schwere respiratorische Alkalose');
    else if (state.pH > 7.5) push('ph_high', 'warning', 'Respiratorische Alkalose');
    if (state.map < 50) push('map_low', 'critical', 'Kreislauf kritisch');
    else if (state.map < 65) push('map_low', 'warning', 'MAP niedrig');
    if (state.hr < 40) push('hr_low', 'critical', 'Bradykardie');
    else if (state.hr < 50) push('hr_low', 'warning', 'Herzfrequenz niedrig');
    if (state.hr > 120) push('hr_high', 'warning', 'Tachykardie');
    if (state.awareness > 0.55) push('anesthesia_low', 'critical', 'Narkosetiefe unzureichend');
    else if (state.awareness > 0.25) push('anesthesia_low', 'warning', 'Narkosetiefe nimmt ab');
    if (state.lungInjury > 0.2) push('lung_injury', 'warning', 'Anhaltend lungenschädliche Beatmung');
    return alarms;
  }

  function step(current, rawSettings, rawPumps, dtSeconds = 0.25) {
    const dt = clamp(dtSeconds, 0.01, 5);
    const settings = normalizeSettings(rawSettings);
    const pumps = normalizePumps(rawPumps);
    const state = { ...current };
    state.elapsed += dt;
    state.medicationEffects = (current.medicationEffects || []).filter(item => Number(item.until) > state.elapsed);
    state.fluidEffects = (current.fluidEffects || []).filter(item => Number(item.until) > state.elapsed);

    const propofolTarget = pumps.propofol.running ? pumps.propofol.rate : 0;
    const remifentanilTarget = pumps.remifentanil.running ? pumps.remifentanil.rate : 0;
    state.propofolEffect = approach(state.propofolEffect, propofolTarget, dt, propofolTarget > state.propofolEffect ? 22 : 50);
    state.remifentanilEffect = approach(state.remifentanilEffect, remifentanilTarget, dt, remifentanilTarget > state.remifentanilEffect ? 8 : 18);

    const hypnosisDeficit = clamp((3.5 - state.propofolEffect) / 3.5, 0, 1);
    const analgesiaDeficit = clamp((0.08 - state.remifentanilEffect) / 0.08, 0, 1);
    const awarenessTarget = clamp(hypnosisDeficit * 0.78 + analgesiaDeficit * 0.34, 0, 1);
    state.awareness = approach(state.awareness, awarenessTarget, dt, awarenessTarget > state.awareness ? 28 : 18);
    state.anesthesiaStatus = state.awareness > 0.55 ? 'unzureichend' : state.awareness > 0.25 ? 'oberflächlich' : 'ausreichend';

    const before = lungMechanics(state, settings);
    const lowPeepTarget = settings.peep < 5 ? (5 - settings.peep) * 0.035 : 0;
    const highOxygenTarget = settings.fio2 > 0.8 ? ((settings.fio2 - 0.8) / 0.2) * 0.11 : 0;
    const absorptionTarget = clamp(lowPeepTarget + highOxygenTarget, 0, 0.27);
    state.absorptionAtelectasis = approach(state.absorptionAtelectasis, absorptionTarget, dt, absorptionTarget > state.absorptionAtelectasis ? 360 : 150);

    const peepRecruitment = settings.peep <= 8
      ? 0.89 + settings.peep * 0.014
      : 1.002 - Math.max(0, settings.peep - 16) * 0.004;
    const recruitmentTarget = clamp(peepRecruitment - state.absorptionAtelectasis - state.lungInjury * 0.28, 0.58, 1);
    state.recruitment = approach(state.recruitment, recruitmentTarget, dt, recruitmentTarget < state.recruitment ? 75 : 38);

    const injuriousPressure = clamp((before.peakPressure - 30) / 15, 0, 1.5);
    const injuriousVolume = clamp((before.vtPerPbw - 9) / 5, 0, 1.5);
    const injuryTarget = clamp(Math.max(injuriousPressure, injuriousVolume) * 0.72, 0, 1);
    state.lungInjury = approach(state.lungInjury, injuryTarget, dt, injuryTarget > state.lungInjury ? 420 : 900);

    const d = lungMechanics(state, settings);
    const metabolicFactor = 1 + state.awareness * 0.13;
    const targetPaCO2 = clamp(40 * 3.82 * metabolicFactor / d.alveolarMinuteVolume, 10, 160);
    state.paCO2 = approach(state.paCO2, targetPaCO2, dt, 14);

    const shuntFraction = clamp(
      0.025 + (1 - state.recruitment) * 0.40 + state.absorptionAtelectasis * 0.20 + state.lungInjury * 0.16,
      0.02,
      0.48
    );
    const alveolarO2 = Math.max(5, settings.fio2 * 713 - state.paCO2 / 0.8);
    const overdistensionVqPenalty = Math.max(0, settings.peep - 16) * 0.008;
    const targetPaO2 = clamp(alveolarO2 * (1 - shuntFraction * 4.2 - overdistensionVqPenalty), 18, 610);
    state.paO2 = approach(state.paO2, targetPaO2, dt, 9);
    const targetSaturation = oxygenSaturation(state.paO2);
    state.spo2 = approach(state.spo2, targetSaturation, dt, 3.5);

    const deadSpaceGradient = 3 + Math.max(0, settings.peep - 12) * 0.35 + state.lungInjury * 7;
    state.etCO2 = approach(state.etCO2, clamp(state.paCO2 - deadSpaceGradient, 5, 130), dt, 5);
    const acidBaseState = acidBase(state.paCO2);
    state.bicarbonate = acidBaseState.bicarbonate;
    state.pH = acidBaseState.pH;
    state.baseExcess = acidBaseState.baseExcess;

    const medicationTotals = state.medicationEffects.reduce((total, item) => {
      const effect = item.effect || {};
      const remainingFraction = clamp((Number(item.until) - state.elapsed) / Math.max(1, Number(item.duration) || 1), 0, 1);
      const fade = clamp(remainingFraction * 1.25, 0.15, 1);
      total.hr += Number(effect.hr || 0) * fade;
      total.map += ((Number(effect.sys || 0) + 2 * Number(effect.dia || 0)) / 3) * fade;
      return total;
    }, { hr: 0, map: 0 });
    const fluidMapSupport = state.fluidEffects.reduce((sum, item) => {
      const remaining = clamp((Number(item.until) - state.elapsed) / Math.max(1, Number(item.duration) || 180), 0, 1);
      return sum + Math.min(7, Number(item.volumeMl || 0) / 100) * remaining;
    }, 0);
    const norepiRemaining = Number(state.norepiBolusUntil || 0) - state.elapsed;
    const norepiBolusSupport = norepiRemaining > 0
      ? (norepiRemaining > 20 ? 23 : 23 * norepiRemaining / 20)
      : 0;
    const hypercapnicSympatheticDrive = clamp((state.paCO2 - 50) * 0.28, 0, 18);
    const acidoticPumpFailure = state.pH < 7.12 ? (7.12 - state.pH) * 150 : 0;
    const hypocapnicVasodilation = state.paCO2 < 22 ? (22 - state.paCO2) * 0.35 : 0;
    const airwayPressurePenalty = Math.max(0, d.meanPressure - 10) * 1.15 +
      Math.max(0, settings.peep - 14) * 1.1 +
      d.intrinsicPeep * 1.2;
    const anestheticMapPenalty = state.propofolEffect * 1.8 + state.remifentanilEffect * 28;
    const interactionPenalty = Math.max(0, state.propofolEffect - 8) * Math.max(0, state.remifentanilEffect - 0.2) * 2.2;
    const hypoxiaStress = state.spo2 < 90 ? (90 - state.spo2) * 0.75 : 0;
    const severeHypoxicFailure = state.spo2 < 55 ? (55 - state.spo2) * 1.1 : 0;
    const targetMap = clamp(
      92 - anestheticMapPenalty - interactionPenalty - airwayPressurePenalty +
      state.awareness * 25 + hypoxiaStress - severeHypoxicFailure +
      medicationTotals.map + fluidMapSupport + norepiBolusSupport +
      hypercapnicSympatheticDrive - acidoticPumpFailure - hypocapnicVasodilation,
      18,
      125
    );
    const targetHr = clamp(
      72 - state.propofolEffect * 0.45 - state.remifentanilEffect * 34 +
      state.awareness * 40 + hypoxiaStress * 0.7 -
      (state.spo2 < 50 ? (50 - state.spo2) * 2.4 : 0) +
      medicationTotals.hr + hypercapnicSympatheticDrive * 0.65 -
      (state.pH < 6.95 ? (6.95 - state.pH) * 160 : 0),
      18,
      150
    );

    if (!state.cardiacArrest) {
      state.map = approach(state.map, targetMap, dt, 16);
      state.hr = approach(state.hr, targetHr, dt, 11);
      const pulsePressure = clamp(40 - Math.max(0, 65 - state.map) * 0.25 + state.awareness * 8, 18, 55);
      state.sys = state.map + pulsePressure * 2 / 3;
      state.dia = state.map - pulsePressure / 3;
      const lactateTarget = state.map < 55 || state.spo2 < 80
        ? clamp(0.9 + Math.max(0, 55 - state.map) * 0.10 + Math.max(0, 80 - state.spo2) * 0.045, 0.9, 10)
        : 0.9;
      state.lactate = approach(state.lactate, lactateTarget, dt, lactateTarget > state.lactate ? 100 : 360);

      const criticalRate =
        (state.spo2 < 50 ? (50 - state.spo2) / 18 + 0.45 : 0) +
        (state.map < 30 ? (30 - state.map) / 15 + 0.45 : 0) +
        (state.pH < 7.0 ? (7.0 - state.pH) * 2 + 0.1 : 0);
      state.criticalDose = clamp(state.criticalDose + dt * criticalRate - (criticalRate === 0 ? dt * 0.75 : 0), 0, 120);
      if (state.criticalDose >= 55) state.cardiacArrest = true;
    }

    if (state.cardiacArrest) {
      state.hr = approach(state.hr, 0, dt, 2);
      state.map = approach(state.map, 0, dt, 2);
      state.sys = approach(state.sys, 0, dt, 2);
      state.dia = approach(state.dia, 0, dt, 2);
      state.etCO2 = approach(state.etCO2, 5, dt, 8);
    }

    state.temp = approach(state.temp, 36.3, dt, 1800);
    state.lastDerived = d;
    state.alarms = alarmList(state, d);
    return state;
  }

  function sampleBga(state) {
    return {
      pH: round(state.pH, 2),
      paCO2: round(state.paCO2, 1),
      paO2: round(state.paO2, 0),
      bicarbonate: round(state.bicarbonate, 1),
      baseExcess: round(state.baseExcess, 1),
      saturation: round(state.spo2, 1),
      lactate: round(state.lactate, 1),
      sodium: 138,
      potassium: 4.1,
      ionizedCalcium: 1.18,
      glucose: 96,
      hemoglobin: 13.4
    };
  }

  function addMedicationEffect(current, id, definition) {
    const duration = Math.max(1, Number(definition?.effect?.duration || 120));
    return {
      ...current,
      medicationEffects: [
        ...(current.medicationEffects || []),
        {
          id,
          label: String(definition?.label || id),
          effect: { ...(definition?.effect || {}) },
          startedAt: current.elapsed,
          duration,
          until: current.elapsed + duration
        }
      ]
    };
  }

  function addFluidEffect(current, volumeMl = 500) {
    const volume = clamp(volumeMl, 0, 2000);
    const duration = 180;
    return {
      ...current,
      crystalloidMl: Number(current.crystalloidMl || 0) + volume,
      fluidEffects: [
        ...(current.fluidEffects || []),
        { volumeMl: volume, startedAt: current.elapsed, duration, until: current.elapsed + duration }
      ]
    };
  }

  function addNorepiBolus(current) {
    return { ...current, norepiBolusUntil: current.elapsed + 60 };
  }

  function waveformAtPhase(phaseSeconds, rawSettings, state) {
    const d = lungMechanics(state, rawSettings);
    const phase = ((phaseSeconds % d.cycleSeconds) + d.cycleSeconds) % d.cycleSeconds;
    const inspiration = phase < d.ti;
    let pressure;
    let flowLMin;
    let volumeMl;

    if (inspiration) {
      const rise = Math.max(0.05, Math.min(d.riseTime, d.ti));
      const pressureFraction = phase < rise ? phase / rise : 1;
      pressure = d.peep + d.deltaP * pressureFraction;
      const t = Math.max(0, phase - rise * 0.35);
      flowLMin = d.peakInspiratoryFlowLMin * Math.exp(-t / d.tau) * pressureFraction;
      volumeMl = d.tidalVolumeMl * (1 - Math.exp(-phase / d.tau)) /
        Math.max(0.01, 1 - Math.exp(-d.ti / d.tau));
    } else {
      const expiratoryTime = phase - d.ti;
      pressure = d.peep;
      volumeMl = d.tidalVolumeMl * Math.exp(-expiratoryTime / d.tau);
      flowLMin = -(d.tidalVolumeMl / 1000 / d.tau) * 60 * Math.exp(-expiratoryTime / d.tau);
    }
    return {
      pressure: clamp(pressure, 0, 70),
      flow: clamp(flowLMin, -160, 160),
      volume: clamp(volumeMl, 0, 1800),
      inspiration
    };
  }

  function waveformAt(timeSeconds, rawSettings, state) {
    return waveformAtPhase(timeSeconds, rawSettings, state);
  }

  function runFor(state, settings, pumps, seconds, dt = 0.25) {
    let next = state;
    const count = Math.ceil(seconds / dt);
    for (let i = 0; i < count; i += 1) next = step(next, settings, pumps, dt);
    return next;
  }

  root.TELECARE_VENT_ENGINE = Object.freeze({
    PATIENT,
    DEFAULT_SETTINGS,
    DEFAULT_PUMPS,
    LIMITS,
    IE_OPTIONS,
    clamp,
    mapPressure,
    parseIe,
    normalizeSettings,
    normalizePumps,
    createInitial,
    lungMechanics,
    acidBase,
    step,
    sampleBga,
    addMedicationEffect,
    addFluidEffect,
    addNorepiBolus,
    waveformAtPhase,
    waveformAt,
    runFor
  });
})(globalThis);
