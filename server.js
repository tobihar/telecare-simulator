import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'dozent';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const EVALUATION_SKIP_PASSWORD = process.env.EVALUATION_SKIP_PASSWORD || '';
const SESSION_COOKIE = 'telecare_admin';
const SESSION_MAX_AGE = 8 * 60 * 60;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const ACTIONS = ['ask_mental','ask_skin','ask_drainage','ask_urine','ask_allergy','ask_auscultation','measure_bz','measure_nibp','count_rr','measure_temp','alert_surgeon','insert_pvk','insert_artery','oxygen','warming','fluid','norepi_bolus','norepi_perfusor','txa','give_ek','give_medication','request_bga','sono','ventilate','shock_position'];
const MEDS = ['adrenaline','amiodarone','atropine','adenosine','aspirin','heparin','nitroglycerin','urapidil','metoprolol','furosemide','salbutamol','ipratropium','prednisolone','dimetindene','ketamine','midazolam','propofol','etomidate','fentanyl','morphine','piritramide','naloxone','flumazenil','rocuronium','succinylcholine','calcium','magnesium','bicarbonate','glucose','insulin','glucagon','vasopressin','dobutamine','paracetamol','ceftriaxone','pip_tazo','meropenem','fibrinogen'];

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store', ...extraHeaders});
  res.end(JSON.stringify(data));
}
function text(res, status, value, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {'Content-Type':contentType,'Cache-Control':'no-store', ...extraHeaders});
  res.end(value);
}
async function body(req) {
  let s = '';
  for await (const c of req) {
    s += c;
    if (s.length > 4e6) throw new Error('Body too large');
  }
  return s ? JSON.parse(s) : {};
}
function safePath(relative) {
  const abs = path.resolve(__dirname, relative);
  return abs.startsWith(__dirname) ? abs : null;
}
async function sendFile(req, res, relative) {
  const abs = safePath(relative);
  if (!abs) return text(res, 403, 'Forbidden');
  try {
    const f = await readFile(abs);
    res.writeHead(200, {'Content-Type':MIME[path.extname(abs)] || 'application/octet-stream','Cache-Control':'no-store'});
    if (req.method === 'HEAD') return res.end();
    res.end(f);
  } catch {
    text(res, 404, 'Not found');
  }
}
async function staticFile(req, res, pathname) {
  if (pathname === '/admin' || pathname === '/admin/') return sendFile(req, res, 'admin.html');
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const abs = safePath(rel);
  if (!abs) return text(res, 403, 'Forbidden');
  try {
    const f = await readFile(abs);
    res.writeHead(200, {'Content-Type':MIME[path.extname(abs)] || 'application/octet-stream','Cache-Control':'no-store'});
    if (req.method === 'HEAD') return res.end();
    res.end(f);
  } catch {
    return sendFile(req, res, 'index.html');
  }
}

function promptFor(message,state){return `Du bist ausschließlich das Team vor Ort in einer medizinischen Telekonsultations-Simulation.
Antworte auf Deutsch, knapp, konkret und ausschließlich anhand der übergebenen Falldaten.

HARTE REGELN:
- Du darfst keine medizinischen Fakten ergänzen, ableiten oder plausibel erfinden.
- Wenn die Antwort nicht ausdrücklich in caseFacts, visiblePatient, knownLabs oder bgaHistory enthalten ist, antworte: "Das ist uns aktuell nicht bekannt."
- Verwende das in caseFacts hinterlegte Geschlecht konsequent. Bei weiblich: "die Patientin"; bei männlich: "der Patient".
- Fragen erzeugen niemals Maßnahmen.
- Nur ausdrücklich formulierte Aufträge dürfen actions erzeugen.
- Bei einer Frage nenne nur den erfragten Befund, maximal zwei kurze Sätze.
- Verwechsle ABCDE-Bereiche nicht: Atemwege/Airway nur mit airway beantworten; Vigilanz nur mit consciousness; Blutung nur mit bleeding.
- Niemals ein anderes Medikament als das ausdrücklich genannte auswählen. Ist es nicht in der ID-Liste, antworte: "Dieses Medikament ist im Simulator nicht verfügbar." und actions leer.
- Bei allgemeiner Anordnung "Antibiose/Antibiotikum geben" verwende ausschließlich pip_tazo.
- Bei einem erkannten Auftrag ist reply exakt leer. Die Simulation bestätigt selbst.
- BGA ohne arteriell/venös: "Arteriell oder venös?" und actions leer.
- Keine therapeutischen Vorschläge, keine Differentialdiagnosen und keine Rückfragen, außer der genannten BGA-Rückfrage.

Erlaubte Aktionen: ${ACTIONS.join(', ')}
Medikamenten-IDs: ${MEDS.join(', ')}

Vollständige Falldaten und aktueller Zustand:
${JSON.stringify(state??{})}

Nachricht: ${message}

Antworte ausschließlich als JSON:
{"reply":"","actions":[]}
Für insert_pvk optional quantity 1-2 und size pink/green/orange.
Für request_bga mode arterial/venous.
Für give_medication medication aus der ID-Liste.`;}

