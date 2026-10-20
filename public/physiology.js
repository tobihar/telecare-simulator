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
    const model = caseConfig.physiology?.model;
    const septic = model === 'sepsis';
    const cardiogenic = model === 'cardiogenic';
    const anaphylactic = model === 'anaphylaxis';
    const traumatic = model === 'traumatic_hemorrhage';
    const dehydrated = model === 'dehydration';
    return {
      circulatingVolume: septic ? 0.73 : cardiogenic ? 0.96 : anaphylactic ? 0.86 : traumatic ? 0.84 : dehydrated ? 0.62 : 0.91,
      venousTone: septic ? 0.94 : cardiogenic ? 1.02 : anaphylactic ? 0.86 : traumatic ? 1.06 : dehydrated ? 0.94 : 1.0,
      vascularTone: septic ? 0.72 : cardiogenic ? 0.90 : anaphylactic ? 0.68 : traumatic ? 1.08 : dehydrated ? 1.03 : 1.02,
      contractility: septic ? 0.86 : cardiogenic ? 0.50 : anaphylactic ? 0.96 : dehydrated ? 0.88 : 1.0,
      respiratoryDrive: septic ? 1.42 : cardiogenic ? 1.36 : anaphylactic ? 1.70 : traumatic ? 1.36 : dehydrated ? 1.23 : 1.0,
      oxygenReserve: clamp(initial.spo2 / 96, 0.7, 1.05),
      perfusionDebt: cardiogenic ? 0.36 : anaphylactic ? 0.30 : traumatic ? 0.34 : dehydrated ? 0.42 : clamp((4.0 - initial.lactate) / 10, 0.04, 0.25),
      strokeVolumeIndex: cardiogenic ? 0.50 : anaphylactic ? 0.78 : traumatic ? 0.76 : dehydrated ? 0.54 : 0.88,
      cardiacOutputIndex: cardiogenic ? 0.50 : anaphylactic ? 0.78 : traumatic ? 0.83 : dehydrated ? 0.60 : 0.88,
      severeHypoxiaSeconds: 0,
      hypoxiaDose: 0,
      hemorrhageSeverity: 0,
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
      flatPosition = false,
      adrenalineIm = 0, adrenalineNebulized = 0, triggerStopped = false, postIntubationHypotension = 0,
      jitter = () => 0
    } = args;

    const med = medicationDomainTotals(medicationEffects);
    const model = caseConfig.physiology?.model;
    const septic = model === 'sepsis';
    const cardiogenic = model === 'cardiogenic';
    const anaphylactic = model === 'anaphylaxis';
    const traumatic = model === 'traumatic_hemorrhage';
    const dehydrated = model === 'dehydration';
    const hardAnaphylaxis = anaphylactic && args.difficulty === 'hard';
    const controlledSeverityFactor = hardAnaphylaxis ? (adrenalineIm ? 0.24 : 0.62) : 0.78;
    let activeSeverity = anaphylactic ? severity * (triggerStopped ? controlledSeverityFactor : 1.06) : severity;
    if(traumatic){
      const mechanicalFactor=therapies.tourniquetApplied?0:therapies.woundCompressed?0.34:therapies.limbElevated?0.56:1;
      const progressionFactor=mechanicalFactor*(therapies.txa ? .82 : 1);
      if(progressionFactor>0)core.hemorrhageSeverity=Math.max(core.hemorrhageSeverity,activeSeverity*progressionFactor);
      activeSeverity=core.hemorrhageSeverity;
    }
    const diseaseVolumeTarget = septic ? clamp(0.76 - activeSeverity * 0.10, 0.48, 0.78) : cardiogenic ? 0.96 : anaphylactic ? clamp(0.86 - activeSeverity * 0.13, 0.56, 0.86) : traumatic ? clamp(0.84 - activeSeverity * 0.58, 0.16, 0.84) : dehydrated ? clamp(0.62 - activeSeverity * 0.11, 0.40, 0.62) : clamp(0.98 - activeSeverity * 0.42, 0.22, 0.98);
    const diseaseToneTarget = septic ? clamp(0.82 - activeSeverity * 0.20, 0.43, 0.84) : cardiogenic ? clamp(0.90 - activeSeverity * 0.045, 0.76, 0.92) : anaphylactic ? clamp(0.70 - activeSeverity * 0.24, 0.28, 0.70) : traumatic ? clamp(1.08 + activeSeverity * 0.08, 1.08, 1.19) : dehydrated ? clamp(1.03 - Math.max(0,activeSeverity-.72)*.09,.94,1.03) : clamp(1.08 - Math.max(0, activeSeverity - 0.55) * 0.18, 0.72, 1.16);
    const diseaseContractilityTarget = septic ? clamp(0.91 - activeSeverity * 0.11, 0.58, 0.92) : cardiogenic ? clamp(0.55 - activeSeverity * 0.24, 0.20, 0.51) : anaphylactic ? clamp(0.98 - activeSeverity * 0.08, 0.78, 0.98) : traumatic ? clamp(1.02 - Math.max(0,activeSeverity-.72)*.34,.58,1.02) : dehydrated ? clamp(.88-activeSeverity*.12,.66,.88) : clamp(1.0 - activeSeverity * 0.08, 0.68, 1.02);
    const diseaseRespiratoryTarget = septic ? clamp(1.42 + activeSeverity * 0.22, 1.25, 1.90) : cardiogenic ? clamp(1.36 + activeSeverity * 0.18, 1.30, 1.86) : anaphylactic ? clamp(1.70 + activeSeverity * 0.18, 1.60, 2.05) : traumatic ? clamp(1.36 + activeSeverity * 0.18, 1.30, 1.80) : dehydrated ? clamp(1.23+activeSeverity*.12,1.23,1.48) : clamp(1.0 + activeSeverity * 0.32, 0.55, 1.75);

    // Schwere Hypoxie wirkt zeitverzögert auf Kontraktilität und Herzfrequenz.
    if (patient.spo2 < 60) {
      core.severeHypoxiaSeconds += 3;
      core.hypoxiaDose += ((60 - patient.spo2) / 20 + 0.35) * 3;
    } else {
      core.severeHypoxiaSeconds = Math.max(0, core.severeHypoxiaSeconds - 4.5);
      core.hypoxiaDose = Math.max(0, core.hypoxiaDose - 5);
    }
    const hypoxicContractilityPenalty = clamp(core.hypoxiaDose / 180, 0, 0.48);

    core.circulatingVolume = approach(core.circulatingVolume, diseaseVolumeTarget, septic&&args.difficulty==='easy'?0.018:cardiogenic?0.025:anaphylactic?0.10:traumatic?0.085:dehydrated?.035:0.055);
    core.venousTone = approach(core.venousTone, anaphylactic?clamp(0.88-activeSeverity*.06,0.70,0.88):traumatic?clamp(1.06+activeSeverity*.04,1.06,1.13):dehydrated?clamp(.94+activeSeverity*.025,.94,.98):1.0 + activeSeverity * 0.025, 0.08);
    core.vascularTone = approach(core.vascularTone, diseaseToneTarget + med.vascularTone, 0.16);
    core.contractility = approach(core.contractility, diseaseContractilityTarget + med.contractility - hypoxicContractilityPenalty, 0.13);
    core.respiratoryDrive = approach(core.respiratoryDrive, diseaseRespiratoryTarget + med.respiratoryDrive, 0.18);

    const interventionMods = caseConfig.treatmentModifiers?.interventions || {};
    const mod = id => Number(interventionMods[id] ?? interventionMods.default ?? 1);
    const norepiBolusTargetMapGain = Math.max(0,Number(caseConfig.physiology?.norepiBolusTargetMapGain||0));
    // fluidCount ist ein gewichteter Wert: neue Gabe = 1, danach graduelles Auslaufen.
    const transientVolume = fluidCount * 0.105 * mod('fluid_500');
    const transfusedVolume = bloodUnits * 0.080 * mod('blood_unit');
    const venousReturnBoost = shockPosition ? 0.11 * mod('shock_position') : flatPosition ? 0.055 * mod('flat_position') : 0;
    const effectiveVolume = clamp(core.circulatingVolume + transientVolume + transfusedVolume, 0.20, 1.25);
    const venousReturn = clamp(Math.pow(effectiveVolume, 1.42) * core.venousTone + venousReturnBoost, 0.12, 1.35);

    // Noradrenalin wirkt bei ausreichender Vorlast deutlich stärker. Bei schwerer
    // Hypovolämie bleibt der vasopressorische Effekt bewusst begrenzt.
    const volumeResponse = clamp(0.18 + Math.pow(effectiveVolume, 1.35) * 0.86, 0.20, 1.08);
    const norepiDoseTone = norepiRate * (septic ? 0.38 : anaphylactic ? (therapies.intubated ? 1.30 : 0.030) : 0.092) * mod('norepi_perfusor');
    const adrenalineTone = anaphylactic && adrenalineIm ? 0.26 * mod('adrenaline_im') : 0;
    const norepiTone = ((norepiBolusTargetMapGain>0?0:norepiBolus * 0.22 * mod('norepi_bolus')) + norepiDoseTone + adrenalineTone) * volumeResponse;
    const effectiveTone = clamp(core.vascularTone + norepiTone, 0.55, septic ? 1.58 : 1.82);
    const effectiveContractility = clamp(core.contractility + (norepiBolus * 0.050 + norepiRate * (anaphylactic?0.004:0.015) + (anaphylactic&&adrenalineIm?0.10:0)) * volumeResponse, 0.38, 1.48);

    const currentHr = clamp(patient.hr, 20, 190);
    // Ab 135/min wird die diastolische Füllung zunehmend ungünstig, besonders bei Hypovolämie.
    const tachyFillingPenalty = currentHr <= 135 ? 1 : clamp(1 - (currentHr - 135) / 150, 0.52, 1);
    const medicationTachyPenalty = med.chronotropy > 0 && currentHr > 140 ? clamp(1 - ((currentHr - 140) / 100) * Math.min(1, med.chronotropy / 25), 0.70, 1) : 1;
    const afterloadThreshold = cardiogenic ? 1.18 : anaphylactic ? 1.48 : 1.3;
    const excessiveAfterloadPenalty = effectiveTone <= afterloadThreshold ? 1 : clamp(1 - (effectiveTone - afterloadThreshold) * (cardiogenic ? 0.42 : 0.18), cardiogenic ? 0.72 : 0.86, 1);
    const preloadCongestionPenalty = cardiogenic && effectiveVolume > 1.08 ? clamp(1 - (effectiveVolume - 1.08) * 0.72, 0.78, 1) : 1;
    const pulmonaryEdemaPenalty = cardiogenic && therapies.pulmonaryEdema ? 0.78 : 1;
    const pumpSupport = cardiogenic ? clamp(med.contractility * 3 + norepiRate * 0.12, 0, 0.68) : 0;
    const terminalPumpPenalty = cardiogenic ? clamp(1 - Math.max(0, severity - 0.55) * 0.62 * (1 - pumpSupport), 0.44, 1) : 1;
    const strokeVolume = clamp(venousReturn * effectiveContractility * tachyFillingPenalty * medicationTachyPenalty * excessiveAfterloadPenalty * preloadCongestionPenalty * pulmonaryEdemaPenalty * terminalPumpPenalty, 0.12, 1.32);
    const cardiacOutput = clamp(strokeVolume * (currentHr / (cardiogenic ? 83 : anaphylactic ? 108 : traumatic ? 124 : dehydrated ? 128 : 112)), 0.12, 1.75);
    core.strokeVolumeIndex = approach(core.strokeVolumeIndex, strokeVolume, 0.28);
    core.cardiacOutputIndex = approach(core.cardiacOutputIndex, cardiacOutput, 0.25);

    const targetMap = clamp((cardiogenic ? 112 : anaphylactic ? 90 : traumatic ? 76 : dehydrated ? 84 : 73) * core.cardiacOutputIndex * effectiveTone + norepiBolus*norepiBolusTargetMapGain - (anaphylactic&&postIntubationHypotension?18:0), 18, dehydrated ? 105 : 135);
    const pulsePressure = clamp((dehydrated?80:38) * core.strokeVolumeIndex / Math.max(0.84, effectiveTone), 12, 72);
    const targetSys = clamp(targetMap + pulsePressure * 0.67, 22, 190);
    const targetDia = clamp(targetMap - pulsePressure * 0.33, 10, 115);

    patient.sys = approach(patient.sys, targetSys, 0.17) + jitter(1.1);
    patient.dia = approach(patient.dia, targetDia, 0.17) + jitter(0.8);
    const currentMap = Math.round((patient.sys + 2 * patient.dia) / 3);

    const easySepsis=septic&&args.difficulty==='easy';
    const lowPressureReflex = Math.max(0, 68 - currentMap) * (easySepsis?0.38:cardiogenic?0.36:anaphylactic?0.72:dehydrated?.68:0.92);
    const volumeReflex = Math.max(0, 0.88 - effectiveVolume) * (easySepsis?20:cardiogenic?12:anaphylactic?30:dehydrated?25:39);
    const highPressureReflex = Math.max(0, currentMap - 78) * 0.35;
    const hypoxicBradycardia = core.hypoxiaDose > 65 ? (core.hypoxiaDose - 65) * 0.38 : 0;
    const cardiogenicBradycardia = cardiogenic ? Math.max(0, severity - 0.92) * 105 * (1 - pumpSupport * 0.65) : 0;
    const anaphylaxisBradycardia = anaphylactic&&!adrenalineIm ? Math.max(0,activeSeverity-.95)*95 : 0;
    const traumaticBradycardia = traumatic ? Math.max(0,activeSeverity-.88)*480 : 0;
    const dehydrationBradycardia = dehydrated ? Math.max(0,activeSeverity-.85)*400*clamp((.75-effectiveVolume)/.25,0,1) : 0;
    let targetHr = clamp((cardiogenic?82:anaphylactic?112:traumatic?120:dehydrated?125:106) + activeSeverity * (cardiogenic?18:anaphylactic?34:traumatic?32:dehydrated?22:29) + lowPressureReflex + volumeReflex - highPressureReflex + med.chronotropy + (anaphylactic&&adrenalineIm?10:0) - hypoxicBradycardia - cardiogenicBradycardia - anaphylaxisBradycardia - traumaticBradycardia - dehydrationBradycardia, 20, 185);
    const easyEarlySepsis = septic && args.difficulty === 'easy' && Number(args.caseConfig?.defaultDurationSeconds || 600) > 0;
    if (easyEarlySepsis && args.severity < 0.55) targetHr = Math.min(targetHr, 120);
    const previousHr = patient.hr;
    const proposedHr = approach(patient.hr, targetHr, easyEarlySepsis?0.022:0.20) + jitter(easyEarlySepsis?0.22:1.4);
    // Auf "Leicht" darf die Herzfrequenz nicht innerhalb weniger Sekunden springen.
    patient.hr = easyEarlySepsis ? clamp(proposedHr, previousHr-0.45, previousHr+0.65) : proposedHr;

    let targetRr = clamp(22 * core.respiratoryDrive, 0, 48);
    if (cardiogenic && therapies.pulmonaryEdema) targetRr = clamp(targetRr + (therapies.upperBodyElevated ? 4 : 7), 0, 48);
    if (paralyzed) targetRr = therapies.ventilation ? 14 : 0;
    patient.rr = clamp(approach(patient.rr, targetRr, paralyzed ? 0.40 : 0.16) + jitter(0.25), 0, 48);

    const untreatedSpo2Target = caseConfig.patient.initial.spo2 - activeSeverity * profile.spo2Loss;
    let oxygenTarget = untreatedSpo2Target + med.oxygenation * 100;
    if (therapies.oxygen) oxygenTarget = Math.max(oxygenTarget, anaphylactic?(adrenalineNebulized||adrenalineIm?96:clamp(94-activeSeverity*8,82,92)):98);
    if (anaphylactic && adrenalineNebulized) oxygenTarget = Math.max(oxygenTarget, 96);
    if (cardiogenic && therapies.pulmonaryEdema) oxygenTarget -= therapies.oxygen ? (therapies.upperBodyElevated ? 4 : 7) : (therapies.upperBodyElevated ? 8 : 12);
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

    if (cardiogenic && Number.isFinite(Number(patient.cvp))) {
      const targetCvp = clamp(8 + Math.max(0, effectiveVolume - 0.72) * 16 + Math.max(0, 0.72 - effectiveContractility) * 13 + (therapies.pulmonaryEdema ? 3 : 0), 8, 24);
      patient.cvp = approach(patient.cvp, targetCvp, 0.16) + jitter(0.12);
    } else if (anaphylactic && Number.isFinite(Number(patient.cvp))) {
      const targetCvp = clamp(1 + Math.max(0,effectiveVolume-.68)*6,1,6);
      patient.cvp = approach(patient.cvp,targetCvp,0.16)+jitter(0.08);
    } else if (dehydrated && Number.isFinite(Number(patient.cvp))) {
      const targetCvp = clamp(.5 + Math.max(0,effectiveVolume-.52)*8,.5,6);
      patient.cvp = approach(patient.cvp,targetCvp,0.16)+jitter(0.06);
    }

    const perfusionIndex = clamp((currentMap / 70) * (patient.hb / 8.1) * (patient.spo2 / 95), 0.03, 1.45);
    const debtTarget = clamp(1 - perfusionIndex, 0, 1.2);
    core.perfusionDebt = approach(core.perfusionDebt, debtTarget, 0.12);
    core.lastSeverity = severity;

    return {
      currentMap,
      perfusionIndex,
      hypoxiaDose: core.hypoxiaDose,
      severeHypoxiaSeconds: core.severeHypoxiaSeconds,
      lactateDelta: septic ? (0.012 + core.perfusionDebt*0.034 - fluidCount*0.018 - (norepiRate>0&&currentMap>=60?0.008:0)) : cardiogenic ? (0.013 + core.perfusionDebt*0.044 - (currentMap>=60?0.010:0) - (med.contractility>0?0.006:0)) : anaphylactic ? (adrenalineIm?-0.018:0.060+core.perfusionDebt*0.016-fluidCount*0.026) : dehydrated ? (.010+core.perfusionDebt*.028-fluidCount*.022) : (0.014 + core.perfusionDebt * 0.038),
      internal: {
        effectiveVolume, venousReturn, vascularTone: effectiveTone,
        contractility: effectiveContractility, strokeVolumeIndex: core.strokeVolumeIndex,
        cardiacOutputIndex: core.cardiacOutputIndex, respiratoryDrive: core.respiratoryDrive,
        perfusionDebt: core.perfusionDebt, hypoxiaDose: core.hypoxiaDose
      }
    };
  }

  window.GALEN_PHYSIOLOGY_ENGINE = Object.freeze({ createInitial, step });
})();
