const el=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=value=>new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const fmtTime=seconds=>`${String(Math.floor((Number(seconds)||0)/60)).padStart(2,'0')}:${String(Math.round(Number(seconds)||0)%60).padStart(2,'0')}`;
const difficulty={easy:'Leicht',medium:'Mittel',hard:'Schwer'};
const evaluationLabels={system_easy:'Bedienung einfach',system_clear:'Oberfläche übersichtlich',system_chat:'Chat verstand Anweisungen',system_overview:'Patientenzustand überblickt',system_teaching:'Für Pflegeunterricht geeignet',system_more_cases:'Weitere Fälle gewünscht',case_realistic:'Fall realistisch',case_reactions:'Reaktionen nachvollziehbar',case_difficulty:'Schwierigkeit angemessen',case_apply_knowledge:'Schockkenntnisse angewendet',case_understanding:'Unterricht besser verstanden',case_overwhelmed:'Überfordert',case_recommend:'Fall empfohlen'};
let cachedSummary=null;

function makeVitalChart(data,title,key,color,minFixed,maxFixed,unit){
  if(!Array.isArray(data)||data.length<2)return '<p class="muted">Keine ausreichenden Verlaufsdaten.</p>';
  const width=520,height=170,pad=34,values=data.map(d=>Number(d[key])).filter(Number.isFinite);
  if(!values.length)return '<p class="muted">Keine Verlaufsdaten.</p>';
  const min=minFixed??Math.min(...values),max=maxFixed??Math.max(...values),span=Math.max(1,max-min);
  const pts=data.map((d,i)=>{const x=pad+(i/Math.max(1,data.length-1))*(width-pad*2),y=height-pad-((Number(d[key])-min)/span)*(height-pad*2);return `${x.toFixed(1)},${y.toFixed(1)}`}).join(' ');
  const lastTime=data[data.length-1]?.time||0;
  return `<div class="admin-chart"><h4>${esc(title)}</h4><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}" class="axis"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="3"/><text x="3" y="${pad+4}" class="label">${Math.round(max)} ${esc(unit)}</text><text x="3" y="${height-pad}" class="label">${Math.round(min)}</text><text x="${width-pad-38}" y="${height-7}" class="label">${fmtTime(lastTime)}</text></svg></div>`;
}
function vitalChartsHtml(vitals){return `<div class="admin-chart-grid">${makeVitalChart(vitals,'Herzfrequenz','hr','#159447',50,180,'/min')}${makeVitalChart(vitals,'MAP','map','#cf3048',25,110,'mmHg')}${makeVitalChart(vitals,'SpO₂','spo2','#1684d8',60,100,'%')}</div>`;}
function investigationTrendTable(history,title){
  if(!Array.isArray(history)||!history.length)return '<p class="muted">Keine Verlaufsdaten.</p>';
  const keys=[],seen=new Set();history.forEach(h=>(h.values||[]).forEach(v=>{const key=v.id||v[0];if(!seen.has(key)){seen.add(key);keys.push(key);}}));
  const find=key=>{for(const h of history){const v=(h.values||[]).find(x=>(x.id||x[0])===key);if(v)return v;}return null;};
  return `<div class="admin-trend-wrap"><table class="admin-trend-table"><thead><tr><th>Parameter</th>${history.map((h,i)=>`<th>${esc(title)} ${i+1}<small>${fmtTime(h.time)}${h.type?' · '+esc(h.type):''}</small></th>`).join('')}</tr></thead><tbody>${keys.map(key=>{const first=find(key);return `<tr><th>${esc(first?.label||first?.[0]||key)}<small>${esc(first?.norm||first?.[2]||'—')}</small></th>${history.map(h=>{const v=(h.values||[]).find(x=>(x.id||x[0])===key);if(!v)return '<td>—</td>';const val=v.value??v[1],abnormal=v.abnormal??v[3];return `<td class="${abnormal?'abnormal':''}">${esc(val)}</td>`;}).join('')}</tr>`;}).join('')}</tbody></table></div>`;
}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let data={};try{data=await r.json();}catch{}if(!r.ok)throw new Error(data.error||`Fehler ${r.status}`);return data;}
function showLogin(){el('loginView').classList.remove('hidden');el('dashboardView').classList.add('hidden');}
function showDashboard(username){el('loginView').classList.add('hidden');el('dashboardView').classList.remove('hidden');el('sessionInfo').textContent=`Angemeldet als ${username}`;loadResults();}
async function checkSession(){try{const d=await api('/api/admin/session');showDashboard(d.username);}catch{showLogin();}}

