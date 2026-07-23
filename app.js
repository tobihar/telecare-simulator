let SIM_DURATION = 600;
let participantUsername = '';
const TICK_SECONDS = 3;
const EVALUATION_STORAGE_KEY = 'telecare_pending_anonymous_evaluation_v2';
const LEGACY_EVALUATION_STORAGE_KEY = 'telecare_pending_evaluation_v1';
const SYSTEM_EVALUATION_QUESTIONS = [
  ['system_easy','Die Bedienung war einfach'],['system_clear','Die Oberfläche war übersichtlich'],['system_chat','Der Chat hat meine Anweisungen korrekt verstanden'],['system_overview','Ich konnte den Zustand des Patienten gut überblicken'],['system_teaching','Das TeleCare-Programm eignet sich für den Pflegeunterricht'],['system_more_cases','Ich würde weitere Fälle mit dem TeleCare-System bearbeiten']
];
const CASE_EVALUATION_QUESTIONS = [
  ['case_realistic','Der Fall wirkte realistisch'],['case_reactions','Die Reaktionen auf meine Maßnahmen waren nachvollziehbar'],['case_difficulty','Die Schwierigkeit war angemessen'],['case_apply_knowledge','Ich konnte meine Kenntnisse zum Schock anwenden'],['case_understanding','Der Fall hat mir geholfen, die Unterrichtsinhalte besser zu verstehen'],['case_overwhelmed','Ich war überfordert'],['case_recommend','Ich würde diesen Fall anderen Lernenden empfehlen']
];

let activeCaseId = window.TELECARE_DEFAULT_CASE_ID;
const getActiveCase = () => window.TELECARE_CASES[activeCaseId];
const clone = value => JSON.parse(JSON.stringify(value));
function map(s,d){return Math.round((s+2*d)/3);}
let LABS = clone(getActiveCase().labs);
let BGA = clone(getActiveCase().bga?.staticRows || []);

const ACCESS = {
  pvk_pink:{label:'PVK rosa',duration:45,suitable:true,roles:['doctor','nurse']},
  pvk_green:{label:'PVK grün',duration:55,suitable:true,roles:['doctor','nurse']},
  pvk_orange:{label:'PVK orange',duration:70,suitable:true,roles:['doctor','nurse']},
  zvk:{label:'ZVK',duration:120,suitable:true,roles:['doctor']},
  artery:{label:'Arterielle Kanüle',duration:90,suitable:false,roles:['doctor']},
  shaldon:{label:'Shaldon-Katheter',duration:150,suitable:true,roles:['doctor']},
  bladder:{label:'Blasenkatheter',duration:60,suitable:false,roles:['nurse']}
};

const initialState = () => ({
  running:false,paused:false,ended:false,elapsed:0,timer:null,difficulty:'easy',dead:false,deathReason:null,criticalSeconds:0,alarmSilencedUntil:0,runId:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),saveAttempted:false,savedResultId:null,pendingResultPayload:null,pendingSummary:null,evaluationSubmitted:false,evaluationSkipped:false,sepsisRecognizedAt:null,diagnosisRecognizedAt:null,anaphylaxisRecognizedAt:null,hemorrhageRecognizedAt:null,ecgAt:null,
  caseId:activeCaseId,
  patient:clone(getActiveCase().patient.initial),
  physiologyCore:window.TELECARE_PHYSIOLOGY_ENGINE?window.TELECARE_PHYSIOLOGY_ENGINE.createInitial(getActiveCase()):null,
  lastMeasurements:{nibp:null,rr:null,temp:null,bz:null},
  staff:getActiveCase().staff.map(person=>({...person,busyUntil:0,taskId:null})),
  tasks:[],events:[],chat:[],labsRequested:new Set(),labsAvailable:new Set(),labResults:[],bgaAvailable:false,bgaResults:[],access:new Set(getActiveCase().initialAccess||[]),
  crossedBloodAvailable:Number(getActiveCase().initialBloodInventory?.crossed||0)>0,bloodInventory:{uncrossed:Number(getActiveCase().initialBloodInventory?.uncrossed||0),crossed:Number(getActiveCase().initialBloodInventory?.crossed||0)},bloodRequested:[],
  therapies:{oxygen:false,warming:false,ventilation:false,upperBodyElevated:false,defibPads:false,pulmonaryEdema:false,norepiBolusUntil:0,norepiPerfusor:false,norepiStandby:false,norepiRate:1,fluidEffects:[],crystalloidMl:0,bloodUnitsGiven:0,activeInfusions:[],txa:false,txaAt:null,medications:[],medicationEffects:[],paralyzedUntil:0,shockPositionAt:null,shockPositionUntil:0,limbElevated:false,limbElevatedAt:null,woundCompressed:false,woundCompressionAt:null,tourniquetApplied:false,tourniquetAt:null,externalBloodLossMl:Number(getActiveCase().patient.visible.bloodLossBaseMl||0),antibioticAt:null,cefuroximeRunning:Boolean(getActiveCase().initialTherapies?.cefuroximeRunning),triggerStoppedAt:null,adrenalineImAt:null,adrenalineImUntil:0,adrenalineImCount:0,adrenalineNebulizedAt:null,adrenalineNebulizedUntil:0,intubated:false,intubationAt:null,postIntubationHypotensionUntil:0},
  vitalHistory:[{time:0,hr:getActiveCase().patient.initial.hr,map:map(getActiveCase().patient.initial.sys,getActiveCase().patient.initial.dia),spo2:getActiveCase().patient.initial.spo2,sys:getActiveCase().patient.initial.sys,dia:getActiveCase().patient.initial.dia}],chatAutoFollow:true,
  firstTherapyAt:null,lastMentalReport:getActiveCase().patient.initial.mental,escalationAt:null,soundOn:true,alarmOn:true,alarmActive:false,aiAvailable:false,proactiveFlags:new Set(),sonoResult:null,newLabResult:false,newBgaResult:false,newSonoResult:false,assessment:new Set()
});

let state = initialState();
const el=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const jitter=n=>(Math.random()-.5)*n;
const formatTime=s=>`${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.round(Math.max(0,s))%60).padStart(2,'0')}`;
const escapeHtml=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function logEvent(text,type='info'){state.events.push({time:state.elapsed,text,type});renderEvents();}
function addChat(sender,text,cls='team'){
  const resultSender=/^(Labor|Blutbank|BGA|Sonografie|POCUS)/i.test(String(sender));
  const resultText=/(Befund|Ergebnisse? (?:ist|sind)|sind bereit|ist bereit|verfügbar|ist abgeschlossen|transfundiert|Blutgruppe)/i.test(String(text));
  const finalCls=cls==='team'&&(resultSender||resultText)?'result-arrival':cls;
  state.chat.push({time:state.elapsed,sender,text,cls:finalCls});state.chatAutoFollow=true;renderChat();
}
function notify(text){addChat('System',text,'system');}
function staffSupportsRole(person,role){return (person.capabilities||[person.role]).includes(role);}
function getAvailableStaff(roles=['doctor','nurse']){const available=state.staff.filter(s=>roles.some(role=>staffSupportsRole(s,role))&&s.busyUntil<=state.elapsed);if(roles.includes('nurse')&&roles.includes('doctor'))available.sort((a,b)=>(a.role==='nurse'?0:1)-(b.role==='nurse'?0:1));return available[0];}
function teamMemberName(role,index=0){const staff=getActiveCase().staff.filter(person=>person.role===role||staffSupportsRole(person,role));return staff[index]?.name||(role==='doctor'?'Arzt':'Pflege');}
function showToast(text){let t=el('toastMessage');if(!t){t=document.createElement('div');t.id='toastMessage';t.className='toast-message';}
  const openDialog=document.querySelector('dialog[open]');
  const host=openDialog||document.body;
  if(t.parentElement!==host)host.appendChild(t);
  t.style.left='50%';t.style.top='24px';
  t.textContent=text;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);
}
function flashNoStaff(roles=['doctor','nurse']){showToast('Das benötigte Personal ist gerade nicht verfügbar.');const panel=el('staffPanel');if(panel){panel.classList.remove('no-staff-flash');void panel.offsetWidth;panel.classList.add('no-staff-flash');setTimeout(()=>panel.classList.remove('no-staff-flash'),700);}state.staff.filter(s=>roles.some(role=>staffSupportsRole(s,role))).forEach(s=>{const card=document.querySelector(`[data-staff-id=\"${s.id}\"]`);if(card){card.classList.remove('deny-flash');void card.offsetWidth;card.classList.add('deny-flash');setTimeout(()=>card.classList.remove('deny-flash'),700);}});}

function assignTask(label,duration,onComplete,options={}){
  if(!state.running||state.paused||state.ended){notify('Die Simulation muss laufen.');return false;}
  const staff=getAvailableStaff(options.roles||['doctor','nurse']);
  if(!staff){flashNoStaff(options.roles||['doctor','nurse']);notify(`Aktuell ist keine passende Person frei.`);return false;}
  const task={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,label,start:state.elapsed,end:state.elapsed+duration,duration,staffId:staff.id,onComplete,type:options.type||'task',phase:options.phase||'vor Ort'};
  staff.busyUntil=task.end;staff.taskId=task.id;state.tasks.push(task);
  logEvent(`${staff.name} übernimmt: ${label}.`);addChat('Team vor Ort',`${staff.name}: Auftrag verstanden – ${label}.`);renderAll();return true;
}
function assignTeamTask(label,duration,onComplete){
  if(!state.running||state.paused||state.ended){notify('Die Simulation muss laufen.');return false;}
  if(state.staff.some(person=>person.busyUntil>state.elapsed)){flashNoStaff(['doctor','nurse']);addChat('Team vor Ort','Für die Intubation muss das ganze Team verfügbar sein.');return false;}
  const task={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,label,start:state.elapsed,end:state.elapsed+duration,duration,staffId:null,staffIds:state.staff.map(person=>person.id),onComplete,type:'team-task',phase:'vor Ort'};
  state.staff.forEach(person=>{person.busyUntil=task.end;person.taskId=task.id;});state.tasks.push(task);
  logEvent(`Das gesamte Team übernimmt: ${label}.`);addChat('Team vor Ort',`Das gesamte Team beginnt: ${label}.`);renderAll();return true;
}
function addBackgroundTask(label,duration,onComplete){
  state.tasks.push({id:`bg-${Date.now()}-${Math.random()}`,label,start:state.elapsed,end:state.elapsed+duration,duration,staffId:null,onComplete,type:'background',phase:'Labor'});
  logEvent(`${label}: Probe im Labor eingegangen.`);renderAll();
}

function addTimedTask(label,duration,onComplete,phase='Messung'){
  if(!state.running||state.paused||state.ended){notify('Die Simulation muss laufen.');return false;}
  state.tasks.push({
    id:`timed-${Date.now()}-${Math.random()}`,
    label,
    start:state.elapsed,
    end:state.elapsed+duration,
    duration,
    staffId:null,
    onComplete,
    type:'background',
    phase
  });
  logEvent(`${label} gestartet.`);
  renderAll();
  return true;
}

function startSimulation(){
  if(!participantUsername)return;
  if(state.running&&!state.paused)return;
  if(!state.running){activeCaseId=el('caseSelect')?.value||activeCaseId;SIM_DURATION=Number(el('durationSelect')?.value||getActiveCase().defaultDurationSeconds||600);state.difficulty=el('difficultySelect')?.value||'easy';state.caseId=activeCaseId;}
  if(!state.running){
    state.running=true;
    const briefing=getActiveCase().briefing; addChat(briefing.sender,briefing.text);
    logEvent('Simulation gestartet. Kurze Lageinformation übergeben.');
    checkAiStatus();
  }
  state.paused=false;el('startBtn').disabled=true;el('pauseBtn').disabled=false;
  if(!state.timer)state.timer=setInterval(tick,1000);startPulseLoop();startAlarmLoop();renderAll();
}
function pauseSimulation(){if(!state.running||state.ended)return;state.paused=!state.paused;el('pauseBtn').textContent=state.paused?'Fortsetzen':'Pause';el('startBtn').disabled=!state.paused;logEvent(state.paused?'Simulation pausiert.':'Simulation fortgesetzt.');}
function resetSimulation(){
  clearInterval(state.timer);stopPulseLoop();stopAlarmLoop();document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  LABS=clone(getActiveCase().labs);BGA=clone(getActiveCase().bga?.staticRows||[]);renderLabOptions();state=initialState();state.difficulty=el('difficultySelect')?.value||'easy';const initialSys=getActiveCase().physiology?.difficulty?.[state.difficulty]?.initialSys;if(initialSys){state.patient.sys=initialSys;state.vitalHistory[0].sys=initialSys;state.vitalHistory[0].map=map(initialSys,state.patient.dia);}
  el('startScreen')?.classList.add('hidden');el('simulationApp')?.classList.remove('hidden');el('pauseBtn').disabled=false;el('pauseBtn').textContent='Pause';renderLabOptions();renderAll();startSimulation();
}
function logout(){clearInterval(state.timer);stopPulseLoop();stopAlarmLoop();document.querySelectorAll('dialog[open]').forEach(d=>d.close());participantUsername='';state=initialState();el('simulationApp')?.classList.add('hidden');el('startScreen')?.classList.remove('hidden');if(el('usernameInput'))el('usernameInput').value='';el('usernameInput')?.focus();}

function tick(){if(!state.running||state.paused||state.ended)return;state.elapsed+=1;processTasks();if(state.elapsed%TICK_SECONDS===0){updatePhysiology();}if(state.elapsed>=SIM_DURATION)endSimulation();renderAll();}
function processTasks(){
  state.tasks.filter(t=>!t.done&&!t.cancelled&&t.end<=state.elapsed).forEach(t=>{
    t.done=true;const staffIds=t.staffIds||[t.staffId].filter(Boolean);const involved=state.staff.filter(s=>staffIds.includes(s.id));involved.forEach(person=>{person.taskId=null;person.busyUntil=state.elapsed;});const staff=involved[0];t.onComplete?.();
    logEvent(`${t.label} abgeschlossen.`);addChat(t.phase==='Labor'?'Labor':'Team vor Ort',`${involved.length>1?'Gesamtes Team: ':staff?staff.name+': ':''}${t.label} ist abgeschlossen.`);
  });
}

