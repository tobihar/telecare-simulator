(function () {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const approach = (current, target, rate) => current + (target - current) * rate;

  /**
   * Bewusst vereinfachtes semi-physiologisches Modell.
   * Die internen Größen sind dimensionslose Indizes und keine Messwerte.
   * Es soll plausible, kontrollierbare Reaktionen erzeugen – keine Humanphysiologie exakt nachbilden.
   */
  function createInitial(caseConfig) {
    const initial = caseConfig.patient.initial;
    return {
      circulatingVolume: 0.91,
      venousTone: 1.0,
      vascularTone: 1.02,
      contractility: 1.0,
      respiratoryDrive: 1.0,
      oxygenReserve: clamp(initial.spo2 / 96, 0.7, 1.05),
      perfusionDebt: clamp((4.0 - initial.lactate) / 10, 0.04, 0.25),
      strokeVolumeIndex: 0.88,
      cardiacOutputIndex: 0.88,
      lastSeverity: 0,
      hypoxiaSeconds: 0
    };
  }

  function medicationDomainTotals(effects) {
    return effects.reduce((totals, effect) => {
      const sys = Number(effect.sys || 0);
      const dia = Number(effect.dia || 0);
      const rr = Number(effect.rr || 0);
      const spo2 = Number(effect.spo2 || 0);
      totals.chronotropy += Number(effect.hr || 0);
      totals.vascularTone += (sys * 0.45 + dia * 0.55) / 110;
      totals.contractility += Math.max(0, sys) / 260;
      if (sys < 0) totals.contractility += sys / 650;
      totals.respiratoryDrive += rr / 24;
      totals.oxygenation += spo2 / 100;
      return totals;
    }, {
      chronotropy: 0,
      vascularTone: 0,
      contractility: 0,
      respiratoryDrive: 0,
      oxygenation: 0
    });
  }

  function step(args) {
    const {
      core,
      patient,
      caseConfig,
      profile,
      severity,
      therapies,
      medicationEffects,
      fluidCount,
      bloodUnits,
      norepiBolus,
      norepiRate,
      shockPosition,
      paralyzed,
      jitter = () => 0
    } = args;

    const med = medicationDomainTotals(medicationEffects);
    const diseaseVolumeTarget = clamp(0.98 - severity * 0.42, 0.22, 0.98);
    const diseaseToneTarget = clamp(1.08 - Math.max(0, severity - 0.55) * 0.18, 0.72, 1.16);
    const diseaseContractilityTarget = clamp(1.0 - severity * 0.08, 0.68, 1.02);
    const diseaseRespiratoryTarget = clamp(1.0 + severity * 0.32, 0.55, 1.75);

    core.circulatingVolume = approach(core.circulatingVolume, diseaseVolumeTarget, 0.055);
    core.venousTone = approach(core.venousTone, 1.0 + severity * 0.025, 0.08);
    core.vascularTone = approach(core.vascularTone, diseaseToneTarget + med.vascularTone, 0.16);
    core.contractility = approach(core.contractility, diseaseContractilityTarget + med.contractility, 0.13);
    core.respiratoryDrive = approach(core.respiratoryDrive, diseaseRespiratoryTarget + med.respiratoryDrive, 0.18);

    const interventionMods = caseConfig.treatmentModifiers?.interventions || {};
    const mod = id => Number(interventionMods[id] ?? interventionMods.default ?? 1);
    const transientVolume = fluidCount * 0.105 * mod('fluid_500');
    const transfusedVolume = bloodUnits * 0.080 * mod('blood_unit');
    const venousReturnBoost = shockPosition ? 0.11 * mod('shock_position') : 0;
    const effectiveVolume = clamp(core.circulatingVolume + transientVolume + transfusedVolume, 0.20, 1.25);
    const venousReturn = clamp(Math.pow(effectiveVolume, 1.42) * core.venousTone + venousReturnBoost, 0.12, 1.35);

    const norepiTone = norepiBolus * 0.20 * mod('norepi_bolus') + norepiRate * 0.078 * mod('norepi_perfusor');
    const effectiveTone = clamp(core.vascularTone + norepiTone, 0.55, 1.75);
    const hypoxiaContractilityPenalty = core.hypoxiaSeconds > 0 ? clamp(core.hypoxiaSeconds / 240, 0, 0.42) : 0;
    const effectiveContractility = clamp(core.contractility + norepiBolus * 0.045 + norepiRate * 0.012 - hypoxiaContractilityPenalty, 0.42, 1.45);

    const currentHr = clamp(patient.hr, 20, 190);
    const tachyFillingPenalty = currentHr <= 130 ? 1 : clamp(1 - (currentHr - 130) / 115, 0.48, 1);
    const excessiveAfterloadPenalty = effectiveTone <= 1.3 ? 1 : clamp(1 - (effectiveTone - 1.3) * 0.18, 0.86, 1);
    const strokeVolume = clamp(venousReturn * effectiveContractility * tachyFillingPenalty * excessiveAfterloadPenalty, 0.18, 1.32);
    const cardiacOutput = clamp(strokeVolume * (currentHr / 112), 0.18, 1.85);
    core.strokeVolumeIndex = approach(core.strokeVolumeIndex, strokeVolume, 0.28);
    core.cardiacOutputIndex = approach(core.cardiacOutputIndex, cardiacOutput, 0.25);

    const targetMap = clamp(73 * core.cardiacOutputIndex * effectiveTone, 24, 135);
    const pulsePressure = clamp(38 * core.strokeVolumeIndex / Math.max(0.84, effectiveTone), 16, 72);
    const targetSys = clamp(targetMap + pulsePressure * 0.67, 30, 190);
    const targetDia = clamp(targetMap - pulsePressure * 0.33, 15, 115);

    patient.sys = approach(patient.sys, targetSys, 0.17) + jitter(1.1);
    patient.dia = approach(patient.dia, targetDia, 0.17) + jitter(0.8);
    const currentMap = Math.round((patient.sys + 2 * patient.dia) / 3);

    const lowPressureReflex = Math.max(0, 68 - currentMap) * 1.18;
    const volumeReflex = Math.max(0, 0.88 - effectiveVolume) * 47;
    const highPressureReflex = Math.max(0, currentMap - 78) * 0.35;
    const hypoxicBradyPenalty = core.hypoxiaSeconds > 45 ? Math.min(70, (core.hypoxiaSeconds - 45) * 0.55) : 0;
    const hrCeiling = args.difficulty === 'hard' ? 180 : 172;
    const targetHr = clamp(104 + severity * 28 + lowPressureReflex + volumeReflex - highPressureReflex + med.chronotropy - hypoxicBradyPenalty, 24, hrCeiling);
    patient.hr = clamp(approach(patient.hr, targetHr, 0.20) + jitter(1.4), 20, hrCeiling);

    let targetRr = clamp(22 * core.respiratoryDrive, 0, 48);
    if (paralyzed) targetRr = therapies.ventilation ? 14 : 0;
    patient.rr = clamp(approach(patient.rr, targetRr, paralyzed ? 0.36 : 0.16) + jitter(0.25), 0, 48);

    const untreatedSpo2Target = caseConfig.patient.initial.spo2 - severity * profile.spo2Loss;
    let oxygenTarget = untreatedSpo2Target + med.oxygenation * 100;
    if (therapies.oxygen) oxygenTarget = Math.max(oxygenTarget, 98);
    const severeHypoventilation = core.respiratoryDrive < 0.48 || (paralyzed && !therapies.ventilation);
    if (severeHypoventilation) oxygenTarget = 3;
    if (therapies.ventilation) oxygenTarget = Math.max(oxygenTarget, 97);
    oxygenTarget = clamp(oxygenTarget, 0, 100);
    let oxygenRate = severeHypoventilation ? 0.20 : (args.difficulty === 'hard' ? 0.18 : args.difficulty === 'medium' ? 0.15 : 0.135);
    if (patient.spo2 < 80 && oxygenTarget < patient.spo2) oxygenRate *= 1.65;
    if (patient.spo2 < 65 && oxygenTarget < patient.spo2) oxygenRate *= 1.45;
    if (patient.spo2 < 40 && oxygenTarget < patient.spo2) oxygenRate *= 1.25;
    patient.spo2 = clamp(approach(patient.spo2, oxygenTarget, oxygenRate) + jitter(0.22), 0, 100);
    if (patient.spo2 < 60) core.hypoxiaSeconds += 3 * (patient.spo2 < 35 ? 1.7 : 1);
    else core.hypoxiaSeconds = Math.max(0, core.hypoxiaSeconds - 6);
    core.oxygenReserve = approach(core.oxygenReserve, patient.spo2 / 96, 0.16);

    const perfusionIndex = clamp((currentMap / 70) * (patient.hb / 8.1) * (patient.spo2 / 95), 0.05, 1.45);
    const debtTarget = clamp(1 - perfusionIndex, 0, 1.2);
    core.perfusionDebt = approach(core.perfusionDebt, debtTarget, 0.12);
    core.lastSeverity = severity;

    return {
      currentMap,
      perfusionIndex,
      lactateDelta: 0.014 + core.perfusionDebt * 0.038,
      internal: {
        effectiveVolume,
        venousReturn,
        vascularTone: effectiveTone,
        contractility: effectiveContractility,
        strokeVolumeIndex: core.strokeVolumeIndex,
        cardiacOutputIndex: core.cardiacOutputIndex,
        respiratoryDrive: core.respiratoryDrive,
        perfusionDebt: core.perfusionDebt
      }
    };
  }

  window.TELECARE_PHYSIOLOGY_ENGINE = Object.freeze({ createInitial, step });
})();