el('loginForm').addEventListener('submit',async e=>{e.preventDefault();el('loginError').classList.add('hidden');try{const d=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:el('adminUsername').value,password:el('adminPassword').value})});showDashboard(d.username);}catch(err){el('loginError').textContent=err.message;el('loginError').classList.remove('hidden');}});
el('logoutBtn').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});showLogin();};
el('refreshBtn').onclick=()=>{loadResults();cachedSummary=null;};el('searchBtn').onclick=()=>loadResults();el('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')loadResults();});el('closeDetailBtn').onclick=()=>el('detailDialog').close();

document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab-btn').forEach(x=>x.classList.toggle('active',x===btn));
  document.querySelectorAll('.admin-view').forEach(x=>x.classList.add('hidden'));
  el(btn.dataset.view).classList.remove('hidden');
  if(btn.dataset.view==='caseSummaryView')loadEvaluationSummary('case');
  if(btn.dataset.view==='systemSummaryView')loadEvaluationSummary('system');
}));
el('caseSummarySelect').addEventListener('change',renderCaseSummary);

async function loadResults(){const msg=el('dashboardMessage');msg.textContent='Ergebnisse werden geladen …';try{const q=encodeURIComponent(el('searchInput').value.trim()),d=await api(`/api/admin/results?search=${q}`);renderRows(d.results||[]);msg.textContent=`${d.results?.length||0} Ergebnis(se)`;}catch(err){if(err.message==='Nicht angemeldet.')return showLogin();msg.textContent=err.message;}}
function renderRows(rows){
  el('resultsBody').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(fmtDate(r.created_at))}</td><td><strong>${esc(r.username)}</strong></td><td>${esc(r.case_name)}</td><td>${esc(difficulty[r.difficulty]||r.difficulty)}</td><td>${esc(r.outcome)}</td><td class="score">${Number(r.score_percent)} %</td><td>${r.evaluation_skipped?'übersprungen':r.evaluation_completed?'abgegeben':'offen'}</td><td class="row-actions"><button class="detail-btn" data-id="${esc(r.id)}">Öffnen</button><button class="danger compact delete-result-btn" data-id="${esc(r.id)}" data-name="${esc(r.username)}">Löschen</button></td></tr>`).join(''):'<tr><td colspan="8">Keine Ergebnisse vorhanden.</td></tr>';
  document.querySelectorAll('.detail-btn').forEach(b=>b.onclick=()=>openDetail(b.dataset.id));
  document.querySelectorAll('.delete-result-btn').forEach(b=>b.onclick=()=>deleteResult(b.dataset.id,b.dataset.name));
}
async function deleteResult(id,name){
  if(!confirm(`Durchlauf von ${name} einschließlich Evaluation endgültig löschen?`))return;
  try{await api(`/api/admin/results/${encodeURIComponent(id)}`,{method:'DELETE'});cachedSummary=null;await loadResults();}catch(e){alert(e.message);}
}
async function deleteEvaluation(id){
  if(!confirm('Nur die Evaluation dieses Durchlaufs endgültig löschen? Das Simulationsergebnis bleibt erhalten.'))return;
  try{await api(`/api/admin/results/${encodeURIComponent(id)}/evaluation`,{method:'DELETE'});cachedSummary=null;el('detailDialog').close();await loadResults();}catch(e){alert(e.message);}
}

function evaluationHtml(ev){
  if(!ev)return '<p class="muted">Noch keine Evaluation abgegeben.</p>';
  if(ev.skipped)return '<p class="muted">Mit Dozentenpasswort übersprungen.</p>';
  const a=ev.answers||{},items=[...Object.entries(a.system||{}),...Object.entries(a.case||{})];
  return `<div class="evaluation-admin-grid">${items.map(([k,v])=>`<div class="metric"><span>${esc(evaluationLabels[k]||k)}</span><strong>${Number(v)}/5</strong></div>`).join('')}</div><div class="metric"><span>Technische Probleme</span><strong>${a.technicalProblems?'Ja':'Nein'}</strong>${a.technicalProblemText?`<p>${esc(a.technicalProblemText)}</p>`:''}</div>`;
}
async function openDetail(id){
  el('detailTitle').textContent='Ergebnis wird geladen …';el('detailContent').innerHTML='';el('detailDialog').showModal();
  try{
    const {result:r}=await api(`/api/admin/results/${encodeURIComponent(id)}`);el('detailTitle').textContent=r.username;
    const s=r.summary||{},d=r.details||{},events=d.essentialEvents||d.events||[],chat=d.chat||[],ev=r.evaluation||null;
    el('detailContent').innerHTML=`<div class="detail-grid"><div class="metric"><span>Datum</span><strong>${esc(fmtDate(r.created_at))}</strong></div><div class="metric"><span>Fall</span><strong>${esc(r.case_name)}</strong></div><div class="metric"><span>Score</span><strong class="score">${Number(r.score_percent)} %</strong></div><div class="metric"><span>Schwierigkeit</span><strong>${esc(difficulty[r.difficulty]||r.difficulty)}</strong></div><div class="metric"><span>Spieldauer</span><strong>${fmtTime(r.elapsed_seconds)}</strong></div><div class="metric"><span>Ergebnis</span><strong>${esc(r.outcome)}</strong></div><div class="metric"><span>Kristalloide</span><strong>${Number(s.crystalloidMl||0)} ml</strong></div><div class="metric"><span>EK gegeben</span><strong>${Number(s.bloodUnitsGiven||0)}</strong></div><div class="metric"><span>Letzter Hb</span><strong>${s.lastHb??'–'} g/dl</strong></div></div><div class="detail-actions"><button class="danger" id="deleteWholeResultBtn">Durchlauf löschen</button>${ev?'<button class="secondary danger-outline" id="deleteEvaluationBtn">Nur Evaluation löschen</button>':''}</div><h3 class="section-title">Evaluation</h3>${evaluationHtml(ev)}<h3 class="section-title">Vitalparameterverlauf</h3>${vitalChartsHtml(d.vitals||[])}<h3 class="section-title">Laborverlauf</h3>${investigationTrendTable(d.labResults||[],'Labor')}<h3 class="section-title">BGA-Verlauf</h3>${investigationTrendTable(d.bgaResults||[],'BGA')}<h3 class="section-title">ABCDE & SAMPLER</h3><div class="tag-list">${(s.assessment||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')||'<span class="tag">Keine Einträge</span>'}</div><h3 class="section-title">Wesentliche Maßnahmen</h3><div class="timeline">${events.map(e=>`<div><time>${fmtTime(e.time)}</time><span>${esc(e.text)}</span></div>`).join('')||'<div>Keine Maßnahmen dokumentiert.</div>'}</div><h3 class="section-title">Chatverlauf</h3><div class="chat-list">${chat.map(m=>`<div><time>${fmtTime(m.time)}</time><span><strong>${esc(m.sender)}:</strong> ${esc(m.text)}</span></div>`).join('')||'<div>Kein Chat dokumentiert.</div>'}</div>`;
    el('deleteWholeResultBtn').onclick=()=>{el('detailDialog').close();deleteResult(r.id,r.username);};
    if(el('deleteEvaluationBtn'))el('deleteEvaluationBtn').onclick=()=>deleteEvaluation(r.id);
  }catch(err){el('detailContent').innerHTML=`<p class="error">${esc(err.message)}</p>`;}
}

