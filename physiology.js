(function () {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const approach = (current, target, rate) => current + (target - current) * rate;

  /**
   * Bewusst vereinfachtes semi-physiologisches Modell.
   * Die internen Größen sind dimensionslose Indizes und keine klinischen Messwerte.
   * Ziel sind plausible, kontrollierbare Reaktionen – keine vollständige Humanphysiologie.
   */
  function createInitial(caseConfig) {
    const initial = caseConfig.patient.initial;
    const septic = caseConfig.physiology?.model === 'sepsis';
    return {
      circulatingVolume: septic ? 0.73 : 0.91,
      venousTone: septic ? 0.94 : 1.0,
      vascularTone: septic ? 0.72 : 1.02,
      contractility: septic ? 0.86 : 1.0,
      respiratoryDrive: septic ? 1.42 : 1.0,
      oxygenReserve: clamp(initial.spo2 / 96, 0.7, 1.05),
      perfusionDebt: clamp((4.0 - initial.lactate) / 10, 0.04, 0.25),
      strokeVolumeIndex: 0.88,
      cardiacOutputIndex: 0.88,
      severeHypoxiaSeconds: 0,
      hypoxiaDose: 0,
      lastSeverity: 0
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
    }, { chronotropy: 0, vascularTone: 0, contractility: 0, respiratoryDrive: 0, oxygenation: 0 });
  }

  function step(args) {
    const {
      core, patient, caseConfig, profile, severity, therapies, medicationEffects,
      fluidCount, bloodUnits, norepiBolus, norepiRate, shockPosition, paralyzed,
      jitter = () => 0
    } = args;

    const med = medicationDomainTotals(medicationEffects);
    const septic = caseConfig.physiology?.model === 'sepsis';
    const diseaseVolumeTarget = septic ? clamp(0.76 - severity * 0.10, 0.48, 0.78) : clamp(0.98 - severity * 0.42, 0.22, 0.98);
    const diseaseToneTarget = septic ? clamp(0.82 - severity * 0.20, 0.43, 0.84) : clamp(1.08 - Math.max(0, severity - 0.55) * 0.18, 0.72, 1.16);
    const diseaseContractilityTarget = septic ? clamp(0.91 - severity * 0.11, 0.58, 0.92) : clamp(1.0 - severity * 0.08, 0.68, 1.02);
    const diseaseRespiratoryTarget = septic ? clamp(1.42 + severity * 0.22, 1.25, 1.90) : clamp(1.0 + severity * 0.32, 0.55, 1.75);

    // Schwere Hypoxie wirkt zeitverzögert auf Kontraktilität und Herzfrequenz.
    if (patient.spo2 < 60) {
      core.severeHypoxiaSeconds += 3;
      core.hypoxiaDose += ((60 - patient.spo2) / 20 + 0.35) * 3;
    } else {
      core.severeHypoxiaSeconds = Math.max(0, core.severeHypoxiaSeconds - 4.5);
      core.hypoxiaDose = Math.max(0, core.hypoxiaDose - 5);
    }
    const hypoxicContractilityPenalty = clamp(core.hypoxiaDose / 180, 0, 0.48);

    core.circulatingVolume = approach(core.circulatingVolume, diseaseVolumeTarget, septic&&args.difficulty==='easy'?0.018:0.055);
    core.venousTone = approach(core.venousTone, 1.0 + severity * 0.025, 0.08);
    core.vascularTone = approach(core.vascularTone, diseaseToneTarget + med.vascularTone, 0.16);
    core.contractility = approach(core.contractility, diseaseContractilityTarget + med.contractility - hypoxicContractilityPenalty, 0.13);
    core.respiratoryDrive = approach(core.respiratoryDrive, diseaseRespiratoryTarget + med.respiratoryDrive, 0.18);

    const interventionMods = caseConfig.treatmentModifiers?.interventions || {};
    const mod = id => Number(interventionMods[id] ?? interventionMods.default ?? 1);
    // fluidCount ist ein gewichteter Wert: neue Gabe = 1, danach graduelles Auslaufen.
    const transientVolume = fluidCount * 0.105 * mod('fluid_500');
    const transfusedVolume = bloodUnits * 0.080 * mod('blood_unit');
    const venousReturnBoost = shockPosition ? 0.11 * mod('shock_position') : 0;
    const effectiveVolume = clamp(core.circulatingVolume + transientVolume + transfusedVolume, 0.20, 1.25);
    const venousReturn = clamp(Math.pow(effectiveVolume, 1.42) * core.venousTone + venousReturnBoost, 0.12, 1.35);

    // Noradrenalin wirkt bei ausreichender Vorlast deutlich stärker. Bei schwerer
    // Hypovolämie bleibt der vasopressorische Effekt bewusst begrenzt.
    const volumeResponse = clamp(0.18 + Math.pow(effectiveVolume, 1.35) * 0.86, 0.20, 1.08);
    const norepiDoseTone = norepiRate * (septic ? 0.38 : 0.092) * mod('norepi_perfusor');
    const norepiTone = (norepiBolus * 0.22 * mod('norepi_bolus') + norepiDoseTone) * volumeResponse;
    const effectiveTone = clamp(core.vascularTone + norepiTone, 0.55, septic ? 1.58 : 1.82);
    const effectiveContractility = clamp(core.contractility + (norepiBolus * 0.050 + norepiRate * 0.015) * volumeResponse, 0.38, 1.48);

    const currentHr = clamp(patient.hr, 20, 190);
    // Ab 135/min wird die diastolische Füllung zunehmend ungünstig, besonders bei Hypovolämie.
    const tachyFillingPenalty = currentHr <= 135 ? 1 : clamp(1 - (currentHr - 135) / 150, 0.52, 1);
    const medicationTachyPenalty = med.chronotropy > 0 && currentHr > 140 ? clamp(1 - ((currentHr - 140) / 100) * Math.min(1, med.chronotropy / 25), 0.70, 1) : 1;
    const excessiveAfterloadPenalty = effectiveTone <= 1.3 ? 1 : clamp(1 - (effectiveTone - 1.3) * 0.18, 0.86, 1);
    const strokeVolume = clamp(venousReturn * effectiveContractility * tachyFillingPenalty * medicationTachyPenalty * excessiveAfterloadPenalty, 0.12, 1.32);
    const cardiacOutput = clamp(strokeVolume * (currentHr / 112), 0.12, 1.75);
    core.strokeVolumeIndex = approach(core.strokeVolumeIndex, strokeVolume, 0.28);
    core.cardiacOutputIndex = approach(core.cardiacOutputIndex, cardiacOutput, 0.25);

    const targetMap = clamp(73 * core.cardiacOutputIndex * effectiveTone, 18, 135);
    const pulsePressure = clamp(38 * core.strokeVolumeIndex / Math.max(0.84, effectiveTone), 12, 72);
    const targetSys = clamp(targetMap + pulsePressure * 0.67, 22, 190);
    const targetDia = clamp(targetMap - pulsePressure * 0.33, 10, 115);

    patient.sys = approach(patient.sys, targetSys, 0.17) + jitter(1.1);
    patient.dia = approach(patient.dia, targetDia, 0.17) + jitter(0.8);
    const currentMap = Math.round((patient.sys + 2 * patient.dia) / 3);

    const easyFrau Berger=septic&&args.difficulty==='easy';
    const lowPressureReflex = Math.max(0, 68 - currentMap) * (easyFrau Berger?0.38:0.92);
    const volumeReflex = Math.max(0, 0.88 - effectiveVolume) * (easyFrau Berger?20:39);
    const highPressureReflex = Math.max(0, currentMap - 78) * 0.35;
    const hypoxicBradycardia = core.hypoxiaDose > 65 ? (core.hypoxiaDose - 65) * 0.38 : 0;
    let targetHr = clamp(106 + severity * 29 + lowPressureReflex + volumeReflex - highPressureReflex + med.chronotropy - hypoxicBradycardia, 20, 175);
    const easyEarlyFrau Berger = septic && args.difficulty === 'easy' && Number(args.caseConfig?.defaultDurationSeconds || 600) > 0;
    if (easyEarlyFrau Berger && args.severity < 0.55) targetHr = Math.min(targetHr, 120);
    const previousHr = patient.hr;
    const proposedHr = approach(patient.hr, targetHr, easyEarlyFrau Berger?0.022:0.20) + jitter(easyEarlyFrau Berger?0.22:1.4);
    // Auf "Leicht" darf die Herzfrequenz nicht innerhalb weniger Sekunden springen.
    patient.hr = easyEarlyFrau Berger ? clamp(proposedHr, previousHr-0.45, previousHr+0.65) : proposedHr;

    let targetRr = clamp(22 * core.respiratoryDrive, 0, 48);
    if (paralyzed) targetRr = therapies.ventilation ? 14 : 0;
    patient.rr = clamp(approach(patient.rr, targetRr, paralyzed ? 0.40 : 0.16) + jitter(0.25), 0, 48);

    const untreatedSpo2Target = caseConfig.patient.initial.spo2 - severity * profile.spo2Loss;
    let oxygenTarget = untreatedSpo2Target + med.oxygenation * 100;
    if (therapies.oxygen) oxygenTarget = Math.max(oxygenTarget, 98);
    const severeHypoventilation = core.respiratoryDrive < 0.48 || (paralyzed && !therapies.ventilation);
    // Bei Apnoe kein unphysiologisches Plateau: Ziel nähert sich sehr niedrigen Werten.
    if (severeHypoventilation) oxygenTarget = therapies.oxygen ? 24 : 4;
    if (therapies.ventilation) oxygenTarget = Math.max(oxygenTarget, 97);
    oxygenTarget = clamp(oxygenTarget, 0, 100);
    let oxygenRate = severeHypoventilation ? 0.055 : (args.difficulty === 'hard' ? 0.18 : args.difficulty === 'medium' ? 0.15 : 0.135);
    // Annäherung an den steilen Anteil der O2-Bindungskurve unter 80 %.
    if (patient.spo2 < 80 && oxygenTarget < patient.spo2) oxygenRate *= 1.25;
    if (patient.spo2 < 60 && oxygenTarget < patient.spo2) oxygenRate *= 1.45;
    patient.spo2 = clamp(approach(patient.spo2, oxygenTarget, oxygenRate) + jitter(0.22), 0, 100);
    core.oxygenReserve = approach(core.oxygenReserve, patient.spo2 / 96, 0.16);

    const perfusionIndex = clamp((currentMap / 70) * (patient.hb / 8.1) * (patient.spo2 / 95), 0.03, 1.45);
    const debtTarget = clamp(1 - perfusionIndex, 0, 1.2);
    core.perfusionDebt = approach(core.perfusionDebt, debtTarget, 0.12);
    core.lastSeverity = severity;

    return {
      currentMap,
      perfusionIndex,
      hypoxiaDose: core.hypoxiaDose,
      severeHypoxiaSeconds: core.severeHypoxiaSeconds,
      lactateDelta: septic ? (0.012 + core.perfusionDebt*0.034 - fluidCount*0.018 - (norepiRate>0&&currentMap>=60?0.008:0)) : (0.014 + core.perfusionDebt * 0.038),
      internal: {
        effectiveVolume, venousReturn, vascularTone: effectiveTone,
        contractility: effectiveContractility, strokeVolumeIndex: core.strokeVolumeIndex,
        cardiacOutputIndex: core.cardiacOutputIndex, respiratoryDrive: core.respiratoryDrive,
        perfusionDebt: core.perfusionDebt, hypoxiaDose: core.hypoxiaDose
      }
    };
  }

  window.TELECARE_PHYSIOLOGY_ENGINE = Object.freeze({ createInitial, step });
})();