function updatePhysiology(){
  const p=state.patient;
  const caseConfig=getActiveCase();
  const physiology=caseConfig.physiology;
  const profile=physiology.difficulty[state.difficulty]||physiology.difficulty.easy;
  const difficultyFactor=profile.progression;
  const timeScale=Math.max(.38,state.elapsed/540);
  let severity=Math.min(2.15,timeScale*difficultyFactor);
  // Leicht und Mittel verschlechtern sich zunächst verzögert. Der schwere
  // Verlauf kann fallbezogen ohne Plateau kontinuierlich und rascher abfallen.
  if(physiology.model==='anaphylaxis'){
    const onsetDelay=Number(profile.onsetDelaySeconds??90);
    const progressionSeconds=Math.max(30,Number(profile.progressionSeconds??330));
    severity=Math.min(2.15,Math.max(0,state.elapsed-onsetDelay)/progressionSeconds*difficultyFactor);
  }
  if(physiology.model==='traumatic_hemorrhage'){
    const progressionSeconds=Math.max(60,Number(profile.progressionSeconds||360));
    severity=Math.min(2.15,state.elapsed/progressionSeconds*difficultyFactor);
  }
  if(physiology.model==='dehydration'){
    const progressionSeconds=Math.max(120,Number(profile.progressionSeconds||600));
    severity=Math.min(2.15,state.elapsed/progressionSeconds*difficultyFactor);
  }
  if(physiology.model==='sepsis'&&state.therapies.antibioticAt!=null){const sinceAbx=state.elapsed-state.therapies.antibioticAt;if(sinceAbx>90)severity*=clamp(1-(sinceAbx-90)/900,0.78,1);}

  state.therapies.fluidEffects=state.therapies.fluidEffects.map(x=>typeof x==='number'?{start:x-180,end:x,duration:180}:x).filter(x=>x.end>state.elapsed);
  state.therapies.medicationEffects=state.therapies.medicationEffects.filter(e=>e.until>state.elapsed);
  const fluidCount=state.therapies.fluidEffects.reduce((sum,e)=>{const remaining=Math.max(0,e.end-state.elapsed);const duration=Math.max(1,e.duration||180);return sum+Number(e.units||1)*Math.max(0.12,remaining/duration);},0);
  const bloodUnits=state.therapies.bloodUnitsGiven;
  const norepiBolus=state.therapies.norepiBolusUntil>state.elapsed?1:0;
  const norepiPerf=state.therapies.norepiPerfusor&&!state.therapies.norepiStandby?state.therapies.norepiRate:0;
  const adrenalineIm=state.therapies.adrenalineImUntil>state.elapsed?1:0;
  const adrenalineNebulized=state.therapies.adrenalineNebulizedUntil>state.elapsed?1:0;
  const postIntubationHypotension=state.therapies.postIntubationHypotensionUntil>state.elapsed?1:0;
  const paralyzed=state.therapies.paralyzedUntil>state.elapsed;
  const shockPosition=state.therapies.shockPositionUntil>state.elapsed?1:0;
  const fluidEffect=interventionEffect('fluid_500');
  const bloodEffect=interventionEffect('blood_unit');

  if(!state.physiologyCore&&window.TELECARE_PHYSIOLOGY_ENGINE){
    state.physiologyCore=window.TELECARE_PHYSIOLOGY_ENGINE.createInitial(caseConfig);
  }

  const engineResult=window.TELECARE_PHYSIOLOGY_ENGINE.step({
    core:state.physiologyCore,
    patient:p,
    caseConfig,
    profile,
    severity,
    difficulty:state.difficulty,
    therapies:state.therapies,
    medicationEffects:state.therapies.medicationEffects,
    fluidCount,
    bloodUnits,
    norepiBolus,
    norepiRate:norepiPerf,
    adrenalineIm,
    adrenalineNebulized,
    triggerStopped:state.therapies.triggerStoppedAt!==null,
    postIntubationHypotension,
    shockPosition,
    paralyzed,
    jitter
  });

  const septic=physiology.model==='sepsis';
  const cardiogenic=physiology.model==='cardiogenic';
  const anaphylaxis=physiology.model==='anaphylaxis';
  const traumatic=physiology.model==='traumatic_hemorrhage';
  const dehydrated=physiology.model==='dehydration';
  const tempTarget=septic?(physiology.tempTarget||39.3):cardiogenic?(physiology.tempTarget||37.0):anaphylaxis?(physiology.tempTarget||36.0):traumatic?(state.therapies.warming?36.6:(physiology.tempTarget||35.3)):dehydrated?(physiology.tempTarget||40.3):(state.therapies.warming?36.6:35.1);
  p.temp=clamp(p.temp+(tempTarget-p.temp)*(septic?.012:cardiogenic?.018:dehydrated?.008:.035)+jitter(.02),34.0,septic||dehydrated?40.7:cardiogenic?37.8:37.3);
  const treatmentLactateDelta=bloodUnits*(bloodEffect.lactatePerTick||0)+fluidCount*(fluidEffect.lactatePerTick||0);
  p.lactate=clamp(p.lactate+engineResult.lactateDelta*difficultyFactor+treatmentLactateDelta,1,14);
  const mechanicalBleedingReduction=state.therapies.tourniquetApplied ? .97 : state.therapies.woundCompressed ? .65 : state.therapies.limbElevated ? .42 : 0;
  const activeBleedingReduction=state.therapies.medicationEffects.reduce((sum,e)=>sum+Number(e.bleedingReduction||0),0)+(state.therapies.txa?0.18:0)+mechanicalBleedingReduction;
  const bleedingFactor=clamp(1-activeBleedingReduction,traumatic?.02:.42,1);
  p.hb=clamp(p.hb-physiology.hbLossPerTick*difficultyFactor*bleedingFactor,3.0,12);
  p.bleeding+=physiology.bleedingGainPerTick*difficultyFactor*bleedingFactor;
  if(traumatic){
    const visibleRate=Number(caseConfig.patient.visible.bloodLossPerSecondMl||0);
    state.therapies.externalBloodLossMl+=visibleRate*TICK_SECONDS*bleedingFactor;
  }

  const old=p.mental;
  if(state.dead)p.mental='nicht ansprechbar';
  else if(septic){
    if(p.sys<48||p.spo2<76)p.mental='komatös';
    else if(p.sys<70)p.mental='somnolent und verwirrt';
    else if(p.sys<90)p.mental='verlangsamt und desorientiert';
    else p.mental='wach, aber desorientiert';
  } else if(cardiogenic){
    if(p.sys<48||p.spo2<76)p.mental='bewusstlos';
    else if(p.sys<68)p.mental='somnolent';
    else if(p.sys<82)p.mental='wach, orientiert und unruhig';
    else p.mental='wach und orientiert';
  } else if(anaphylaxis){
    if(p.sys<45||p.spo2<70)p.mental='bewusstlos';
    else if(p.sys<65||p.spo2<83)p.mental='soporös';
    else if(p.sys<80||p.spo2<89)p.mental='somnolent';
    else p.mental='wach, orientiert und unruhig';
  } else if(traumatic){
    if(p.sys<42)p.mental='bewusstlos';
    else if(p.sys<60)p.mental='somnolent';
    else if(p.sys<76)p.mental='verlangsamt und zeitlich desorientiert';
    else if(p.sys<90)p.mental='unruhig und leicht verwirrt';
    else p.mental='wach, orientiert und unruhig';
  } else if(dehydrated){
    if(p.sys<42||p.hr<35)p.mental='bewusstlos';
    else if(p.sys<62)p.mental='somnolent und kaum adäquat ansprechbar';
    else if(p.sys<82)p.mental='somnolent und verwirrt';
    else if(p.sys<95)p.mental='wach, aber desorientiert';
    else p.mental='wach und zunehmend orientiert';
  } else if(p.sys<60||p.spo2<82)p.mental='somnolent';
  else if(p.sys<76)p.mental='verlangsamt und zeitlich desorientiert';
  else if(p.sys<90)p.mental='unruhig und leicht verwirrt';
  else p.mental='wach und unruhig';
  if(p.mental!==old){state.lastMentalReport=p.mental;logEvent(`Bewusstseinslage verändert: ${p.mental}.`,'warning');}
  if(anaphylaxis&&!state.therapies.intubated&&p.spo2<85&&!state.proactiveFlags.has('anaphylaxis_airway_worse')){state.proactiveFlags.add('anaphylaxis_airway_worse');addChat('Team vor Ort','Der inspiratorische Stridor wird lauter. Lippen und Zunge wirken zunehmend geschwollen; die Patientin bekommt schlechter Luft.','system');}
  if(traumatic&&!state.therapies.tourniquetApplied&&state.elapsed>=60&&!state.proactiveFlags.has('trauma_bleeding_worse')){state.proactiveFlags.add('trauma_bleeding_worse');addChat('Team RTW',`Die Blutung spritzt weiter. Die Blutlache umfasst inzwischen grob ${Math.round(state.therapies.externalBloodLossMl/50)*50} ml; Tim wird blasser und schwindeliger.`,'system');}

  const currentMap=engineResult.currentMap;
  const criticalMap=profile.criticalMap;
  const hypoxicArrest=engineResult.hypoxiaDose>=115||p.spo2<5;
  const hypoxicCritical=engineResult.hypoxiaDose>=75||p.spo2<15;
  const critical=(currentMap<criticalMap||hypoxicCritical||p.hr<28||p.hr>185);
  state.criticalSeconds=critical?state.criticalSeconds+TICK_SECONDS:Math.max(0,state.criticalSeconds-TICK_SECONDS*2);
  const threshold=profile.arrestSeconds;
  if(!state.dead&&(hypoxicArrest||state.criticalSeconds>=threshold)){
    state.dead=true;state.deathReason=cardiogenic&&currentMap<45?`${physiology.arrestRhythm||'Kreislaufstillstand'} bei dekompensiertem kardiogenen Schock`:anaphylaxis?`${physiology.arrestRhythm||'Asystolie'} bei schwerer anaphylaktischer Reaktion`:traumatic?`${physiology.arrestRhythm||'Kammerflimmern'} bei hämorrhagischem Schock`:dehydrated?`${physiology.arrestRhythm||'PEA'} bei schwerer Exikose`:currentMap<38?'prolongierter Kreislaufschock':hypoxicCritical?'prolongierte schwere Hypoxämie':'prolongierte vitale Entgleisung';
    p.hr=0;p.sys=0;p.dia=0;p.spo2=Math.max(0,p.spo2);p.rr=0;p.mental='nicht ansprechbar';
    const subject=getActiveCase().patient.sex==='weiblich'?'Die Patientin':'Der Patient';
    logEvent(`Kreislaufstillstand: ${state.deathReason}.`,'critical');addChat('Team vor Ort',cardiogenic?'Der Patient ist nicht mehr ansprechbar und pulslos. Am Monitor zeigt sich Kammerflimmern. Kreislaufstillstand – die Simulation wird beendet.':anaphylaxis?'Die Patientin ist nicht mehr ansprechbar, pulslos und apnoisch. Am Monitor zeigt sich eine Asystolie. Kreislaufstillstand – die Simulation wird beendet.':traumatic?'Tim ist nicht mehr ansprechbar und pulslos. Am Monitor zeigt sich Kammerflimmern. Kreislaufstillstand – die Simulation wird beendet.':dehydrated?'Die Patientin ist nicht mehr ansprechbar und pulslos. Am Monitor zeigt sich eine PEA. Kreislaufstillstand – die Simulation wird beendet.':`${subject} ist nicht mehr ansprechbar, pulslos und apnoisch. Kreislaufstillstand – die Simulation wird beendet.`,'system');
    setTimeout(()=>{if(!state.ended)endSimulation();},0);
  }
  const measuredBpAlarm=(state.access.has('artery')&&p.sys<90)||(state.lastMeasurements.nibp&&state.lastMeasurements.nibp.sys<90);
  state.alarmActive=!state.dead&&(p.hr<60||p.hr>120||measuredBpAlarm||p.spo2<90);
  state.vitalHistory.push({time:state.elapsed,hr:Math.round(p.hr),map:map(p.sys,p.dia),spo2:Math.round(p.spo2),sys:Math.round(p.sys),dia:Math.round(p.dia)});
}

let audioCtx=null,pulseTimer=null,alarmTimer=null;
function pulseToneFrequency(spo2){
  const saturation=clamp(Number(spo2)||0,50,100);
  if(saturation>=90)return 650+(saturation-90)*18;
  if(saturation>=80)return 500+(saturation-80)*15;
  if(saturation>=70)return 380+(saturation-70)*12;
  return 280+(saturation-50)*5;
}
function beep(){if(!state.soundOn||!state.running||state.paused||state.ended)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=pulseToneFrequency(state.patient.spo2);g.gain.value=.035;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.045);}catch{} }
function startPulseLoop(){stopPulseLoop();const schedule=()=>{if(state.running&&!state.ended){beep();pulseTimer=setTimeout(schedule,Math.max(330,60000/state.patient.hr));}};schedule();}
function stopPulseLoop(){if(pulseTimer)clearTimeout(pulseTimer);pulseTimer=null;}
function toggleSound(){state.soundOn=!state.soundOn;el('soundBtn').textContent=state.soundOn?'🔊 Pulston':'🔇 Pulston aus';el('soundBtn').classList.toggle('off',!state.soundOn);if(state.soundOn)startPulseLoop();else stopPulseLoop();}
function alarmBeep(){if(!state.alarmOn||state.alarmSilencedUntil>state.elapsed||!state.alarmActive||!state.running||state.paused||state.ended)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=1050;g.gain.value=.05;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.12);}catch{}}
function startAlarmLoop(){stopAlarmLoop();alarmTimer=setInterval(alarmBeep,1200);}
function stopAlarmLoop(){if(alarmTimer)clearInterval(alarmTimer);alarmTimer=null;}
function toggleAlarm(){if(!state.running||state.ended)return;state.alarmOn=true;state.alarmSilencedUntil=state.elapsed+120;el('alarmBtn').classList.add('alarm-paused');renderButtons();showToast('Alarm für 2 Minuten pausiert.');}
function resourceAvailable(id){return getActiveCase().resources?.[id]!==false;}
function accessAllowed(id){const allowed=getActiveCase().resources?.allowedAccess;return !Array.isArray(allowed)||allowed.includes(id);}
function hasContinuousTemperature(){return state.access.has('bladder')&&getActiveCase().monitoring?.continuousTemperatureViaBladder!==false;}

function renderVitals(){
  const p=state.patient;el('hr').textContent=Math.round(p.hr);el('spo2').textContent=Math.round(p.spo2);
  const arterial=state.access.has('artery');el('artBp').textContent=arterial?`${Math.round(p.sys)}/${Math.round(p.dia)}`:'kein Signal';el('artMap').textContent=arterial?`MAP ${map(p.sys,p.dia)} mmHg`:'Arterie erforderlich';
  if(state.lastMeasurements.nibp){el('nibp').textContent=`${state.lastMeasurements.nibp.sys}/${state.lastMeasurements.nibp.dia}`;el('nibpMap').textContent=`MAP ${state.lastMeasurements.nibp.map} mmHg · ${formatTime(state.lastMeasurements.nibp.time)}`;}else{el('nibp').textContent='– / –';el('nibpMap').textContent='MAP – mmHg';}
  el('rr').textContent=state.lastMeasurements.rr?state.lastMeasurements.rr.value:'–';
  const continuous=hasContinuousTemperature();el('temp').textContent=continuous?p.temp.toFixed(1):(state.lastMeasurements.temp?state.lastMeasurements.temp.value.toFixed(1):'–');el('tempInfo').textContent=continuous?'°C · kontinuierlich über DK':'°C';el('measureTempBtn').classList.toggle('hidden',continuous);
  const cvpAvailable=state.access.has('zvk');const cvpValue=Number.isFinite(Number(p.cvp))?Number(p.cvp):(getActiveCase().physiology?.model==='sepsis'?3:5);el('cvp').textContent=cvpAvailable?cvpValue.toFixed(0):'kein Signal';el('cvpInfo').textContent=cvpAvailable?'mmHg · kontinuierlich':'ZVK erforderlich';
  const alarmVisible=state.alarmOn&&state.alarmSilencedUntil<=state.elapsed;const alarmMap={hr:p.hr<60||p.hr>120,nibp:!!state.lastMeasurements.nibp&&state.lastMeasurements.nibp.sys<90,art:state.access.has('artery')&&p.sys<90,spo2:p.spo2<90};document.querySelectorAll('.strip-vital').forEach(n=>n.classList.remove('vital-alarm'));for(const [cls,on] of Object.entries(alarmMap)){if(on&&alarmVisible)document.querySelector(`.strip-vital.${cls}`)?.classList.add('vital-alarm');}
  ['measureTempBtn','measureNibpBtn','countRrBtn'].forEach(id=>el(id).disabled=!state.running||state.paused||state.ended);
  el('norepiPanel').classList.toggle('hidden',!state.therapies.norepiPerfusor);el('norepiPanel').parentElement?.classList.toggle('has-perfusor',state.therapies.norepiPerfusor);el('norepiRate').textContent=state.therapies.norepiStandby?'Standby · 0,00 µg/kg/min':`${NOREPI_RATES[state.therapies.norepiRate-1].toFixed(2)} µg/kg/min`;renderPatientMap();
}
function renderStaff(){
  el('staffGrid').innerHTML=state.staff.map(s=>{
    const busy=s.busyUntil>state.elapsed;
    const task=state.tasks.find(t=>t.id===s.taskId);
    const role=s.displayRole||(s.role==='doctor'?'Arzt':'Pflegefachperson');
    const status=busy?'BESCHÄFTIGT':'VERFÜGBAR';
    const detail=busy?escapeHtml(task?.label||'Aufgabe läuft'):'Bereit für Auftrag';
    const remaining=busy?formatTime(Math.max(0,s.busyUntil-state.elapsed)):'';
    return `<div data-staff-id="${s.id}" class="staff-card ${busy?'busy':'available'}">
      <div class="staff-avatar"><span class="staff-icon">${s.icon}</span><span class="availability-dot"></span></div>
      <div class="staff-identity"><div class="staff-name">${s.name}</div><div class="staff-role">${role}</div></div>
      <div class="staff-status-badge">${status}</div>
      <div class="staff-task"><span>${detail}</span>${remaining?`<strong>${remaining}</strong>`:''}</div>
    </div>`;
  }).join('');
}
function renderPatientMap(){
  const container=el('patientMap');if(!container)return;
  const labels=[...state.access].map(id=>ACCESS[id]?.label||ACCESS[id.split('_').slice(0,2).join('_')]?.label).filter(Boolean);
  const inf=[];
  if(state.therapies.oxygen)inf.push('O₂ läuft');
  if(state.therapies.cefuroximeRunning)inf.push('Cefuroxim 1,5 g läuft');
  if(state.therapies.adrenalineImUntil>state.elapsed)inf.push('Adrenalin i.m. wirksam');
  if(state.therapies.adrenalineNebulizedUntil>state.elapsed)inf.push('Adrenalin-Verneblung wirksam');
  if(state.therapies.intubated)inf.push('endotracheal intubiert und beatmet');
  if(state.therapies.norepiPerfusor)inf.push(state.therapies.norepiStandby?'Noradrenalin-Perfusor: Standby':`Noradrenalin ${NOREPI_RATES[state.therapies.norepiRate-1].toFixed(2)} µg/kg/min`);
  if(state.therapies.fluidEffects.length)inf.push(`${Math.round(state.therapies.fluidEffects.reduce((sum,e)=>sum+Number(e.units||1)*500,0))} ml Volumeneffekt aktiv`);
  if(state.therapies.upperBodyElevated)inf.push('Oberkörper hochgelagert');
  if(state.therapies.defibPads)inf.push('Defibrillationselektroden geklebt');
  if(state.therapies.pulmonaryEdema)inf.push('zunehmende Dyspnoe mit beidseitigen Rasselgeräuschen');
  if(state.therapies.shockPositionUntil>state.elapsed)inf.push('Schocklage');if(state.therapies.medications.length){state.therapies.medications.slice(-3).forEach(m=>inf.push(`${m.label} gegeben`));}
  if(state.therapies.limbElevated)inf.push('verletzte linke Hand hochgelagert');
  if(state.therapies.woundCompressed&&!state.therapies.tourniquetApplied)inf.push('Handstumpf manuell komprimiert');
  if(state.therapies.tourniquetApplied)inf.push(`Tourniquet am linken Unterarm · ${formatTime(state.therapies.tourniquetAt)}`);
  if(getActiveCase().physiology?.model==='traumatic_hemorrhage')inf.push(state.therapies.tourniquetApplied?'spritzende Blutung gestoppt':`äußerer Blutverlust grob ${Math.round(state.therapies.externalBloodLossMl/50)*50} ml`);
  container.innerHTML=`<div class="body-figure"><div class="head"></div><div class="torso"></div><div class="arm left"></div><div class="arm right"></div><div class="leg left"></div><div class="leg right"></div>${state.therapies.defibPads?'<span class="defib-pad pad-left">⚡</span><span class="defib-pad pad-right">⚡</span>':''}${[...state.access].map((id,i)=>`<span class="access-marker marker-${i%5}" title="${escapeHtml(ACCESS[id]?.label||ACCESS[id.split('_').slice(0,2).join('_')]?.label||id)}">${id==='bladder'?'DK':id==='artery'?'A':id==='zvk'?'Z':id.startsWith('pvk')?'P':'K'}</span>`).join('')}</div><div class="patient-lines"><div><strong>Zugänge/Katheter</strong>${labels.length?labels.map(x=>`<span>${escapeHtml(x)}</span>`).join(''):'<span>keine</span>'}</div><div><strong>Laufende Therapie</strong>${inf.length?inf.map(x=>`<span>${escapeHtml(x)}</span>`).join(''):'<span>keine</span>'}${state.therapies.cefuroximeRunning?'<button type="button" id="stopTriggerQuickBtn" class="mini">Cefuroxim stoppen</button>':''}</div></div>`;
  const stopTriggerButton=el('stopTriggerQuickBtn');if(stopTriggerButton)stopTriggerButton.onclick=()=>doAction({type:'stop_trigger'});
}