function scoreClass(value,inverted=false){const v=inverted?6-Number(value):Number(value);return v>=4?'good':v>=3?'medium':'bad';}
function summaryBar(label,value,count,{inverted=false}={}){
  const val=Number(value)||0,display=val.toFixed(2).replace('.',','),width=Math.max(0,Math.min(100,(val/5)*100));
  return `<div class="summary-row"><div class="summary-label"><span>${esc(label)}</span><strong>${display}/5</strong></div><div class="summary-track"><div class="summary-fill ${scoreClass(val,inverted)}" style="width:${width}%"></div></div><small>n = ${Number(count)||0}</small></div>`;
}
function renderTechnicalSummary(technical){const total=Number(technical?.total)||0,yes=Number(technical?.yes)||0,pct=total?Math.round(yes/total*100):0;return `<div class="technical-summary"><strong>${pct} %</strong><span>meldeten technische Probleme (${yes} von ${total})</span></div>`;}
async function loadEvaluationSummary(mode){
  const msg=el(mode==='case'?'caseSummaryMessage':'systemSummaryMessage');msg.textContent='Evaluationen werden ausgewertet …';
  try{if(!cachedSummary)cachedSummary=await api('/api/admin/evaluations/summary');if(mode==='case')setupCaseSummary();else renderSystemSummary();msg.textContent='';}catch(e){msg.textContent=e.message;}
}
function renderSystemSummary(){
  const s=cachedSummary?.system;if(!s||!s.count){el('systemSummaryContent').innerHTML='<p class="empty-state">Noch keine abgegebenen Evaluationen vorhanden.</p>';return;}
  el('systemSummaryContent').innerHTML=`<div class="summary-kpis"><div class="metric"><span>Evaluationen</span><strong>${s.count}</strong></div><div class="metric"><span>Mittlere Systembewertung</span><strong>${Number(s.overallAverage).toFixed(2).replace('.',',')}/5</strong></div></div><div class="summary-panel"><h3>Einzelfragen</h3>${Object.entries(s.averages||{}).map(([k,v])=>summaryBar(evaluationLabels[k]||k,v,s.count)).join('')}</div><div class="summary-panel"><h3>Technische Probleme</h3>${renderTechnicalSummary(s.technicalProblems)}</div>`;
}
function setupCaseSummary(){
  const cases=cachedSummary?.cases||[];el('caseSummarySelect').innerHTML=cases.map(c=>`<option value="${esc(c.caseName)}">${esc(c.caseName)} · n=${c.count}</option>`).join('');renderCaseSummary();
}
function renderCaseSummary(){
  const name=el('caseSummarySelect').value,c=(cachedSummary?.cases||[]).find(x=>x.caseName===name);
  if(!c){el('caseSummaryContent').innerHTML='<p class="empty-state">Noch keine fallbezogenen Evaluationen vorhanden.</p>';return;}
  el('caseSummaryContent').innerHTML=`<div class="summary-kpis"><div class="metric"><span>Evaluationen</span><strong>${c.count}</strong></div><div class="metric"><span>Mittlere Fallbewertung</span><strong>${Number(c.overallAverage).toFixed(2).replace('.',',')}/5</strong></div></div><div class="summary-panel"><h3>Einzelfragen</h3>${Object.entries(c.averages||{}).map(([k,v])=>summaryBar(evaluationLabels[k]||k,v,c.count,{inverted:k==='case_overwhelmed'})).join('')}</div><div class="summary-panel"><h3>Technische Probleme in diesem Fall</h3>${renderTechnicalSummary(c.technicalProblems)}</div>`;
}
checkSession();
