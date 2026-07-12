(function () {
  const interventions = {
    fluid_500:{
      label:'500 ml Kristalloid',taskSeconds:60,requiresAccess:true,roles:['nurse','doctor'],
      effect:{duration:180,support:0.55,hrOffset:-5,lactatePerTick:-0.006,hbImmediate:-0.25,volumeMl:500}
    },
    blood_unit:{
      label:'1 EK transfundieren',taskSeconds:45,requiresAccess:true,roles:['doctor'],
      effect:{support:0.55,hrOffset:-6,lactatePerTick:-0.012,hbImmediate:0.7}
    },
    shock_position:{
      label:'Schocklage herstellen',taskSeconds:15,roles:['nurse','doctor'],
      effect:{duration:180,support:0.55}
    },
    norepi_bolus:{
      label:'Noradrenalin 5 µg i.v. als Bolus geben',taskSeconds:15,requiresAccess:true,roles:['nurse','doctor'],
      effect:{duration:60,support:0.9}
    },
    norepi_perfusor:{
      label:'Noradrenalin-Perfusor mit 0,05 µg/kg/min starten',taskSeconds:45,requiresAccess:true,roles:['nurse','doctor'],
      effect:{supportPerRateStep:0.58}
    },
    oxygen:{label:'Sauerstoffgabe beginnen',taskSeconds:15,roles:['nurse','doctor']},
    warming:{label:'Aktiven Wärmeerhalt beginnen',taskSeconds:20,roles:['nurse','doctor']},
    ventilation:{label:'Beatmung beginnen',taskSeconds:20,roles:['nurse','doctor']},
    txa:{label:'Tranexamsäure 1 g i.v. verabreichen',taskSeconds:30,requiresAccess:true,roles:['nurse','doctor']}
  };
  window.TELECARE_INTERVENTIONS = Object.freeze(interventions);
})();
