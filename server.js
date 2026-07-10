import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

app.use(express.json({ limit: '200kb' }));
app.use(express.static(__dirname));
app.get('/api/status', (_req,res)=>res.json({enabled:Boolean(process.env.GEMINI_API_KEY),model:MODEL}));

const actionTypes=['ask_mental','ask_skin','ask_drainage','ask_urine','ask_allergy','ask_auscultation','measure_bz','alert_surgeon','insert_pvk','oxygen','warming','fluid','norepi_bolus','norepi_perfusor','txa','give_ek','give_medication','request_bga','insert_artery','sono','ventilate'];
const medicationIds=['adrenaline','amiodarone','atropine','adenosine','aspirin','heparin','nitroglycerin','urapidil','metoprolol','furosemide','salbutamol','ipratropium','prednisolone','dimetindene','ketamine','midazolam','propofol','etomidate','fentanyl','morphine','piritramide','naloxone','flumazenil','rocuronium','succinylcholine','calcium','magnesium','bicarbonate','glucose','insulin','glucagon','vasopressin','dobutamine','ceftriaxone','pip_tazo','meropenem'];
app.post('/api/chat', async (req,res)=>{
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:'Kein GEMINI_API_KEY gesetzt.'});
  const {message,state}=req.body||{};
  if(typeof message!=='string'||!message.trim())return res.status(400).json({error:'Nachricht fehlt.'});
  const system=`Du bist das Team einer medizinischen Telekonsultations-Simulation für Pflegeschüler. Antworte auf Deutsch, knapp, realistisch und professionell. Du spielst Dr. Weber, Anna Keller und Mehmet Yilmaz vor Ort. WICHTIG: Führe ausschließlich Maßnahmen aus, die ausdrücklich als Auftrag formuliert wurden. Fragen, hypothetische Formulierungen oder reine Befundabfragen erzeugen niemals Aktionen. Beispiel: "Sind die Atemwege frei?" => actions: []; "Gebt Sauerstoff" => oxygen. Leite niemals selbstständig Therapie aus einem Befund ab. Erfinde keine Befunde, nenne keine unbekannten Laborwerte und verändere niemals den Patientenzustand. Nutze nur Informationen, die im sichtbaren Zustand als bekannt markiert sind. Wenn eine Anweisung unklar ist, stelle eine kurze Rückfrage. Formuliere bei Aktionsaufträgen nur eine neutrale Bestätigung wie „Auftrag verstanden“ und behaupte niemals, dass eine Maßnahme bereits durchgeführt wurde; Durchführung und Ablehnung entscheidet ausschließlich der Simulator. Keine Dosierungen verlangen. "Volumen" bedeutet 500 ml Kristalloid. "Noradrenalin geben" ohne Zusatz bedeutet Perfusor mit 0,05 µg/kg/min; ein ausdrücklich genannter Bolus bedeutet 5 µg i.v. Ein EK-Befehl bedeutet genau ein EK. Medikamentenaufträge werden als give_medication mit medication-ID ausgegeben. Verfügbare IDs: ${medicationIds.join(', ')}. Ein ausdrücklicher Auftrag wie 'legt einen Zugang' oder 'PVK legen' bedeutet insert_pvk. Ein ausdrücklicher Auftrag 'Arterie legen' oder 'arterielle Kanüle legen' bedeutet insert_artery und niemals insert_pvk. 'Sono', 'Ultraschall' oder 'POCUS durchführen' bedeutet sono. 'Beatmen', 'Beutel-Masken-Beatmung' oder 'kontrolliert beatmen' bedeutet ventilate. 'Auskultieren', 'abhören' oder Fragen nach Atemgeräusch/Herztönen bedeutet ask_auscultation. 'BZ messen', 'Blutzucker messen' oder 'Glukose bestimmen' bedeutet measure_bz und niemals eine Glukosegabe. Eine Glukosegabe darf nur bei einem ausdrücklichen Verabreichungsauftrag wie 'Glukose geben' erzeugt werden. Ein ausdrücklicher Auftrag für eine BGA bedeutet request_bga. Bei arterieller BGA setze mode='arterial', bei venöser BGA mode='venous'. Wenn die Art nicht genannt ist, stelle in reply die Rückfrage 'Arteriell oder venös?' und gib keine Aktion aus. Standard ist ein grüner PVK; bei 'zwei Zugänge' quantity 2. Fragen wie 'liegt ein Zugang?' erzeugen keine Aktion. Gib ausschließlich gültiges JSON zurück.`;
  const prompt=`Aktueller Simulationszustand:\n${JSON.stringify(state)}\n\nNachricht der Telekonsultation:\n${message}\n\nErlaubte Aktionen: ${actionTypes.join(', ')}\nAntwortschema: {"reply":"kurze Antwort des Teams","actions":[{"type":"eine erlaubte Aktion","quantity":1,"size":"green"}]}. quantity und size werden nur bei insert_pvk genutzt; size ist pink, green oder orange. medication wird nur bei give_medication genutzt. mode wird nur bei request_bga genutzt. Bei Fragen oder nicht ausdrücklich angeordneten Maßnahmen muss actions leer sein.`;
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.15,responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{reply:{type:'STRING'},actions:{type:'ARRAY',items:{type:'OBJECT',properties:{type:{type:'STRING',enum:actionTypes},quantity:{type:'INTEGER',minimum:1,maximum:2},size:{type:'STRING',enum:['pink','green','orange']},medication:{type:'STRING',enum:medicationIds},mode:{type:'STRING',enum:['arterial','venous']}},required:['type']}}},required:['reply','actions']}}})});
    const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Gemini-Anfrage fehlgeschlagen');
    const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}';const parsed=JSON.parse(text);parsed.actions=(parsed.actions||[]).filter(a=>actionTypes.includes(a.type));res.json(parsed);
  }catch(err){res.status(502).json({error:err.message});}
});
app.listen(PORT,()=>console.log(`TeleCare läuft auf http://localhost:${PORT}`));
