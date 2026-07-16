(function () {
  const postoperativeBleeding = {
    id: 'postop_bleeding_01',
    title: 'Postoperative Blutung nach Hemikolektomie',
    shortTitle: 'Postoperative Blutung',
    number: 'Fall 01',
    setting: 'Aufwachraum / Tele-ICU',
    enabled: true,
    defaultDurationSeconds: 600,
    availableDurations: [300, 600, 900, 1200],
    briefing: {
      sender: 'Anna Keller',
      text: '68-jähriger Patient nach Hemikolektomie im Aufwachraum. Seit wenigen Minuten fällt der Blutdruck ab, die Herzfrequenz steigt und über die Drainage kommt frisches Blut. Der Patient ist noch ansprechbar. Bitte übernehmen Sie.'
    },
    patient: {
      age: 68,
      sex: 'männlich',
      initial: {
        hr: 112,
        sys: 98,
        dia: 61,
        spo2: 95,
        rr: 22,
        temp: 35.8,
        mental: 'wach und unruhig',
        lactate: 3.4,
        hb: 8.1,
        iCa: 1.05,
        glucose: 112,
        bleeding: 1
      },
      visible: {
        skin: 'blass, kühl und feucht',
        drainageBaseMl: 260,
        drainagePerSecondMl: 1.35,
        drainageDescription: 'frisches Blut'
      }
    },
    staff: [
      { id: 1, name: 'Dr. Weber', role: 'doctor', icon: '🩺' },
      { id: 2, name: 'Anna Keller', role: 'nurse', icon: '👩‍⚕️' },
      { id: 3, name: 'Mehmet Yilmaz', role: 'nurse', icon: '👨‍⚕️' }
    ],
    labs: {
      hb:{label:'Hämoglobin',value:'7,4 g/dl',norm:'12,0–16,0 g/dl',abnormal:true,dynamic:'hb'},
      hct:{label:'Hämatokrit',value:'23 %',norm:'36–46 %',abnormal:true,dynamic:'hct'},
      platelets:{label:'Thrombozyten',value:'148.000/µl',norm:'150.000–400.000/µl',abnormal:true},
      leukocytes:{label:'Leukozyten',value:'13,8 /nl',norm:'4,0–10,0 /nl',abnormal:true},
      sodium:{label:'Natrium',value:'138 mmol/l',norm:'135–145 mmol/l'},
      potassium:{label:'Kalium',value:'4,3 mmol/l',norm:'3,5–5,1 mmol/l'},
      calcium:{label:'Calcium gesamt',value:'2,03 mmol/l',norm:'2,15–2,55 mmol/l',abnormal:true,dynamic:'calcium'},
      creatinine:{label:'Kreatinin',value:'1,2 mg/dl',norm:'0,6–1,1 mg/dl',abnormal:true},
      urea:{label:'Harnstoff',value:'49 mg/dl',norm:'17–43 mg/dl',abnormal:true},
      ast:{label:'AST (GOT)',value:'41 U/l',norm:'<35 U/l',abnormal:true},
      alt:{label:'ALT (GPT)',value:'33 U/l',norm:'<35 U/l'},
      bilirubin:{label:'Bilirubin gesamt',value:'0,8 mg/dl',norm:'<1,2 mg/dl'},
      crp:{label:'CRP',value:'32 mg/l',norm:'<5 mg/l',abnormal:true},
      inr:{label:'INR',value:'1,4',norm:'0,9–1,2',abnormal:true},
      aptt:{label:'aPTT',value:'39 s',norm:'25–35 s',abnormal:true},
      fibrinogen:{label:'Fibrinogen',value:'165 mg/dl',norm:'200–400 mg/dl',abnormal:true},
      d_dimer:{label:'D-Dimere',value:'2,1 mg/l FEU',norm:'<0,5 mg/l FEU',abnormal:true},
      lactate:{label:'Laktat',value:'4,8 mmol/l',norm:'0,5–2,2 mmol/l',abnormal:true,dynamic:'lactate'},
      troponin:{label:'hs-Troponin T',value:'19 ng/l',norm:'<14 ng/l',abnormal:true},
      crossmatch:{label:'Kreuzblut',value:'Blutgruppe A Rh positiv, Kreuzprobe kompatibel',norm:'—'}
    },
    bga: {
      staticRows: [
        ['Na⁺','138 mmol/l','135–145 mmol/l',false],
        ['K⁺','4,3 mmol/l','3,5–5,1 mmol/l',false]
      ]
    },
    history: {
      allergy: 'Keine bekannte schwere Allergie.',
      symptoms: 'Zunehmende Schwäche, Schwindel und Unruhe.',
      medication: 'Keine gerinnungshemmende Dauermedikation bekannt.',
      previousHistory: 'Zustand nach Hemikolektomie, arterielle Hypertonie.',
      lastMeal: 'Seit dem Vorabend nüchtern.',
      events: 'Seit etwa 20 Minuten zunehmende blutige Drainageförderung und Kreislaufinstabilität.',
      riskFactors: 'Frische große abdominalchirurgische Operation.'
    },
    diagnostics: {
      sono: 'V. cava inferior schmal und atemvariabel; linksventrikulär hyperdynam; kein Perikarderguss; kein Hinweis auf Rechtsherzbelastung; freie Flüssigkeit im Abdomen nachweisbar. Das Abdomen ist gespannt und hart.',
      auscultation: 'Beidseits vesikuläres Atemgeräusch, keine Rasselgeräusche, keine relevante Seitendifferenz. Herztöne tachykard, regelmäßig.'
    },
    treatmentModifiers: {
      medications: { default: 1 },
      interventions: {
        default: 1,
        fluid_500: 1,
        blood_unit: 1,
        shock_position: 1,
        norepi_bolus: 1,
        norepi_perfusor: 1
      }
    },
    physiology: {
      difficulty: {
        easy:   { progression: 1.0, spo2Loss: 10.5, criticalMap: 30, arrestSeconds: 99999 },
        medium: { progression: 1.28, spo2Loss: 12.5, criticalMap: 38, arrestSeconds: 75 },
        hard:   { progression: 1.68, spo2Loss: 17.0, criticalMap: 46, arrestSeconds: 24 }
      },
      targetSysBase: 100,
      sysLossPerSeverity: 52,
      targetDiaBase: 62,
      diaLossPerSeverity: 29,
      targetHrBase: 112,
      hrGainPerSeverity: 45,
      lactateGainPerTick: 0.03,
      hbLossPerTick: 0.008,
      bleedingGainPerTick: 0.012
    },
    scoring: [
      { id:'early_escalation', labelDone:'Chirurgie rechtzeitig informiert', labelMissing:'Chirurgie verspätet oder nicht informiert', thresholdSeconds:120 },
      { id:'bga', labelDone:'BGA durchgeführt', labelMissing:'Keine BGA durchgeführt' },
      { id:'lab_hb', labelDone:'Hämoglobin kontrolliert', labelMissing:'Keine Hb-Kontrolle in Labor oder BGA' },
      { id:'vascular_access', labelDone:'Gefäßzugang vorhanden', labelMissing:'Kein geeigneter Gefäßzugang' },
      { id:'blood_prepared', labelDone:'Blutprodukte vorbereitet', labelMissing:'Keine Blutprodukte vorbereitet' },
      { id:'circulation_therapy', labelDone:'Kreislauftherapie begonnen', labelMissing:'Keine Kreislauftherapie begonnen' }
    ]
  };

  window.TELECARE_CASES = Object.freeze({
    [postoperativeBleeding.id]: postoperativeBleeding
  });
  window.TELECARE_DEFAULT_CASE_ID = postoperativeBleeding.id;
})();