async function chat(req,res){
  if(!API_KEY)return json(res,503,{error:'Kein GEMINI_API_KEY gesetzt.'});
  try{
    const {message,state}=await body(req);
    if(typeof message!=='string'||!message.trim())return json(res,400,{error:'Nachricht fehlt.'});
    const payload={contents:[{role:'user',parts:[{text:promptFor(message.trim(),state)}]}],generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{reply:{type:'STRING'},actions:{type:'ARRAY',items:{type:'OBJECT',properties:{type:{type:'STRING',enum:ACTIONS},quantity:{type:'INTEGER',minimum:1,maximum:2},size:{type:'STRING',enum:['pink','green','orange']},medication:{type:'STRING',enum:MEDS},mode:{type:'STRING',enum:['arterial','venous']}},required:['type']}}},required:['reply','actions']}}};
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':API_KEY},body:JSON.stringify(payload)});
    const d=await r.json();if(!r.ok)return json(res,r.status,{error:d?.error?.message||'Gemini-Anfrage fehlgeschlagen'});
    const modelText=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'{}';
    const parsed=JSON.parse(modelText);parsed.actions=(parsed.actions||[]).filter(a=>ACTIONS.includes(a.type));
    if(parsed.actions.length)parsed.reply='';
    json(res,200,{reply:typeof parsed.reply==='string'?parsed.reply:'',actions:parsed.actions});
  }catch(e){console.error(e);json(res,502,{error:e instanceof Error?e.message:String(e)});}
}

function databaseConfigured(){ return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY); }
async function supabaseRequest(tablePath, options = {}) {
  if (!databaseConfigured()) throw new Error('Datenbank ist nicht konfiguriert.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tablePath}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (!response.ok) {
    console.error('Supabase error', response.status, data);
    throw new Error(data?.message || data?.hint || `Datenbankfehler ${response.status}`);
  }
  return data;
}
function cleanUsername(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}
async function saveResult(req, res) {
  try {
    if (!databaseConfigured()) return json(res,503,{error:'Ergebnisspeicherung ist noch nicht konfiguriert.'});
    const input = await body(req);
    const username = cleanUsername(input.username);
    if (username.length < 2) return json(res,400,{error:'Ein Benutzername mit mindestens 2 Zeichen ist erforderlich.'});
    const record = {
      client_run_id: String(input.clientRunId || '').slice(0, 100) || null,
      username,
      case_name: String(input.caseName || 'Postoperative Blutung').slice(0, 120),
      difficulty: String(input.difficulty || 'easy').slice(0, 20),
      planned_duration_seconds: Number(input.plannedDurationSeconds) || 0,
      elapsed_seconds: Number(input.elapsedSeconds) || 0,
      outcome: String(input.outcome || 'beendet').slice(0, 120),
      score_percent: Math.max(0, Math.min(100, Number(input.scorePercent) || 0)),
      summary: input.summary && typeof input.summary === 'object' ? input.summary : {},
      details: input.details && typeof input.details === 'object' ? input.details : {}
    };
    const data = await supabaseRequest('simulation_results?on_conflict=client_run_id', {
      method:'POST',
      headers:{Prefer:'return=representation,resolution=merge-duplicates'},
      body:JSON.stringify(record)
    });
    json(res,201,{ok:true,id:Array.isArray(data)?data[0]?.id:null});
  } catch (e) {
    console.error('Save result failed:', e);
    json(res,500,{error:e instanceof Error?e.message:String(e)});
  }
}


