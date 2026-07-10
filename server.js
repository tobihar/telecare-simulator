import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);

function loadLocalEnv(){
  const envPath=path.join(__dirname,'.env');
  if(!existsSync(envPath))return;
  for(const line of readFileSync(envPath,'utf8').split(/\r?\n/)){
    const t=line.trim(); if(!t||t.startsWith('#')||!t.includes('='))continue;
    const i=t.indexOf('='); const key=t.slice(0,i).trim(); let value=t.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(key&&process.env[key]===undefined)process.env[key]=value;
  }
}
loadLocalEnv();

const PORT=Number(process.env.PORT)||3000;
const API_KEY=process.env.GEMINI_API_KEY||'';
const MODEL=process.env.GEMINI_MODEL||'gemini-3.1-flash-lite';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
const ACTIONS=['ask_mental','ask_skin','ask_drainage','ask_urine','ask_allergy','ask_auscultation','measure_bz','measure_nibp','count_rr','measure_temp','alert_surgeon','insert_pvk','insert_artery','oxygen','warming','fluid','norepi_bolus','norepi_perfusor','txa','give_ek','give_medication','request_bga','sono','ventilate'];
const MEDS=['adrenaline','amiodarone','atropine','adenosine','aspirin','heparin','nitroglycerin','urapidil','metoprolol','furosemide','salbutamol','ipratropium','prednisolone','dimetindene','ketamine','midazolam','propofol','etomidate','fentanyl','morphine','piritramide','naloxone','flumazenil','rocuronium','succinylcholine','calcium','magnesium','bicarbonate','glucose','insulin','glucagon','vasopressin','dobutamine','ceftriaxone','pip_tazo','meropenem'];

function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>1e6)throw new Error('Body too large');}return s?JSON.parse(s):{};}
async function staticFile(req,res,pathname){let rel=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/, '');const abs=path.resolve(__dirname,rel);if(!abs.startsWith(__dirname)){res.writeHead(403);res.end('Forbidden');return;}try{const f=await readFile(abs);res.writeHead(200,{'Content-Type':MIME[path.extname(abs)]||'application/octet-stream','Cache-Control':path.extname(abs)==='.html'?'no-cache':'public, max-age=300'});res.end(f);}catch{try{const f=await readFile(path.join(__dirname,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(f);}catch{res.writeHead(404);res.end('Not found');}}}

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
    const text=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'{}';
    const parsed=JSON.parse(text);parsed.actions=(parsed.actions||[]).filter(a=>ACTIONS.includes(a.type));
    if(parsed.actions.length)parsed.reply='';
    json(res,200,{reply:typeof parsed.reply==='string'?parsed.reply:'',actions:parsed.actions});
  }catch(e){console.error(e);json(res,502,{error:e instanceof Error?e.message:String(e)});}
}

const server=http.createServer(async(req,res)=>{const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);if(req.method==='GET'&&u.pathname==='/api/status')return json(res,200,{enabled:Boolean(API_KEY),model:MODEL});if(req.method==='POST'&&u.pathname==='/api/chat')return chat(req,res);if(req.method==='GET'||req.method==='HEAD')return staticFile(req,res,u.pathname);res.writeHead(405);res.end('Method not allowed');});
server.listen(PORT,'0.0.0.0',()=>console.log(`TeleCare läuft auf Port ${PORT}`));
