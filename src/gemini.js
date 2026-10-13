// Gemini-Anbindung: Prompt, Antwortschema und Aufruf mit Retry/Modell-Fallback.
// Unverändert aus dem früheren Node-Server übernommen; der API-Key wird übergeben.

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const ACTIONS = ['ask_mental','ask_skin','ask_drainage','ask_urine','ask_allergy','ask_auscultation','measure_bz','measure_nibp','count_rr','measure_temp','alert_surgeon','insert_pvk','insert_artery','oxygen','upper_body_elevated','flat_position','defib_pads','warming','fluid','norepi_bolus','norepi_perfusor','stop_trigger','adrenaline_im','adrenaline_nebulized','intubate','txa','give_ek','give_medication','request_lab','request_bga','request_ecg','sono','ventilate','shock_position','limb_elevation','wound_compression','tourniquet'];
const LAB_IDS = ['blood_cultures','urine_culture','pct','crp','leukocytes','creatinine','lactate','platelets','inr','fibrinogen','electrolytes','troponin','ck','ckmb','ldh','ast','alt','potassium','sodium'];
const MEDS = ['adrenaline','amiodarone','atropine','adenosine','aspirin','heparin','nitroglycerin','urapidil','metoprolol','furosemide','salbutamol','ipratropium','prednisolone','dimetindene','clemastine','h2_blocker','ketamine','midazolam','propofol','etomidate','fentanyl','sufentanil','morphine','piritramide','naloxone','flumazenil','rocuronium','succinylcholine','calcium','magnesium','bicarbonate','glucose','insulin','glucagon','vasopressin','dobutamine','ondansetron','potassium','paracetamol','ceftriaxone','pip_tazo','meropenem','fibrinogen'];
const GEMINI_RESPONSE_SCHEMA = {type:'OBJECT',properties:{reply:{type:'STRING'},actions:{type:'ARRAY',items:{type:'OBJECT',properties:{type:{type:'STRING',enum:ACTIONS},quantity:{type:'INTEGER',minimum:1,maximum:2},size:{type:'STRING',enum:['pink','green','orange']},volumeMl:{type:'INTEGER',enum:[250,500,1000]},medication:{type:'STRING',enum:MEDS},mode:{type:'STRING',enum:['arterial','venous']},labs:{type:'ARRAY',items:{type:'STRING',enum:LAB_IDS}}},required:['type']}}},required:['reply','actions']};

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
- Gib niemals Falltitel, Fall-ID oder eine nicht ausdrücklich erfragte Gesamtdiagnose aus.
- "HKL informieren", "Herzkatheterlabor informieren" oder gleichbedeutende Aufträge erzeugen ausschließlich alert_surgeon und keinen Antworttext.
- Im Anaphylaxie-Fall bedeutet "Adrenalin" oder "Adrenalin geben" ohne ausdrücklich genannten anderen Applikationsweg immer adrenaline_im (0,5 mg i.m.). Bei "Adrenalin vernebeln/inhalieren" ausschließlich adrenaline_nebulized.
- "Cefuroxim stoppen/abdrehen/diskonnektieren" erzeugt ausschließlich stop_trigger. "Intubieren/Atemweg sichern" erzeugt ausschließlich intubate.
- "Tourniquet anlegen" oder "Extremität abbinden" erzeugt ausschließlich tourniquet. Hochlagern von Hand/Arm/Extremität erzeugt limb_elevation; Wundkompression oder Druckverband erzeugt wound_compression.
- "Flach lagern", "Flachlagerung" oder "Patient flach hinlegen" erzeugt ausschließlich flat_position.
- BGA ohne arteriell/venös: "Arteriell oder venös?" und actions leer.
- Interpretiere kurze klinische Aufträge und übliche Abkürzungen: z. B. '500 VE' = 500 ml kristalloide Vollelektrolytlösung, 'Viggo' = PVK, 'Nor Bolus' = Noradrenalin-Bolus.
- Für fluid darf volumeMl nur 250, 500 oder 1000 sein. Wenn der Fall eine explizite Mengenauswahl verlangt und keine Menge genannt ist, frage knapp nach 250, 500 oder 1000 ml und erzeuge keine Aktion.
- Beachte caseFacts.simulationRules.resources. Für dort mit false markierte Diagnostik oder Blutprodukte sowie nicht in allowedAccess enthaltene Zugänge darfst du keine Aktion erzeugen; antworte knapp, dass dies im Setting nicht verfügbar ist.
- Bei unklarer Anweisung lieber knapp nachfragen, statt eine andere Maßnahme zu wählen.
- Keine therapeutischen Vorschläge und keine Differentialdiagnosen, sofern nicht ausdrücklich danach gefragt wird.

