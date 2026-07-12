let SIM_DURATION = 600;
let participantUsername = '';
const TICK_SECONDS = 3;

let activeCaseId = window.TELECARE_DEFAULT_CASE_ID;
const getActiveCase = () => window.TELECARE_CASES[activeCaseId];
const clone = value => JSON.parse(JSON.stringify(value));
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
  running:false,paused:false,ended:false,elapsed:0,timer:null,difficulty:'easy',dead:false,deathReason:null,criticalSeconds:0,alarmSilencedUntil:0,runId:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),saveAttempted:false,savedResultId:null,
  caseId:activeCaseId,
  patient:clone(getActiveCase().patient.initial),
  lastMeasurements:{nibp:null,rr:null,temp:null,bz:null},
  staff:getActiveCase().staff.map(person=>({...person,busyUntil:0,taskId:null})),
  tasks:[],events:[],chat:[],labsRequested:new Set(),labsAvailable:new Set(),bgaAvailable:false,bgaResults:[],access:new Set(),
  crossedBloodAvailable:false,bloodInventory:{uncrossed:0,crossed:0},bloodRequested:[],
  therapies:{oxygen:false,warming:false,ventilation:false,norepiBolusUntil:0,norepiPerfusor:false,norepiRate:1,fluidEffects:[],crystalloidMl:0,bloodUnitsGiven:0,activeInfusions:[],txa:false,medications:[],medicationEffects:[],paralyzedUntil:0,shockPositionUntil:0},
  vitalHistory:[{time:0,hr:getActiveCase().patient.initial.hr,map:map(getActiveCase().patient.initial.sys,getActiveCase().patient.initial.dia),spo2:getActiveCase().patient.initial.spo2,sys:getActiveCase().patient.initial.sys,dia:getActiveCase().patient.initial.dia}],chatAutoFollow:true,
  firstTherapyAt:null,lastMentalReport:'wach und unruhig',escalationAt:null,soundOn:true,alarmOn:true,alarmActive:false,aiAvailable:false,proactiveFlags:new Set(),sonoResult:null,newLabResult:false,newBgaResult:false,newSonoResult:false,assessment:new Set()
});

let state = initialState();
const el=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const jitter=n=>(Math.random()-.5)*n;
const formatTime=s=>`${String(Math.floor(Math.max(0,s)/60)).padStart(2,'0')}:${String(Math.round(Math.max(0,s))%60).padStart(2,'0')}`;
const map=(s,d)=>Math.round((s+2*d)/3);
const escapeHtml=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function logEvent(text,type='info'){state.events.push({time:state.elapsed,text,type});renderEvents();}
function addChat(sender,text,cls='team'){state.chat.push({time:state.elapsed,sender,text,cls});state.chatAutoFollow=true;renderChat();}
function notify(text){addChat('System',text,'system');}
function getAvailableStaff(roles=['doctor','nurse']){const available=state.staff.filter(s=>roles.includes(s.role)&&s.busyUntil<=state.elapsed);if(roles.includes('nurse')&&roles.includes('doctor'))available.sort((a,b)=>(a.role==='nurse'?0:1)-(b.role==='nurse'?0:1));return available[0];}
function showToast(text){let t=el('toastMessage');if(!t){t=document.createElement('div');t.id='toastMessage';t.className='toast-message';}
  const openDialog=document.querySelector('dialog[open]');
  const host=openDialog||document.body;
  if(t.parentElement!==host)host.appendChild(t);
  t.style.left='50%';t.style.top='24px';
  t.textContent=text;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800);
}
function flashNoStaff(roles=['doctor','nurse']){showToast('Das benötigte Personal ist gerade nicht verfügbar.');const panel=el('staffPanel');if(panel){panel.classList.remove('no-staff-flash');void panel.offsetWidth;panel.classList.add('no-staff-flash');setTimeout(()=>panel.classList.remove('no-staff-flash'),700);}state.staff.filter(s=>roles.includes(s.role)).forEach(s=>{const card=document.querySelector(`[data-staff-id=\"${s.id}\"]`);if(card){card.classList.remove('deny-flash');void card.offsetWidth;card.classList.add('deny-flash');setTimeout(()=>card.classList.remove('deny-flash'),700);}});}

function assignTask(label,duration,onComplete,options={}){
  if(!state.running||state.paused||state.ended){notify('Die Simulation muss laufen.');return false;}
  const staff=getAvailableStaff(options.roles||['doctor','nurse']);
  if(!staff){flashNoStaff(options.roles||['doctor','nurse']);notify(`Aktuell ist keine passende Person frei.`);return false;}
  const task={id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,label,start:state.elapsed,end:state.elapsed+duration,duration,staffId:staff.id,onComplete,type:options.type||'task',phase:options.phase||'vor Ort'};
  staff.busyUntil=task.end;staff.taskId=task.id;state.tasks.push(task);
  logEvent(`${staff.name} übernimmt: ${label}.`);addChat('Team vor Ort',`${staff.name}: Auftrag verstanden – ${label}.`);renderAll();return true;
}
function addBackgroundTask(label,duration,onComplete){
  state.tasks.push({id:`bg-${Date.now()}-${Math.random()}`,label,start:state.elapsed,end:state.elapsed+duration,duration,staffId:null,onComplete,type:'background',phase:'Labor'});
  logEvent(`${label}: Probe im Labor eingegangen.`);renderAll();
}