function renderTasks(){const active=state.tasks.filter(t=>!t.done&&!t.cancelled);el('activeOrders').classList.toggle('empty-state',!active.length);el('activeOrders').innerHTML=active.length?active.map(t=>`<div class="order-item"><div><strong>${escapeHtml(t.label)}</strong><small>${t.phase}${t.staffIds?.length?' · gesamtes Team':t.staffId?' · '+escapeHtml(state.staff.find(s=>s.id===t.staffId)?.name||''):''}</small></div><div class="order-controls"><span>${formatTime(t.end-state.elapsed)}</span><button type="button" class="cancel-task-btn" data-cancel-task="${t.id}">Abbrechen</button></div></div>`).join(''):'Keine aktiven Aufträge.';document.querySelectorAll('[data-cancel-task]').forEach(btn=>btn.onclick=()=>cancelTask(btn.dataset.cancelTask));}
function cancelTask(taskId){const t=state.tasks.find(x=>x.id===taskId&&!x.done&&!x.cancelled);if(!t)return;t.cancelled=true;t.done=true;const staffIds=t.staffIds||[t.staffId].filter(Boolean);state.staff.filter(s=>staffIds.includes(s.id)).forEach(person=>{person.taskId=null;person.busyUntil=state.elapsed;});logEvent(`${t.label} abgebrochen.`,'warning');addChat('Team vor Ort',`${t.label} wurde abgebrochen.`);renderAll();}
function renderChat(){const node=el('chatLog');const oldTop=node.scrollTop;const nearBottom=node.scrollHeight-node.scrollTop-node.clientHeight<60;node.innerHTML=state.chat.map(m=>`<div class="message ${m.cls}"><div class="message-meta">${escapeHtml(m.sender)} · ${formatTime(m.time)}</div><div>${escapeHtml(m.text).replace(/\n/g,'<br>')}</div></div>`).join('');if(state.chatAutoFollow||nearBottom){node.scrollTop=node.scrollHeight;state.chatAutoFollow=false;}else node.scrollTop=oldTop;}
function renderEvents(){const node=el('eventLog');if(!node)return;node.innerHTML=state.events.slice().reverse().map(e=>`<div class="event-row"><span>${formatTime(e.time)}</span><div>${escapeHtml(e.text)}</div></div>`).join('');}
function renderButtons(){
  el('timer').textContent=formatTime(SIM_DURATION-state.elapsed);if(el('participantName'))el('participantName').textContent=participantUsername||'–';
  const alarmRemaining=Math.max(0,state.alarmSilencedUntil-state.elapsed);el('alarmBtn').textContent=alarmRemaining>0?`⏸ Alarm ${formatTime(alarmRemaining)}`:'⏸ Alarm 2 min';el('alarmBtn').classList.toggle('alarm-paused',alarmRemaining>0);
  el('crossedBtn').disabled=!state.crossedBloodAvailable;
  const giveCrossed=el('giveCrossedEkBtn'),giveUncrossed=el('giveUncrossedEkBtn');if(giveCrossed)giveCrossed.disabled=state.bloodInventory.crossed<1;if(giveUncrossed)giveUncrossed.disabled=state.bloodInventory.uncrossed<1;
  const lb=el('openLabResultsBtn'),bb=el('openBgaResultsBtn'),sb=el('openSonoResultsBtn');
  lb.disabled=!resourceAvailable('lab')||!state.labsAvailable.size;bb.disabled=!resourceAvailable('bga')||!state.bgaAvailable;sb.disabled=!resourceAvailable('sono')||!state.sonoResult;
  el('labBtn').disabled=!resourceAvailable('lab');el('bgaBtn').disabled=!resourceAvailable('bga');el('ecgBtn').disabled=!resourceAvailable('ecg');el('sonoBtn').disabled=!resourceAvailable('sono');
  const actionDescriptions={lab:'Pflege · 20 s + 2 min Labor',bga:'Arzt oder Pflege · 30 s',access:'Personal und Zeit im Menü',ecg:'Pflege · 45 s',sono:'Arzt · 60 s',...(getActiveCase().resources?.actionDescriptions||{})};
  for(const [id,key] of [['labBtn','lab'],['bgaBtn','bga'],['accessBtn','access'],['ecgBtn','ecg'],['sonoBtn','sono']]){const small=el(id)?.querySelector('small');if(small)small.textContent=actionDescriptions[key];}
  for(const [id,label] of [['labBtn','Labor'],['bgaBtn','BGA'],['ecgBtn','12-Kanal-EKG'],['sonoBtn','POCUS / Sono']]){const button=el(id);if(button&&!resourceAvailable(id==='labBtn'?'lab':id==='bgaBtn'?'bga':id==='ecgBtn'?'ecg':'sono'))button.title=`${label} ist in diesem Setting nicht verfügbar.`;else if(button)button.removeAttribute('title');}
  document.querySelectorAll('[data-access]').forEach(button=>{const access=ACCESS[button.dataset.access],allowed=accessAllowed(button.dataset.access),restricted=Array.isArray(getActiveCase().resources?.allowedAccess);button.disabled=!allowed;button.title=allowed?'':`${access?.label||'Dieser Zugang'} ist in diesem Setting nicht verfügbar.`;const small=button.querySelector('small');if(small){const defaultRole=access?.roles?.includes('doctor')&&access?.roles?.includes('nurse')?'Arzt oder Pflege':access?.roles?.includes('doctor')?'Arzt':'Pflege';small.textContent=restricted?(allowed?`Rettungsdienst · ${access.duration} s`:'Im RTW nicht verfügbar'):`${defaultRole} · ${access.duration} s`;}})
  el('uncrossedCount').textContent=state.bloodInventory.uncrossed;el('crossedCount').textContent=state.bloodInventory.crossed;el('givenCount').textContent=state.therapies.bloodUnitsGiven;
  const bloodProductsEnabled=getActiveCase().bloodProductsEnabled!==false&&resourceAvailable('blood');document.querySelector('.inventory')?.classList.toggle('hidden',!bloodProductsEnabled);el('bloodBtn')?.classList.toggle('hidden',!bloodProductsEnabled);
  if(el('gameCaseName'))el('gameCaseName').textContent=`${getActiveCase().number} · ${getActiveCase().shortTitle}`;el('finishBtn').disabled=!state.running||state.ended;
  lb.classList.toggle('new-result',state.newLabResult);bb.classList.toggle('new-result',state.newBgaResult);sb.classList.toggle('new-result',state.newSonoResult);
}
function renderAll(){renderVitals();renderStaff();renderTasks();renderChat();renderEvents();renderButtons();}

function measureNibp(){addTimedTask('Nichtinvasive Blutdruckmessung',20,()=>{const p=state.patient;state.lastMeasurements.nibp={sys:Math.round(p.sys+jitter(2)),dia:Math.round(p.dia+jitter(2)),map:map(p.sys,p.dia),time:state.elapsed};},'Messung');}
function countRr(){assignTask('Atemfrequenz auszählen',15,()=>{state.lastMeasurements.rr={value:Math.round(state.patient.rr),time:state.elapsed};},{roles:['nurse']});}
function measureTemp(){assignTask('Temperatur messen',15,()=>{state.lastMeasurements.temp={value:state.patient.temp,time:state.elapsed};},{roles:['nurse']});}
function currentBga(){
  const p=state.patient; const oxy=state.therapies.oxygen?18:0; const activeCase=getActiveCase();const septic=activeCase.physiology?.model==='sepsis';const cardiogenic=activeCase.physiology?.model==='cardiogenic';const anaphylaxis=activeCase.physiology?.model==='anaphylaxis';
  if(cardiogenic){
    const initial=activeCase.bga?.initial||{ph:7.16,pco2:30,po2:60,hco3:14,baseExcess:-13,lactate:4.5};
    const lactateImprovement=Number(initial.lactate||4.5)-p.lactate;
    const ph=clamp(Number(initial.ph)+lactateImprovement*.045,6.85,7.48);
    const pco2=clamp(Number(initial.pco2)-(p.rr-activeCase.patient.initial.rr)*.25,20,55);
    const po2=clamp(Number(initial.po2)+(p.spo2-activeCase.patient.initial.spo2)*2.2+oxy-(state.therapies.pulmonaryEdema?8:0),30,140);
    const hco3=clamp(Number(initial.hco3)+lactateImprovement*1.2,8,27);
    const baseExcess=clamp(Number(initial.baseExcess)+lactateImprovement*1.6,-24,3);
    return [
      ['pH',ph.toFixed(2),'7,35–7,45',ph<7.35||ph>7.45],
      ['pCO₂',Math.round(pco2)+' mmHg','35–45 mmHg',pco2<35||pco2>45],
      ['pO₂',Math.round(po2)+' mmHg','75–100 mmHg',po2<75||po2>100],
      ['HCO₃⁻',Math.round(hco3)+' mmol/l','22–26 mmol/l',hco3<22||hco3>26],
      ['Base Excess',Math.round(baseExcess)+' mmol/l','−2 bis +2 mmol/l',baseExcess<-2||baseExcess>2],
      ['Laktat',p.lactate.toFixed(1)+' mmol/l','0,5–2,2 mmol/l',p.lactate>2.2],
      ['Hb',p.hb.toFixed(1)+' g/dl','13,5–17,5 g/dl',p.hb<13.5||p.hb>17.5],
      ['Na⁺','138 mmol/l','135–145 mmol/l',false],
      ['K⁺',Number(p.potassium||3.3).toFixed(1)+' mmol/l','3,5–5,1 mmol/l',Number(p.potassium||3.3)<3.5||Number(p.potassium||3.3)>5.1],
      ['iCa²⁺',p.iCa.toFixed(2)+' mmol/l','1,12–1,32 mmol/l',p.iCa<1.12||p.iCa>1.32],
      ['Glukose',Math.round(p.glucose)+' mg/dl','70–100 mg/dl',p.glucose<70||p.glucose>100]
    ];
  }
  if(anaphylaxis){
    const initial=activeCase.bga?.initial||{ph:7.30,pco2:29,po2:57,hco3:24,baseExcess:0,lactate:3};
    const lactateImprovement=Number(initial.lactate||3)-p.lactate;
    const ph=clamp(Number(initial.ph)+lactateImprovement*.035,6.90,7.46);
    const pco2=clamp(Number(initial.pco2)-(p.rr-activeCase.patient.initial.rr)*.22,20,50);
    const po2=clamp(Number(initial.po2)+(p.spo2-activeCase.patient.initial.spo2)*2.1+oxy*.35,28,140);
    const hco3=clamp(Number(initial.hco3)+lactateImprovement*.75,10,27);
    const baseExcess=clamp(Number(initial.baseExcess)+lactateImprovement*1.15,-20,3);
    return [
      ['pH',ph.toFixed(2),'7,35–7,45',ph<7.35||ph>7.45],
      ['pCO₂',Math.round(pco2)+' mmHg','35–45 mmHg',pco2<35||pco2>45],
      ['pO₂',Math.round(po2)+' mmHg','75–100 mmHg',po2<75||po2>100],
      ['HCO₃⁻',Math.round(hco3)+' mmol/l','22–26 mmol/l',hco3<22||hco3>26],
      ['Base Excess',Math.round(baseExcess)+' mmol/l','−2 bis +2 mmol/l',baseExcess<-2||baseExcess>2],
      ['Laktat',p.lactate.toFixed(1)+' mmol/l','0,5–2,2 mmol/l',p.lactate>2.2],
      ['Hb',p.hb.toFixed(1)+' g/dl','12,0–16,0 g/dl',p.hb<12||p.hb>16],
      ['Na⁺','135 mmol/l','135–145 mmol/l',false],
      ['K⁺',Number(p.potassium||4.5).toFixed(1)+' mmol/l','3,5–5,1 mmol/l',false],
      ['iCa²⁺',p.iCa.toFixed(2)+' mmol/l','1,15–1,35 mmol/l',p.iCa<1.15||p.iCa>1.35],
      ['Glukose',Math.round(p.glucose)+' mg/dl','70–100 mg/dl',p.glucose<70||p.glucose>100]
    ];
  }
  return [
    ['pH',(7.34-(p.lactate-2.5)*0.018).toFixed(2),'7,35–7,45',true],
    ['pCO₂',String(Math.round(34-(p.rr-22)*0.25))+' mmHg','35–45 mmHg',true],
    ['pO₂',String(Math.round(68+oxy))+' mmHg','80–100 mmHg',!state.therapies.oxygen],
    ['HCO₃⁻',String(Math.round(20-(p.lactate-3)*0.7))+' mmol/l','22–26 mmol/l',true],
    ['Base Excess',String(Math.round(-4-(p.lactate-3)*1.2))+' mmol/l','−2 bis +2 mmol/l',true],
    ['Laktat',p.lactate.toFixed(1)+' mmol/l','0,5–2,2 mmol/l',p.lactate>2.2],
    ['Hb',p.hb.toFixed(1)+' g/dl','12,0–16,0 g/dl',p.hb<12],
    ['Na⁺',septic?'130 mmol/l':'138 mmol/l','135–145 mmol/l',septic],['K⁺',septic?'5,0 mmol/l':'4,3 mmol/l','3,5–5,1 mmol/l',false],['iCa²⁺',p.iCa.toFixed(2)+' mmol/l','1,12–1,32 mmol/l',p.iCa<1.12||p.iCa>1.32]
  ];
}
function requestBga(mode){if(!resourceAvailable('bga')){addChat('Team vor Ort','Eine BGA steht in diesem Rettungsdienst-Setting nicht zur Verfügung.');return false;}const arterial=mode==='arterial';const hasArtery=state.access.has('artery');const duration=arterial?(hasArtery?15:45):30;const roles=arterial&&!hasArtery?['doctor']:['nurse','doctor'];const label=arterial?(hasArtery?'Arterielle BGA über liegende Arterie':'Arterielle BGA per Einmalpunktion'):'Venöse BGA';return assignTask(`${label} abnehmen und analysieren`,duration,()=>{state.bgaAvailable=true;state.newBgaResult=true;state.bgaResults.push({time:state.elapsed,type:arterial?'arteriell':'venös',values:currentBga()});},{roles});}
function requestEcg(){if(!resourceAvailable('ecg')){addChat('Team vor Ort','Ein 12-Kanal-EKG steht in diesem Setting nicht zur Verfügung.');return false;}return assignTask('12-Kanal-EKG schreiben',45,()=>{state.ecgAt=state.elapsed;addChat('Team vor Ort',`12-Kanal-EKG: ${getActiveCase().diagnostics.ecg||'Sinustachykardie, keine akuten ST-Hebungen.'}`);},{roles:['nurse']});}
function requestSono(){if(!resourceAvailable('sono')){addChat('Team vor Ort','Eine Sonografie steht in diesem Setting nicht zur Verfügung.');return false;}const roles=getActiveCase().resources?.sonoRoles||['doctor'];return assignTask('Fokussierte Sonografie / POCUS durchführen',60,()=>{state.sonoResult={time:state.elapsed,text:getActiveCase().diagnostics.sono};state.newSonoResult=true;addChat(getActiveCase().staff.find(x=>roles.includes(x.role))?.name||'Team vor Ort','POCUS ist abgeschlossen. Der Befund kann geöffnet werden.');},{roles});}
function showSonoResults(){state.newSonoResult=false;if(!state.sonoResult)return;el('resultsTitle').textContent='POCUS / Sono';el('resultsContent').innerHTML=`<div class="result-group"><h3>${formatTime(state.sonoResult.time)}</h3><p>${escapeHtml(state.sonoResult.text)}</p></div>`;el('resultsDialog').showModal();}

