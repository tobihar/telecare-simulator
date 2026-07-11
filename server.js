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
const SESSION_COOKIE = 'telecare_admin';
const SESSION_MAX_AGE = 8 * 60 * 60;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const ACTIONS = ['ask_mental','ask_skin','ask_drainage','ask_urine','ask_allergy','ask_auscultation','measure_bz','measure_nibp','count_rr','measure_temp','alert_surgeon','insert_pvk','insert_artery','oxygen','warming','fluid','norepi_bolus','norepi_perfusor','txa','give_ek','give_medication','request_bga','sono','ventilate','shock_position'];
const MEDS = ['adrenaline','amiodarone','atropine','adenosine','aspirin','heparin','nitroglycerin','urapidil','metoprolol','furosemide','salbutamol','ipratropium','prednisolone','dimetindene','ketamine','midazolam','propofol','etomidate','fentanyl','morphine','piritramide','naloxone','flumazenil','rocuronium','succinylcholine','calcium','magnesium','bicarbonate','glucose','insulin','glucagon','vasopressin','dobutamine','ceftriaxone','pip_tazo','meropenem'];

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
    res.writeHead(200, {'Content-Type':MIME[path.extname(abs)] || 'application/octet-stream','Cache-Control':path.extname(abs)==='.html'?'no-cache':'public, max-age=300'});
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
    res.writeHead(200, {'Content-Type':MIME[path.extname(abs)] || 'application/octet-stream','Cache-Control':path.extname(abs)==='.html'?'no-cache':'public, max-age=300'});
    if (req.method === 'HEAD') return res.end();
    res.end(f);
  } catch {
    return sendFile(req, res, 'index.html');
  }
}

function promptFor(message,state){return `Du bist ausschließlich das Team vor Ort in einer medizinischen Telekonsultations-Simulation.
Antworte auf Deutsch, knapp und ohne Zusatzinformationen.

HARTE REGELN:
- Fragen erzeugen niemals Maßnahmen.
- Nur ausdrücklich formulierte Aufträge erzeugen actions.
- Keine eigenständige Therapie, keine erfundenen Befunde, keine unbekannten Laborwerte.
- Keine Rückfragen zu Dosierung, Applikationsweg oder Zugang bei Standardbefehlen.
- "Noradrenalin-Bolus" bedeutet fest 5 µg i.v.; niemals nach Dosis fragen.
- "Noradrenalin" ohne Zusatz bedeutet Perfusor 0,05 µg/kg/min.
- "Volumen", "500 VE", "500 ml VE" oder "Flüssigkeit" bedeutet 500 ml Kristalloid; niemals nach Zugang oder Applikationsweg fragen.
- "Schocklage", "Beine hoch" oder "Beine anheben" bedeutet shock_position.
- "NIBP messen", "RR messen" oder "Blutdruck messen" bedeutet measure_nibp.
- "AF auszählen" bedeutet count_rr. "Temperatur messen" bedeutet measure_temp.
- "Legt einen Zugang" bedeutet einen grünen PVK.
- "Legt eine Arterie" bedeutet insert_artery, niemals insert_pvk.
- "BGA" ohne arteriell/venös: kurze Rückfrage "Arteriell oder venös?" und actions leer.
- Bei einem erkannten Auftrag ist reply exakt leer. Die Simulation bestätigt selbst.
- Bei einer Frage nur den erfragten Befund nennen, maximal zwei kurze Sätze.
- Keine Sätze wie "Welche Maßnahmen sollen wir ergreifen?", "Wir warten auf weitere Anweisungen" oder "Soll die Gabe über einen Zugang erfolgen?".

Erlaubte Aktionen: ${ACTIONS.join(', ')}
Medikamenten-IDs: ${MEDS.join(', ')}

Sichtbarer Zustand: ${JSON.stringify(state??{})}
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
    const data = await supabaseRequest('simulation_results', {
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
    let query=`simulation_results?select=id,username,created_at,case_name,difficulty,planned_duration_seconds,elapsed_seconds,outcome,score_percent&order=created_at.desc&limit=${limit}`;
    if(search)query+=`&username=ilike.*${encodeURIComponent(search.replace(/[,*()]/g,''))}*`;
    const data=await supabaseRequest(query,{method:'GET'});
    json(res,200,{results:data||[]});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
async function getResult(req,res,id){
  if(!adminRequired(req,res))return;
  try{const data=await supabaseRequest(`simulation_results?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,{method:'GET'});if(!data?.length)return json(res,404,{error:'Ergebnis nicht gefunden.'});json(res,200,{result:data[0]});}
  catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}
function csvCell(value){const s=String(value??'');return /[";,\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
async function exportCsv(req,res){
  if(!adminRequired(req,res))return;
  try{
    const data=await supabaseRequest('simulation_results?select=id,username,created_at,case_name,difficulty,planned_duration_seconds,elapsed_seconds,outcome,score_percent,summary&order=created_at.desc&limit=5000',{method:'GET'});
    const rows=[['Benutzername','Datum','Fall','Schwierigkeit','Geplante Dauer (s)','Spieldauer (s)','Ergebnis','Score (%)','Eskalation (s)','Kristalloide (ml)','EK gegeben']];
    for(const r of data||[])rows.push([r.username,r.created_at,r.case_name,r.difficulty,r.planned_duration_seconds,r.elapsed_seconds,r.outcome,r.score_percent,r.summary?.escalationAt??'',r.summary?.crystalloidMl??'',r.summary?.bloodUnitsGiven??'']);
    const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
    text(res,200,csv,'text/csv; charset=utf-8',{'Content-Disposition':`attachment; filename="telecare-ergebnisse-${new Date().toISOString().slice(0,10)}.csv"`});
  }catch(e){json(res,500,{error:e instanceof Error?e.message:String(e)});}
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(req.method==='GET'&&u.pathname==='/api/status')return json(res,200,{enabled:Boolean(API_KEY),model:MODEL,database:databaseConfigured()});
    if(req.method==='POST'&&u.pathname==='/api/chat')return chat(req,res);
    if(req.method==='POST'&&u.pathname==='/api/results')return saveResult(req,res);
    if(req.method==='POST'&&u.pathname==='/api/admin/login')return adminLogin(req,res);
    if(req.method==='POST'&&u.pathname==='/api/admin/logout')return adminLogout(req,res);
    if(req.method==='GET'&&u.pathname==='/api/admin/session')return json(res,isAdmin(req)?200:401,{authenticated:isAdmin(req),username:isAdmin(req)?ADMIN_USERNAME:null,database:databaseConfigured()});
    if(req.method==='GET'&&u.pathname==='/api/admin/results')return listResults(req,res,u);
    if(req.method==='GET'&&u.pathname==='/api/admin/export.csv')return exportCsv(req,res);
    const detail=u.pathname.match(/^\/api\/admin\/results\/([a-zA-Z0-9-]+)$/);
    if(req.method==='GET'&&detail)return getResult(req,res,detail[1]);
    if(req.method==='GET'||req.method==='HEAD')return staticFile(req,res,u.pathname);
    text(res,405,'Method not allowed');
  }catch(e){console.error('Unhandled server error:',e);if(!res.headersSent)json(res,500,{error:'Interner Serverfehler.'});else res.end();}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`TeleCare läuft auf Port ${PORT}`));
