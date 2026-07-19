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
      { id:'lab_hb', labelDone:'Hämoglobin bestimmt', labelMissing:'Hämoglobin nicht bestimmt' },
      { id:'vascular_access', labelDone:'Gefäßzugang vorhanden', labelMissing:'Kein geeigneter Gefäßzugang' },
      { id:'blood_prepared', labelDone:'Blutprodukte vorbereitet', labelMissing:'Keine Blutprodukte vorbereitet' },
      { id:'circulation_therapy', labelDone:'Kreislauftherapie begonnen', labelMissing:'Keine Kreislauftherapie begonnen' }
    ]
  };


  const septicShock = {
    id: 'septic_shock_05',
    title: 'Septischer Schock bei Urosepsis',
    shortTitle: 'Septischer Schock',
    number: 'Fall 05',
    setting: 'Notaufnahme',
    enabled: true,
    defaultDurationSeconds: 600,
    availableDurations: [300, 600, 900, 1200],
    briefing: {
      sender: 'Fatou',
      text: 'Es ist Sonntag, 09:15 Uhr, in der Notaufnahme. Vom angrenzenden Pflegeheim wird die 75-jährige Frau Berger vorgestellt. Sie habe beim Frühstück nichts gegessen und sei so schläfrig gewesen, dass sie fast vom Stuhl gefallen wäre. Sie trägt dauerhaft einen Blasenkatheter; der Urin ist trüb und flockig. Eine Pflegeassistenz aus dem Heim ist dabei, kennt die Patientin aber kaum. Bitte übernehmen Sie.'
    },
    patient: {
      age: 75, sex: 'weiblich', weightKg: 60,
      initial: {hr:110,sys:60,dia:35,spo2:90,rr:34,temp:38.9,mental:'somnolent und verwirrt',lactate:10.0,hb:9.4,iCa:1.06,glucose:80,bleeding:0},
      visible: {skin:'warm und feucht, peripher schlecht perfundiert',observationDescription:'Dauerkatheter mit trübem, flockigem Urin; seit Stunden nahezu keine Urinausscheidung',urineMlPerHour:0}
    },
    initialAccess: ['pvk_pink','bladder'],
    staff: [
      {id:1,name:'Annika',role:'doctor',icon:'🩺'},
      {id:2,name:'Stefan',role:'nurse',icon:'👨‍⚕️'},
      {id:3,name:'Fatou',role:'nurse',icon:'👩‍⚕️'}
    ],
    labs: {
      hb:{label:'Hämoglobin',value:'9,4 g/dl',norm:'12,0–16,0 g/dl',abnormal:true,dynamic:'hb'},
      hct:{label:'Hämatokrit',value:'28 %',norm:'36–46 %',abnormal:true,dynamic:'hct'},
      platelets:{label:'Thrombozyten',value:'108.000/µl',norm:'150.000–400.000/µl',abnormal:true},
      leukocytes:{label:'Leukozyten',value:'22,4 /nl',norm:'4,0–10,0 /nl',abnormal:true},
      crp:{label:'CRP',value:'300 mg/l',norm:'<5 mg/l',abnormal:true},
      pct:{label:'Prokalzitonin',value:'34 ng/ml',norm:'<0,5 ng/ml',abnormal:true},
      il6:{label:'IL-6',value:'1.850 pg/ml',norm:'<7 pg/ml',abnormal:true},
      sodium:{label:'Natrium',value:'130 mmol/l',norm:'135–145 mmol/l',abnormal:true},
      potassium:{label:'Kalium',value:'5,0 mmol/l',norm:'3,5–5,1 mmol/l'},
      calcium:{label:'Calcium gesamt',value:'2,02 mmol/l',norm:'2,15–2,55 mmol/l',abnormal:true,dynamic:'calcium'},
      creatinine:{label:'Kreatinin',value:'3,0 mg/dl',norm:'0,6–1,1 mg/dl',abnormal:true},
      urea:{label:'Harnstoff',value:'112 mg/dl',norm:'17–43 mg/dl',abnormal:true},
      ast:{label:'AST (GOT)',value:'88 U/l',norm:'<35 U/l',abnormal:true},
      alt:{label:'ALT (GPT)',value:'62 U/l',norm:'<35 U/l',abnormal:true},
      bilirubin:{label:'Bilirubin gesamt',value:'1,8 mg/dl',norm:'<1,2 mg/dl',abnormal:true},
      inr:{label:'INR',value:'1,5',norm:'0,9–1,2',abnormal:true},
      aptt:{label:'aPTT',value:'43 s',norm:'25–35 s',abnormal:true},
      fibrinogen:{label:'Fibrinogen',value:'520 mg/dl',norm:'200–400 mg/dl',abnormal:true},
      d_dimer:{label:'D-Dimere',value:'5,8 mg/l FEU',norm:'<0,5 mg/l FEU',abnormal:true},
      lactate:{label:'Laktat',value:'10,0 mmol/l',norm:'0,5–2,2 mmol/l',abnormal:true,dynamic:'lactate'},
      troponin:{label:'hs-Troponin T',value:'72 ng/l',norm:'<14 ng/l',abnormal:true},
      blood_cultures:{label:'Blutkulturen',value:'Abgenommen – Ergebnis frühestens in mehreren Stunden/Tagen',norm:'—'},
      urine_culture:{label:'Urinkultur',value:'Abgenommen – mikrobiologisches Ergebnis ausstehend',norm:'—'}
    },
    bga: { staticRows:[['Na⁺','130 mmol/l','135–145 mmol/l',true],['K⁺','5,0 mmol/l','3,5–5,1 mmol/l',false]] },
    history: {
      allergy:'Keine Allergien bekannt.',
      symptoms:'Aufgrund fortgeschrittener Demenz und Somnolenz kaum Eigenangaben. Druckschmerz im Unterbauch, Klopfschmerz über dem linken Nierenlager; laut Begleitperson einmaliges Erbrechen.',
      medication:'Der Medikamentenplan wird vom Pflegeheim nachgeliefert. Laut Pflegeassistenz nimmt Frau Berger „viele Medikamente“.',
      previousHistory:'Fortgeschrittene Alzheimer-Demenz und Pflegebedürftigkeit. Weitere Vorerkrankungen sind der Begleitperson nicht bekannt; der Medikamentenplan wird nachgeliefert.',
      lastMeal:'Zuletzt gestern Abend gegessen; beim Frühstück heute praktisch nichts aufgenommen.',
      events:'Beim Frühstück durch ausgeprägte Schläfrigkeit aufgefallen. Laut Pflegeassistenz ging es ihr bereits seit einiger Zeit „nicht gut“.',
      riskFactors:'Dauerkatheter, Pflegebedürftigkeit und mögliche Harnwegsinfektion.'
    },
    diagnostics: {
      sono:'Global leicht bis mäßig reduzierte linksventrikuläre Pumpfunktion, kein Perikarderguss. V. cava inferior deutlich atemkollaptisch. Linke Niere vergrößert und echoärmer mit unscharfer Mark-Rinden-Differenzierung. Einliegender Blasenkatheter, Konkrement und etwa 100 ml Blasenfüllung.',
      auscultation:'Beidseits vesikuläres Atemgeräusch, keine Rasselgeräusche. Herztöne tachykard und absolut arrhythmisch.',
      ecg:'Tachykardes Vorhofflimmern, Linkstyp, keine akuten ST-Hebungen.'
    },
    chatFacts: {
      access:'Es liegt ein rosa peripherer Venenzugang. Zusätzlich liegt ein Blasenkatheter; eine arterielle Kanüle und ein ZVK sind nicht vorhanden.',
      airway:'Die Atemwege der Patientin sind frei.',
      breathing:'Die Patientin atmet spontan. Die Atemfrequenz ist erhöht; die Lunge ist beidseits vesikulär belüftet.',
      consciousness:'Die Patientin ist somnolent und verwirrt. Ausgangs-GCS 11.',
      pupils:'Die Pupillen sind mittelweit, isokor und beidseits prompt lichtreagibel.',
      skin:'Die Haut ist warm und feucht. Die Rekapillarisierungszeit beträgt etwa 4 Sekunden.',
      pulse:'Die peripheren Pulse sind nicht sicher tastbar.',
      neckVeins:'Die Halsvenen sind nicht gestaut.',
      edema:'Es bestehen leichte Beinödeme.',
      urine:'Aktuell besteht praktisch keine Urinausscheidung; der Urin im Dauerkatheter ist trüb und flockig.',
      bleeding:'Es besteht keine kritische äußere Blutung.',
      abdomen:'Es bestehen Druckschmerzen im Unterbauch und Klopfschmerzen über dem linken Nierenlager.',
      focus:'Hinweise auf einen Harnwegs- beziehungsweise Katheterfokus mit trübem, flockigem Urin und Klopfschmerz über dem linken Nierenlager.',
      catheter:'Ein Dauerkatheter liegt. Der Urin ist trüb und flockig; eine entzündete Einstichstelle ist nicht beschrieben.',
      glucose:'Der initiale Blutzucker beträgt 80 mg/dl.',
      temperature:'Die initiale Temperatur beträgt 38,9 °C.',
      medication:'Der Medikamentenplan wird vom Pflegeheim nachgeliefert. Laut Pflegeassistenz nimmt Frau Berger „viele Medikamente“.',
      previousHistory:'Bekannt sind eine fortgeschrittene Alzheimer-Demenz und Pflegebedürftigkeit. Weitere Vorerkrankungen sind der Begleitperson nicht bekannt.',
      allergy:'Keine Allergien bekannt.',
      symptoms:'Aufgrund fortgeschrittener Demenz und Somnolenz kaum Eigenangaben. Druckschmerz im Unterbauch, Klopfschmerz über dem linken Nierenlager und laut Begleitperson einmaliges Erbrechen.',
      lastMeal:'Zuletzt gestern Abend gegessen; beim Frühstück heute praktisch nichts aufgenommen.',
      events:'Beim Frühstück durch ausgeprägte Schläfrigkeit aufgefallen. Laut Pflegeassistenz ging es ihr bereits seit einiger Zeit „nicht gut“.',
      riskFactors:'Dauerkatheter, Pflegebedürftigkeit und mögliche Harnwegsinfektion.'
    },
    treatmentModifiers:{medications:{default:1,pip_tazo:1,ceftriaxone:1,meropenem:1},interventions:{default:1,fluid_500:1,norepi_bolus:1,norepi_perfusor:1,shock_position:1,blood_unit:.25}},
    physiology:{
      model:'sepsis', fluidDurationSeconds:900,
      difficulty:{easy:{progression:.42,initialSys:60,spo2Loss:5.0,criticalMap:28,arrestSeconds:99999},medium:{progression:.90,initialSys:65,spo2Loss:7.0,criticalMap:25,arrestSeconds:120},hard:{progression:1.10,initialSys:65,spo2Loss:9.0,criticalMap:28,arrestSeconds:75}},
      lactateGainPerTick:.018,hbLossPerTick:0,bleedingGainPerTick:0,tempTarget:39.3
    },
    scoring:[
      {id:'sepsis_recognized',labelDone:'Sepsis beziehungsweise septischen Schock erkannt',labelMissing:'Sepsis/Schock nicht rechtzeitig erkannt',thresholdSeconds:240},
      {id:'bga',labelDone:'BGA und Laktat bestimmt',labelMissing:'Keine BGA/Laktatbestimmung'},
      {id:'blood_cultures',labelDone:'Blutkulturen angefordert',labelMissing:'Keine Blutkulturen angefordert'},
      {id:'antibiotic',labelDone:'Breit wirksames Antibiotikum verabreicht',labelMissing:'Antibiotikum nicht oder verspätet verabreicht',thresholdSeconds:420},
      {id:'circulation_therapy',labelDone:'Volumen- und Kreislauftherapie begonnen',labelMissing:'Keine angemessene Kreislauftherapie'},
      {id:'norepi',labelDone:'Noradrenalin bei persistierender Hypotonie eingesetzt',labelMissing:'Noradrenalin trotz persistierender Hypotonie nicht eingesetzt'},
      {id:'map_target',labelDone:'MAP-Ziel von mindestens 65 mmHg erreicht',labelMissing:'MAP-Ziel nicht erreicht'}
    ]
  };

  window.TELECARE_CASES = Object.freeze({
    [postoperativeBleeding.id]: postoperativeBleeding,
    [septicShock.id]: septicShock
  });
  window.TELECARE_DEFAULT_CASE_ID = postoperativeBleeding.id;
})();