function startSimulation(){
  if(!participantUsername){el('usernameDialog')?.showModal();el('usernameInput')?.focus();return;}
  if(state.running&&!state.paused)return;
  if(!state.running){activeCaseId=el('caseSelect')?.value||activeCaseId;SIM_DURATION=Number(el('durationSelect')?.value||getActiveCase().defaultDurationSeconds||600);state.difficulty=el('difficultySelect')?.value||'easy';}
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
function resetSimulation(){clearInterval(state.timer);stopPulseLoop();stopAlarmLoop();activeCaseId=el('caseSelect')?.value||activeCaseId;LABS=clone(getActiveCase().labs);BGA=clone(getActiveCase().bga?.staticRows||[]);SIM_DURATION=Number(el('durationSelect')?.value||getActiveCase().defaultDurationSeconds||600);state=initialState();state.difficulty=el('difficultySelect')?.value||'easy';document.querySelectorAll('dialog[open]').forEach(d=>d.close());el('startBtn').disabled=false;el('pauseBtn').disabled=true;el('pauseBtn').textContent='Pause';renderAll();}
function tick(){if(!state.running||state.paused||state.ended)return;state.elapsed+=1;processTasks();if(state.elapsed%TICK_SECONDS===0){updatePhysiology();}if(state.elapsed>=SIM_DURATION)endSimulation();renderAll();}
function processTasks(){
  state.tasks.filter(t=>!t.done&&!t.cancelled&&t.end<=state.elapsed).forEach(t=>{
    t.done=true;const staff=state.staff.find(s=>s.id===t.staffId);if(staff){staff.taskId=null;staff.busyUntil=state.elapsed;}t.onComplete?.();
    logEvent(`${t.label} abgeschlossen.`);addChat(t.phase==='Labor'?'Labor':'Team vor Ort',`${staff?staff.name+': ':''}${t.label} ist abgeschlossen.`);
  });
}

function updatePhysiology(){
  const p=state.patient;
  const caseConfig=getActiveCase();const physiology=caseConfig.physiology;const profile=physiology.difficulty[state.difficulty]||physiology.difficulty.easy;const difficultyFactor=profile.progression;
  const timeScale=Math.max(.38,state.elapsed/540);
  const severity=Math.min(2.15,timeScale*difficultyFactor);
  state.therapies.fluidEffects=state.therapies.fluidEffects.filter(x=>x>state.elapsed);
  const fluidCount=state.therapies.fluidEffects.length;
  const bloodUnits=state.therapies.bloodUnitsGiven;
  const norepiBolus=state.therapies.norepiBolusUntil>state.elapsed?1:0;
  const norepiPerf=state.therapies.norepiPerfusor?state.therapies.norepiRate:0;
  state.therapies.medicationEffects=state.therapies.medicationEffects.filter(e=>e.until>state.elapsed);
  const medTotals=state.therapies.medicationEffects.reduce((a,e)=>{
    for(const k of ['hr','sys','dia','rr','spo2'])a[k]+=(e[k]||0);
    return a;
  },{hr:0,sys:0,dia:0,rr:0,spo2:0});
  const paralyzed=state.therapies.paralyzedUntil>state.elapsed;
  const shockPosition=state.therapies.shockPositionUntil>state.elapsed?1:0;
  const support=fluidCount*.55+bloodUnits*.55+norepiBolus*.9+norepiPerf*.58+shockPosition*.55;
  const targetSys=clamp(physiology.targetSysBase-severity*physiology.sysLossPerSeverity+support*14+medTotals.sys,32,185);
  const targetDia=clamp(physiology.targetDiaBase-severity*physiology.diaLossPerSeverity+support*8+medTotals.dia,18,110);
  p.sys+=(targetSys-p.sys)*.17+jitter(1.1);p.dia+=(targetDia-p.dia)*.17+jitter(.8);
  const currentMap=map(p.sys,p.dia);
  const targetHr=clamp(physiology.targetHrBase+severity*physiology.hrGainPerSeverity+(currentMap<65?(65-currentMap)*1.35:0)-fluidCount*5-bloodUnits*6-(currentMap>75?8:0)+medTotals.hr,25,210);
  p.hr+=(targetHr-p.hr)*.20+jitter(1.4);
  const untreatedSpo2Target=caseConfig.patient.initial.spo2-severity*profile.spo2Loss;
  let targetSpo2=(state.therapies.oxygen?98:untreatedSpo2Target)+medTotals.spo2;
  if(paralyzed&&!state.therapies.ventilation)targetSpo2=state.difficulty==='hard'?48:58;
  let spo2Response=paralyzed&&!state.therapies.ventilation?.24:(state.difficulty==='hard'?.18:state.difficulty==='medium'?.15:.135);
  if(p.spo2<80&&targetSpo2<p.spo2)spo2Response*=1.9;
  if(p.spo2<65&&targetSpo2<p.spo2)spo2Response*=1.5;
  p.spo2=clamp(p.spo2+(targetSpo2-p.spo2)*spo2Response+jitter(.22),0,100);
  let targetRr=22+severity*11-bloodUnits*.8+medTotals.rr;
  if(paralyzed)targetRr=state.therapies.ventilation?14:0;
  p.rr=clamp(p.rr+(targetRr-p.rr)*(paralyzed?.35:.15)+jitter(.25),0,48);
  p.temp=clamp(p.temp+((state.therapies.warming?36.6:35.1)-p.temp)*.035+jitter(.02),34.0,37.3);
  p.lactate=clamp(p.lactate+physiology.lactateGainPerTick*difficultyFactor-bloodUnits*.012-fluidCount*.006,1,14);
  p.hb=clamp(p.hb-physiology.hbLossPerTick*difficultyFactor,3.0,12);
  p.bleeding+=physiology.bleedingGainPerTick*difficultyFactor;
  const old=p.mental;
  if(state.dead)p.mental='nicht ansprechbar';
  else if(p.sys<60||p.spo2<82)p.mental='somnolent';
  else if(p.sys<76)p.mental='verlangsamt und zeitlich desorientiert';
  else if(p.sys<90)p.mental='unruhig und leicht verwirrt';
  else p.mental='wach und unruhig';
  if(p.mental!==old){state.lastMentalReport=p.mental;logEvent(`Bewusstseinslage verändert: ${p.mental}.`,'warning');}
  const criticalMap=profile.criticalMap;
  const critical=(currentMap<criticalMap||p.spo2<10||p.hr<28||p.hr>195);
  state.criticalSeconds=critical?state.criticalSeconds+TICK_SECONDS:Math.max(0,state.criticalSeconds-TICK_SECONDS*2);
  const threshold=profile.arrestSeconds;
  if(!state.dead&&state.criticalSeconds>=threshold){
    state.dead=true;state.deathReason=currentMap<38?'prolongierter Kreislaufschock':p.spo2<10?'extreme prolongierte Hypoxämie':'prolongierte vitale Entgleisung';
    p.hr=0;p.sys=0;p.dia=0;p.spo2=Math.max(0,p.spo2);p.rr=0;p.mental='nicht ansprechbar';
    logEvent(`Kreislaufstillstand: ${state.deathReason}.`,'critical');addChat('Team vor Ort','Der Patient ist nicht mehr ansprechbar, pulslos und apnoisch. Kreislaufstillstand. Die Simulation wird beendet.','system');
    setTimeout(()=>{if(!state.ended)endSimulation();},0);
  }
  const measuredBpAlarm=(state.access.has('artery')&&p.sys<90)||(state.lastMeasurements.nibp&&state.lastMeasurements.nibp.sys<90);
  state.alarmActive=!state.dead&&(p.hr<60||p.hr>120||measuredBpAlarm||p.spo2<90);
  state.vitalHistory.push({time:state.elapsed,hr:Math.round(p.hr),map:map(p.sys,p.dia),spo2:Math.round(p.spo2),sys:Math.round(p.sys),dia:Math.round(p.dia)});
}
let audioCtx=null,pulseTimer=null,alarmTimer=null;
function beep(){if(!state.soundOn||!state.running||state.paused||state.ended)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=760;g.gain.value=.035;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.045);}catch{} }
function startPulseLoop(){stopPulseLoop();const schedule=()=>{if(state.running&&!state.ended){beep();pulseTimer=setTimeout(schedule,Math.max(330,60000/state.patient.hr));}};schedule();}
function stopPulseLoop(){if(pulseTimer)clearTimeout(pulseTimer);pulseTimer=null;}
function toggleSound(){state.soundOn=!state.soundOn;el('soundBtn').textContent=state.soundOn?'🔊 Pulston':'🔇 Pulston aus';el('soundBtn').classList.toggle('off',!state.soundOn);if(state.soundOn)startPulseLoop();else stopPulseLoop();}
function alarmBeep(){if(!state.alarmOn||state.alarmSilencedUntil>state.elapsed||!state.alarmActive||!state.running||state.paused||state.ended)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=1050;g.gain.value=.05;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.12);}catch{}}
function startAlarmLoop(){stopAlarmLoop();alarmTimer=setInterval(alarmBeep,1200);}
function stopAlarmLoop(){if(alarmTimer)clearInterval(alarmTimer);alarmTimer=null;}
function toggleAlarm(){if(!state.running||state.ended)return;state.alarmOn=true;state.alarmSilencedUntil=state.elapsed+120;el('alarmBtn').classList.add('alarm-paused');renderButtons();showToast('Alarm für 2 Minuten pausiert.');}

