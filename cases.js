(function () {
  const postoperativeBleeding = {
    id: 'postop_bleeding_01',
    title: 'Postoperative Blutung nach Hemikolektomie',
    shortTitle: 'Herr Müller',
    number: 'Fall 01',
    setting: 'Aufwachraum / Tele-ICU',
    enabled: true,
    defaultDurationSeconds: 600,
    availableDurations: [300, 600, 900, 1200],
    briefing: {
      sender: 'Anna Keller',
      text: '68-jähriger Patient Herr Müller nach Hemikolektomie im Aufwachraum. Seit wenigen Minuten fällt der Blutdruck ab, die Herzfrequenz steigt und über die Drainage kommt frisches Blut. Der Patient ist noch ansprechbar. Bitte übernehmen Sie.'
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


  const cardiogenicShock = {
    id: 'cardiogenic_shock_stemi_02',
    title: 'Kardiogener Schock bei inferiorem STEMI',
    shortTitle: 'Herr Gronen',
    number: 'Fall 02',
    setting: 'Notaufnahme',
    enabled: true,
    defaultDurationSeconds: 600,
    availableDurations: [300, 600, 900, 1200],
    bloodProductsEnabled: false,
    briefing: {
      sender: 'Miriam Vogt',
      text: 'Guten Morgen, wir melden uns aus der Notaufnahme. An der Anmeldung hat sich der 65-jährige Herr Gronen mit retrosternalem Brustschmerz vorgestellt. Bitte übernehmen Sie.'
    },
    patient: {
      age: 65,
      sex: 'männlich',
      weightKg: 115,
      initial: {
        hr: 83,
        sys: 70,
        dia: 43,
        spo2: 91,
        rr: 30,
        temp: 37.0,
        mental: 'wach, orientiert und unruhig',
        lactate: 4.5,
        hb: 15.0,
        iCa: 1.18,
        glucose: 73,
        potassium: 3.3,
        cvp: 14,
        bleeding: 0
      },
      visible: {
        skin: 'kühl, blass, marmoriert und kaltschweißig',
        observationDescription: 'keine äußere Blutung; keine sichtbaren Verletzungen oder peripheren Ödeme',
        urineMlPerHour: 0
      }
    },
    initialAccess: [],
    staff: [
      {id:1,name:'Dr. Lena Hoffmann',role:'doctor',icon:'🩺'},
      {id:2,name:'Miriam Vogt',role:'nurse',icon:'👩‍⚕️'},
      {id:3,name:'Jonas Becker',role:'nurse',icon:'👨‍⚕️'}
    ],
    labs: {
      hb:{label:'Hämoglobin',value:'15,0 g/dl',norm:'13,5–17,5 g/dl',dynamic:'hb'},
      hct:{label:'Hämatokrit',value:'45 %',norm:'40–52 %',dynamic:'hct'},
      platelets:{label:'Thrombozyten',value:'230.000/µl',norm:'150.000–400.000/µl'},
      leukocytes:{label:'Leukozyten',value:'11,8 /nl',norm:'4,0–10,0 /nl',abnormal:true},
      sodium:{label:'Natrium',value:'138 mmol/l',norm:'135–145 mmol/l'},
      potassium:{label:'Kalium',value:'3,3 mmol/l',norm:'3,5–5,1 mmol/l',abnormal:true,dynamic:'potassium'},
      calcium:{label:'Calcium gesamt',value:'2,36 mmol/l',norm:'2,15–2,55 mmol/l',dynamic:'calcium'},
      creatinine:{label:'Kreatinin',value:'1,6 mg/dl',norm:'0,7–1,2 mg/dl',abnormal:true},
      urea:{label:'Harnstoff',value:'58 mg/dl',norm:'17–43 mg/dl',abnormal:true},
      ast:{label:'AST (GOT)',value:'96 U/l',norm:'<35 U/l',abnormal:true},
      alt:{label:'ALT (GPT)',value:'42 U/l',norm:'<50 U/l'},
      ldh:{label:'LDH',value:'390 U/l',norm:'<250 U/l',abnormal:true},
      bilirubin:{label:'Bilirubin gesamt',value:'0,9 mg/dl',norm:'<1,2 mg/dl'},
      crp:{label:'CRP',value:'5 mg/l',norm:'<5 mg/l'},
      inr:{label:'INR',value:'1,0',norm:'0,9–1,2'},
      aptt:{label:'aPTT',value:'30 s',norm:'25–35 s'},
      fibrinogen:{label:'Fibrinogen',value:'390 mg/dl',norm:'200–400 mg/dl'},
      d_dimer:{label:'D-Dimere',value:'0,7 mg/l FEU',norm:'<0,5 mg/l FEU',abnormal:true},
      lactate:{label:'Laktat',value:'4,5 mmol/l',norm:'0,5–2,2 mmol/l',abnormal:true,dynamic:'lactate'},
      troponin:{label:'hs-Troponin T',value:'1.850 ng/l',norm:'<14 ng/l',abnormal:true},
      ck:{label:'CK',value:'680 U/l',norm:'<190 U/l',abnormal:true},
      ckmb:{label:'CK-MB',value:'82 µg/l',norm:'<5 µg/l',abnormal:true},
      crossmatch:{label:'Kreuzblut',value:'Blutgruppe 0 Rh positiv, Kreuzprobe kompatibel',norm:'—'}
    },
    bga: {
      staticRows: [
        ['Na⁺','138 mmol/l','135–145 mmol/l',false],
        ['K⁺','3,3 mmol/l','3,5–5,1 mmol/l',true]
      ],
      initial:{ph:7.16,pco2:30,po2:60,hco3:14,baseExcess:-13,lactate:4.5}
    },
    history: {
      allergy:'Penicillinallergie.',
      symptoms:'Seit dem Aufstehen drückender retrosternaler Brustschmerz mit allgemeiner Schwäche, leichter Luftnot und Übelkeit. Kein Erbrechen.',
      medication:'Dauermedikation: Ramipril 5 mg, Bisoprolol 2,5 mg und Rosuvastatin 5 mg. Im aktuellen Fall wurde noch nichts verabreicht.',
      previousHistory:'Arterielle Hypertonie und Hyperlipidämie. STEMI im Jahr 2025; Hernienreparation nach Lichtenstein 2023.',
      lastMeal:'Zuletzt gestern Abend gegessen; heute Morgen wegen der Übelkeit nichts gegessen.',
      events:'Die Beschwerden begannen morgens nach dem Aufstehen.',
      riskFactors:'Ehemaliger Raucher, seit zwei Jahren rauchfrei, insgesamt etwa 30 Packungsjahre. Täglich ein bis zwei Bier.'
    },
    diagnostics: {
      sono:'Kein Perikarderguss. Hochgradig reduzierte linksventrikuläre Pumpfunktion mit regionaler Wandbewegungsstörung und Akinesie der inferioren Segmente. Der rechte Ventrikel ist leicht dilatiert. V. cava inferior nicht atemkollaptisch. Keine akute Klappenpathologie.',
      auscultation:'Lunge beidseits vesikulär belüftet, keine Rasselgeräusche. Der Patient ist tachypnoisch. Herztöne regelmäßig und normofrequent.',
      pulmonaryEdemaAuscultation:'Neu aufgetretene grobblasige Rasselgeräusche beidseits basal bis mittig, brodelndes Atemgeräusch und deutlich zunehmende Dyspnoe.',
      ecg:'Sinusrhythmus, Linkstyp, Frequenz etwa 80/min. ST-Strecken-Hebungen in II, III und aVF sowie reziproke ST-Senkungen in V1–V2.'
    },
    chatFacts: {
      access:'Es liegt noch kein Gefäßzugang. Eine arterielle Kanüle, ein ZVK und ein Blasenkatheter sind nicht vorhanden.',
      airway:'Die Atemwege sind frei.',
      breathing:'Der Patient atmet spontan und tachypnoisch mit einer Atemfrequenz von 30/min. Initial ist die Lunge beidseits vesikulär belüftet.',
      consciousness:'Der Patient ist wach, voll orientiert und unruhig. Ausgangs-GCS 15.',
      pupils:'Die Pupillen sind mittelweit, isokor und beidseits prompt lichtreagibel.',
      skin:'Die Haut ist kühl, blass, marmoriert und kaltschweißig. Die Rekapillarisierungszeit beträgt etwa 4 Sekunden.',
      pulse:'Die peripheren Pulse sind schwach und fadenförmig, aber regelmäßig tastbar.',
      neckVeins:'Die Halsvenen sind nicht gestaut.',
      edema:'Es bestehen keine peripheren Ödeme.',
      urine:'Aktuell besteht keine messbare Urinausscheidung. Ein Blasenkatheter liegt nicht.',
      bleeding:'Es besteht keine kritische äußere Blutung.',
      abdomen:'Das Abdomen ist weich; es bestehen keine sichtbaren oder tastbaren Auffälligkeiten.',
      glucose:'Der initiale Blutzucker beträgt 73 mg/dl.',
      temperature:'Die initiale Temperatur beträgt 37,0 °C.',
      medication:'Dauermedikation: Ramipril 5 mg, Bisoprolol 2,5 mg und Rosuvastatin 5 mg. Im aktuellen Fall wurde noch nichts verabreicht.',
      previousHistory:'Bekannt sind arterielle Hypertonie und Hyperlipidämie, ein STEMI 2025 sowie eine Hernienreparation 2023.',
      allergy:'Es besteht eine Penicillinallergie.',
      symptoms:'Seit dem Aufstehen drückender retrosternaler Brustschmerz mit allgemeiner Schwäche, leichter Luftnot und Übelkeit. Kein Erbrechen.',
      lastMeal:'Zuletzt gestern Abend gegessen; heute Morgen wegen der Übelkeit nichts gegessen.',
      events:'Die Beschwerden begannen morgens nach dem Aufstehen.',
      riskFactors:'Ehemaliger Raucher, seit zwei Jahren rauchfrei, insgesamt etwa 30 Packungsjahre. Täglich ein bis zwei Bier.'
    },
    escalation: {
      label:'Herzkatheterlabor aktivieren',
      response:'Das Herzkatheterlabor ist informiert. Das Team benötigt etwa zehn Minuten zur Vorbereitung; Herr Gronen soll bis zur Übernahme stabilisiert werden.',
      preparationSeconds:600
    },
    medicationDefaults: {
      aspirin:'ASS 250 mg',
      heparin:'Heparin 5.000 IE i.v.',
      morphine:'Morphin 4 mg i.v.',
      ondansetron:'Ondansetron 4 mg i.v.',
      potassium:'Kalium i.v.'
    },
    treatmentModifiers: {
      medications:{default:1,dobutamine:.75,morphine:1,propofol:1.15,midazolam:1.15},
      interventions:{default:1,fluid_500:1,norepi_bolus:1,norepi_perfusor:1.8,shock_position:0.15,blood_unit:0.2}
    },
    physiology: {
      model:'cardiogenic',
      requiredFluidChoice:true,
      fluidDurationSeconds:420,
      fluidOverloadThresholdMl:1000,
      arrestRhythm:'Kammerflimmern',
      difficulty: {
        easy:{progression:.58,spo2Loss:3.5,criticalMap:29,arrestSeconds:99999},
        medium:{progression:.92,spo2Loss:6.5,criticalMap:39,arrestSeconds:75},
        hard:{progression:1.22,spo2Loss:9.5,criticalMap:42,arrestSeconds:90}
      },
      lactateGainPerTick:.018,
      hbLossPerTick:0,
      bleedingGainPerTick:0,
      tempTarget:37.0
    },
    scoring: [
      {id:'abcde',labelDone:'ABCDE strukturiert durchgeführt',labelMissing:'ABCDE nicht vollständig erhoben'},
      {id:'ecg',labelDone:'12-Kanal-EKG innerhalb von fünf Minuten geschrieben',labelMissing:'12-Kanal-EKG nicht oder verspätet geschrieben',thresholdSeconds:300},
      {id:'vascular_access',labelDone:'Geeigneten Gefäßzugang angelegt',labelMissing:'Kein geeigneter Gefäßzugang'},
      {id:'controlled_fluid',labelDone:'Vorsichtige Volumengabe von 250–500 ml',labelMissing:'Keine vorsichtige Volumengabe von 250–500 ml'},
      {id:'aspirin',labelDone:'ASS verabreicht',labelMissing:'ASS nicht verabreicht',thresholdSeconds:600},
      {id:'heparin',labelDone:'Heparin verabreicht',labelMissing:'Heparin nicht verabreicht',thresholdSeconds:600},
      {id:'cath_lab',labelDone:'Herzkatheterlabor aktiviert',labelMissing:'Herzkatheterlabor nicht aktiviert'},
      {id:'map_target',labelDone:'MAP-Ziel von mindestens 65 mmHg erreicht',labelMissing:'MAP-Ziel nicht erreicht'}
    ]
  };


  const anaphylacticShock = {
    id: 'perioperative_anaphylaxis_03',
    title: 'Perioperative Anaphylaxie nach Cefuroximgabe',
    shortTitle: 'Frau Chen',
    number: 'Fall 03',
    setting: 'Unfallchirurgischer OP',
    enabled: true,
    defaultDurationSeconds: 600,
    availableDurations: [300, 600, 900, 1200],
    briefing: {
      sender: 'Lea Wagner',
      text: 'Guten Tag, ich melde mich aus dem unfallchirurgischen OP. Die 65-jährige Frau Chen soll nach Oberschenkelhalsfraktur elektiv operiert werden. Wir haben eine Spinalanästhesie durchgeführt und gerade 1,5 g Cefuroxim zur Antibiotikaprophylaxe angehängt. Jetzt fällt der Blutdruck plötzlich ab und die Patientin klagt über beginnende Luftnot. Bitte übernehmen Sie.'
    },
    patient: {
      age: 65,
      sex: 'weiblich',
      weightKg: 60,
      initial: {
        hr: 120,
        sys: 80,
        dia: 40,
        spo2: 89,
        rr: 40,
        temp: 36.0,
        mental: 'wach, orientiert und unruhig',
        lactate: 3.0,
        hb: 10.3,
        iCa: 1.15,
        glucose: 130,
        potassium: 4.5,
        cvp: 2,
        bleeding: 0
      },
      visible: {
        skin: 'feucht und kaltschweißig',
        observationDescription: 'geschwollene Lippen und Zunge; keine kritische äußere Blutung',
        urineMlPerHour: null
      }
    },
    initialAccess: ['pvk_green','pvk_orange','artery','bladder'],
    initialBloodInventory: {uncrossed:0,crossed:2},
    initialTherapies: {cefuroximeRunning:true},
    bloodProductsEnabled: true,
    staff: [
      {id:1,name:'Dr. Neumann',role:'doctor',icon:'🩺'},
      {id:2,name:'Lea Wagner',role:'nurse',icon:'👩‍⚕️'},
      {id:3,name:'Murat Demir',role:'nurse',icon:'👨‍⚕️'}
    ],
    labs: {
      hb:{label:'Hämoglobin',value:'10,3 g/dl',norm:'12,0–16,0 g/dl',abnormal:true,dynamic:'hb'},
      hct:{label:'Hämatokrit',value:'31 %',norm:'36–46 %',abnormal:true,dynamic:'hct'},
      platelets:{label:'Thrombozyten',value:'Das ist uns aktuell nicht bekannt.',norm:'150.000–400.000/µl'},
      leukocytes:{label:'Leukozyten',value:'Das ist uns aktuell nicht bekannt.',norm:'4,0–10,0 /nl'},
      sodium:{label:'Natrium',value:'135 mmol/l',norm:'135–145 mmol/l'},
      potassium:{label:'Kalium',value:'4,5 mmol/l',norm:'3,5–5,1 mmol/l',dynamic:'potassium'},
      calcium:{label:'Ionisiertes Calcium',value:'1,15 mmol/l',norm:'1,15–1,35 mmol/l',dynamic:'iCa'},
      creatinine:{label:'Kreatinin',value:'Das ist uns aktuell nicht bekannt.',norm:'0,6–1,1 mg/dl'},
      urea:{label:'Harnstoff',value:'Das ist uns aktuell nicht bekannt.',norm:'17–43 mg/dl'},
      ast:{label:'AST (GOT)',value:'Das ist uns aktuell nicht bekannt.',norm:'<35 U/l'},
      alt:{label:'ALT (GPT)',value:'Das ist uns aktuell nicht bekannt.',norm:'<35 U/l'},
      bilirubin:{label:'Bilirubin gesamt',value:'Das ist uns aktuell nicht bekannt.',norm:'<1,2 mg/dl'},
      crp:{label:'CRP',value:'Das ist uns aktuell nicht bekannt.',norm:'<5 mg/l'},
      inr:{label:'INR',value:'Das ist uns aktuell nicht bekannt.',norm:'0,9–1,2'},
      aptt:{label:'aPTT',value:'Das ist uns aktuell nicht bekannt.',norm:'25–35 s'},
      lactate:{label:'Laktat',value:'3,0 mmol/l',norm:'0,5–2,2 mmol/l',abnormal:true,dynamic:'lactate'},
      crossmatch:{label:'Kreuzblut',value:'Zwei gekreuzte EK stehen bereit; die Blutgruppe ist nicht hinterlegt.',norm:'—'}
    },
    bga: {
      staticRows: [
        ['Na⁺','135 mmol/l','135–145 mmol/l',false],
        ['K⁺','4,5 mmol/l','3,5–5,1 mmol/l',false]
      ],
      initial:{ph:7.30,pco2:29,po2:57,hco3:24,baseExcess:0,lactate:3.0}
    },
    history: {
      allergy:'Keine Allergien bekannt.',
      symptoms:'Akute Schwäche mit Schwindel und Übelkeit. In den letzten Minuten ist Luftnot hinzugekommen; beim Einatmen ist ein leichtes Pfeifen hörbar.',
      medication:'Dauermedikation: Apixaban, vor der Operation pausiert; Valsartan 80 mg und Metformin 500 mg, ebenfalls präoperativ pausiert. Aktuell läuft Cefuroxim 1,5 g als Antibiotikaprophylaxe.',
      previousHistory:'Arterielle Hypertonie, paroxysmales Vorhofflimmern und Diabetes mellitus Typ 2. Keine relevanten früheren Eingriffe; als Kind an den Weisheitszähnen operiert.',
      lastMeal:'Nüchtern zur elektiven Operation; zuletzt am Vorabend gegessen.',
      events:'Die Beschwerden begannen unmittelbar nach Beginn der Cefuroximgabe.',
      riskFactors:'Das ist uns aktuell nicht bekannt.'
    },
    diagnostics: {
      sono:'V. cava inferior deutlich atemkollaptisch und kaliberschmal. Der linke Ventrikel zeigt ein geringes Füllungsvolumen, eine hohe Ejektionsfraktion und „kissing walls“. eFAST ohne pathologischen Befund.',
      auscultation:'Inspiratorischer Stridor.',
      ecg:'Sinustachykardie, keine Erregungsrückbildungsstörungen.'
    },
    chatFacts: {
      access:'Es liegen ein grüner und ein orangefarbener peripherer Venenzugang, eine arterielle Kanüle und ein Blasenkatheter. Ein ZVK liegt nicht.',
      airway:'Lippen und Zunge wirken geschwollen. Es besteht ein inspiratorischer Stridor; der Atemweg ist bedroht.',
      breathing:'Die Patientin atmet spontan und tachypnoisch mit einer Atemfrequenz von 40/min. Beim Einatmen ist ein Stridor hörbar.',
      consciousness:'Die Patientin ist wach, voll orientiert und deutlich unruhig. Ausgangs-GCS 15.',
      pupils:'Die Pupillen sind eng, isokor und beidseits prompt lichtreagibel.',
      skin:'Die Haut ist feucht und kaltschweißig. Die Rekapillarisierungszeit beträgt etwa 3 Sekunden.',
      pulse:'Die peripheren Pulse sind schwach tastbar und tachykard.',
      neckVeins:'Die Halsvenen sind kollabiert.',
      edema:'Das ist uns aktuell nicht bekannt.',
      urine:'Das ist uns aktuell nicht bekannt.',
      bleeding:'Es besteht keine kritische äußere Blutung.',
      glucose:'Der initiale Blutzucker beträgt 130 mg/dl.',
      temperature:'Die Temperatur beträgt 36,0 °C.',
      medication:'Dauermedikation: Apixaban, Valsartan 80 mg und Metformin 500 mg; Apixaban und Metformin wurden präoperativ pausiert. Aktuell läuft Cefuroxim 1,5 g.',
      previousHistory:'Bekannt sind arterielle Hypertonie, paroxysmales Vorhofflimmern und Diabetes mellitus Typ 2.',
      allergy:'Es sind keine Allergien bekannt.',
      pain:'Die Patientin gibt keine Schmerzen an.',
      symptoms:'Akute Schwäche mit Schwindel und Übelkeit. In den letzten Minuten ist Luftnot hinzugekommen; beim Einatmen ist ein leichtes Pfeifen hörbar.',
      lastMeal:'Nüchtern zur elektiven Operation; zuletzt am Vorabend gegessen.',
      events:'Die Symptomatik begann unmittelbar nach Beginn der Cefuroximgabe.',
      riskFactors:'Das ist uns aktuell nicht bekannt.'
    },
    medicationDefaults: {
      prednisolone:'Prednisolon 250 mg i.v.',
      clemastine:'Clemastin (Tavegil) 2 mg i.v.',
      h2_blocker:'H2-Blocker i.v.',
      propofol:'Propofol 30 mg i.v.',
      sufentanil:'Sufentanil 30 µg i.v.',
      rocuronium:'Rocuronium 100 mg i.v.'
    },
    treatmentModifiers: {
      medications:{default:1,prednisolone:0,clemastine:0,h2_blocker:0,propofol:1,sufentanil:1,rocuronium:1},
      interventions:{default:1,fluid_500:.20,norepi_bolus:.10,norepi_perfusor:.08,shock_position:1,blood_unit:.05,adrenaline_im:1,adrenaline_nebulized:1}
    },
    physiology: {
      model:'anaphylaxis',
      fluidDurationSeconds:480,
      arrestRhythm:'Asystolie',
      difficulty: {
        easy:{progression:.62,spo2Loss:15,criticalMap:24,arrestSeconds:99999},
        medium:{progression:.98,spo2Loss:22,criticalMap:31,arrestSeconds:180},
        hard:{progression:1.35,spo2Loss:31,criticalMap:39,arrestSeconds:75,onsetDelaySeconds:0,progressionSeconds:210}
      },
      lactateGainPerTick:.05,
      hbLossPerTick:0,
      bleedingGainPerTick:0,
      tempTarget:36.0
    },
    scoring: [
      {id:'abcde',labelDone:'ABCDE strukturiert durchgeführt',labelMissing:'ABCDE nicht vollständig erhoben'},
      {id:'anaphylaxis_recognized',labelDone:'Anaphylaxie erkannt',labelMissing:'Anaphylaxie nicht ausdrücklich erkannt',thresholdSeconds:300},
      {id:'trigger_stopped',labelDone:'Cefuroximzufuhr innerhalb von fünf Minuten gestoppt',labelMissing:'Cefuroximzufuhr nicht oder verspätet gestoppt',thresholdSeconds:300},
      {id:'oxygen',labelDone:'Sauerstoffgabe begonnen',labelMissing:'Keine Sauerstoffgabe'},
      {id:'adrenaline_im',labelDone:'Adrenalin 0,5 mg i.m. verabreicht',labelMissing:'Keine leitliniengerechte Adrenalingabe i.m.',thresholdSeconds:300},
      {id:'fluid_therapy',labelDone:'Kristalloidgabe begonnen',labelMissing:'Keine Kristalloidgabe'},
      {id:'shock_position',labelDone:'Schocklage hergestellt',labelMissing:'Keine Schocklage'},
      {id:'adjunct_medication',labelDone:'Prednisolon und Antihistaminika ergänzt',labelMissing:'Begleitmedikation unvollständig'},
      {id:'map_target',labelDone:'MAP-Ziel von mindestens 65 mmHg erreicht',labelMissing:'MAP-Ziel nicht erreicht'}
    ]
  };


  const septicShock = {
    id: 'septic_shock_05',
    title: 'Frau Berger bei Urosepsis',
    shortTitle: 'Frau Berger',
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
    [cardiogenicShock.id]: cardiogenicShock,
    [anaphylacticShock.id]: anaphylacticShock,
    [septicShock.id]: septicShock
  });
  window.TELECARE_DEFAULT_CASE_ID = postoperativeBleeding.id;
})();