function getCurrentLabValue(id){
  const l=LABS[id];
  let value=l?.value??'—',abnormal=Boolean(l?.abnormal);
  if(id==='hb'){value=state.patient.hb.toFixed(1)+' g/dl';abnormal=state.patient.hb<12;}
  if(id==='hct'){value=Math.round(state.patient.hb*3)+' %';abnormal=state.patient.hb<36;}
  if(id==='lactate'){value=state.patient.lactate.toFixed(1)+' mmol/l';abnormal=state.patient.lactate>2.2;}
  if(id==='potassium'){value=Number(state.patient.potassium||4.3).toFixed(1)+' mmol/l';abnormal=Number(state.patient.potassium||4.3)<3.5||Number(state.patient.potassium||4.3)>5.1;}
  if(id==='calcium'&&l?.dynamic==='iCa'){value=state.patient.iCa.toFixed(2)+' mmol/l';abnormal=state.patient.iCa<1.15||state.patient.iCa>1.35;}
  else if(id==='calcium'){value=(state.patient.iCa*2).toFixed(2)+' mmol/l';abnormal=state.patient.iCa<1.08;}
  return {id,label:l?.label||id,value,norm:l?.norm||'—',abnormal};
}
function renderLabOptions(){
  const host=el('labCheckboxes');if(!host)return;
  host.innerHTML=Object.entries(LABS).map(([id,l])=>`<label class="check-item"><input type="checkbox" name="lab" value="${id}"><span>${l.label}</span></label>`).join('');
}
function requestLab(selected){
  if(!resourceAvailable('lab')){addChat('Team vor Ort','Ein Labor steht in diesem Rettungsdienst-Setting nicht zur Verfügung.');return false;}
  selected=[...new Set((selected||[]).filter(id=>LABS[id]))];
  if(!selected.length){notify('Die angeforderten Laborparameter sind in diesem Fall nicht verfügbar.');return false;}
  const label=selected.map(x=>LABS[x].label).join(', ');
  const started=assignTask(`Blutentnahme für Labor: ${label}`,20,()=>{
    addBackgroundTask(`Laboranalyse: ${label}`,120,()=>{
      const values=selected.map(getCurrentLabValue);
      state.labResults.push({time:state.elapsed,values});
      selected.forEach(x=>state.labsAvailable.add(x));
      state.newLabResult=true;
      if(selected.includes('crossmatch'))state.crossedBloodAvailable=true;
      addChat('Labor',`Neue Laborergebnisse (${label}) sind verfügbar.`);
    });
  },{roles:['nurse']});
  if(started)selected.forEach(x=>state.labsRequested.add(x));
  return started;
}
function setupLabDialog(){
  renderLabOptions();
  el('labBtn').onclick=()=>{renderLabOptions();el('labDialog').showModal();};
  el('submitLabBtn').onclick=()=>{
    const selected=[...document.querySelectorAll('input[name="lab"]:checked')].map(x=>x.value);
    if(!selected.length){notify('Bitte mindestens einen Laborparameter auswählen.');return;}
    if(requestLab(selected)){el('labDialog').close();document.querySelectorAll('input[name="lab"]').forEach(x=>x.checked=false);}
  };
}
function buildTrendTable(history,title){
  if(!history.length)return '<p>Keine Ergebnisse verfügbar.</p>';
  const all=[]; const seen=new Set();
  history.forEach(h=>(h.values||[]).forEach(v=>{const key=v.id||v[0];if(!seen.has(key)){seen.add(key);all.push(key);}}));
  const labelFor=key=>{for(const h of history){const v=(h.values||[]).find(x=>(x.id||x[0])===key);if(v)return v.label||v[0]||key;}return key;};
  const normFor=key=>{for(const h of history){const v=(h.values||[]).find(x=>(x.id||x[0])===key);if(v)return v.norm||v[2]||'—';}return '—';};
  const cells=history.map((h,i)=>`<th>${title} ${i+1}<small>${formatTime(h.time)}${h.type?' · '+h.type:''}</small></th>`).join('');
  const rows=all.map(key=>`<tr><th>${escapeHtml(labelFor(key))}<small>${escapeHtml(normFor(key))}</small></th>${history.map(h=>{const v=(h.values||[]).find(x=>(x.id||x[0])===key);if(!v)return '<td class="trend-missing">—</td>';const val=v.value??v[1];const abnormal=v.abnormal??v[3];return `<td class="${abnormal?'abnormal':''}">${escapeHtml(val)}</td>`;}).join('')}</tr>`).join('');
  return `<div class="trend-table-wrap"><table class="result-table trend-table"><thead><tr><th>Parameter<small>Normbereich</small></th>${cells}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function showLabResults(){
  state.newLabResult=false;
  el('resultsTitle').textContent='Laborverlauf';
  el('resultsContent').innerHTML=buildTrendTable(state.labResults,'Labor');
  el('resultsDialog').showModal();
}
function showBgaResults(){
  state.newBgaResult=false;
  el('resultsTitle').textContent='BGA-Verlauf';
  el('resultsContent').innerHTML=buildTrendTable(state.bgaResults,'BGA');
  el('resultsDialog').showModal();
}
function setupAccessDialog(){el('accessBtn').onclick=()=>el('accessDialog').showModal();document.querySelectorAll('[data-access]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.access,a=ACCESS[id];if(!accessAllowed(id)){addChat('Team vor Ort',`${a.label} ist in diesem Setting nicht verfügbar.`);return;}if(state.access.has(id))return notify(`${a.label} liegt bereits.`);if(assignTask(`${a.label} legen`,a.duration,()=>{state.access.add(id);const doctor=getActiveCase().staff.find(x=>x.role==='doctor')?.name||'Arzt';const nurse=getActiveCase().staff.find(x=>x.role==='nurse')?.name||'Pflege';if(id==='artery')addChat(doctor,'Die Arterie liegt. Der arterielle Blutdruck wird kontinuierlich angezeigt.');if(id==='zvk')addChat(doctor,`Der ZVK liegt. Der ZVD wird jetzt kontinuierlich angezeigt${Number.isFinite(Number(state.patient.cvp))?` und beträgt aktuell etwa ${Math.round(state.patient.cvp)} mmHg`:''}.`);if(id==='bladder')addChat(nurse,'Der Blasenkatheter liegt. Temperatur wird jetzt kontinuierlich über den DK angezeigt.');},{roles:a.roles}))el('accessDialog').close();});}
function setupBloodDialog(){el('bloodBtn').onclick=()=>el('bloodDialog').showModal();el('uncrossedBtn').onclick=()=>{if(assignTask('2 ungekreuzte 0-negative EK anfordern',20,()=>addBackgroundTask('Bereitstellung 2 ungekreuzte EK',70,()=>{state.bloodInventory.uncrossed+=2;state.bloodRequested.push('uncrossed');addChat('Blutbank',`Zwei ungekreuzte EK sind bereit. Bestand: ${state.bloodInventory.uncrossed}.`);}),{roles:['nurse','doctor']}))el('bloodDialog').close();};el('crossedBtn').onclick=()=>{if(assignTask('2 gekreuzte EK anfordern',20,()=>addBackgroundTask('Bereitstellung 2 gekreuzte EK',100,()=>{state.bloodInventory.crossed+=2;state.bloodRequested.push('crossed');addChat('Blutbank',`Zwei gekreuzte EK sind bereit. Bestand: ${state.bloodInventory.crossed}.`);}),{roles:['nurse','doctor']}))el('bloodDialog').close();};el('giveCrossedEkBtn').onclick=()=>{if(state.bloodInventory.crossed<1){showToast('Kein gekreuztes EK verfügbar.');return;}if(doAction({type:'give_ek',source:'crossed'}))el('bloodDialog').close();};el('giveUncrossedEkBtn').onclick=()=>{if(state.bloodInventory.uncrossed<1){showToast('Kein ungekreuztes EK verfügbar.');return;}if(doAction({type:'give_ek',source:'uncrossed'}))el('bloodDialog').close();};}
function showResults(title,rows){el('resultsTitle').textContent=title;el('resultsContent').innerHTML=`<table class="result-table"><thead><tr><th>Parameter</th><th>Ergebnis</th><th>Normbereich</th></tr></thead><tbody>${rows}</tbody></table>`;el('resultsDialog').showModal();}

function hasUsableAccess(){return [...state.access].some(id=>ACCESS[id]?.suitable||ACCESS[id.split('_').slice(0,2).join('_')]?.suitable);}
function markFirstTherapy(){if(state.firstTherapyAt===null)state.firstTherapyAt=state.elapsed;}
function currentBleedingFinding(){
  const activeCase=getActiveCase();
  if(activeCase.physiology?.model!=='traumatic_hemorrhage')return activeCase.chatFacts?.bleeding||'Es besteht keine kritische äußere Blutung.';
  const loss=Math.round(state.therapies.externalBloodLossMl/50)*50;
  if(state.therapies.tourniquetApplied)return `Das Tourniquet liegt am linken Unterarm. Die spritzende Blutung ist gestoppt. Der äußere Blutverlust wird auf etwa ${loss} ml geschätzt.`;
  if(state.therapies.woundCompressed)return `Der Handstumpf wird komprimiert. Die Blutung ist deutlich schwächer, aber noch nicht sicher gestoppt. Der äußere Blutverlust wird auf etwa ${loss} ml geschätzt.`;
  if(state.therapies.limbElevated)return `Die linke Hand ist hochgelagert. Die Blutung ist etwas schwächer, spritzt aber weiterhin aus dem Stumpf. Der äußere Blutverlust wird auf etwa ${loss} ml geschätzt.`;
  return `Aus dem subtotal amputierten linken Handstumpf blutet es stark und spritzend. Die Blutlache entspricht grob ${loss} ml und wird weiter größer.`;
}
function currentPainFinding(){
  if(getActiveCase().physiology?.model!=='traumatic_hemorrhage')return getActiveCase().chatFacts?.pain;
  const analgesics=['fentanyl','ketamine','morphine','piritramide','sufentanil'];
  const treated=state.therapies.medications.some(m=>analgesics.includes(m.id));
  return treated?'Die Schmerzen sind nach der Analgesie deutlich geringer, aber noch vorhanden.':'Der Patient gibt stärkste Schmerzen an.';
}

const MEDICATIONS=window.TELECARE_MEDICATIONS||{};
const INTERVENTIONS=window.TELECARE_INTERVENTIONS||{};

function caseEffectMultiplier(kind,id){
  const modifiers=getActiveCase()?.treatmentModifiers||{};
  const group=modifiers[kind]||{};
  return Number(group[id]??group.default??1);
}
function scaledMedicationEffect(id){
  const med=MEDICATIONS[id];if(!med?.effect)return null;
  const multiplier=caseEffectMultiplier('medications',id);
  const effect={...med.effect,...(getActiveCase()?.medicationEffectOverrides?.[id]||{})};
  for(const key of ['hr','sys','dia','rr','spo2','iCa','potassium','bleedingReduction'])if(typeof effect[key]==='number')effect[key]*=multiplier;
  return effect;
}
function interventionEffect(id){
  const base=INTERVENTIONS[id]?.effect||{};
  const multiplier=caseEffectMultiplier('interventions',id);
  const effect={...base};
  for(const key of ['support','supportPerRateStep','hrOffset','lactatePerTick','hbImmediate'])if(typeof effect[key]==='number')effect[key]*=multiplier;
  return effect;
}
function applyMedicationEffect(id){
  const med=MEDICATIONS[id];const effect=scaledMedicationEffect(id);if(!med||!effect)return;
  if(effect.iCa)state.patient.iCa=clamp(state.patient.iCa+effect.iCa,0.8,1.5);
  if(effect.potassium)state.patient.potassium=clamp(Number(state.patient.potassium||4.0)+effect.potassium,2.0,6.5);
  state.therapies.medicationEffects.push({...effect,id,until:state.elapsed+effect.duration});
  if(effect.paralysis){state.therapies.paralyzedUntil=Math.max(state.therapies.paralyzedUntil,state.elapsed+effect.duration);addChat('Team vor Ort',`${med.label}: neuromuskuläre Blockade wirksam. Keine Sedierung oder Analgesie. ${state.therapies.ventilation?'Beatmung läuft.':'Ohne Beatmung drohen Apnoe und Hypoxämie.'}`);}
}

function doAction(action){
  const type=action.type;
  if(type==='measure_nibp'){state.assessment.add('C_bp');return measureNibp();}
  if(type==='count_rr'){state.assessment.add('B_rr');return countRr();}
  if(type==='measure_temp'){state.assessment.add('E_exposure');return measureTemp();}
  if(type==='ask_mental'){state.assessment.add('D_mental');addChat(teamMemberName('nurse'),`${getActiveCase().patient.sex==='weiblich'?'Die Patientin':'Der Patient'} ist aktuell ${state.patient.mental}.`);return true;}
  if(type==='ask_skin'){state.assessment.add('C_skin');const refill=getActiveCase().physiology?.model==='traumatic_hemorrhage'?4:state.patient.sys<80?4:3;addChat(teamMemberName('nurse',1),`Die Haut ist ${getActiveCase().patient.visible.skin}. Rekapillarisierungszeit etwa ${refill} Sekunden.`);return true;}
  if(type==='ask_drainage'){state.assessment.add('C_bleeding');const visible=getActiveCase().patient.visible;if(visible.bleedingDescription)addChat(teamMemberName('nurse'),currentBleedingFinding());else if(visible.drainageDescription)addChat(teamMemberName('nurse'),`Die Drainage fördert weiter ${visible.drainageDescription}, grob ${Math.round(visible.drainageBaseMl+state.elapsed*visible.drainagePerSecondMl)} ml seit Fallbeginn.`);else addChat(teamMemberName('nurse'),'Es besteht keine kritische äußere Blutung und keine blutführende Drainage.');return true;}
  if(type==='ask_urine'){state.assessment.add('C_urine');addChat(teamMemberName('nurse',1),getActiveCase().chatFacts?.urine||(state.access.has('bladder')?(getActiveCase().patient.visible.observationDescription||'Seit Anlage nur geringe Urinmenge.'):'Ohne DK ist die Diurese nicht quantifiziert.'));return true;}
  if(type==='ask_allergy'){state.assessment.add('S_allergy');addChat(teamMemberName('nurse'),getActiveCase().history.allergy);return true;}
  if(type==='ask_auscultation'){state.assessment.add('B_auscultation');logEvent('Auskultationsbefund erhoben.');const c=getActiveCase(),d=c.diagnostics;const anaphylaxis=c.physiology?.model==='anaphylaxis';const finding=anaphylaxis&&state.therapies.intubated?'Der Endotrachealtubus liegt; die kontrollierte Beatmung läuft.':anaphylaxis&&state.therapies.adrenalineNebulizedUntil>state.elapsed?'Der inspiratorische Stridor ist nach der Verneblung deutlich leiser.':state.therapies.pulmonaryEdema&&d.pulmonaryEdemaAuscultation?d.pulmonaryEdemaAuscultation:d.auscultation;addChat('Team vor Ort',`Auskultation: ${finding}`);return true;}
  if(type==='measure_bz'){state.assessment.add('D_glucose');return assignTask('Blutzucker messen',15,()=>{state.lastMeasurements.bz={value:Math.round(state.patient.glucose),time:state.elapsed};addChat(getActiveCase().staff.find(x=>x.role==='nurse')?.name||'Pflege',`Blutzucker: ${Math.round(state.patient.glucose)} mg/dl.`);},{roles:['nurse','doctor']});}
  if(type==='alert_surgeon'){const activeCase=getActiveCase();const septic=activeCase.physiology?.model==='sepsis';const label=activeCase.escalation?.label||(septic?'Intensivmedizinisches Schockteam alarmieren':'Operateur und Anästhesie alarmieren');return assignTask(label,15,()=>{state.escalationAt=state.elapsed;addChat(activeCase.staff.find(x=>x.role==='doctor')?.name||'Arzt',activeCase.escalation?.response||(septic?'Das intensivmedizinische Schockteam ist informiert und auf dem Weg.':'Operateur und Anästhesie sind informiert und auf dem Weg.'));const preparationSeconds=Number(activeCase.escalation?.preparationSeconds||0);if(preparationSeconds>0)addTimedTask('Herzkatheterlabor vorbereiten',preparationSeconds,()=>addChat('Herzkatheterlabor','Das Herzkatheterlabor ist vorbereitet und kann den Patienten übernehmen.'),'Organisation');},{roles:['doctor']});}
  if(type==='shock_position'){const person=getActiveCase().patient.sex==='weiblich'?'Die Patientin':'Der Patient';if(state.therapies.shockPositionUntil>state.elapsed){addChat(teamMemberName('nurse'),`${person} befindet sich bereits in Schocklage.`);return true;}const cfg=INTERVENTIONS.shock_position,effect=interventionEffect('shock_position');return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.shockPositionAt=state.therapies.shockPositionAt??state.elapsed;state.therapies.shockPositionUntil=state.elapsed+(effect.duration||180);markFirstTherapy();addChat(teamMemberName('nurse'),'Schocklage ist hergestellt. Der venöse Rückstrom und der Blutdruck verbessern sich vorübergehend.');},{roles:cfg.roles});}
  if(type==='limb_elevation'){if(getActiveCase().physiology?.model!=='traumatic_hemorrhage'){addChat('Team vor Ort','Eine verletzte Extremität zum Hochlagern ist in diesem Fall nicht hinterlegt.');return false;}if(state.therapies.limbElevated){addChat('Team RTW','Die verletzte linke Hand ist bereits hochgelagert.');return true;}const cfg=INTERVENTIONS.limb_elevation;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.limbElevated=true;state.therapies.limbElevatedAt=state.elapsed;markFirstTherapy();addChat('Team RTW','Die verletzte linke Hand ist hochgelagert. Die Blutung wird etwas schwächer, bleibt aber weiterhin kritisch.');},{roles:cfg.roles});}
  if(type==='wound_compression'){if(getActiveCase().physiology?.model!=='traumatic_hemorrhage'){addChat('Team vor Ort','Eine komprimierbare äußere Blutung ist in diesem Fall nicht hinterlegt.');return false;}if(state.therapies.woundCompressed||state.therapies.tourniquetApplied){addChat('Team RTW',state.therapies.tourniquetApplied?'Die Blutung ist bereits mit dem Tourniquet kontrolliert.':'Der Handstumpf wird bereits komprimiert.');return true;}const cfg=INTERVENTIONS.wound_compression;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.woundCompressed=true;state.therapies.woundCompressionAt=state.elapsed;markFirstTherapy();addChat('Team RTW','Der Handstumpf wird komprimiert. Die Blutung nimmt deutlich ab, ist aber noch nicht sicher gestoppt.');},{roles:cfg.roles});}
  if(type==='tourniquet'){if(getActiveCase().physiology?.model!=='traumatic_hemorrhage'){addChat('Team vor Ort','Eine Tourniquet-Anlage ist in diesem Fall nicht vorgesehen.');return false;}if(state.therapies.tourniquetApplied){addChat('Team RTW',`Das Tourniquet liegt bereits seit ${formatTime(state.therapies.tourniquetAt)} und die spritzende Blutung ist gestoppt.`);return true;}const cfg=INTERVENTIONS.tourniquet;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.tourniquetApplied=true;state.therapies.tourniquetAt=state.elapsed;markFirstTherapy();addChat('Team RTW',`Das Tourniquet liegt am linken Unterarm. Die spritzende Blutung ist gestoppt; die Anlagezeit ${formatTime(state.therapies.tourniquetAt)} ist dokumentiert.`);},{roles:cfg.roles});}
  if(type==='insert_artery'){const a=ACCESS.artery;if(!accessAllowed('artery')){addChat('Team vor Ort','Eine arterielle Kanüle ist in diesem Setting nicht verfügbar.');return false;}if(state.access.has('artery')){addChat(teamMemberName('doctor'),'Eine arterielle Kanüle liegt bereits.');return true;}return assignTask('Arterielle Kanüle legen',a.duration,()=>{state.access.add('artery');addChat(teamMemberName('doctor'),'Die arterielle Kanüle liegt; der Blutdruck wird kontinuierlich angezeigt.');},{roles:['doctor']});}
  if(type==='ventilate'){if(state.therapies.ventilation){addChat('Team vor Ort','Die kontrollierte Beatmung läuft bereits.');return true;}const cfg=INTERVENTIONS.ventilation;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.ventilation=true;markFirstTherapy();},{roles:cfg.roles});}
  if(type==='sono'){return requestSono();}
  if(type==='insert_pvk'){const qty=clamp(Number(action.quantity||1),1,2),size=['pink','green','orange'].includes(action.size)?action.size:'green',id=`pvk_${size}`,a=ACCESS[id];if(!accessAllowed(id)){addChat('Team vor Ort',`${a.label} ist in diesem Setting nicht verfügbar.`);return false;}let started=0;for(let i=0;i<qty;i++){if(assignTask(`${a.label} legen`,a.duration,()=>{state.access.add(`${id}_${Date.now()}_${Math.random()}`);},{roles:['doctor','nurse']}))started++;}return started>0;}
  if(type==='oxygen'){if(state.therapies.oxygen){addChat(teamMemberName('nurse'),'Sauerstoff läuft bereits.');return true;}const cfg=INTERVENTIONS.oxygen;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.oxygen=true;markFirstTherapy();},{roles:cfg.roles});}
  if(type==='upper_body_elevated'){if(state.therapies.upperBodyElevated){addChat('Team vor Ort','Der Oberkörper ist bereits hochgelagert.');return true;}const cfg=INTERVENTIONS.upper_body_elevated;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.upperBodyElevated=true;addChat('Team vor Ort','Der Oberkörper ist hochgelagert; der Patient empfindet die Atmung als etwas leichter.');},{roles:cfg.roles});}
  if(type==='defib_pads'){if(state.therapies.defibPads){addChat('Team vor Ort','Die Defibrillationselektroden kleben bereits.');return true;}const cfg=INTERVENTIONS.defib_pads;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.defibPads=true;addChat('Team vor Ort','Die Defibrillationselektroden sind präventiv angebracht und am Patientensymbol sichtbar.');},{roles:cfg.roles});}
  if(type==='stop_trigger'){if(getActiveCase().physiology?.model!=='anaphylaxis'){addChat('Team vor Ort','In diesem Fall läuft keine Cefuroximzufuhr.');return false;}if(!state.therapies.cefuroximeRunning){addChat('Team vor Ort','Die Cefuroximzufuhr ist bereits gestoppt und diskonnektiert.');return true;}const cfg=INTERVENTIONS.stop_trigger;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.cefuroximeRunning=false;state.therapies.triggerStoppedAt=state.elapsed;markFirstTherapy();addChat('Team vor Ort','Die Cefuroximzufuhr ist gestoppt und die Leitung diskonnektiert.');},{roles:cfg.roles});}
  if(type==='adrenaline_im'){if(getActiveCase().physiology?.model!=='anaphylaxis'){addChat('Team vor Ort','Die fallbezogene Standardgabe Adrenalin i.m. ist nur im Anaphylaxie-Fall verfügbar.');return false;}const cfg=INTERVENTIONS.adrenaline_im,effect=interventionEffect('adrenaline_im');return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.adrenalineImAt=state.therapies.adrenalineImAt??state.elapsed;state.therapies.adrenalineImUntil=Math.max(state.therapies.adrenalineImUntil,state.elapsed+(effect.duration||330));state.therapies.adrenalineImCount+=1;state.therapies.medications.push({id:'adrenaline_im',label:'Adrenalin 0,5 mg i.m.',time:state.elapsed});markFirstTherapy();addChat('Team vor Ort','Adrenalin 0,5 mg wurde intramuskulär in den Oberschenkel gegeben. Kreislauf und Atemweg werden engmaschig beobachtet.');},{roles:cfg.roles});}
  if(type==='adrenaline_nebulized'){if(getActiveCase().physiology?.model!=='anaphylaxis'){addChat('Team vor Ort','Die Adrenalin-Verneblung ist in diesem Fall nicht vorgesehen.');return false;}const cfg=INTERVENTIONS.adrenaline_nebulized,effect=interventionEffect('adrenaline_nebulized');return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.adrenalineNebulizedAt=state.therapies.adrenalineNebulizedAt??state.elapsed;state.therapies.adrenalineNebulizedUntil=Math.max(state.therapies.adrenalineNebulizedUntil,state.elapsed+(effect.duration||300));state.therapies.medications.push({id:'adrenaline_nebulized',label:'Adrenalin vernebelt',time:state.elapsed});markFirstTherapy();addChat('Team vor Ort','Adrenalin wird vernebelt. Der inspiratorische Stridor wird allmählich leiser.');},{roles:cfg.roles});}
  if(type==='intubate'){if(getActiveCase().physiology?.model!=='anaphylaxis'){addChat('Team vor Ort','Die fallbezogene Intubationssequenz ist hier nicht verfügbar.');return false;}if(state.therapies.intubated){addChat('Team vor Ort','Die Patientin ist bereits endotracheal intubiert.');return true;}const cfg=INTERVENTIONS.intubate;return assignTeamTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.intubated=true;state.therapies.intubationAt=state.elapsed;state.therapies.ventilation=true;state.therapies.paralyzedUntil=Math.max(state.therapies.paralyzedUntil,state.elapsed+420);state.therapies.postIntubationHypotensionUntil=state.elapsed+90;state.therapies.medications.push({id:'propofol',label:'Propofol 30 mg i.v.',time:state.elapsed},{id:'sufentanil',label:'Sufentanil 30 µg i.v.',time:state.elapsed},{id:'rocuronium',label:'Rocuronium 100 mg i.v.',time:state.elapsed});markFirstTherapy();addChat('Team vor Ort','Die Patientin ist intubiert und wird kontrolliert beatmet. Direkt nach der Einleitung fällt der arterielle Blutdruck erneut deutlich ab.');});}
  if(type==='warming'){if(state.therapies.warming){addChat(teamMemberName('nurse',1),'Aktiver Wärmeerhalt läuft bereits.');return true;}const cfg=INTERVENTIONS.warming;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.warming=true;markFirstTherapy();},{roles:cfg.roles});}
  if(type==='fluid'){if(!hasUsableAccess()){addChat('Team vor Ort','Volumen ist ohne geeigneten Gefäßzugang nicht möglich.');return false;}const activeCase=getActiveCase(),cfg=INTERVENTIONS.fluid_500,effect=interventionEffect('fluid_500');const allowed=[250,500,1000],volumeMl=allowed.includes(Number(action.volumeMl))?Number(action.volumeMl):500;const duration=cfg.taskSeconds;return assignTask(`${volumeMl} ml Kristalloid verabreichen`,duration,()=>{const fluidDuration=Number(activeCase.physiology?.fluidDurationSeconds||effect.duration||180);const units=volumeMl/500;state.therapies.fluidEffects.push({start:state.elapsed,end:state.elapsed+fluidDuration,duration:fluidDuration,units});state.therapies.crystalloidMl+=volumeMl;state.patient.hb=clamp(state.patient.hb+(effect.hbImmediate||0)*units,4.0,17.5);markFirstTherapy();const total=state.therapies.crystalloidMl;const cardiogenic=activeCase.physiology?.model==='cardiogenic';const dehydrated=activeCase.physiology?.model==='dehydration';const threshold=Number(activeCase.physiology?.fluidOverloadThresholdMl||Infinity);if(cardiogenic&&total>threshold&&!state.therapies.pulmonaryEdema){state.therapies.pulmonaryEdema=true;logEvent('Klinische Verschlechterung nach weiterer Volumengabe.','warning');addChat('Team vor Ort','Herr Gronen klagt jetzt über deutlich zunehmende Atemnot. Beim Atmen ist ein brodelndes Geräusch hörbar; auskultatorisch bestehen neu beidseitige Rasselgeräusche.','system');}else addChat(activeCase.staff.find(x=>x.role==='nurse')?.name||'Team vor Ort',`${volumeMl} ml Kristalloid sind verabreicht. Gesamtmenge: ${total} ml.${cardiogenic&&total<=500?' Der Blutdruck reagiert moderat.':dehydrated?' Kreislauf und Vigilanz reagieren zunehmend auf die Volumentherapie.':' Der Volumeneffekt summiert sich.'}`);},{roles:cfg.roles});}
  if(type==='norepi_bolus'){if(!hasUsableAccess()){addChat(teamMemberName('doctor'),'Für Noradrenalin fehlt ein geeigneter Gefäßzugang.');return false;}const cfg=INTERVENTIONS.norepi_bolus,effect=interventionEffect('norepi_bolus');return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.norepiBolusUntil=state.elapsed+(effect.duration||60);markFirstTherapy();addChat(teamMemberName('doctor'),'Noradrenalin 5 µg i.v. als Bolus gegeben; die simulierte Wirkung hält etwa eine Minute an.');},{roles:cfg.roles});}
  if(type==='norepi_perfusor'){if(!hasUsableAccess()){addChat(teamMemberName('doctor'),'Für den Noradrenalin-Perfusor fehlt ein geeigneter Gefäßzugang.');return false;}if(state.therapies.norepiPerfusor){addChat(teamMemberName('doctor'),'Der Noradrenalin-Perfusor läuft bereits.');return true;}const cfg=INTERVENTIONS.norepi_perfusor;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.norepiPerfusor=true;state.therapies.norepiStandby=false;state.therapies.norepiRate=2;markFirstTherapy();addChat(teamMemberName('doctor'),'Noradrenalin-Perfusor läuft mit 0,05 µg/kg/min. Die Dosis kann am Monitor angepasst werden.');},{roles:cfg.roles});}
  if(type==='txa'){if(!hasUsableAccess()){addChat(teamMemberName('nurse'),'Für Tranexamsäure fehlt ein geeigneter Gefäßzugang.');return false;}if(state.therapies.txa){addChat(teamMemberName('nurse'),'Tranexamsäure wurde bereits gegeben.');return true;}const cfg=INTERVENTIONS.txa;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.therapies.txa=true;state.therapies.txaAt=state.elapsed;markFirstTherapy();addChat(teamMemberName('nurse'),'Tranexamsäure 1 g i.v. wurde verabreicht.');},{roles:cfg.roles});}
  if(type==='give_medication'){const med=MEDICATIONS[action.medication];if(!med){addChat('Team vor Ort','Dieses Medikament ist im Simulator nicht hinterlegt.');return false;}const displayLabel=getActiveCase().medicationDefaults?.[action.medication]||med.label;if(!hasUsableAccess()&&med.requiresAccess){addChat('Team vor Ort',`Für ${displayLabel} fehlt ein geeigneter Gefäßzugang.`);return false;}return assignTask(`${displayLabel} verabreichen`,med.taskSeconds,()=>{state.therapies.medications.push({id:action.medication,label:displayLabel,time:state.elapsed});if(['pip_tazo','ceftriaxone','meropenem'].includes(action.medication)&&!state.therapies.antibioticAt)state.therapies.antibioticAt=state.elapsed;applyMedicationEffect(action.medication);markFirstTherapy();addChat(getActiveCase().staff.find(x=>x.role==='nurse')?.name||'Pflege',`${displayLabel} wurde verabreicht. Die simulierte physiologische Wirkung ist aktiv.`);},{roles:['nurse','doctor']});}
  if(type==='request_lab'){return requestLab(action.labs||[]);}
  if(type==='request_bga'){return requestBga(action.mode==='arterial'?'arterial':'venous');}
  if(type==='request_ecg'){return requestEcg();}
  if(type==='give_ek'){
    if(!resourceAvailable('blood')){addChat('Team vor Ort','Blutprodukte stehen im Rettungswagen nicht zur Verfügung.');return false;}
    if(!hasUsableAccess()){addChat(teamMemberName('nurse'),'Für die Transfusion fehlt ein geeigneter Gefäßzugang.');return false;}
    const requestedSource=action.source;const source=requestedSource&&state.bloodInventory[requestedSource]>0?requestedSource:state.bloodInventory.crossed>0?'crossed':state.bloodInventory.uncrossed>0?'uncrossed':null;if(!source){addChat(teamMemberName('doctor'),'Es ist aktuell kein EK vor Ort. Bitte zuerst EK anfordern.');return false;}
    const cfg=INTERVENTIONS.blood_unit;return assignTask(cfg.label,cfg.taskSeconds,()=>{state.bloodInventory[source]-=1;state.therapies.bloodUnitsGiven+=1;const effect=interventionEffect('blood_unit');state.patient.hb=clamp(state.patient.hb+(effect.hbImmediate||0.7),3,12);markFirstTherapy();addChat(teamMemberName('nurse'),`Ein EK wurde transfundiert. Verbleibender Bestand: ${state.bloodInventory.crossed+state.bloodInventory.uncrossed}.`);},{roles:cfg.roles});
  }
  return false;
}

function normalizeChatText(value){
  return String(value||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/µ/g,'u')
    .replace(/ß/g,'ss')
    .replace(/[^a-z0-9.,/+\-\s?]/g,' ')
    .replace(/(\d)\s*(ml|mg|g|ve)\b/g,'$1 $2')
    .replace(/\s+/g,' ')
    .trim();
}
function isQuestionLike(q){
  return /\?$/.test(q)||/^(wie|ist|sind|hat|haben|kann|konnen|soll|sollen|darf|durfen|braucht|liegt|liegen|gibt|welch|was|wo|warum)\b/.test(q);
}
function accessDescription(){
  const labels=[];
  if([...state.access].some(id=>id.startsWith('pvk_pink')))labels.push('ein rosa peripherer Venenzugang');
  if([...state.access].some(id=>id.startsWith('pvk_green')))labels.push('ein grüner peripherer Venenzugang');
  if([...state.access].some(id=>id.startsWith('pvk_orange')))labels.push('ein orangefarbener peripherer Venenzugang');
  if(state.access.has('artery'))labels.push('eine arterielle Kanüle');
  if(state.access.has('zvk'))labels.push('ein ZVK');
  if(state.access.has('shaldon'))labels.push('ein Shaldon-Katheter');
  if(state.access.has('bladder'))labels.push('ein Blasenkatheter');
  if(!labels.length)return 'Aktuell liegt kein Gefäßzugang.';
  return `Aktuell liegen ${labels.join(', ').replace(/, ([^,]*)$/, ' und $1')}.`;
}
function localInterpret(raw){
  const q=normalizeChatText(raw),a=[],question=isQuestionLike(q);
  const anaphylaxis=getActiveCase().physiology?.model==='anaphylaxis';
  const traumatic=getActiveCase().physiology?.model==='traumatic_hemorrhage';
  const command=/(bitte|jetzt|legen|leg|legt|anlage|anlegen|platzieren|platzier|kleben|kleb|hochlager|geben|gib|verabreichen|anhangen|starten|starte|lauf|laufen|bolus|perfusor|abnehmen|bestimmen|messen|schreiben|mach|durchfuhren|stoppen|stopp|abdrehen|diskonnekt|entfernen|intubier|sichern|abbind|komprimier|druck ausub|druck drauf)/.test(q);

  if(/\b(blutkultur(?:en)?|bk)\b/.test(q)&&(!question||command))a.push({type:'request_lab',labs:['blood_cultures']});
  if(/\b(urinkultur)\b/.test(q)&&(!question||command))a.push({type:'request_lab',labs:['urine_culture']});
  if(/(?:nibp|nichtinvasiv.*blutdruck|blutdruck.*mess|rr.*mess)/.test(q)&&(!question||command))a.push({type:'measure_nibp'});
  if(/(?:atemfrequenz|\baf\b).*(?:zahl|mess|bestimm)|(?:zahl|mess|bestimm).*(?:atemfrequenz|\baf\b)/.test(q)&&(!question||command))a.push({type:'count_rr'});
  if(/temperatur.*(?:mess|bestimm)|(?:mess|bestimm).*temperatur/.test(q)&&(!question||command))a.push({type:'measure_temp'});
  if(/bewusst|orientiert|gcs|ansprech|vigilanz|somnolent|wachheit/.test(q))a.push({type:'ask_mental'});
  if(/haut|rekap|kapillar/.test(q))a.push({type:'ask_skin'});
  if(/drainage|blutverlust|blutung/.test(q))a.push({type:'ask_drainage'});
  if(/urin|ausscheid/.test(q))a.push({type:'ask_urine'});
  if(/allerg/.test(q))a.push({type:'ask_allergy'});
  if(/auskult|abhoren|atemgerausch|herztone/.test(q))a.push({type:'ask_auscultation'});
  if(/\bbz\b|blutzucker|glukose.*mess|zucker.*mess/.test(q))a.push({type:'measure_bz'});

  if(!question){
    if(anaphylaxis&&/\bcefuroxim\b/.test(q)&&/(stopp|abdrehen|abstopsel|diskonnekt|abhang|entfern|zufuhr aus|infusion aus)/.test(q))a.push({type:'stop_trigger'});
    if(anaphylaxis&&/(\bintubier|atemweg.*sicher|endotracheal)/.test(q))a.push({type:'intubate'});
    if(anaphylaxis&&/\b(adrenalin|epinephrin)\b/.test(q)){
      if(/vernebel|inhalier|inhalativ|nebul/.test(q))a.push({type:'adrenaline_nebulized'});
      else if(!/(intravenos|\bi\.?\s*v\.?\b)/.test(q))a.push({type:'adrenaline_im'});
    }
    if(traumatic&&/\b(tourniquet|tournique|abbindesystem|\bcat\b)|(?:arm|unterarm|extremitat|hand).*(?:abbind|abbinden)/.test(q))a.push({type:'tourniquet'});
    if(traumatic&&(/\b(druckverband|kompression)\b/.test(q)||/(wunde|stumpf|blutung).*(komprimier|druck ausub|druck drauf|abdruck|druckverband)|(?:komprimier|druck ausub|druck drauf|druckverband).*(wunde|stumpf|blutung)/.test(q)))a.push({type:'wound_compression'});
    if(traumatic&&/(?:hand|arm|unterarm|extremitat).*(hoch|anheb)|(?:hochlag|anheb).*(?:hand|arm|unterarm|extremitat)/.test(q))a.push({type:'limb_elevation'});
    if(/operateur|chirurg|op team|anasthesie.*alarm|intensiv|schockraum|traumazentrum|zielklinik|transport.*vorbereit|voranmeld|hilfe.*holen|oberarzt|herzkatheter|katheterlabor|\bhkl\b|kardiolog/.test(q))a.push({type:'alert_surgeon'});
    if(/\bbga\b|blutgasanalyse/.test(q)){
      if(/arteriell|arterielle|\bart\b/.test(q))a.push({type:'request_bga',mode:'arterial'});
      else if(/venos|venose/.test(q))a.push({type:'request_bga',mode:'venous'});
    }
    if(/\b(arterie|arterielle kanule|arterieller zugang)\b/.test(q)&&command)a.push({type:'insert_artery'});
    else if(/\b(pvk|viggo|venflon|braunule|peripherer? venenzugang)\b/.test(q)||(/\bzugang\b/.test(q)&&command)){
      a.push({type:'insert_pvk',quantity:/\b(zwei|2)\b/.test(q)?2:1,size:/orange/.test(q)?'orange':/rosa|pink/.test(q)?'pink':'green'});
    }
    if(/sauerstoff|\bo2\b/.test(q))a.push({type:'oxygen'});
    if(/oberkorper.*hoch|hoch.*oberkorper|herzbettlager|atemerleichternde.*lager/.test(q))a.push({type:'upper_body_elevated'});
    if(/defi.*(?:pad|patch|elektrode)|(?:pad|patch|elektrode).*defi|paddles.*kleb/.test(q))a.push({type:'defib_pads'});
    if(/beatm|ambu|beutel.?maske/.test(q))a.push({type:'ventilate'});
    if(/sono|ultraschall|pocus|focus|fast(?: test)?/.test(q))a.push({type:'sono'});
    if(/(?:12.?kanal.)?ekg/.test(q)&&command)a.push({type:'request_ecg'});
    if(/warm|decke|hypotherm/.test(q))a.push({type:'warming'});
    if(/schocklage|beine.*hoch|beine.*anheb|autotransfusion/.test(q))a.push({type:'shock_position'});
    if(/\b(kristall|kristalloid|volumen|ringer|nacl|elektrolyt|ve)\b/.test(q)||/\b(250|500|1000)\s*(?:ml|ve)\b/.test(q))a.push({type:'fluid',volumeMl:/\b1000\s*(?:ml|ve)\b|\b1\s*l(?:iter)?\b/.test(q)?1000:/\b250\s*(?:ml|ve)\b/.test(q)?250:500});
    if(/tranexam|\btxa\b/.test(q))a.push({type:'txa'});
    if(/(?:antibiose|antibiotikum|antibiotika).*(?:geben|start|verabreich|anhang|anord)|^(?:antibiose|antibiotikum|antibiotika)$/.test(q))a.push({type:'give_medication',medication:'pip_tazo'});
    if(/\b(nor|noradrenalin|norepi|norepinephrin)\b/.test(q)){
      if(/bolus/.test(q))a.push({type:'norepi_bolus'});else a.push({type:'norepi_perfusor'});
    }
    if(/\bek\b|erythro|transfund|blutkonserve/.test(q))a.push({type:'give_ek'});
    for(const [medId,med] of Object.entries(MEDICATIONS)){
      const aliases=[med.label,...(med.aliases||[])].map(normalizeChatText);
      if(medId==='adrenaline'&&/\b(nor|noradrenalin|norepi)\b/.test(q))continue;
      if(medId==='adrenaline'&&anaphylaxis&&!/(intravenos|\bi\.?\s*v\.?\b)/.test(q))continue;
      if(aliases.some(alias=>alias&&q.includes(alias))&&!a.some(x=>x.type==='give_medication'&&x.medication===medId)){
        if(medId==='glucose'&&/(mess|bestimm|kontroll)/.test(q))continue;
        a.push({type:'give_medication',medication:medId});
      }
    }
  }
  return a.filter((x,i,arr)=>arr.findIndex(y=>JSON.stringify(y)===JSON.stringify(x))===i);
}
function trackAssessmentFromText(q){
  if(/sepsis|septisch|septischer schock|urosepsis/.test(q)){state.assessment.add('sepsis_recognized');if(state.sepsisRecognizedAt===null)state.sepsisRecognizedAt=state.elapsed;}
  if(/stemi|myokardinfarkt|herzinfarkt|kardiogen(?:er|en)? schock/.test(q)){state.assessment.add('cardiogenic_recognized');if(state.diagnosisRecognizedAt===null)state.diagnosisRecognizedAt=state.elapsed;}
  if(/anaphylax|anaphylakt|allergischer schock/.test(q)){state.assessment.add('anaphylaxis_recognized');if(state.anaphylaxisRecognizedAt===null)state.anaphylaxisRecognizedAt=state.elapsed;}
  if(/hamorrhag|hypovolam|blutverlust.*schock|schock.*blutverlust|verblut/.test(q)){state.assessment.add('hemorrhage_recognized');if(state.hemorrhageRecognizedAt===null)state.hemorrhageRecognizedAt=state.elapsed;}
  const checks=[
    [/atemweg|stridor|mund.*frei|airway/, 'A_airway'],
    [/auskult|abhören|atemgeräusch|herztöne/, 'B_auscultation'],
    [/atemfrequenz|\baf\b/, 'B_rr'],
    [/sättigung|spo2|oxygenierung/, 'B_spo2'],
    [/blutdruck|\bnibp\b|\brr\b/, 'C_bp'],
    [/haut|rekap|kapillar/, 'C_skin'],
    [/drainage|blutung|blutverlust/, 'C_bleeding'],
    [/puls|herzfrequenz|\bhf\b/, 'C_pulse'],
    [/urin|diurese|ausscheid/, 'C_urine'],
    [/bewusst|orientiert|gcs|ansprech|vigilanz|somnolent|wachheit/, 'D_mental'],
    [/\bbz\b|blutzucker|glukose.*mess/, 'D_glucose'],
    [/temperatur|entkleid|untersuch.*körper|verletzung/, 'E_exposure'],
    [/symptom|beschwer|schmerz|übel|schwindel/, 'S_symptoms'],
    [/allerg/, 'S_allergy'],
    [/medikament|dauermed|medikation/, 'S_medication'],
    [/vorgeschichte|vorerkrank|krankheit|operationen/, 'S_history'],
    [/letzte.*mahlzeit|zuletzt.*gegessen|nahrung|nüchtern/, 'S_lastmeal'],
    [/ereignis|was.*passiert|beginn|seit wann|verlauf/, 'S_events'],
    [/risiko|antikoag|gerinnungshem|blutverdünn|rauchen|thrombose/, 'S_risk']
  ];
  checks.forEach(([re,key])=>{if(re.test(q))state.assessment.add(key);});
}


function getCaseAnswer(q){
  const c=getActiveCase();
  const f=c.chatFacts||{};
  const anaphylaxis=c.physiology?.model==='anaphylaxis';
  const traumatic=c.physiology?.model==='traumatic_hemorrhage';
  const airwayFinding=anaphylaxis&&state.therapies.intubated?'Der Atemweg ist endotracheal gesichert; der Tubus liegt und die kontrollierte Beatmung läuft.':anaphylaxis&&state.therapies.adrenalineNebulizedUntil>state.elapsed?'Der inspiratorische Stridor ist nach der Adrenalinverneblung deutlich leiser.':f.airway;
  const breathingFinding=anaphylaxis&&state.therapies.intubated?'Die Patientin ist intubiert und wird kontrolliert beatmet.':f.breathing;
  const answer=(text,key)=>text?{text,key}:null;
  const rules=[
    [/(^|\b)(zugang|zugange|gefasszugang|pvk vorhanden|venenzugang vorhanden)(\b|\?)/,()=>answer(accessDescription(),null)],
    [/(cefuroxim).*(lauf|stopp|abgedreht|diskonnekt)/,()=>answer(state.therapies.cefuroximeRunning?'Die Cefuroximzufuhr läuft noch.':'Die Cefuroximzufuhr ist gestoppt und diskonnektiert.',null)],
    [/(^|\b)(atemweg|atemwege|airway|stridor|mund frei|intubiert|tubus|beatmet)(\b|\?)/,()=>answer(airwayFinding,'A_airway')],
    [/(^|\b)(atmung|breathing|spontanatmung)(\b|\?)/,()=>answer(breathingFinding,'B_rr')],
    [/(auskult|abhören|atemgeräusch|lunge.*hören|herztöne)/,()=>answer(c.diagnostics?.auscultation,'B_auscultation')],
    [/(vigilanz|bewusst|gcs|ansprech|somnolent|orientiert|wachheit)/,()=>answer(f.consciousness||c.patient.initial.mental,'D_mental')],
    [/(pupill)/,()=>answer(f.pupils,'D_mental')],
    [/(haut|rekap|kapillar)/,()=>answer(f.skin||c.patient.visible.skin,'C_skin')],
    [/(tourniquet|tournique|abbindesystem)/,()=>answer(traumatic?(state.therapies.tourniquetApplied?`Das Tourniquet liegt seit ${formatTime(state.therapies.tourniquetAt)} am linken Unterarm; die spritzende Blutung ist gestoppt.`:'Aktuell liegt noch kein Tourniquet. Die Blutung ist weiterhin kritisch.'):null,'C_bleeding')],
    [/(wunde|stumpf|amputat|verletzte hand)/,()=>answer(traumatic?`${f.wound} ${currentBleedingFinding()}`:f.wound,'C_bleeding')],
    [/(kritische.*äußere.*blutung|äußere.*blutung|blutverlust|blutung)/,()=>answer(traumatic?currentBleedingFinding():f.bleeding,'C_bleeding')],
    [/(puls|peripher.*tast)/,()=>answer(f.pulse,'C_pulse')],
    [/(halsvene|jugular)/,()=>answer(f.neckVeins,'C_skin')],
    [/(ödem|oedem)/,()=>answer(f.edema,'C_skin')],
    [/(urin|diurese|ausscheid)/,()=>answer(f.urine||c.patient.visible.observationDescription,'C_urine')],
    [/(infektionsfokus|fokus|urosepsis|harnwegsinfekt)/,()=>answer(f.focus,'S_symptoms')],
    [/(blasenkatheter|dauerkatheter|katheter)/,()=>answer(f.catheter,'S_risk')],
    [/(bauch|abdomen|nierenlager|flanke)/,()=>answer(f.abdomen||c.history.symptoms,'S_symptoms')],
    [/(blutzucker|\bbz\b|glukose)/,()=>answer(c.monitoring?.requireGlucoseMeasurement&&!state.lastMeasurements.bz?'Der Blutzucker wurde noch nicht gemessen.':state.lastMeasurements.bz?`Der zuletzt gemessene Blutzucker beträgt ${state.lastMeasurements.bz.value} mg/dl.`:f.glucose,'D_glucose')],
    [/(temperatur|fieber)/,()=>answer(c.monitoring?.requireTemperatureMeasurement&&!state.lastMeasurements.temp?'Die Körpertemperatur wurde noch nicht gemessen.':state.lastMeasurements.temp?`Die zuletzt gemessene Körpertemperatur beträgt ${state.lastMeasurements.temp.value.toFixed(1)} °C.`:f.temperature,'E_exposure')],
    [/(allerg)/,()=>answer(f.allergy||c.history.allergy,'S_allergy')],
    [/(dauer)?medikament|medikationsplan|nimmt.*medikament/,()=>answer(f.medication||c.history.medication,'S_medication')],
    [/(vorerkrank|vorgeschichte|krankheit)/,()=>answer(f.previousHistory||c.history.previousHistory,'S_history')],
    [/(letzte.*mahlzeit|zuletzt.*gegessen|nahrung|nüchtern)/,()=>answer(f.lastMeal||c.history.lastMeal,'S_lastmeal')],
    [/(seit wann|beginn|ereignis|was.*passiert|verlauf)/,()=>answer(f.events||c.history.events,'S_events')],
    [/(risikofaktor|risiko)/,()=>answer(f.riskFactors||c.history.riskFactors,'S_risk')],
    [/(schmerz|schmerzen)/,()=>answer(traumatic?currentPainFinding():f.pain,'S_symptoms')],
    [/(symptom|beschwer|schmerz|übel|erbrochen)/,()=>answer(f.symptoms||c.history.symptoms,'S_symptoms')],
    [/(sono|ultraschall|pocus|focus|fast(?:-test)?)/,()=>answer(c.diagnostics?.sono,null)],
    [/(ekg|rhythmus)/,()=>answer(c.diagnostics?.ecg,null)]
  ];
  for(const [re,fn] of rules){if(re.test(q)){const hit=fn();if(hit)return hit;}}
  return null;
}

function latestKnownLabs(){
  const latest={};
  state.labResults.forEach(result=>(result.values||[]).forEach(v=>{if(v?.id)latest[v.id]=v.value;}));
  return latest;
}
function medicationMentioned(q,medId){const med=MEDICATIONS[medId];if(!med)return false;return [medId,med.label,...(med.aliases||[])].some(x=>q.includes(String(x).toLowerCase()));}
function filterSafeActions(q,actions){return (actions||[]).filter(action=>{if(action.type!=='give_medication')return true;if(action.medication==='pip_tazo'&&/(antibiose|antibiotikum|antibiotika)/.test(q))return true;return medicationMentioned(q,action.medication);});}
function actionMatchesText(raw,action){
  const q=normalizeChatText(raw);
  if(action.type==='adrenaline_im')return /\b(adrenalin|epinephrin)\b/.test(q)&&!/vernebel|inhalier|inhalativ|nebul|intravenos|\bi\.?\s*v\.?\b/.test(q);
  if(action.type==='adrenaline_nebulized')return /\b(adrenalin|epinephrin)\b/.test(q)&&/vernebel|inhalier|inhalativ|nebul/.test(q);
  const patterns={
    insert_pvk:/\b(pvk|viggo|venflon|braunule|venenzugang|zugang)\b/,
    insert_artery:/\b(arterie|arterielle kanule|arterieller zugang)\b/,
    fluid:/\b(kristall|kristalloid|volumen|ringer|nacl|elektrolyt|ve)\b|\b(250|500|1000)\s*(?:ml|ve)\b|\b1\s*l(?:iter)?\b/,
    norepi_bolus:/\b(nor|noradrenalin|norepi|norepinephrin)\b.*\bbolus\b|\bbolus\b.*\b(nor|noradrenalin|norepi)\b/,
    norepi_perfusor:/\b(nor|noradrenalin|norepi|norepinephrin)\b/,
    oxygen:/\b(sauerstoff|o2)\b/,
    upper_body_elevated:/\b(oberkorper|herzbettlager)\b/,
    defib_pads:/\b(defi|pad|patch|elektrode)\b/,
    request_bga:/\b(bga|blutgasanalyse)\b/,
    request_ecg:/\b(ekg|12 kanal)\b/,
    request_lab:/\b(labor|blutkultur|bk|urinkultur)\b/,
    sono:/\b(sono|ultraschall|pocus|focus|fast)\b/,
    give_ek:/\b(ek|erythro|transfusion|blutkonserve)\b/,
    give_medication:/.*/,
    measure_nibp:/\b(nibp|blutdruck|rr)\b/,
    count_rr:/\b(atemfrequenz|af)\b/,
    measure_temp:/\b(temperatur|fieber)\b/,
    measure_bz:/\b(blutzucker|bz|glukose)\b/,
    ventilate:/\b(beatm|ambu|beutel maske)\b/,
    shock_position:/\b(schocklage|beine hoch|autotransfusion)\b/,
    stop_trigger:/\bcefuroxim\b.*(?:stopp|abdrehen|abstopsel|diskonnekt|abhang|entfern|zufuhr aus|infusion aus)/,
    intubate:/\b(intubier|atemweg|endotracheal)\b/,
    warming:/\b(warm|decke|hypotherm)\b/,
    txa:/\b(tranexam|txa)\b/,
    tourniquet:/\b(tourniquet|tournique|abbindesystem|cat)\b|(?:arm|unterarm|extremitat|hand).*(?:abbind|abbinden)/,
    wound_compression:/\b(druckverband|kompression)\b|(?:wunde|stumpf|blutung).*(?:komprimier|druck|druckverband)|(?:komprimier|druckverband).*(?:wunde|stumpf|blutung)/,
    limb_elevation:/(?:hand|arm|unterarm|extremitat).*(?:hoch|anheb)|(?:hochlag|anheb).*(?:hand|arm|unterarm|extremitat)/
  };
  if(action.type==='give_medication')return medicationMentioned(q,action.medication)||(action.medication==='pip_tazo'&&/\b(antibiose|antibiotikum|antibiotika)\b/.test(q));
  return patterns[action.type]?patterns[action.type].test(q):false;
}
function looksLikeMedicationOrder(q){return /(gib|geben|gebe|verabreich|anhäng|anord|starte|starten).{0,35}(mg|g\b|medikament|tablette|i\.v\.|iv\b)|^(paracetamol|fentanyl|morphin|meropenem|ceftriaxon|piperacillin|pip.?taz)/.test(q);}
async function handleChat(text){
  const t=text.trim();if(!t)return;
  addChat('Telekonsultation',t,'user');
  const q=normalizeChatText(t);
  if(/\bvereinbar(?:e|en|t)?\b.*\btermin\b.*\bnachkontrolle\b/.test(q)){
    addChat('Josie Bieber','Patient kommt nächste woche. Slay!');
    return;
  }
  trackAssessmentFromText(q);

  // Eindeutige Aufträge werden zuerst lokal erkannt. Dadurch gibt es keine
  // unnötigen KI-Rückfragen zu Dosis, Zugang oder Applikationsweg.
  if(!resourceAvailable('bga')&&(/\bbga\b|blutgasanalyse/.test(q))){addChat('Team vor Ort','Eine BGA steht im Rettungswagen nicht zur Verfügung.');return;}
  if(!resourceAvailable('lab')&&(/\blabor\b|blutbild|gerinnung|laborwerte/.test(q))){addChat('Team vor Ort','Eine Laboranalyse steht im Rettungswagen nicht zur Verfügung.');return;}
  if(!resourceAvailable('ecg')&&(/\bekg\b|12.?kanal/.test(q))){addChat('Team vor Ort','Ein 12-Kanal-EKG steht in diesem Rettungsdienst-Setting nicht zur Verfügung.');return;}
  const unavailableAccess=[
    ['zvk',/\b(zvk|zentralven)/],
    ['shaldon',/\b(shaldon|dialysekatheter)/],
    ['artery',/\b(arterie|arterielle kanule|arterieller zugang)/],
    ['bladder',/\b(blasenkatheter|dauerkatheter|\bdk\b)/]
  ].find(([,pattern])=>pattern.test(q));
  if(unavailableAccess&&!accessAllowed(unavailableAccess[0])){addChat('Team vor Ort',`${ACCESS[unavailableAccess[0]].label} ist in diesem Rettungsdienst-Setting nicht vorhanden und kann hier nicht angelegt werden.`);return;}
  if(resourceAvailable('bga')&&(/\bbga\b|blutgasanalyse/.test(q))&&!/arteriell|arterielle|art\.|venös|venoes|venöse/.test(q)){
    addChat('Team vor Ort','Soll die BGA arteriell oder venös abgenommen werden?');return;
  }
  if(getActiveCase().physiology?.requiredFluidChoice&&/\b(kristall|kristalloid|volumen|ringer|nacl|elektrolyt|ve)\b/.test(q)&&(!isQuestionLike(q)||/(geben|gib|verabreich|anhang|lauf|bolus|bitte)/.test(q))&&!/\b(250|500|1000)\s*(?:ml|ve)\b|\b1\s*l(?:iter)?\b/.test(q)){
    addChat('Team vor Ort','Welche Menge Kristalloid soll gegeben werden: 250 ml, 500 ml oder 1.000 ml?');return;
  }
  // Eindeutige Aufträge werden vor Befundfragen verarbeitet. So wird z. B.
  // „FAST“, „Viggo“, „500 VE“ oder „Nor Bolus“ als Maßnahme ausgeführt.
  const localActions=localInterpret(q);
  if(localActions.length){localActions.forEach(doAction);return;}
  const direct=getCaseAnswer(q);
  if(direct){if(direct.key)state.assessment.add(direct.key);addChat('Team vor Ort',direct.text);return;}
  if(looksLikeMedicationOrder(q)){addChat('Team vor Ort','Dieses Medikament ist im Simulator nicht verfügbar oder konnte nicht eindeutig erkannt werden. Es wurde kein Ersatzmedikament angeordnet.');return;}

  if(state.aiAvailable){
    const placeholder={time:state.elapsed,sender:'Team vor Ort',text:'KI wertet die Nachricht aus …',cls:'team ai-thinking'};
    state.chat.push(placeholder);renderChat();
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,state:{elapsed:state.elapsed,visiblePatient:{heartRate:Math.round(state.patient.hr),spo2:Math.round(state.patient.spo2),arterialPressure:state.access.has('artery')?`${Math.round(state.patient.sys)}/${Math.round(state.patient.dia)}`:null,lastNibp:state.lastMeasurements.nibp,lastRespiratoryRate:state.lastMeasurements.rr,lastTemperature:hasContinuousTemperature()?state.patient.temp:state.lastMeasurements.temp,consciousness:state.patient.mental,skin:getActiveCase().patient.visible.skin,observation:getActiveCase().patient.visible.bleedingDescription?currentBleedingFinding():getActiveCase().patient.visible.drainageDescription?`${getActiveCase().patient.visible.drainageDescription}, etwa ${Math.round(getActiveCase().patient.visible.drainageBaseMl+state.elapsed*getActiveCase().patient.visible.drainagePerSecondMl)} ml seit Fallbeginn`:getActiveCase().patient.visible.observationDescription},knownLabs:latestKnownLabs(),bgaHistory:state.bgaResults.map(b=>({time:b.time,values:Object.fromEntries(b.values.map(v=>[v[0],v[1]]))})),access:[...state.access],bloodInventory:state.bloodInventory,staff:state.staff.map(s=>({name:s.name,role:s.role,available:s.busyUntil<=state.elapsed})),norepiPerfusor:state.therapies.norepiPerfusor,caseFacts:{sex:getActiveCase().patient.sex,age:getActiveCase().patient.age,history:getActiveCase().history,diagnostics:getActiveCase().diagnostics,chatFacts:getActiveCase().chatFacts||{},briefing:getActiveCase().briefing,initial:getActiveCase().patient.initial,simulationRules:{requiredFluidChoice:Boolean(getActiveCase().physiology?.requiredFluidChoice),resources:getActiveCase().resources||{}}}}})});
      const data=await r.json();state.chat=state.chat.filter(x=>x!==placeholder);if(!r.ok)throw new Error(data.error||'KI-Fehler');
      // Gemini übersetzt freie Formulierungen in standardisierte Aktionen. Jede Aktion
      // wird lokal gegen die tatsächlich genannten Begriffe geprüft, bevor sie ausgeführt wird.
      const safeActions=isQuestionLike(q)?[]:filterSafeActions(q,data.actions||[]).filter(action=>actionMatchesText(q,action));
      if(safeActions.length){safeActions.forEach(doAction);return;}
      if(data.reply)addChat('Team vor Ort',data.reply);
      else addChat('Team vor Ort','Ich habe die Anweisung nicht sicher verstanden. Bitte nennen Sie Maßnahme oder Befund etwas genauer.');
      return;
    }catch(e){
      state.chat=state.chat.filter(x=>x!==placeholder);el('aiStatus').textContent='Gemini gestört';el('aiStatus').className='status-pill idle';const reason=String(e?.message||'Unbekannter API-Fehler').replace(/\s+/g,' ').slice(0,220);addChat('System',`Gemini antwortet momentan nicht (${reason}). Der lokale Regel-Chat übernimmt diese Nachricht; bei der nächsten Anfrage wird Gemini erneut versucht.`,'system');
    }
  }
  addChat(teamMemberName('nurse'),['anaphylaxis','traumatic_hemorrhage','dehydration'].includes(getActiveCase().physiology?.model)&&isQuestionLike(q)?'Das ist uns aktuell nicht bekannt.':'Bitte formulieren Sie die Frage noch etwas konkreter.');
}
async function checkAiStatus(){try{const r=await fetch('/api/status');const d=await r.json();state.aiAvailable=!!d.enabled;el('aiStatus').textContent=state.aiAvailable?'Gemini aktiv':'Regel-Fallback';el('aiStatus').className=`status-pill ${state.aiAvailable?'live':'idle'}`;}catch{state.aiAvailable=false;el('aiStatus').textContent='Regel-Fallback';}}

const NOREPI_RATES=[0.02,0.05,0.10,0.15,0.20];
function adjustNorepi(delta){if(!state.therapies.norepiPerfusor)return;if(delta<0&&state.therapies.norepiStandby)return;if(delta<0&&state.therapies.norepiRate<=1){state.therapies.norepiStandby=true;logEvent('Noradrenalin-Perfusor in Standby versetzt.');addChat('Team vor Ort','Noradrenalin-Perfusor steht jetzt im Standby (0,00 µg/kg/min).');renderAll();return;}if(delta>0&&state.therapies.norepiStandby){state.therapies.norepiStandby=false;state.therapies.norepiRate=1;}else state.therapies.norepiRate=clamp(state.therapies.norepiRate+delta,1,5);const dose=NOREPI_RATES[state.therapies.norepiRate-1];logEvent(`Noradrenalin-Perfusor auf ${dose.toFixed(2)} µg/kg/min eingestellt.`);addChat('Team vor Ort',`Noradrenalin läuft jetzt mit ${dose.toFixed(2)} µg/kg/min.`);renderAll();}
function stopNorepi(){if(!state.therapies.norepiPerfusor)return;state.therapies.norepiPerfusor=false;state.therapies.norepiStandby=false;logEvent('Noradrenalin-Perfusor gestoppt.');addChat('Team vor Ort','Noradrenalin-Perfusor wurde gestoppt.');renderAll();}

function endSimulation(){state.ended=true;state.running=false;clearInterval(state.timer);state.timer=null;stopPulseLoop();stopAlarmLoop();el('pauseBtn').disabled=true;el('startBtn').disabled=true;logEvent(`Simulation nach ${Math.round(SIM_DURATION/60)} Minuten beendet.`);beginEvaluationFlow();}
function makeChart(title,key,color,minValue,maxValue,unit){
  const data=state.vitalHistory.length?state.vitalHistory:[{time:0,[key]:0}];const w=420,h=150,pad=28;
  const values=data.map(d=>Number(d[key]));const min=minValue??Math.min(...values);const max=maxValue??Math.max(...values);const span=Math.max(1,max-min);
  const points=data.map((d,i)=>{const x=pad+(i/(Math.max(1,data.length-1)))*(w-pad*2);const y=h-pad-((Number(d[key])-min)/span)*(h-pad*2);return `${x.toFixed(1)},${y.toFixed(1)}`}).join(' ');
  return `<div class="vital-chart"><h3>${title}</h3><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${title} Verlauf"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="chart-axis"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"/><text x="4" y="${pad+4}" class="chart-label">${Math.round(max)} ${unit}</text><text x="4" y="${h-pad}" class="chart-label">${Math.round(min)}</text><text x="${w-pad-35}" y="${h-7}" class="chart-label">${formatTime(state.elapsed)}</text></svg></div>`;
}

function assessmentList(keys, labels){
  return keys.map(key=>`<li class="${state.assessment.has(key)?'done':'missing'}"><span>${state.assessment.has(key)?'✓':'○'}</span>${escapeHtml(labels[key])}</li>`).join('');
}
function assessmentSummaryHtml(){
  const abcdeLabels={A_airway:'A – Atemwege beurteilt',B_auscultation:'B – Auskultation durchgeführt',B_rr:'B – Atemfrequenz erhoben',B_spo2:'B – Sauerstoffsättigung beurteilt',C_bp:'C – Blutdruck erhoben',C_skin:'C – Haut und Rekapillarisierung beurteilt',C_bleeding:'C – Blutung/Drainage beurteilt',C_pulse:'C – Puls/Herzfrequenz beurteilt',C_urine:'C – Diurese erfragt',D_mental:'D – Bewusstseinslage beurteilt',D_glucose:'D – Blutzucker erhoben',E_exposure:'E – Temperatur/Exposure beurteilt'};
  const samplerLabels={S_symptoms:'S – Symptome/Beschwerden erfragt',S_allergy:'A – Allergien erfragt',S_medication:'M – Medikamente erfragt',S_history:'P – Patientenvorgeschichte erfragt',S_lastmeal:'L – Letzte Nahrungsaufnahme erfragt',S_events:'E – Ereignisse/Verlauf erfragt',S_risk:'R – Risikofaktoren erfragt'};
  return `<details class="summary-details"><summary>Anamnese – ABCDE & SAMPLER</summary><div class="assessment-columns"><div><h3>ABCDE</h3><ul class="assessment-list">${assessmentList(Object.keys(abcdeLabels),abcdeLabels)}</ul></div><div><h3>SAMPLER</h3><ul class="assessment-list">${assessmentList(Object.keys(samplerLabels),samplerLabels)}</ul></div></div></details>`;
}

function buildSavedResult(scorePercent, positives, missing){
  const essentialEvents=state.events.filter(e=>/übernimmt:|abgeschlossen|abgebrochen|alarmiert|transfund|verabreicht|BGA|Labor|Sonografie|Kreislaufstillstand|Schocklage/.test(e.text));
  return {
    clientRunId:state.runId,
    username:participantUsername,
    caseId:activeCaseId,
    caseName:getActiveCase().title,
    difficulty:state.difficulty,
    plannedDurationSeconds:SIM_DURATION,
    elapsedSeconds:state.elapsed,
    outcome:state.dead?`Kreislaufstillstand – ${state.deathReason||'unklar'}`:(state.elapsed>=SIM_DURATION?'regulär beendet':'vorzeitig beendet'),
    scorePercent,
    summary:{
      positives,missing,
      escalationAt:state.escalationAt,
      anaphylaxisRecognizedAt:state.anaphylaxisRecognizedAt,
      hemorrhageRecognizedAt:state.hemorrhageRecognizedAt,
      firstTherapyAt:state.firstTherapyAt,
      crystalloidMl:state.therapies.crystalloidMl,
      bloodUnitsGiven:state.therapies.bloodUnitsGiven,
      lastHb:Number(state.patient.hb.toFixed(1)),
      lastLactate:Number(state.patient.lactate.toFixed(1)),
      medications:state.therapies.medications.map(m=>({id:m.id,label:m.label,time:m.time})),
      assessment:[...state.assessment]
    },
    details:{
      events:state.events.map(e=>({time:e.time,text:e.text,type:e.type})),
      essentialEvents,
      chat:state.chat.map(m=>({time:m.time,sender:m.sender,text:m.text,kind:m.cls})),
      vitals:state.vitalHistory,
      bgaResults:state.bgaResults,
      labResults:state.labResults,
      labsRequested:[...state.labsRequested],
      labsAvailable:[...state.labsAvailable],
      access:[...state.access],
      bloodInventory:state.bloodInventory,
      therapies:{
        oxygen:state.therapies.oxygen,warming:state.therapies.warming,ventilation:state.therapies.ventilation,upperBodyElevated:state.therapies.upperBodyElevated,defibPads:state.therapies.defibPads,pulmonaryEdema:state.therapies.pulmonaryEdema,
        norepiPerfusor:state.therapies.norepiPerfusor,norepiStandby:state.therapies.norepiStandby,norepiRate:state.therapies.norepiRate,
        crystalloidMl:state.therapies.crystalloidMl,bloodUnitsGiven:state.therapies.bloodUnitsGiven,
        txa:state.therapies.txa,txaAt:state.therapies.txaAt,medications:state.therapies.medications,
        limbElevated:state.therapies.limbElevated,limbElevatedAt:state.therapies.limbElevatedAt,
        woundCompressed:state.therapies.woundCompressed,woundCompressionAt:state.therapies.woundCompressionAt,
        tourniquetApplied:state.therapies.tourniquetApplied,tourniquetAt:state.therapies.tourniquetAt,externalBloodLossMl:state.therapies.externalBloodLossMl,
        cefuroximeRunning:state.therapies.cefuroximeRunning,triggerStoppedAt:state.therapies.triggerStoppedAt,
        adrenalineImAt:state.therapies.adrenalineImAt,adrenalineImCount:state.therapies.adrenalineImCount,
        adrenalineNebulizedAt:state.therapies.adrenalineNebulizedAt,shockPositionAt:state.therapies.shockPositionAt,
        intubated:state.therapies.intubated,intubationAt:state.therapies.intubationAt
      },
      caseMetadata:{id:getActiveCase().id,title:getActiveCase().title,number:getActiveCase().number,setting:getActiveCase().setting},
      finalVitals:{hr:state.patient.hr,sys:state.patient.sys,dia:state.patient.dia,spo2:state.patient.spo2,rr:state.patient.rr,temp:state.patient.temp,cvp:state.patient.cvp,mental:state.patient.mental}
    }
  };
}
async function saveSimulationResult(payload,forceRetry=false){if(state.savedResultId)return state.savedResultId;if(state.saveAttempted&&!forceRetry)return null;state.saveAttempted=true;try{const response=await fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Speichern fehlgeschlagen');state.savedResultId=data.id||null;updatePendingEvaluationStorage();return state.savedResultId;}catch(error){state.saveAttempted=false;console.error('Ergebnis konnte nicht gespeichert werden:',error);return null;}}
function calculateSummaryData(){
  const firstMedicationAt=id=>state.therapies.medications.find(m=>m.id===id)?.time??null;
  const abcdeComplete=['A_airway','B_rr','C_bp','D_mental','E_exposure'].every(key=>state.assessment.has(key));
  const maxMap=Math.max(...state.vitalHistory.map(v=>Number(v.map)||0));
  const evaluateCriterion=criterion=>{
    const threshold=criterion.thresholdSeconds;
    const medicationInTime=id=>{const at=firstMedicationAt(id);return at!=null&&(threshold==null||at<=threshold);};
    const done={
      early_escalation:state.escalationAt!==null&&state.escalationAt<=(threshold||120),
      sepsis_recognized:state.sepsisRecognizedAt!==null&&state.sepsisRecognizedAt<=(threshold||240),
      anaphylaxis_recognized:state.anaphylaxisRecognizedAt!==null&&state.anaphylaxisRecognizedAt<=(threshold||300),
      hemorrhage_recognized:state.hemorrhageRecognizedAt!==null&&state.hemorrhageRecognizedAt<=(threshold||120),
      abcde:abcdeComplete,
      nibp:Boolean(state.lastMeasurements.nibp),
      respiratory_rate:Boolean(state.lastMeasurements.rr),
      temperature_measured:Boolean(state.lastMeasurements.temp),
      glucose_measured:Boolean(state.lastMeasurements.bz),
      urine_assessed:state.assessment.has('C_urine'),
      bleeding_assessed:state.assessment.has('C_bleeding'),
      ecg:state.ecgAt!=null&&(threshold==null||state.ecgAt<=threshold),
      bga:state.bgaAvailable,
      lab_hb:state.labsAvailable.has('hb')||state.bgaResults.some(b=>b.values?.some(v=>String(v[0]).toLowerCase()==='hb')),
      vascular_access:hasUsableAccess(),
      blood_prepared:state.bloodRequested.length>0,
      blood_cultures:state.labsRequested.has('blood_cultures'),
      antibiotic:state.therapies.antibioticAt!=null&&state.therapies.antibioticAt<=(threshold||420),
      circulation_therapy:Boolean(state.therapies.fluidEffects.length||state.therapies.bloodUnitsGiven||state.therapies.crystalloidMl>0||state.therapies.norepiPerfusor),
      controlled_fluid:state.therapies.crystalloidMl>=250&&state.therapies.crystalloidMl<=500,
      aspirin:medicationInTime('aspirin'),
      heparin:medicationInTime('heparin'),
      cath_lab:state.escalationAt!==null,
      norepi:state.therapies.norepiPerfusor,
      defib_pads:state.therapies.defibPads,
      trigger_stopped:state.therapies.triggerStoppedAt!==null&&(threshold==null||state.therapies.triggerStoppedAt<=threshold),
      oxygen:state.therapies.oxygen,
      adrenaline_im:state.therapies.adrenalineImAt!==null&&(threshold==null||state.therapies.adrenalineImAt<=threshold),
      fluid_therapy:state.therapies.crystalloidMl>0,
      adequate_fluid:state.therapies.crystalloidMl>=1500,
      shock_position:state.therapies.shockPositionAt!==null,
      tourniquet:state.therapies.tourniquetAt!==null&&(threshold==null||state.therapies.tourniquetAt<=threshold),
      txa:state.therapies.txaAt!==null&&(threshold==null||state.therapies.txaAt<=threshold),
      analgesia:['fentanyl','ketamine','morphine','piritramide','sufentanil'].some(id=>medicationInTime(id)),
      trauma_center:state.escalationAt!==null,
      permissive_target:state.therapies.tourniquetApplied&&!state.dead&&state.patient.sys>=80&&state.patient.sys<=110,
      adjunct_medication:['prednisolone','clemastine','h2_blocker'].every(id=>state.therapies.medications.some(m=>m.id===id)),
      map_target:maxMap>=65
    }[criterion.id]||false;
    return [done,criterion.labelDone,criterion.labelMissing];
  };
  const checks=getActiveCase().scoring.map(evaluateCriterion),positives=checks.filter(x=>x[0]).map(x=>x[1]),missing=checks.filter(x=>!x[0]).map(x=>x[2]);
  return {pct:Math.round(positives.length/checks.length*100),positives,missing};
}
function caseTreatmentSummaryHtml(){
  const model=getActiveCase().physiology?.model;
  if(model==='cardiogenic'){
    const has=id=>state.therapies.medications.some(m=>m.id===id);
    return `<li>ASS: ${has('aspirin')?'gegeben':'nicht gegeben'}</li><li>Heparin: ${has('heparin')?'gegeben':'nicht gegeben'}</li><li>Herzkatheterlabor: ${state.escalationAt!=null?'aktiviert':'nicht aktiviert'}</li><li>Letztes Laktat: ${state.patient.lactate.toFixed(1)} mmol/l</li>`;
  }
  if(model==='sepsis')return `<li>Antibiotikum: ${state.therapies.antibioticAt!=null?'gegeben':'nicht gegeben'}</li><li>Letztes Laktat: ${state.patient.lactate.toFixed(1)} mmol/l</li>`;
  if(model==='anaphylaxis')return `<li>Cefuroximzufuhr: ${state.therapies.cefuroximeRunning?'läuft noch':'gestoppt'}</li><li>Adrenalin i.m.: ${state.therapies.adrenalineImCount?`${state.therapies.adrenalineImCount} Gabe${state.therapies.adrenalineImCount===1?'':'n'}`:'nicht gegeben'}</li><li>Atemweg: ${state.therapies.intubated?'endotracheal gesichert':'nicht intubiert'}</li><li>Letztes Laktat: ${state.patient.lactate.toFixed(1)} mmol/l</li>`;
  if(model==='traumatic_hemorrhage')return `<li>Tourniquet: ${state.therapies.tourniquetApplied?`angelegt bei ${formatTime(state.therapies.tourniquetAt)}`:'nicht angelegt'}</li><li>Äußerer Blutverlust: etwa ${Math.round(state.therapies.externalBloodLossMl/50)*50} ml</li><li>TXA: ${state.therapies.txa?'gegeben':'nicht gegeben'}</li><li>Analgesie: ${['fentanyl','ketamine','morphine','piritramide','sufentanil'].some(id=>state.therapies.medications.some(m=>m.id===id))?'gegeben':'nicht gegeben'}</li><li>Letztes Laktat: ${state.patient.lactate.toFixed(1)} mmol/l</li>`;
  if(model==='dehydration')return `<li>Volumentherapie: ${state.therapies.crystalloidMl} ml Kristalloid</li><li>Letzte Temperatur: ${state.patient.temp.toFixed(1)} °C</li><li>Letztes Laktat: ${state.patient.lactate.toFixed(1)} mmol/l</li>`;
  return `<li>EK transfundiert: ${state.therapies.bloodUnitsGiven}</li><li>Letzter Hb: ${state.patient.hb.toFixed(1)} g/dl</li>`;
}
function buildSummaryHtml(pct,positives,missing){return `<div class="summary-score">${pct} % Prozessadhärenz</div><p class="modal-note"><strong>Benutzer:</strong> ${escapeHtml(participantUsername)} · Didaktische, nicht validierte Auswertung.</p><div id="saveStatus" class="save-status">${state.restoredEvaluation?'Auswertung wurde lokal wiederhergestellt.':state.savedResultId?'✓ Ergebnis wurde gespeichert.':'Ergebnis wird gespeichert …'}</div><div class="summary-simple"><div><h3>Gut umgesetzt</h3><ul>${positives.map(x=>`<li>${x}</li>`).join('')||'<li>—</li>'}</ul></div><div><h3>Besprechen</h3><ul>${missing.map(x=>`<li>${x}</li>`).join('')||'<li>—</li>'}</ul></div><div><h3>Ergebnis</h3><ul><li>Schwierigkeit: ${{easy:'Leicht',medium:'Mittel',hard:'Schwer'}[state.difficulty]}</li><li>Patient: ${state.dead?'Kreislaufstillstand – '+state.deathReason:'am Fallende lebend'}</li><li>Kristalloide: ${state.therapies.crystalloidMl} ml</li>${caseTreatmentSummaryHtml()}</ul></div></div>${assessmentSummaryHtml()}<h2>Wesentliche Maßnahmen</h2><div class="summary-timeline">${state.events.filter(e=>/übernimmt:|abgeschlossen|abgebrochen|alarmiert|transfund|verabreicht|BGA|Labor|Sonografie|Kreislaufstillstand/.test(e.text)).map(e=>`<div><strong>${formatTime(e.time)}</strong><span>${escapeHtml(e.text)}</span></div>`).join('')||'<p>Keine wesentlichen Maßnahmen dokumentiert.</p>'}</div><h2>Vitalparameter im Verlauf</h2><div class="chart-grid">${makeChart('Herzfrequenz','hr','#24e879',50,190,'/min')}${makeChart('MAP','map','#ff4d68',35,110,'mmHg')}${makeChart('SpO₂','spo2','#39a8ff',75,100,'%')}</div>`;}
function showSummary(){const data=state.pendingSummary||calculateSummaryData();state.pendingSummary=data;el('summaryContent').innerHTML=buildSummaryHtml(data.pct,data.positives,data.missing);el('summaryDialog').showModal();if(state.pendingResultPayload)saveSimulationResult(state.pendingResultPayload,true);}
function likertQuestionHtml([id,label]){return `<fieldset class="evaluation-question"><legend>${escapeHtml(label)}</legend><div class="likert-row">${[1,2,3,4,5].map(v=>`<label><input type="radio" name="${id}" value="${v}" required><span>${v}</span></label>`).join('')}</div><div class="likert-hints"><span>stimme gar nicht zu</span><span>stimme vollständig zu</span></div></fieldset>`;}
function setupEvaluationQuestions(){const sys=el('systemEvaluationQuestions'),cas=el('caseEvaluationQuestions');if(sys&&!sys.children.length)sys.innerHTML=SYSTEM_EVALUATION_QUESTIONS.map(likertQuestionHtml).join('');if(cas&&!cas.children.length)cas.innerHTML=CASE_EVALUATION_QUESTIONS.map(likertQuestionHtml).join('');}
function evaluationDraftFromForm(){const form=el('evaluationForm');if(!form)return {};const data=new FormData(form),answers={};for(const [k,v] of data.entries())answers[k]=v;return answers;}
function applyEvaluationDraft(answers={}){for(const [name,value] of Object.entries(answers||{})){document.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach(node=>{if(node.type==='radio')node.checked=String(node.value)===String(value);else node.value=value;});}const tech=document.querySelector('[name="technicalProblems"]:checked')?.value;el('technicalProblemTextWrap')?.classList.toggle('hidden',tech!=='yes');}
function anonymousEvaluationSnapshot(){return {elapsed:state.elapsed,dead:state.dead,deathReason:state.deathReason,patient:clone(state.patient),events:clone(state.events),vitalHistory:clone(state.vitalHistory),assessment:[...state.assessment],therapies:{crystalloidMl:state.therapies.crystalloidMl,bloodUnitsGiven:state.therapies.bloodUnitsGiven,antibioticAt:state.therapies.antibioticAt,medications:clone(state.therapies.medications),defibPads:state.therapies.defibPads,pulmonaryEdema:state.therapies.pulmonaryEdema,cefuroximeRunning:state.therapies.cefuroximeRunning,triggerStoppedAt:state.therapies.triggerStoppedAt,adrenalineImAt:state.therapies.adrenalineImAt,adrenalineImCount:state.therapies.adrenalineImCount,adrenalineNebulizedAt:state.therapies.adrenalineNebulizedAt,shockPositionAt:state.therapies.shockPositionAt,intubated:state.therapies.intubated,intubationAt:state.therapies.intubationAt,oxygen:state.therapies.oxygen,txa:state.therapies.txa,txaAt:state.therapies.txaAt,limbElevated:state.therapies.limbElevated,limbElevatedAt:state.therapies.limbElevatedAt,woundCompressed:state.therapies.woundCompressed,woundCompressionAt:state.therapies.woundCompressionAt,tourniquetApplied:state.therapies.tourniquetApplied,tourniquetAt:state.therapies.tourniquetAt,externalBloodLossMl:state.therapies.externalBloodLossMl},escalationAt:state.escalationAt,ecgAt:state.ecgAt,anaphylaxisRecognizedAt:state.anaphylaxisRecognizedAt,hemorrhageRecognizedAt:state.hemorrhageRecognizedAt};}
function pendingEvaluationObject(){return {version:2,caseId:activeCaseId,caseName:getActiveCase().title,difficulty:state.difficulty,summary:state.pendingSummary,snapshot:anonymousEvaluationSnapshot(),answers:evaluationDraftFromForm(),updatedAt:new Date().toISOString()};}
function updatePendingEvaluationStorage(){if(!state.ended||state.evaluationSubmitted||state.evaluationSkipped)return;try{localStorage.setItem(EVALUATION_STORAGE_KEY,JSON.stringify(pendingEvaluationObject()));}catch(e){console.warn(e);}}
function clearPendingEvaluationStorage(){try{localStorage.removeItem(EVALUATION_STORAGE_KEY);localStorage.removeItem(LEGACY_EVALUATION_STORAGE_KEY);}catch{}}
function readPendingEvaluationStorage(){try{localStorage.removeItem(LEGACY_EVALUATION_STORAGE_KEY);return JSON.parse(localStorage.getItem(EVALUATION_STORAGE_KEY)||'null');}catch{return null;}}
async function beginEvaluationFlow(){setupEvaluationQuestions();state.pendingSummary=calculateSummaryData();state.pendingResultPayload=buildSavedResult(state.pendingSummary.pct,state.pendingSummary.positives,state.pendingSummary.missing);updatePendingEvaluationStorage();await saveSimulationResult(state.pendingResultPayload,true);updatePendingEvaluationStorage();el('evaluationDialog').showModal();}
function collectEvaluationAnswers(){const form=el('evaluationForm');if(!form?.checkValidity()){form?.reportValidity();return null;}const raw=evaluationDraftFromForm(),system={},caseQuestions={};SYSTEM_EVALUATION_QUESTIONS.forEach(([id])=>system[id]=Number(raw[id]));CASE_EVALUATION_QUESTIONS.forEach(([id])=>caseQuestions[id]=Number(raw[id]));return {system,case:caseQuestions,technicalProblems:raw.technicalProblems==='yes',technicalProblemText:String(raw.technicalProblemText||'').trim().slice(0,1000)};}
async function submitEvaluation(e){e.preventDefault();const answers=collectEvaluationAnswers();if(!answers)return;const status=el('evaluationSaveStatus');status.textContent='Anonyme Evaluation wird gespeichert …';status.className='save-status';try{const response=await fetch('/api/evaluations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:activeCaseId,caseName:getActiveCase().title,difficulty:state.difficulty,answers})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Speichern fehlgeschlagen');state.evaluationSubmitted=true;clearPendingEvaluationStorage();status.textContent='✓ Anonyme Evaluation gespeichert.';status.className='save-status ok';setTimeout(()=>{el('evaluationDialog')?.close();showSummary();},200);}catch(error){status.textContent=`Evaluation konnte nicht gespeichert werden: ${error.message}`;status.className='save-status error';updatePendingEvaluationStorage();}}
async function skipEvaluation(e){e.preventDefault();const password=String(el('evaluationSkipPassword')?.value||''),errorEl=el('evaluationSkipError');errorEl.classList.add('hidden');try{const response=await fetch('/api/evaluation/skip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Passwort falsch');state.evaluationSkipped=true;clearPendingEvaluationStorage();el('evaluationDialog')?.close();showSummary();}catch(error){errorEl.textContent=error.message;errorEl.classList.remove('hidden');}}
async function restorePendingEvaluation(){const pending=readPendingEvaluationStorage();if(pending?.version!==2||!pending?.summary||!window.TELECARE_CASES[pending.caseId])return false;setupEvaluationQuestions();participantUsername='Teilnehmer';activeCaseId=pending.caseId;LABS=clone(getActiveCase().labs);BGA=clone(getActiveCase().bga?.staticRows||[]);state=initialState();const snapshot=pending.snapshot||{};state.ended=true;state.running=false;state.restoredEvaluation=true;state.pendingResultPayload=null;state.pendingSummary=pending.summary;state.elapsed=Number(snapshot.elapsed)||0;state.difficulty=pending.difficulty||'easy';state.dead=Boolean(snapshot.dead);state.deathReason=snapshot.deathReason||null;state.events=Array.isArray(snapshot.events)?snapshot.events:[];state.vitalHistory=Array.isArray(snapshot.vitalHistory)&&snapshot.vitalHistory.length?snapshot.vitalHistory:state.vitalHistory;state.assessment=new Set(snapshot.assessment||[]);state.therapies={...state.therapies,...(snapshot.therapies||{})};state.patient={...state.patient,...(snapshot.patient||{})};state.escalationAt=snapshot.escalationAt??null;state.ecgAt=snapshot.ecgAt??null;state.anaphylaxisRecognizedAt=snapshot.anaphylaxisRecognizedAt??null;state.hemorrhageRecognizedAt=snapshot.hemorrhageRecognizedAt??null;el('startScreen')?.classList.add('hidden');el('simulationApp')?.classList.remove('hidden');renderAll();applyEvaluationDraft(pending.answers||{});el('evaluationDialog')?.showModal();return true;}

function onClick(id,handler){const node=el(id);if(!node){console.warn(`UI-Element fehlt: #${id}`);return;}node.onclick=handler;}
function bind(){
  const startForm=el('startForm');if(startForm)startForm.addEventListener('submit',e=>{e.preventDefault();const input=el('usernameInput');const value=String(input?.value||'').trim().replace(/\s+/g,' ');if(value.length<2){el('usernameError')?.classList.remove('hidden');input?.focus();return;}participantUsername=value.slice(0,80);el('usernameError')?.classList.add('hidden');activeCaseId=el('caseSelect')?.value||activeCaseId;SIM_DURATION=Number(el('durationSelect')?.value||getActiveCase().defaultDurationSeconds||600);LABS=clone(getActiveCase().labs);BGA=clone(getActiveCase().bga?.staticRows||[]);state=initialState();state.difficulty=el('difficultySelect')?.value||'easy';const initialSys=getActiveCase().physiology?.difficulty?.[state.difficulty]?.initialSys;if(initialSys){state.patient.sys=initialSys;state.vitalHistory[0].sys=initialSys;state.vitalHistory[0].map=map(initialSys,state.patient.dia);}el('startScreen')?.classList.add('hidden');el('simulationApp')?.classList.remove('hidden');renderAll();startSimulation();});
  onClick('pauseBtn',pauseSimulation);onClick('resetBtn',resetSimulation);onClick('logoutBtn',logout);onClick('finishBtn',()=>{if(state.running&&!state.ended)endSimulation();});onClick('soundBtn',toggleSound);onClick('alarmBtn',toggleAlarm);
  onClick('measureNibpBtn',measureNibp);onClick('countRrBtn',countRr);onClick('measureTempBtn',measureTemp);
  onClick('bgaBtn',()=>el('bgaDialog')?.showModal());
  onClick('venousBgaBtn',()=>{if(requestBga('venous'))el('bgaDialog')?.close();});
  onClick('arterialBgaBtn',()=>{if(requestBga('arterial'))el('bgaDialog')?.close();});
  onClick('ecgBtn',requestEcg);onClick('sonoBtn',requestSono);
  onClick('openLabResultsBtn',showLabResults);onClick('openBgaResultsBtn',showBgaResults);onClick('openSonoResultsBtn',showSonoResults);
  onClick('closeResultsBtn',()=>el('resultsDialog')?.close());onClick('closeSummaryBtn',()=>el('summaryDialog')?.close());
  onClick('printBtn',()=>window.print());onClick('restartFromSummaryBtn',resetSimulation);
  onClick('norepiDownBtn',()=>adjustNorepi(-1));onClick('norepiUpBtn',()=>adjustNorepi(1));onClick('norepiStopBtn',stopNorepi);
  const chatLog=el('chatLog');if(chatLog)chatLog.addEventListener('scroll',()=>{state.chatAutoFollow=chatLog.scrollHeight-chatLog.scrollTop-chatLog.clientHeight<60;});
  const chatForm=el('chatForm');if(chatForm)chatForm.addEventListener('submit',e=>{e.preventDefault();const input=el('chatInput');if(input){handleChat(input.value);input.value='';}});
  const caseSelect=el('caseSelect');if(caseSelect){caseSelect.innerHTML=Object.values(window.TELECARE_CASES).filter(c=>c.enabled!==false).map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.number)} · ${escapeHtml(c.shortTitle)}</option>`).join('');caseSelect.value=activeCaseId;caseSelect.onchange=()=>{activeCaseId=caseSelect.value;LABS=clone(getActiveCase().labs);BGA=clone(getActiveCase().bga?.staticRows||[]);renderLabOptions();const c=getActiveCase();const durationSelect=el('durationSelect');if(durationSelect){durationSelect.value=String(c.defaultDurationSeconds||600);SIM_DURATION=Number(durationSelect.value);}};}
  const durationSelect=el('durationSelect');if(durationSelect)durationSelect.onchange=()=>{if(!state.running){SIM_DURATION=Number(durationSelect.value);renderButtons();}};const difficultySelect=el('difficultySelect');if(difficultySelect)difficultySelect.onchange=()=>{if(!state.running)state.difficulty=difficultySelect.value;};
  setupEvaluationQuestions();const evaluationForm=el('evaluationForm');if(evaluationForm){evaluationForm.addEventListener('submit',submitEvaluation);evaluationForm.addEventListener('change',()=>{const tech=document.querySelector('[name="technicalProblems"]:checked')?.value;el('technicalProblemTextWrap')?.classList.toggle('hidden',tech!=='yes');updatePendingEvaluationStorage();});evaluationForm.addEventListener('input',updatePendingEvaluationStorage);}el('evaluationSkipForm')?.addEventListener('submit',skipEvaluation);window.addEventListener('pagehide',updatePendingEvaluationStorage);
  setupLabDialog();setupAccessDialog();setupBloodDialog();
}
bind();renderAll();checkAiStatus();restorePendingEvaluation().then(restored=>{if(!restored){el('startScreen')?.classList.remove('hidden');el('simulationApp')?.classList.add('hidden');setTimeout(()=>el('usernameInput')?.focus(),0);}});