function renderVitals(){
  const p=state.patient;el('hr').textContent=Math.round(p.hr);el('spo2').textContent=Math.round(p.spo2);
  const arterial=state.access.has('artery');el('artBp').textContent=arterial?`${Math.round(p.sys)}/${Math.round(p.dia)}`:'kein Signal';el('artMap').textContent=arterial?`MAP ${map(p.sys,p.dia)} mmHg`:'Arterie erforderlich';
  if(state.lastMeasurements.nibp){el('nibp').textContent=`${state.lastMeasurements.nibp.sys}/${state.lastMeasurements.nibp.dia}`;el('nibpMap').textContent=`MAP ${state.lastMeasurements.nibp.map} mmHg · ${formatTime(state.lastMeasurements.nibp.time)}`;}else{el('nibp').textContent='– / –';el('nibpMap').textContent='MAP – mmHg';}
  el('rr').textContent=state.lastMeasurements.rr?state.lastMeasurements.rr.value:'–';
  const continuous=state.access.has('bladder');el('temp').textContent=continuous?p.temp.toFixed(1):(state.lastMeasurements.temp?state.lastMeasurements.temp.value.toFixed(1):'–');el('tempInfo').textContent=continuous?'°C · kontinuierlich über DK':'°C';el('measureTempBtn').classList.toggle('hidden',continuous);
  const alarmVisible=state.alarmOn&&state.alarmSilencedUntil<=state.elapsed;const alarmMap={hr:p.hr<60||p.hr>120,nibp:!!state.lastMeasurements.nibp&&state.lastMeasurements.nibp.sys<90,art:state.access.has('artery')&&p.sys<90,spo2:p.spo2<90};document.querySelectorAll('.strip-vital').forEach(n=>n.classList.remove('vital-alarm'));for(const [cls,on] of Object.entries(alarmMap)){if(on&&alarmVisible)document.querySelector(`.strip-vital.${cls}`)?.classList.add('vital-alarm');}
  ['measureTempBtn','measureNibpBtn','countRrBtn'].forEach(id=>el(id).disabled=!state.running||state.paused||state.ended);
  el('norepiPanel').classList.toggle('hidden',!state.therapies.norepiPerfusor);el('norepiRate').textContent=`${NOREPI_RATES[state.therapies.norepiRate-1].toFixed(2)} µg/kg/min`;renderPatientMap();
}
function renderStaff(){
  el('staffGrid').innerHTML=state.staff.map(s=>{
    const busy=s.busyUntil>state.elapsed;
    const task=state.tasks.find(t=>t.id===s.taskId);
    const role=s.role==='doctor'?'Arzt':'Pflegefachperson';
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
  if(state.therapies.norepiPerfusor)inf.push(`Noradrenalin ${NOREPI_RATES[state.therapies.norepiRate-1].toFixed(2)} µg/kg/min`);
  if(state.therapies.fluidEffects.length)inf.push(`${state.therapies.fluidEffects.length}× Volumeneffekt aktiv`);
  if(state.therapies.shockPositionUntil>state.elapsed)inf.push('Schocklage');if(state.therapies.medications.length){state.therapies.medications.slice(-3).forEach(m=>inf.push(`${m.label} gegeben`));}
  container.innerHTML=`<div class="body-figure"><div class="head"></div><div class="torso"></div><div class="arm left"></div><div class="arm right"></div><div class="leg left"></div><div class="leg right"></div>${[...state.access].map((id,i)=>`<span class="access-marker marker-${i%5}" title="${escapeHtml(ACCESS[id]?.label||ACCESS[id.split('_').slice(0,2).join('_')]?.label||id)}">${id==='bladder'?'DK':id==='artery'?'A':id.startsWith('pvk')?'P':'Z'}</span>`).join('')}</div><div class="patient-lines"><div><strong>Zugänge/Katheter</strong>${labels.length?labels.map(x=>`<span>${escapeHtml(x)}</span>`).join(''):'<span>keine</span>'}</div><div><strong>Laufende Therapie</strong>${inf.length?inf.map(x=>`<span>${escapeHtml(x)}</span>`).join(''):'<span>keine</span>'}</div></div>`;
}

function renderTasks(){const active=state.tasks.filter(t=>!t.done&&!t.cancelled);el('activeOrders').classList.toggle('empty-state',!active.length);el('activeOrders').innerHTML=active.length?active.map(t=>`<div class="order-item"><div><strong>${escapeHtml(t.label)}</strong><small>${t.phase}${t.staffId?' · '+escapeHtml(state.staff.find(s=>s.id===t.staffId)?.name||''):''}</small></div><div class="order-controls"><span>${formatTime(t.end-state.elapsed)}</span><button type="button" class="cancel-task-btn" data-cancel-task="${t.id}">Abbrechen</button></div></div>`).join(''):'Keine aktiven Aufträge.';document.querySelectorAll('[data-cancel-task]').forEach(btn=>btn.onclick=()=>cancelTask(btn.dataset.cancelTask));}
function cancelTask(taskId){const t=state.tasks.find(x=>x.id===taskId&&!x.done&&!x.cancelled);if(!t)return;t.cancelled=true;t.done=true;const staff=state.staff.find(s=>s.id===t.staffId);if(staff){staff.taskId=null;staff.busyUntil=state.elapsed;}logEvent(`${t.label} abgebrochen.`,'warning');addChat('Team vor Ort',`${t.label} wurde abgebrochen.`);renderAll();}
function renderChat(){const node=el('chatLog');const oldTop=node.scrollTop;const nearBottom=node.scrollHeight-node.scrollTop-node.clientHeight<60;node.innerHTML=state.chat.map(m=>`<div class="message ${m.cls}"><div class="message-meta">${escapeHtml(m.sender)} · ${formatTime(m.time)}</div><div>${escapeHtml(m.text).replace(/\n/g,'<br>')}</div></div>`).join('');if(state.chatAutoFollow||nearBottom){node.scrollTop=node.scrollHeight;state.chatAutoFollow=false;}else node.scrollTop=oldTop;}
function renderEvents(){const node=el('eventLog');if(!node)return;node.innerHTML=state.events.slice().reverse().map(e=>`<div class="event-row"><span>${formatTime(e.time)}</span><div>${escapeHtml(e.text)}</div></div>`).join('');}
function renderButtons(){el('timer').textContent=formatTime(SIM_DURATION-state.elapsed);if(el('participantName'))el('participantName').textContent=participantUsername||'–';const alarmRemaining=Math.max(0,state.alarmSilencedUntil-state.elapsed);el('alarmBtn').textContent=alarmRemaining>0?`⏸ Alarm ${formatTime(alarmRemaining)}`:'⏸ Alarm 2 min';el('alarmBtn').classList.toggle('alarm-paused',alarmRemaining>0);el('crossedBtn').disabled=!state.crossedBloodAvailable;const giveCrossed=el('giveCrossedEkBtn'),giveUncrossed=el('giveUncrossedEkBtn');if(giveCrossed)giveCrossed.disabled=state.bloodInventory.crossed<1;if(giveUncrossed)giveUncrossed.disabled=state.bloodInventory.uncrossed<1;el('openLabResultsBtn').disabled=!state.labsAvailable.size;el('openBgaResultsBtn').disabled=!state.bgaAvailable;el('openSonoResultsBtn').disabled=!state.sonoResult;el('uncrossedCount').textContent=state.bloodInventory.uncrossed;el('crossedCount').textContent=state.bloodInventory.crossed;el('givenCount').textContent=state.therapies.bloodUnitsGiven;el('durationSelect').disabled=state.running&&!state.ended;el('difficultySelect').disabled=state.running&&!state.ended;if(el('caseSelect'))el('caseSelect').disabled=state.running&&!state.ended;el('finishBtn').disabled=!state.running||state.ended;const lb=el('openLabResultsBtn'),bb=el('openBgaResultsBtn'),sb=el('openSonoResultsBtn');lb.classList.toggle('new-result',state.newLabResult);bb.classList.toggle('new-result',state.newBgaResult);sb.classList.toggle('new-result',state.newSonoResult);}
function renderAll(){renderVitals();renderStaff();renderTasks();renderChat();renderEvents();renderButtons();}

function measureNibp(){assignTask('Nichtinvasive Blutdruckmessung',20,()=>{const p=state.patient;state.lastMeasurements.nibp={sys:Math.round(p.sys+jitter(2)),dia:Math.round(p.dia+jitter(2)),map:map(p.sys,p.dia),time:state.elapsed};},{roles:['nurse']});}
function countRr(){assignTask('Atemfrequenz auszählen',15,()=>{state.lastMeasurements.rr={value:Math.round(state.patient.rr),time:state.elapsed};},{roles:['nurse']});}
function measureTemp(){assignTask('Temperatur messen',15,()=>{state.lastMeasurements.temp={value:state.patient.temp,time:state.elapsed};},{roles:['nurse']});}
function currentBga(){
  const p=state.patient; const oxy=state.therapies.oxygen?18:0;
  return [
    ['pH',(7.34-(p.lactate-2.5)*0.018).toFixed(2),'7,35–7,45',true],
    ['pCO₂',String(Math.round(34-(p.rr-22)*0.25))+' mmHg','35–45 mmHg',true],
    ['pO₂',String(Math.round(68+oxy))+' mmHg','80–100 mmHg',!state.therapies.oxygen],
    ['HCO₃⁻',String(Math.round(20-(p.lactate-3)*0.7))+' mmol/l','22–26 mmol/l',true],
    ['Base Excess',String(Math.round(-4-(p.lactate-3)*1.2))+' mmol/l','−2 bis +2 mmol/l',true],
    ['Laktat',p.lactate.toFixed(1)+' mmol/l','0,5–2,2 mmol/l',p.lactate>2.2],
    ['Hb',p.hb.toFixed(1)+' g/dl','12,0–16,0 g/dl',p.hb<12],
    ['Na⁺','138 mmol/l','135–145 mmol/l',false],['K⁺','4,3 mmol/l','3,5–5,1 mmol/l',false],['iCa²⁺',p.iCa.toFixed(2)+' mmol/l','1,12–1,32 mmol/l',p.iCa<1.12||p.iCa>1.32]
  ];
}
function requestBga(mode){const arterial=mode==='arterial';const hasArtery=state.access.has('artery');const duration=arterial?(hasArtery?15:45):30;const roles=arterial&&!hasArtery?['doctor']:['nurse','doctor'];const label=arterial?(hasArtery?'Arterielle BGA über liegende Arterie':'Arterielle BGA per Einmalpunktion'):'Venöse BGA';return assignTask(`${label} abnehmen und analysieren`,duration,()=>{state.bgaAvailable=true;state.newBgaResult=true;state.bgaResults.push({time:state.elapsed,type:arterial?'arteriell':'venös',values:currentBga()});},{roles});}
function requestEcg(){assignTask('12-Kanal-EKG schreiben',45,()=>addChat('Team vor Ort','12-Kanal-EKG: Sinustachykardie, keine akuten ST-Hebungen.'),{roles:['nurse']});}
function requestSono(){return assignTask('Fokussierte Sonografie / POCUS durchführen',60,()=>{state.sonoResult={time:state.elapsed,text:getActiveCase().diagnostics.sono};state.newSonoResult=true;addChat('Dr. Weber','POCUS ist abgeschlossen. Der Befund kann geöffnet werden.');},{roles:['doctor']});}
function showSonoResults(){state.newSonoResult=false;if(!state.sonoResult)return;el('resultsTitle').textContent='POCUS / Sono';el('resultsContent').innerHTML=`<div class="result-group"><h3>${formatTime(state.sonoResult.time)}</h3><p>${escapeHtml(state.sonoResult.text)}</p></div>`;el('resultsDialog').showModal();}

function setupLabDialog(){
  el('labCheckboxes').innerHTML=Object.entries(LABS).map(([id,l])=>`<label class="check-item"><input type="checkbox" name="lab" value="${id}"><span>${l.label}</span></label>`).join('');
  el('labBtn').onclick=()=>el('labDialog').showModal();
  el('labForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const selected=[...document.querySelectorAll('input[name="lab"]:checked')].map(x=>x.value).filter(x=>!state.labsRequested.has(x));if(!selected.length)return notify('Bitte mindestens einen noch nicht angeforderten Parameter auswählen.');const label=selected.map(x=>LABS[x].label).join(', ');
    if(assignTask(`Blutentnahme für Labor: ${label}`,20,()=>{addBackgroundTask(`Laboranalyse: ${label}`,120,()=>{selected.forEach(x=>state.labsAvailable.add(x));state.newLabResult=true;if(selected.includes('crossmatch'))state.crossedBloodAvailable=true;});},{roles:['nurse']})){selected.forEach(x=>state.labsRequested.add(x));el('labDialog').close();document.querySelectorAll('input[name="lab"]').forEach(x=>x.checked=false);}
  });
}
function setupAccessDialog(){el('accessBtn').onclick=()=>el('accessDialog').showModal();document.querySelectorAll('[data-access]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.access,a=ACCESS[id];if(state.access.has(id))return notify(`${a.label} liegt bereits.`);if(assignTask(`${a.label} legen`,a.duration,()=>{state.access.add(id);if(id==='artery')addChat('Dr. Weber','Die Arterie liegt. Der arterielle Blutdruck wird kontinuierlich angezeigt.');if(id==='bladder')addChat('Pflege 2','Der Blasenkatheter liegt. Temperatur wird jetzt kontinuierlich über den DK angezeigt.');},{roles:a.roles}))el('accessDialog').close();});}
function setupBloodDialog(){el('bloodBtn').onclick=()=>el('bloodDialog').showModal();el('uncrossedBtn').onclick=()=>{if(assignTask('2 ungekreuzte 0-negative EK anfordern',20,()=>addBackgroundTask('Bereitstellung 2 ungekreuzte EK',70,()=>{state.bloodInventory.uncrossed+=2;state.bloodRequested.push('uncrossed');addChat('Blutbank',`Zwei ungekreuzte EK sind bereit. Bestand: ${state.bloodInventory.uncrossed}.`);}),{roles:['nurse','doctor']}))el('bloodDialog').close();};el('crossedBtn').onclick=()=>{if(assignTask('2 gekreuzte EK anfordern',20,()=>addBackgroundTask('Bereitstellung 2 gekreuzte EK',100,()=>{state.bloodInventory.crossed+=2;state.bloodRequested.push('crossed');addChat('Blutbank',`Zwei gekreuzte EK sind bereit. Bestand: ${state.bloodInventory.crossed}.`);}),{roles:['nurse','doctor']}))el('bloodDialog').close();};el('giveCrossedEkBtn').onclick=()=>{if(state.bloodInventory.crossed<1){showToast('Kein gekreuztes EK verfügbar.');return;}if(doAction({type:'give_ek',source:'crossed'}))el('bloodDialog').close();};el('giveUncrossedEkBtn').onclick=()=>{if(state.bloodInventory.uncrossed<1){showToast('Kein ungekreuztes EK verfügbar.');return;}if(doAction({type:'give_ek',source:'uncrossed'}))el('bloodDialog').close();};}
function showLabResults(){state.newLabResult=false;const rows=[...state.labsAvailable].map(id=>{const l=LABS[id];let value=l.value,abnormal=l.abnormal;if(id==='hb'){value=state.patient.hb.toFixed(1)+' g/dl';abnormal=state.patient.hb<12;}if(id==='hct'){value=Math.round(state.patient.hb*3)+' %';abnormal=true;}if(id==='lactate'){value=state.patient.lactate.toFixed(1)+' mmol/l';abnormal=state.patient.lactate>2.2;}if(id==='calcium'){value=(state.patient.iCa*2).toFixed(2)+' mmol/l';abnormal=state.patient.iCa<1.08;}return `<tr><td>${l.label}</td><td class="${abnormal?'abnormal':''}">${value}</td><td>${l.norm}</td></tr>`}).join('');showResults('Laborergebnisse',rows||'<tr><td colspan="3">Keine Ergebnisse verfügbar.</td></tr>');}
function showBgaResults(){
  state.newBgaResult=false;if(!state.bgaResults.length)return showResults('BGA-Ergebnisse','<tr><td colspan="3">Keine Ergebnisse verfügbar.</td></tr>');
  const html=state.bgaResults.slice().reverse().map((b,i)=>`<div class="result-group"><h3>BGA ${state.bgaResults.length-i} · ${b.type||'unbekannt'} · ${formatTime(b.time)}</h3><table class="result-table"><thead><tr><th>Parameter</th><th>Ergebnis</th><th>Normbereich</th></tr></thead><tbody>${b.values.map(r=>`<tr><td>${r[0]}</td><td class="${r[3]?'abnormal':''}">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>`).join('');
  el('resultsTitle').textContent='BGA-Verlauf';el('resultsContent').innerHTML=html;el('resultsDialog').showModal();
}
function showResults(title,rows){el('resultsTitle').textContent=title;el('resultsContent').innerHTML=`<table class="result-table"><thead><tr><th>Parameter</th><th>Ergebnis</th><th>Normbereich</th></tr></thead><tbody>${rows}</tbody></table>`;el('resultsDialog').showModal();}

function hasUsableAccess(){return [...state.access].some(id=>ACCESS[id]?.suitable||ACCESS[id.split('_').slice(0,2).join('_')]?.suitable);}
function markFirstTherapy(){if(state.firstTherapyAt===null)state.firstTherapyAt=state.elapsed;}

const MEDICATIONS={
  adrenaline:{label:'Adrenalin',duration:20},amiodarone:{label:'Amiodaron',duration:30},atropine:{label:'Atropin',duration:20},adenosine:{label:'Adenosin',duration:20},
  aspirin:{label:'ASS',duration:20},heparin:{label:'Heparin',duration:20},nitroglycerin:{label:'Nitroglycerin',duration:20},urapidil:{label:'Urapidil',duration:20},metoprolol:{label:'Metoprolol',duration:20},furosemide:{label:'Furosemid',duration:20},
  salbutamol:{label:'Salbutamol',duration:25},ipratropium:{label:'Ipratropium',duration:25},prednisolone:{label:'Prednisolon',duration:25},dimetindene:{label:'Dimetinden',duration:20},
  ketamine:{label:'Ketamin',duration:25},midazolam:{label:'Midazolam',duration:20},propofol:{label:'Propofol',duration:20},etomidate:{label:'Etomidat',duration:20},fentanyl:{label:'Fentanyl',duration:20},morphine:{label:'Morphin',duration:20},piritramide:{label:'Piritramid',duration:20},naloxone:{label:'Naloxon',duration:20},flumazenil:{label:'Flumazenil',duration:20},
  rocuronium:{label:'Rocuronium',duration:20},succinylcholine:{label:'Succinylcholin',duration:20},calcium:{label:'Calcium',duration:25},magnesium:{label:'Magnesium',duration:25},bicarbonate:{label:'Natriumbicarbonat',duration:25},glucose:{label:'Glukose',duration:20},insulin:{label:'Insulin',duration:20},glucagon:{label:'Glukagon',duration:20},
  vasopressin:{label:'Vasopressin',duration:25},dobutamine:{label:'Dobutamin',duration:30},ceftriaxone:{label:'Ceftriaxon',duration:30},pip_tazo:{label:'Piperacillin/Tazobactam',duration:30},meropenem:{label:'Meropenem',duration:30}
};

const MEDICATION_EFFECTS={
  atropine:{duration:120,hr:38},adrenaline:{duration:120,hr:30,sys:28,dia:16},amiodarone:{duration:240,hr:-18},adenosine:{duration:18,hr:-70},
  metoprolol:{duration:240,hr:-28,sys:-9,dia:-4},urapidil:{duration:240,sys:-24,dia:-14},nitroglycerin:{duration:180,sys:-18,dia:-10},
  dobutamine:{duration:240,hr:14,sys:18},vasopressin:{duration:240,sys:22,dia:15},calcium:{duration:150,sys:10,dia:6},
  ketamine:{duration:150,hr:12,sys:12},propofol:{duration:150,sys:-24,dia:-14,rr:-12,spo2:-3},midazolam:{duration:180,sys:-10,dia:-5,rr:-7,spo2:-2},etomidate:{duration:90,sys:-4,rr:-5},
  fentanyl:{duration:240,sys:-8,dia:-4,rr:-8,spo2:-3},morphine:{duration:240,sys:-11,dia:-6,rr:-8,spo2:-3},piritramide:{duration:240,sys:-9,dia:-5,rr:-7,spo2:-2},
  naloxone:{duration:150,rr:9,spo2:6,hr:8},flumazenil:{duration:120,rr:6,spo2:3},salbutamol:{duration:240,hr:12,spo2:4},ipratropium:{duration:240,spo2:2},
  magnesium:{duration:240,hr:-8,sys:-5},bicarbonate:{duration:150,sys:4},glucose:{duration:150,hr:4},glucagon:{duration:150,hr:12,sys:8},
  furosemide:{duration:240,sys:-6},prednisolone:{duration:600},dimetindene:{duration:240,sys:-4},aspirin:{duration:600},heparin:{duration:600},
  insulin:{duration:600},ceftriaxone:{duration:600},pip_tazo:{duration:600},meropenem:{duration:600},rocuronium:{duration:420,paralysis:true},succinylcholine:{duration:120,paralysis:true}
};
function applyMedicationEffect(id){const effect=MEDICATION_EFFECTS[id];if(!effect)return;if(id==='calcium')state.patient.iCa=clamp(state.patient.iCa+0.14,0.8,1.5);state.therapies.medicationEffects.push({...effect,id,until:state.elapsed+effect.duration});if(effect.paralysis){state.therapies.paralyzedUntil=Math.max(state.therapies.paralyzedUntil,state.elapsed+effect.duration);addChat('Team vor Ort',`${MEDICATIONS[id].label}: neuromuskuläre Blockade wirksam. Keine Sedierung oder Analgesie. ${state.therapies.ventilation?'Beatmung läuft.':'Ohne Beatmung drohen Apnoe und Hypoxämie.'}`);}}

function doAction(action){
  const type=action.type;
  if(type==='measure_nibp'){state.assessment.add('C_bp');return measureNibp();}
  if(type==='count_rr'){state.assessment.add('B_rr');return countRr();}
  if(type==='measure_temp'){state.assessment.add('E_temp');return measureTemp();}
  if(type==='ask_mental'){state.assessment.add('D_mental');addChat('Pflege 1',`Der Patient ist aktuell ${state.patient.mental}.`);return true;}
  if(type==='ask_skin'){state.assessment.add('C_skin');addChat('Pflege 2',`Die Haut ist ${getActiveCase().patient.visible.skin}. Rekapillarisierungszeit etwa ${state.patient.sys<80?'4':'3'} Sekunden.`);return true;}
  if(type==='ask_drainage'){state.assessment.add('C_bleeding');const visible=getActiveCase().patient.visible;addChat('Pflege 1',`Die Drainage fördert weiter ${visible.drainageDescription}, grob ${Math.round(visible.drainageBaseMl+state.elapsed*visible.drainagePerSecondMl)} ml seit Fallbeginn.`);return true;}
  if(type==='ask_urine'){state.assessment.add('C_urine');addChat('Pflege 2',state.access.has('bladder')?'Seit Anlage nur geringe Urinmenge.':'Ohne DK ist die Diurese nicht quantifiziert.');return true;}
  if(type==='ask_allergy'){state.assessment.add('S_allergy');addChat('Pflege 1',getActiveCase().history.allergy);return true;}
  if(type==='ask_auscultation'){state.assessment.add('B_auscultation');logEvent('Auskultationsbefund erhoben.');addChat('Team vor Ort',`Auskultation: ${getActiveCase().diagnostics.auscultation}`);return true;}
  if(type==='measure_bz'){state.assessment.add('D_glucose');return assignTask('Blutzucker messen',15,()=>{state.lastMeasurements.bz={value:Math.round(state.patient.glucose),time:state.elapsed};addChat('Anna Keller',`Blutzucker: ${Math.round(state.patient.glucose)} mg/dl.`);},{roles:['nurse','doctor']});}
  if(type==='alert_surgeon'){return assignTask('Operateur und Anästhesie alarmieren',15,()=>{state.escalationAt=state.elapsed;addChat('Dr. Weber','Operateur und Anästhesie sind informiert und auf dem Weg.');},{roles:['doctor']});}
  if(type==='shock_position'){if(state.therapies.shockPositionUntil>state.elapsed){addChat('Anna Keller','Der Patient befindet sich bereits in Schocklage.');return true;}return assignTask('Schocklage herstellen',15,()=>{state.therapies.shockPositionUntil=state.elapsed+180;markFirstTherapy();addChat('Anna Keller','Schocklage ist hergestellt. Der venöse Rückstrom und der Blutdruck verbessern sich vorübergehend.');},{roles:['nurse','doctor']});}
  if(type==='insert_artery'){const a=ACCESS.artery;if(state.access.has('artery')){addChat('Dr. Weber','Eine arterielle Kanüle liegt bereits.');return true;}return assignTask('Arterielle Kanüle legen',a.duration,()=>{state.access.add('artery');addChat('Dr. Weber','Die arterielle Kanüle liegt; der Blutdruck wird kontinuierlich angezeigt.');},{roles:['doctor']});}
  if(type==='ventilate'){if(state.therapies.ventilation){addChat('Team vor Ort','Die kontrollierte Beatmung läuft bereits.');return true;}return assignTask('Beutel-Masken-Beatmung / kontrollierte Beatmung beginnen',20,()=>{state.therapies.ventilation=true;markFirstTherapy();},{roles:['nurse','doctor']});}
  if(type==='sono'){return requestSono();}
  if(type==='insert_pvk'){const qty=clamp(Number(action.quantity||1),1,2),size=['pink','green','orange'].includes(action.size)?action.size:'green',id=`pvk_${size}`,a=ACCESS[id];let started=0;for(let i=0;i<qty;i++){if(assignTask(`${a.label} legen`,a.duration,()=>{state.access.add(`${id}_${Date.now()}_${Math.random()}`);},{roles:['doctor','nurse']}))started++;}return started>0;}
  if(type==='oxygen'){if(state.therapies.oxygen){addChat('Pflege 1','Sauerstoff läuft bereits.');return true;}return assignTask('Sauerstoffgabe beginnen',15,()=>{state.therapies.oxygen=true;markFirstTherapy();},{roles:['doctor','nurse']});}
  if(type==='warming'){if(state.therapies.warming){addChat('Pflege 2','Aktiver Wärmeerhalt läuft bereits.');return true;}return assignTask('Aktiven Wärmeerhalt beginnen',20,()=>{state.therapies.warming=true;markFirstTherapy();},{roles:['doctor','nurse']});}
  if(type==='fluid'){if(!hasUsableAccess()){addChat('Pflege 1','Volumen ist ohne geeigneten Gefäßzugang nicht möglich.');return false;}return assignTask('500 ml Kristalloid verabreichen',60,()=>{state.therapies.fluidEffects.push(state.elapsed+180);state.therapies.crystalloidMl+=500;state.patient.hb=clamp(state.patient.hb-0.25,4.0,12);markFirstTherapy();addChat('Anna Keller',`500 ml Kristalloid sind verabreicht. Gesamt: ${state.therapies.crystalloidMl} ml. Der Volumeneffekt summiert sich; der Hb fällt durch Hämodilution.`);},{roles:['nurse','doctor']});}
  if(type==='norepi_bolus'){if(!hasUsableAccess()){addChat('Dr. Weber','Für Noradrenalin fehlt ein geeigneter Gefäßzugang.');return false;}return assignTask('Noradrenalin 5 µg i.v. als Bolus geben',15,()=>{state.therapies.norepiBolusUntil=state.elapsed+60;markFirstTherapy();addChat('Dr. Weber','Noradrenalin 5 µg i.v. als Bolus gegeben; die simulierte Wirkung hält etwa eine Minute an.');},{roles:['doctor','nurse']});}
  if(type==='norepi_perfusor'){if(!hasUsableAccess()){addChat('Dr. Weber','Für den Noradrenalin-Perfusor fehlt ein geeigneter Gefäßzugang.');return false;}if(state.therapies.norepiPerfusor){addChat('Dr. Weber','Der Noradrenalin-Perfusor läuft bereits.');return true;}return assignTask('Noradrenalin-Perfusor mit 0,05 µg/kg/min starten',45,()=>{state.therapies.norepiPerfusor=true;state.therapies.norepiRate=2;markFirstTherapy();addChat('Dr. Weber','Noradrenalin-Perfusor läuft mit 0,05 µg/kg/min. Die Dosis kann am Monitor angepasst werden.');},{roles:['doctor','nurse']});}
  if(type==='txa'){if(!hasUsableAccess()){addChat('Anna Keller','Für Tranexamsäure fehlt ein geeigneter Gefäßzugang.');return false;}if(state.therapies.txa){addChat('Anna Keller','Tranexamsäure wurde bereits gegeben.');return true;}return assignTask('Tranexamsäure 1 g i.v. verabreichen',30,()=>{state.therapies.txa=true;markFirstTherapy();addChat('Anna Keller','Tranexamsäure 1 g i.v. wurde verabreicht.');},{roles:['doctor','nurse']});}
  if(type==='give_medication'){const med=MEDICATIONS[action.medication];if(!med){addChat('Team vor Ort','Dieses Medikament ist im Simulator nicht hinterlegt.');return false;}if(!hasUsableAccess()&&!['salbutamol','ipratropium','nitroglycerin','aspirin'].includes(action.medication)){addChat('Anna Keller',`Für ${med.label} fehlt ein geeigneter Gefäßzugang.`);return false;}return assignTask(`${med.label} verabreichen`,med.duration,()=>{state.therapies.medications.push({id:action.medication,label:med.label,time:state.elapsed});applyMedicationEffect(action.medication);markFirstTherapy();addChat('Anna Keller',`${med.label} wurde verabreicht. Die simulierte physiologische Wirkung ist aktiv.`);},{roles:['nurse','doctor']});}
  if(type==='request_bga'){return requestBga(action.mode==='arterial'?'arterial':'venous');}
  if(type==='give_ek'){
    if(!hasUsableAccess()){addChat('Pflege 1','Für die Transfusion fehlt ein geeigneter Gefäßzugang.');return false;}
    const requestedSource=action.source;const source=requestedSource&&state.bloodInventory[requestedSource]>0?requestedSource:state.bloodInventory.crossed>0?'crossed':state.bloodInventory.uncrossed>0?'uncrossed':null;if(!source){addChat('Dr. Weber','Es ist aktuell kein EK vor Ort. Bitte zuerst EK anfordern.');return false;}
    return assignTask('1 EK transfundieren',45,()=>{state.bloodInventory[source]-=1;state.therapies.bloodUnitsGiven+=1;state.patient.hb=clamp(state.patient.hb+0.7,3,12);markFirstTherapy();addChat('Pflege 1',`Ein EK wurde transfundiert. Verbleibender Bestand: ${state.bloodInventory.crossed+state.bloodInventory.uncrossed}.`);},{roles:['doctor']});
  }
  return false;
}

function localInterpret(q){
  const a=[]; const isQuestion=/\?|^(wie|ist|sind|hat|haben|kann|können|braucht|liegt|gibt)/.test(q.trim());if(/(?:nibp|nichtinvasiv.*blutdruck|blutdruck.*mess|rr.*mess)/.test(q)&&!isQuestion)a.push({type:'measure_nibp'});if(/(?:atemfrequenz|\baf\b).*(?:zähl|mess|bestimm)|(?:zähl|mess|bestimm).*(?:atemfrequenz|\baf\b)/.test(q)&&!isQuestion)a.push({type:'count_rr'});if(/temperatur.*(?:mess|bestimm)|(?:mess|bestimm).*temperatur/.test(q)&&!isQuestion)a.push({type:'measure_temp'});if(/bewusst|orientiert|gcs|ansprech/.test(q))a.push({type:'ask_mental'});if(/haut|rekap|kapillar/.test(q))a.push({type:'ask_skin'});if(/drainage|blutverlust|blutung/.test(q))a.push({type:'ask_drainage'});if(/urin|ausscheid/.test(q))a.push({type:'ask_urine'});if(/allerg/.test(q))a.push({type:'ask_allergy'});if(/auskult|abhören|atemgeräusch|herztöne/.test(q))a.push({type:'ask_auscultation'});if(/\bbz\b|blutzucker|glukose.*mess|zucker.*mess/.test(q))a.push({type:'measure_bz'});
  if(!isQuestion){if(/operateur|chirurg|op-team|anästhesie.*alarm|hilfe.*holen/.test(q))a.push({type:'alert_surgeon'});if(/\bbga\b|blutgasanalyse/.test(q)){if(/arteriell|arterielle|art\./.test(q))a.push({type:'request_bga',mode:'arterial'});else if(/venös|venoes|venöse/.test(q))a.push({type:'request_bga',mode:'venous'});}if(/(arterie|arterielle kanüle|arteriellen zugang).*(leg|anleg|platzier)|(leg|anleg|platzier).*(arterie|arterielle kanüle|arteriellen zugang)/.test(q))a.push({type:'insert_artery'});else if(/(leg|legt|legen|anlage).*(zugang|pvk)|^(zugang|pvk).*(leg|legen)/.test(q))a.push({type:'insert_pvk',quantity:/\b(zwei|2)\b/.test(q)?2:1,size:/orange/.test(q)?'orange':/rosa|pink/.test(q)?'pink':'green'});if(/sauerstoff|\bo2\b/.test(q))a.push({type:'oxygen'});if(/beatm|ambu|beutel.?maske/.test(q))a.push({type:'ventilate'});if(/sono|ultraschall|pocus|focus/.test(q))a.push({type:'sono'});if(/wärm|decke|hypotherm/.test(q))a.push({type:'warming'});if(/schocklage|beine.*hoch|beine.*anheb|autotransfusion/.test(q))a.push({type:'shock_position'});if(/kristall|volumen|ringer|infusion/.test(q))a.push({type:'fluid'});if(/tranexam|txa/.test(q))a.push({type:'txa'});if(/noradrenalin|norepi/.test(q)){if(/bolus/.test(q))a.push({type:'norepi_bolus'});else a.push({type:'norepi_perfusor'});}if(/\bek\b|erythro|transfund|blutkonserve/.test(q))a.push({type:'give_ek'});const medPatterns={adrenaline:/adrenalin/,amiodarone:/amiodaron/,atropine:/atropin/,adenosine:/adenosin/,aspirin:/\bass\b|aspirin/,heparin:/heparin/,nitroglycerin:/nitro|glyceroltrinitrat/,urapidil:/urapidil|ebrantil/,metoprolol:/metoprolol/,furosemide:/furosemid|lasix/,salbutamol:/salbutamol/,ipratropium:/ipratropium|atrovent/,prednisolone:/prednisolon/,dimetindene:/dimetinden|fenistil/,ketamine:/ketamin|ketanest/,midazolam:/midazolam|dormicum/,propofol:/propofol/,etomidate:/etomidat/,fentanyl:/fentanyl/,morphine:/morphin/,piritramide:/piritramid|dipidolor/,naloxone:/naloxon/,flumazenil:/flumazenil|anexate/,rocuronium:/rocuronium|esmeron/,succinylcholine:/succinylcholin|lysthenon/,calcium:/calcium/,magnesium:/magnesium/,bicarbonate:/bicarbonat|bikarbonat/,glucose:/(?:glukose|glucose)(?!.*(?:mess|bestimm|kontroll))/,insulin:/insulin/,glucagon:/glukagon/,vasopressin:/vasopressin/,dobutamine:/dobutamin/,ceftriaxone:/ceftriaxon/,pip_tazo:/piperacillin|tazobactam|pip.?taz/,meropenem:/meropenem/};for(const [med,re] of Object.entries(medPatterns))if(re.test(q)&&!a.some(x=>x.type==='give_medication'&&x.medication===med))a.push({type:'give_medication',medication:med});}return a;
}
function trackAssessmentFromText(q){
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
    [/bewusst|orientiert|gcs|ansprech/, 'D_mental'],
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

async function handleChat(text){
  const t=text.trim();if(!t)return;
  addChat('Telekonsultation',t,'user');
  const q=t.toLowerCase();
  trackAssessmentFromText(q);

  // Eindeutige Aufträge werden zuerst lokal erkannt. Dadurch gibt es keine
  // unnötigen KI-Rückfragen zu Dosis, Zugang oder Applikationsweg.
  if((/\bbga\b|blutgasanalyse/.test(q))&&!/arteriell|arterielle|art\.|venös|venoes|venöse/.test(q)){
    addChat('Team vor Ort','Soll die BGA arteriell oder venös abgenommen werden?');return;
  }
  const localActions=localInterpret(q);
  if(localActions.length){
    localActions.forEach(doAction);
    return;
  }

  if(state.aiAvailable){
    const placeholder={time:state.elapsed,sender:'Team vor Ort',text:'KI wertet die Nachricht aus …',cls:'team ai-thinking'};
    state.chat.push(placeholder);renderChat();
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,state:{elapsed:state.elapsed,visiblePatient:{heartRate:Math.round(state.patient.hr),spo2:Math.round(state.patient.spo2),arterialPressure:state.access.has('artery')?`${Math.round(state.patient.sys)}/${Math.round(state.patient.dia)}`:null,lastNibp:state.lastMeasurements.nibp,lastRespiratoryRate:state.lastMeasurements.rr,lastTemperature:state.access.has('bladder')?state.patient.temp:state.lastMeasurements.temp,consciousness:state.patient.mental,skin:getActiveCase().patient.visible.skin,drainage:`${getActiveCase().patient.visible.drainageDescription}, etwa ${Math.round(getActiveCase().patient.visible.drainageBaseMl+state.elapsed*getActiveCase().patient.visible.drainagePerSecondMl)} ml seit Fallbeginn`},knownLabs:Object.fromEntries([...state.labsAvailable].map(id=>[id,LABS[id]?.value])),bgaHistory:state.bgaResults.map(b=>({time:b.time,values:Object.fromEntries(b.values.map(v=>[v[0],v[1]]))})),access:[...state.access],bloodInventory:state.bloodInventory,staff:state.staff.map(s=>({name:s.name,role:s.role,available:s.busyUntil<=state.elapsed})),norepiPerfusor:state.therapies.norepiPerfusor}})});
      const data=await r.json();state.chat=state.chat.filter(x=>x!==placeholder);if(!r.ok)throw new Error(data.error||'KI-Fehler');
      const actions=data.actions||[];
      const results=actions.map(doAction);
      const accepted=results.filter(Boolean).length;
      const rejected=results.length-accepted;
      if(actions.length===0){
        if(data.reply)addChat('Team vor Ort',data.reply);
        else addChat('Team vor Ort','Bitte formulieren Sie die Frage noch etwas genauer.');
      }else if(rejected>0&&accepted>0){
        addChat('Team vor Ort','Ein Teil der Anordnung wurde übernommen. Nicht durchführbare Anteile wurden abgelehnt.');
      }
      // Bei vollständig übernommenen Aufträgen erzeugen die konkreten
      // Simulationsfunktionen bereits die passende Bestätigung. Keine zweite
      // generische KI-Antwort anhängen.
      return;
    }catch(e){
      state.chat=state.chat.filter(x=>x!==placeholder);state.aiAvailable=false;el('aiStatus').textContent='Regel-Fallback';el('aiStatus').className='status-pill idle';addChat('System','Gemini war nicht erreichbar. Der lokale Regel-Chat übernimmt.','system');
    }
  }
  addChat('Anna Keller','Bitte formulieren Sie die Frage noch etwas konkreter.');
}
async function checkAiStatus(){try{const r=await fetch('/api/status');const d=await r.json();state.aiAvailable=!!d.enabled;el('aiStatus').textContent=state.aiAvailable?'Gemini aktiv':'Regel-Fallback';el('aiStatus').className=`status-pill ${state.aiAvailable?'live':'idle'}`;}catch{state.aiAvailable=false;el('aiStatus').textContent='Regel-Fallback';}}

const NOREPI_RATES=[0.02,0.05,0.10,0.15,0.20];
function adjustNorepi(delta){if(!state.therapies.norepiPerfusor)return;state.therapies.norepiRate=clamp(state.therapies.norepiRate+delta,1,5);const dose=NOREPI_RATES[state.therapies.norepiRate-1];logEvent(`Noradrenalin-Perfusor auf ${dose.toFixed(2)} µg/kg/min eingestellt.`);addChat('Dr. Weber',`Noradrenalin läuft jetzt mit ${dose.toFixed(2)} µg/kg/min.`);renderAll();}
function stopNorepi(){if(!state.therapies.norepiPerfusor)return;state.therapies.norepiPerfusor=false;logEvent('Noradrenalin-Perfusor gestoppt.');addChat('Dr. Weber','Noradrenalin-Perfusor wurde gestoppt.');renderAll();}

function endSimulation(){state.ended=true;state.running=false;clearInterval(state.timer);state.timer=null;stopPulseLoop();stopAlarmLoop();el('pauseBtn').disabled=true;el('startBtn').disabled=true;logEvent(`Simulation nach ${Math.round(SIM_DURATION/60)} Minuten beendet.`);showSummary();}
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
      firstTherapyAt:state.firstTherapyAt,
      crystalloidMl:state.therapies.crystalloidMl,
      bloodUnitsGiven:state.therapies.bloodUnitsGiven,
      lastHb:Number(state.patient.hb.toFixed(1)),
      assessment:[...state.assessment]
    },
    details:{
      events:state.events.map(e=>({time:e.time,text:e.text,type:e.type})),
      essentialEvents,
      chat:state.chat.map(m=>({time:m.time,sender:m.sender,text:m.text,kind:m.cls})),
      vitals:state.vitalHistory,
      bgaResults:state.bgaResults,
      labsRequested:[...state.labsRequested],
      labsAvailable:[...state.labsAvailable],
      access:[...state.access],
      bloodInventory:state.bloodInventory,
      therapies:{
        oxygen:state.therapies.oxygen,warming:state.therapies.warming,ventilation:state.therapies.ventilation,
        norepiPerfusor:state.therapies.norepiPerfusor,norepiRate:state.therapies.norepiRate,
        crystalloidMl:state.therapies.crystalloidMl,bloodUnitsGiven:state.therapies.bloodUnitsGiven,
        txa:state.therapies.txa,medications:state.therapies.medications
      },
      caseMetadata:{id:getActiveCase().id,title:getActiveCase().title,number:getActiveCase().number,setting:getActiveCase().setting},
      finalVitals:{hr:state.patient.hr,sys:state.patient.sys,dia:state.patient.dia,spo2:state.patient.spo2,rr:state.patient.rr,temp:state.patient.temp,mental:state.patient.mental}
    }
  };
}
async function saveSimulationResult(payload){
  if(state.saveAttempted)return;
  state.saveAttempted=true;
  const status=el('saveStatus');
  if(status){status.textContent='Ergebnis wird gespeichert …';status.className='save-status';}
  try{
    const response=await fetch('/api/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Speichern fehlgeschlagen');
    state.savedResultId=data.id||null;
    if(status){status.textContent='✓ Ergebnis wurde gespeichert.';status.className='save-status ok';}
  }catch(error){
    console.error('Ergebnis konnte nicht gespeichert werden:',error);
    if(status){status.textContent=`Ergebnis konnte nicht gespeichert werden: ${error.message}`;status.className='save-status error';}
  }
}

function showSummary(){
  const evaluateCriterion=(criterion)=>{
    const done={
      early_escalation:state.escalationAt!==null&&state.escalationAt<=(criterion.thresholdSeconds||120),
      bga:state.bgaAvailable,
      lab_hb:state.labsAvailable.has('hb'),
      vascular_access:hasUsableAccess(),
      blood_prepared:state.bloodRequested.length>0,
      circulation_therapy:Boolean(state.therapies.fluidEffects.length||state.therapies.bloodUnitsGiven||state.therapies.crystalloidMl>0)
    }[criterion.id]||false;
    return [done,criterion.labelDone,criterion.labelMissing];
  };
  const checks=getActiveCase().scoring.map(evaluateCriterion);
  const positives=checks.filter(x=>x[0]).map(x=>x[1]),missing=checks.filter(x=>!x[0]).map(x=>x[2]);const pct=Math.round(positives.length/checks.length*100);
  el('summaryContent').innerHTML=`<div class="summary-score">${pct} % Prozessadhärenz</div><p class="modal-note"><strong>Benutzer:</strong> ${escapeHtml(participantUsername)} · Didaktische, nicht validierte Auswertung.</p><div id="saveStatus" class="save-status">Ergebnis wird vorbereitet …</div><div class="summary-simple"><div><h3>Gut umgesetzt</h3><ul>${positives.map(x=>`<li>${x}</li>`).join('')||'<li>—</li>'}</ul></div><div><h3>Besprechen</h3><ul>${missing.map(x=>`<li>${x}</li>`).join('')||'<li>—</li>'}</ul></div><div><h3>Ergebnis</h3><ul><li>Schwierigkeit: ${{easy:'Leicht',medium:'Mittel',hard:'Schwer'}[state.difficulty]}</li><li>Patient: ${state.dead?'Kreislaufstillstand – '+state.deathReason:'am Fallende lebend'}</li><li>Kristalloide: ${state.therapies.crystalloidMl} ml</li><li>EK transfundiert: ${state.therapies.bloodUnitsGiven}</li><li>Letzter Hb: ${state.patient.hb.toFixed(1)} g/dl</li></ul></div></div>${assessmentSummaryHtml()}<h2>Wesentliche Maßnahmen</h2><div class="summary-timeline">${state.events.filter(e=>/übernimmt:|abgeschlossen|abgebrochen|alarmiert|transfund|verabreicht|BGA|Labor|Sonografie|Kreislaufstillstand/.test(e.text)).map(e=>`<div><strong>${formatTime(e.time)}</strong><span>${escapeHtml(e.text)}</span></div>`).join('')||'<p>Keine wesentlichen Maßnahmen dokumentiert.</p>'}</div><h2>Vitalparameter im Verlauf</h2><div class="chart-grid">${makeChart('Herzfrequenz','hr','#24e879',50,190,'/min')}${makeChart('MAP','map','#ff4d68',35,110,'mmHg')}${makeChart('SpO₂','spo2','#39a8ff',75,100,'%')}</div>`;el('summaryDialog').showModal();saveSimulationResult(buildSavedResult(pct,positives,missing));
}

function onClick(id,handler){const node=el(id);if(!node){console.warn(`UI-Element fehlt: #${id}`);return;}node.onclick=handler;}
function bind(){
  const usernameDialog=el('usernameDialog');if(usernameDialog)usernameDialog.addEventListener('cancel',e=>e.preventDefault());const usernameForm=el('usernameForm');if(usernameForm)usernameForm.addEventListener('submit',e=>{e.preventDefault();const input=el('usernameInput');const value=String(input?.value||'').trim().replace(/\s+/g,' ');if(value.length<2){el('usernameError')?.classList.remove('hidden');input?.focus();return;}participantUsername=value.slice(0,80);el('usernameError')?.classList.add('hidden');el('usernameDialog')?.close();renderButtons();});
  onClick('changeUserBtn',()=>{if(state.running&&!state.ended){showToast('Benutzerwechsel erst nach Ende der Simulation möglich.');return;}el('usernameInput').value=participantUsername;el('usernameDialog')?.showModal();el('usernameInput')?.focus();});
  onClick('startBtn',startSimulation);onClick('pauseBtn',pauseSimulation);onClick('resetBtn',resetSimulation);onClick('finishBtn',()=>{if(state.running&&!state.ended)endSimulation();});onClick('soundBtn',toggleSound);onClick('alarmBtn',toggleAlarm);
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
  const caseSelect=el('caseSelect');if(caseSelect){caseSelect.innerHTML=Object.values(window.TELECARE_CASES).filter(c=>c.enabled!==false).map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.number)} · ${escapeHtml(c.shortTitle)}</option>`).join('');caseSelect.value=activeCaseId;caseSelect.onchange=()=>{if(state.running&&!state.ended)return;activeCaseId=caseSelect.value;LABS=clone(getActiveCase().labs);BGA=clone(getActiveCase().bga?.staticRows||[]);const c=getActiveCase();el('caseSubtitle').textContent=`${c.shortTitle} · ${c.number}`;const durationSelect=el('durationSelect');if(durationSelect){durationSelect.value=String(c.defaultDurationSeconds||600);SIM_DURATION=Number(durationSelect.value);}state=initialState();renderAll();};}
  const c=getActiveCase();if(el('caseSubtitle'))el('caseSubtitle').textContent=`${c.shortTitle} · ${c.number}`;
  const durationSelect=el('durationSelect');if(durationSelect)durationSelect.onchange=()=>{if(!state.running){SIM_DURATION=Number(durationSelect.value);renderButtons();}};const difficultySelect=el('difficultySelect');if(difficultySelect)difficultySelect.onchange=()=>{if(!state.running)state.difficulty=difficultySelect.value;};
  setupLabDialog();setupAccessDialog();setupBloodDialog();
}
bind();renderAll();checkAiStatus();setTimeout(()=>{if(!participantUsername){const d=el('usernameDialog');if(d&&!d.open)d.showModal();el('usernameInput')?.focus();}},0);