async function saveEvaluation(req,res){
  try{
    if(!databaseConfigured())return json(res,503,{error:'Evaluationsspeicherung ist noch nicht konfiguriert.'});
    const input=await body(req),username=cleanUsername(input.username),resultId=String(input.simulationResultId||'').trim();
    if(username.length<2)return json(res,400,{error:'Benutzername fehlt.'});
    const answers=input.answers&&typeof input.answers==='object'?input.answers:{},system=answers.system||{},caseAnswers=answers.case||{};
    const requiredSystem=['system_easy','system_clear','system_chat','system_overview','system_teaching','system_more_cases'];
    const requiredCase=['case_realistic','case_reactions','case_difficulty','case_apply_knowledge','case_understanding','case_overwhelmed','case_recommend'];
    const valid=v=>Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=5;
    if(!requiredSystem.every(k=>valid(system[k]))||!requiredCase.every(k=>valid(caseAnswers[k]))||typeof answers.technicalProblems!=='boolean')return json(res,400,{error:'Die Evaluation ist unvollständig.'});
    const record={simulation_result_id:resultId||null,client_run_id:String(input.clientRunId||'').slice(0,100)||null,username,case_name:String(input.caseName||'').slice(0,120),difficulty:String(input.difficulty||'easy').slice(0,20),answers:{system,case:caseAnswers,technicalProblems:Boolean(answers.technicalProblems),technicalProblemText:String(answers.technicalProblemText||'').slice(0,1000)},skipped:false};
    const data=await supabaseRequest('simulation_evaluations?on_conflict=client_run_id',{method:'POST',headers:{Prefer:'return=representation,resolution=merge-duplicates'},body:JSON.stringify(record)});
    if(resultId)await supabaseRequest(`simulation_results?id=eq.${encodeURIComponent(resultId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({evaluation_completed:true,evaluation_skipped:false})});
    json(res,201,{ok:true,id:Array.isArray(data)?data[0]?.id:null});
  }catch(e){console.error('Save evaluation failed:',e);json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
async function verifyEvaluationSkip(req,res){
  try{
    const input=await body(req);if(!EVALUATION_SKIP_PASSWORD)return json(res,503,{error:'Überspringen ist nicht konfiguriert.'});if(!safeEqual(input.password||'',EVALUATION_SKIP_PASSWORD))return json(res,401,{error:'Passwort falsch.'});
    if(!databaseConfigured())return json(res,503,{error:'Evaluationsspeicherung ist noch nicht konfiguriert.'});
    const resultId=String(input.simulationResultId||'').trim();
    const record={simulation_result_id:resultId||null,client_run_id:String(input.clientRunId||'').slice(0,100)||null,username:cleanUsername(input.username)||'unbekannt',case_name:String(input.caseName||'').slice(0,120),difficulty:String(input.difficulty||'easy').slice(0,20),answers:{},skipped:true};
    await supabaseRequest('simulation_evaluations?on_conflict=client_run_id',{method:'POST',headers:{Prefer:'return=representation,resolution=merge-duplicates'},body:JSON.stringify(record)});
    if(resultId)await supabaseRequest(`simulation_results?id=eq.${encodeURIComponent(resultId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({evaluation_completed:false,evaluation_skipped:true})});
    json(res,200,{ok:true});
  }catch(e){console.error('Skip evaluation failed:',e);json(res,500,{error:e instanceof Error?e.message:String(e)});}
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) result[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return result;
}
function safeEqual(a,b) {
  const ab=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return ab.length===bb.length && timingSafeEqual(ab,bb);
}
function sign(value) { return createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'); }
function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({u:ADMIN_USERNAME,exp:Date.now()+SESSION_MAX_AGE*1000})).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function isAdmin(req) {
  if (!SESSION_SECRET || !ADMIN_PASSWORD) return false;
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || !token.includes('.')) return false;
  const [payload,sig] = token.split('.');
  if (!safeEqual(sign(payload),sig)) return false;
  try { const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')); return data.u===ADMIN_USERNAME && data.exp>Date.now(); } catch { return false; }
}
function adminRequired(req,res){ if(!isAdmin(req)){json(res,401,{error:'Nicht angemeldet.'});return false;} return true; }
async function adminLogin(req,res){
  if(!ADMIN_PASSWORD||!SESSION_SECRET)return json(res,503,{error:'Dozentenlogin ist noch nicht konfiguriert.'});
  try{
    const input=await body(req);
    if(!safeEqual(input.username||'',ADMIN_USERNAME)||!safeEqual(input.password||'',ADMIN_PASSWORD))return json(res,401,{error:'Benutzername oder Passwort falsch.'});
    const secure=String(req.headers['x-forwarded-proto']||'').includes('https');
    const cookie=`${SESSION_COOKIE}=${encodeURIComponent(createSessionToken())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure?'; Secure':''}`;
    json(res,200,{ok:true,username:ADMIN_USERNAME},{'Set-Cookie':cookie});
  }catch(e){json(res,400,{error:e instanceof Error?e.message:String(e)});}
}
function adminLogout(req,res){json(res,200,{ok:true},{'Set-Cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`});}
async function listResults(req,res,url){
  if(!adminRequired(req,res))return;
  try{
    const search=(url.searchParams.get('search')||'').trim();
    const limit=Math.min(500,Math.max(1,Number(url.searchParams.get('limit'))||200));
    let query=`simulation_results?select=id,username,created_at,case_name,difficulty,planned_duration_seconds,elapsed_seconds,outcome,score_percent,evaluation_completed,evaluation_skipped&order=created_at.desc&limit=${limit}`;
    if(search)query+=`&username=ilike.*${encodeURIComponent(search.replace(/[,*()]/g,''))}*`;
    const data=await supabaseRequest(query,{method:'GET'});
    json(res,200,{results:data||[]});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
async function getResult(req,res,id){
  if(!adminRequired(req,res))return;
  try{const data=await supabaseRequest(`simulation_results?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,{method:'GET'});if(!data?.length)return json(res,404,{error:'Ergebnis nicht gefunden.'});const evals=await supabaseRequest(`simulation_evaluations?select=*&simulation_result_id=eq.${encodeURIComponent(id)}&limit=1`,{method:'GET'}).catch(()=>[]);json(res,200,{result:{...data[0],evaluation:evals?.[0]||null}});}
  catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
async function deleteResult(req,res,id){
  if(!adminRequired(req,res))return;
  try{
    await supabaseRequest(`simulation_results?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    json(res,200,{ok:true});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
async function deleteEvaluation(req,res,id){
  if(!adminRequired(req,res))return;
  try{
    await supabaseRequest(`simulation_evaluations?simulation_result_id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    await supabaseRequest(`simulation_results?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({evaluation_completed:false,evaluation_skipped:false})});
    json(res,200,{ok:true});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
function averageFrom(items,key){
  const values=items.map(x=>Number(x?.[key])).filter(v=>Number.isFinite(v)&&v>=1&&v<=5);
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}
async function evaluationSummary(req,res){
  if(!adminRequired(req,res))return;
  try{
    const data=await supabaseRequest('simulation_evaluations?select=case_name,answers,skipped&skipped=eq.false&order=created_at.desc&limit=10000',{method:'GET'});
    const evaluations=(data||[]).filter(x=>x&&!x.skipped&&x.answers&&typeof x.answers==='object');
    const systemKeys=['system_easy','system_clear','system_chat','system_overview','system_teaching','system_more_cases'];
    const caseKeys=['case_realistic','case_reactions','case_difficulty','case_apply_knowledge','case_understanding','case_overwhelmed','case_recommend'];
    const build=(items,section,keys,invertedKeys=[])=>{
      const objects=items.map(x=>x.answers?.[section]||{});
      const averages=Object.fromEntries(keys.map(k=>[k,Number(averageFrom(objects,k).toFixed(3))]));
      const scoredValues=keys.map(k=>invertedKeys.includes(k)?6-Number(averages[k]):Number(averages[k])).filter(Number.isFinite);
      const overallAverage=scoredValues.length?scoredValues.reduce((a,b)=>a+b,0)/scoredValues.length:0;
      const technicalYes=items.filter(x=>x.answers?.technicalProblems===true).length;
      return {count:items.length,averages,overallAverage:Number(overallAverage.toFixed(3)),technicalProblems:{yes:technicalYes,total:items.length}};
    };
    const system=build(evaluations,'system',systemKeys);
    const groups=new Map();
    for(const item of evaluations){const name=String(item.case_name||'Unbekannter Fall');if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);}
    const cases=[...groups.entries()].map(([caseName,items])=>({caseName,...build(items,'case',caseKeys,['case_overwhelmed'])})).sort((a,b)=>a.caseName.localeCompare(b.caseName,'de'));
    json(res,200,{system,cases});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}

function csvCell(value){const s=String(value??'');return /[";,\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
async function exportCsv(req,res){
  if(!adminRequired(req,res))return;
  try{
    const data=await supabaseRequest('simulation_results?select=id,username,created_at,case_name,difficulty,planned_duration_seconds,elapsed_seconds,outcome,score_percent,summary,evaluation_completed,evaluation_skipped&order=created_at.desc&limit=5000',{method:'GET'});
    const evals=await supabaseRequest('simulation_evaluations?select=simulation_result_id,answers,skipped&limit=5000',{method:'GET'}).catch(()=>[]),byResult=new Map((evals||[]).map(e=>[e.simulation_result_id,e]));
    const rows=[['Benutzername','Datum','Fall','Schwierigkeit','Spieldauer (s)','Ergebnis','Score (%)','Evaluation','Bedienung einfach','Oberfläche übersichtlich','Chat verstanden','Patient überblickt','Pflegeunterricht geeignet','Weitere Fälle','Fall realistisch','Reaktionen nachvollziehbar','Schwierigkeit angemessen','Kenntnisse angewendet','Verständnis verbessert','Überfordert','Empfehlung','Technische Probleme','Technik-Kommentar']];
    for(const r of data||[]){const ev=byResult.get(r.id),a=ev?.answers||{},sys=a.system||{},cas=a.case||{};rows.push([r.username,r.created_at,r.case_name,r.difficulty,r.elapsed_seconds,r.outcome,r.score_percent,ev?.skipped?'übersprungen':ev?'abgegeben':'offen',sys.system_easy??'',sys.system_clear??'',sys.system_chat??'',sys.system_overview??'',sys.system_teaching??'',sys.system_more_cases??'',cas.case_realistic??'',cas.case_reactions??'',cas.case_difficulty??'',cas.case_apply_knowledge??'',cas.case_understanding??'',cas.case_overwhelmed??'',cas.case_recommend??'',a.technicalProblems===true?'ja':a.technicalProblems===false?'nein':'',a.technicalProblemText??'']);}
    const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');text(res,200,csv,'text/csv; charset=utf-8',{'Content-Disposition':`attachment; filename="telecare-ergebnisse-${new Date().toISOString().slice(0,10)}.csv"`});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(req.method==='GET'&&u.pathname==='/api/status')return json(res,200,{enabled:Boolean(API_KEY),model:MODEL,database:databaseConfigured()});
    if(req.method==='POST'&&u.pathname==='/api/chat')return chat(req,res);
    if(req.method==='POST'&&u.pathname==='/api/results')return saveResult(req,res);
    if(req.method==='POST'&&u.pathname==='/api/evaluations')return saveEvaluation(req,res);
    if(req.method==='POST'&&u.pathname==='/api/evaluation/skip')return verifyEvaluationSkip(req,res);
    if(req.method==='POST'&&u.pathname==='/api/admin/login')return adminLogin(req,res);
    if(req.method==='POST'&&u.pathname==='/api/admin/logout')return adminLogout(req,res);
    if(req.method==='GET'&&u.pathname==='/api/admin/session')return json(res,isAdmin(req)?200:401,{authenticated:isAdmin(req),username:isAdmin(req)?ADMIN_USERNAME:null,database:databaseConfigured()});
    if(req.method==='GET'&&u.pathname==='/api/admin/results')return listResults(req,res,u);
    if(req.method==='GET'&&u.pathname==='/api/admin/export.csv')return exportCsv(req,res);
    if(req.method==='GET'&&u.pathname==='/api/admin/evaluations/summary')return evaluationSummary(req,res);
    const evaluationDelete=u.pathname.match(/^\/api\/admin\/results\/([a-zA-Z0-9-]+)\/evaluation$/);
    if(req.method==='DELETE'&&evaluationDelete)return deleteEvaluation(req,res,evaluationDelete[1]);
    const detail=u.pathname.match(/^\/api\/admin\/results\/([a-zA-Z0-9-]+)$/);
    if(req.method==='GET'&&detail)return getResult(req,res,detail[1]);
    if(req.method==='DELETE'&&detail)return deleteResult(req,res,detail[1]);
    if(req.method==='GET'||req.method==='HEAD')return staticFile(req,res,u.pathname);
    text(res,405,'Method not allowed');
  }catch(e){console.error('Unhandled server error:',e);if(!res.headersSent)json(res,500,{error:'Interner Serverfehler.'});else res.end();}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`TeleCare läuft auf Port ${PORT}`));