Erlaubte Aktionen: ${ACTIONS.join(', ')}
Medikamenten-IDs: ${MEDS.join(', ')}

Vollständige Falldaten und aktueller Zustand:
${JSON.stringify(state??{})}

Nachricht: ${message}

Antworte ausschließlich als JSON:
{"reply":"","actions":[]}
Für insert_pvk optional quantity 1-2 und size pink/green/orange.
Für fluid volumeMl 250, 500 oder 1000.
Für request_bga mode arterial/venous.
Für request_lab labs als Liste aus: ${LAB_IDS.join(', ')}.
Für give_medication medication aus der ID-Liste.`;}

function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function geminiPayload(prompt,withSchema=true){
  const generationConfig={temperature:0,responseMimeType:'application/json'};
  if(withSchema)generationConfig.responseSchema=GEMINI_RESPONSE_SCHEMA;
  return {contents:[{role:'user',parts:[{text:prompt}]}],generationConfig};
}
function parseJsonText(raw){
  const text=String(raw||'').trim();
  try{return JSON.parse(text);}
  catch{
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start>=0&&end>start)return JSON.parse(text.slice(start,end+1));
    throw new Error('Gemini hat keine lesbare JSON-Antwort geliefert.');
  }
}
async function requestGemini(apiKey,model,prompt,withSchema=true){
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(geminiPayload(prompt,withSchema)),signal:AbortSignal.timeout(25000)});
      const raw=await response.text();
      let data={};try{data=raw?JSON.parse(raw):{};}catch{data={};}
      if(response.ok)return {ok:true,data,model};
      lastError={ok:false,status:response.status,error:data?.error?.message||`Gemini-Anfrage fehlgeschlagen (${response.status}).`,code:data?.error?.status||'',model};
      if(![429,500,502,503,504].includes(response.status)||attempt>0)break;
    }catch(error){
      lastError={ok:false,status:502,error:error?.name==='TimeoutError'?'Zeitüberschreitung bei Gemini.':(error instanceof Error?error.message:String(error)),code:error?.name||'',model};
      if(attempt>0)break;
    }
    await wait(350*(attempt+1));
  }
  return lastError||{ok:false,status:502,error:'Gemini-Anfrage fehlgeschlagen.',code:'',model};
}
function isSchemaError(result){return result?.status===400&&/schema|enum|invalid argument|response.?mime|response.?format/i.test(`${result.error||''} ${result.code||''}`);}
function canTryFallbackModel(result){return [400,404,429,500,502,503,504].includes(Number(result?.status))&&!/api.?key|permission|billing/i.test(`${result?.error||''} ${result?.code||''}`);}

export function modelCandidates(configuredModel) {
  const model = String(configuredModel || DEFAULT_MODEL).trim().replace(/^models\//, '') || DEFAULT_MODEL;
  return [...new Set([model, DEFAULT_MODEL])];
}

// Fragt Gemini an und filtert die Antwort auf erlaubte Aktionen.
export async function askGemini(apiKey, configuredModel, message, state) {
  const prompt = promptFor(message, state);
  let result = null;
  for (const model of modelCandidates(configuredModel)) {
    result = await requestGemini(apiKey, model, prompt, true);
    if (!result.ok && isSchemaError(result)) result = await requestGemini(apiKey, model, prompt, false);
    if (result.ok || !canTryFallbackModel(result)) break;
  }
  if (!result?.ok) return result;
  const modelText = result.data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '{}';
  const parsed = parseJsonText(modelText);
  const actions = Array.isArray(parsed.actions) ? parsed.actions.filter(a => a && ACTIONS.includes(a.type)) : [];
  return {ok: true, model: result.model, actions, reply: actions.length ? '' : (typeof parsed.reply === 'string' ? parsed.reply : '')};
}
