import http from "node:http";
import {
  existsSync,
  readFileSync
} from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* -------------------------------------------------------------------------- */
/*  Grundkonfiguration                                                        */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Liest lokal eine .env-Datei ein.
 * Auf Render werden die dort hinterlegten Environment Variables verwendet.
 * Bereits vorhandene Prozessvariablen werden nicht überschrieben.
 */
function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      !trimmed.includes("=")
    ) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();

    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "";

/* -------------------------------------------------------------------------- */
/*  Dateitypen                                                                */
/* -------------------------------------------------------------------------- */

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

/* -------------------------------------------------------------------------- */
/*  Hilfsfunktionen                                                           */
/* -------------------------------------------------------------------------- */

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  response.end(JSON.stringify(data));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });

  response.end(text);
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (body.length > 1_000_000) {
      throw new Error("Request body exceeds 1 MB.");
    }
  }

  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Request body contains invalid JSON.");
  }
}

function resolveStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(
    urlPath.split("?")[0]
  );

  const relativePath =
    decodedPath === "/"
      ? "index.html"
      : decodedPath.replace(/^\/+/, "");

  const absolutePath = path.resolve(
    __dirname,
    relativePath
  );

  const relativeCheck = path.relative(
    __dirname,
    absolutePath
  );

  if (
    relativeCheck.startsWith("..") ||
    path.isAbsolute(relativeCheck)
  ) {
    return null;
  }

  return absolutePath;
}

async function serveStaticFile(request, response, pathname) {
  const filePath = resolveStaticPath(pathname);

  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[extension] ||
        "application/octet-stream",
      "Cache-Control":
        extension === ".html"
          ? "no-cache"
          : "public, max-age=300"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(file);
  } catch {
    /*
     * Fallback auf index.html, falls später Browser-Routen
     * wie /simulation oder /auswertung verwendet werden.
     */
    try {
      const indexFile = await readFile(
        path.join(__dirname, "index.html")
      );

      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      response.end(indexFile);
    } catch {
      sendText(response, 404, "Not found");
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Aktionsnormalisierung                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Diese Namen müssen zu den Aktionsnamen passen,
 * die app.js verarbeitet.
 */
const ALLOWED_ACTIONS = new Set([
  "ask_mental",
  "ask_skin",
  "ask_drainage",
  "ask_urine",
  "ask_allergy",
  "ask_auscultation",
  "measure_bz",
  "alert_surgeon",
  "insert_artery",
  "insert_pvk",
  "ventilate",
  "sono",
  "oxygen",
  "warming",
  "fluid",
  "norepi_bolus",
  "norepi_perfusor",
  "txa",
  "give_medication",
  "request_bga",
  "give_ek"
]);

const ACTION_ALIASES = {
  give_oxygen: "oxygen",
  start_oxygen: "oxygen",
  administer_oxygen: "oxygen",

  insert_arterial_line: "insert_artery",
  insert_arterial_cannula: "insert_artery",
  place_arterial_line: "insert_artery",

  insert_pvk_pink: "insert_pvk",
  insert_pvk_green: "insert_pvk",
  insert_pvk_orange: "insert_pvk",
  insert_peripheral_access: "insert_pvk",
  insert_iv: "insert_pvk",

  start_ventilation: "ventilate",
  ventilate_patient: "ventilate",

  request_sonography: "sono",
  request_ultrasound: "sono",
  perform_sonography: "sono",

  give_crystalloid: "fluid",
  administer_fluid: "fluid",
  give_fluid: "fluid",

  start_norepinephrine_infusion: "norepi_perfusor",
  start_norepinephrine_perfusor: "norepi_perfusor",

  give_norepinephrine_bolus: "norepi_bolus",

  administer_medication: "give_medication",
  give_drug: "give_medication",

  request_bga_venous: "request_bga",
  request_bga_arterial: "request_bga",
  request_blood_gas: "request_bga",

  transfuse_rbc: "give_ek",
  transfuse_ek: "give_ek",
  give_rbc: "give_ek",

  auscultate: "ask_auscultation",
  perform_auscultation: "ask_auscultation",

  measure_glucose: "measure_bz",
  measure_blood_glucose: "measure_bz",

  alert_surgical_team: "alert_surgeon",
  call_surgeon: "alert_surgeon"
};

/**
 * Interne Medikamenten-IDs.
 * Die Werte müssen zu den IDs in app.js passen.
 */
const MEDICATION_ALIASES = {
  adrenalin: "adrenaline",
  adrenaline: "adrenaline",
  epinephrine: "adrenaline",

  amiodaron: "amiodarone",
  amiodarone: "amiodarone",

  atropin: "atropine",
  atropine: "atropine",

  adenosin: "adenosine",
  adenosine: "adenosine",

  ass: "aspirin",
  aspirin: "aspirin",
  acetylsalicylsaeure: "aspirin",
  acetylsalicylsäure: "aspirin",

  heparin: "heparin",

  nitroglycerin: "nitroglycerin",
  glyceroltrinitrat: "nitroglycerin",

  urapidil: "urapidil",

  metoprolol: "metoprolol",

  furosemid: "furosemide",
  furosemide: "furosemide",

  salbutamol: "salbutamol",

  ipratropium: "ipratropium",

  prednisolon: "prednisolone",
  prednisolone: "prednisolone",

  dimetinden: "dimetindene",
  dimetindene: "dimetindene",

  ketamin: "ketamine",
  ketamine: "ketamine",

  midazolam: "midazolam",

  propofol: "propofol",

  etomidat: "etomidate",
  etomidate: "etomidate",

  fentanyl: "fentanyl",

  morphin: "morphine",
  morphine: "morphine",

  piritramid: "piritramide",
  piritramide: "piritramide",

  naloxon: "naloxone",
  naloxone: "naloxone",

  flumazenil: "flumazenil",

  rocuronium: "rocuronium",

  succinylcholin: "succinylcholine",
  succinylcholine: "succinylcholine",
  suxamethonium: "succinylcholine",

  calcium: "calcium",
  kalzium: "calcium",

  magnesium: "magnesium",

  natriumbicarbonat: "sodium_bicarbonate",
  natriumhydrogencarbonat: "sodium_bicarbonate",
  bicarbonat: "sodium_bicarbonate",

  glucose: "glucose",
  glukose: "glucose",

  insulin: "insulin",

  glucagon: "glucagon",
  glukagon: "glucagon",

  vasopressin: "vasopressin",

  dobutamin: "dobutamine",
  dobutamine: "dobutamine",

  ceftriaxon: "ceftriaxone",
  ceftriaxone: "ceftriaxone",

  piperacillin_tazobactam: "piperacillin_tazobactam",
  "piperacillin/tazobactam":
    "piperacillin_tazobactam",
  piperacillin: "piperacillin_tazobactam",
  tazobactam: "piperacillin_tazobactam",

  meropenem: "meropenem",

  tranexamsaeure: "tranexamic_acid",
  tranexamsäure: "tranexamic_acid",
  tranexamic_acid: "tranexamic_acid",
  txa: "tranexamic_acid"
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeMedication(value) {
  if (!value) {
    return null;
  }

  const original = String(value).trim().toLowerCase();
  const underscored = normalizeText(value);

  return (
    MEDICATION_ALIASES[original] ||
    MEDICATION_ALIASES[underscored] ||
    underscored
  );
}

function normalizeGeminiAction(action) {
  if (!action || typeof action !== "object") {
    return null;
  }

  const originalType = String(action.type || "").trim();
  const normalizedType =
    ACTION_ALIASES[originalType] || originalType;

  if (!ALLOWED_ACTIONS.has(normalizedType)) {
    console.warn(
      `Unbekannte Gemini-Aktion verworfen: ${originalType}`
    );

    return null;
  }

  const normalized = {
    ...action,
    type: normalizedType
  };

  /* PVK-Varianten aus dem alten Aktionsnamen übernehmen */
  if (originalType === "insert_pvk_pink") {
    normalized.size = "pink";
  }

  if (originalType === "insert_pvk_green") {
    normalized.size = "green";
  }

  if (originalType === "insert_pvk_orange") {
    normalized.size = "orange";
  }

  /* BGA-Art aus dem alten Aktionsnamen übernehmen */
  if (originalType === "request_bga_venous") {
    normalized.mode = "venous";
  }

  if (originalType === "request_bga_arterial") {
    normalized.mode = "arterial";
  }

  if (normalizedType === "insert_pvk") {
    normalized.quantity = Math.min(
      3,
      Math.max(
        1,
        Number.parseInt(normalized.quantity, 10) || 1
      )
    );

    if (
      !["pink", "green", "orange"].includes(
        normalized.size
      )
    ) {
      normalized.size = "green";
    }
  }

  if (normalizedType === "request_bga") {
    if (
      !["arterial", "venous"].includes(normalized.mode)
    ) {
      normalized.mode = null;
    }
  }

  if (normalizedType === "give_medication") {
    normalized.medication = normalizeMedication(
      normalized.medication
    );

    if (!normalized.medication) {
      return null;
    }
  }

  if (normalizedType === "give_ek") {
    normalized.quantity = Math.min(
      4,
      Math.max(
        1,
        Number.parseInt(normalized.quantity, 10) || 1
      )
    );
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/*  Gemini-Prompt                                                             */
/* -------------------------------------------------------------------------- */

function buildGeminiPrompt(message, state) {
  return `
Du spielst ausschließlich das medizinische Team vor Ort in einer
Telekonsultations-Simulation für Pflegeschüler.

Die Lernenden führen das Team über einen Chat. Deine Aufgabe ist:
1. Fragen anhand der bereits sichtbaren Informationen zu beantworten.
2. ausdrücklich angeordnete Maßnahmen in strukturierte Aktionen zu übersetzen.
3. bei unklaren oder unvollständigen Anweisungen gezielt nachzufragen.

WICHTIGE REGELN:
- Antworte ausschließlich auf Deutsch.
- Antworte kurz, sachlich und professionell.
- Erfinde keine Befunde, Laborwerte, Zugänge, Medikamente oder Maßnahmen.
- Verwende nur Informationen aus dem sichtbaren Simulationszustand.
- Verrate keine Werte, die noch nicht gemessen oder freigegeben wurden.
- Führe niemals eigenständig eine Maßnahme aus.
- Eine Frage ist keine Anweisung.
- Aus einem auffälligen Befund darfst du keine automatische Therapie ableiten.
- "Sind die Atemwege frei?" ist nur eine Frage und keine Sauerstoffanordnung.
- "Braucht der Patient Sauerstoff?" ist nur eine Frage.
- Eine Maßnahme wird nur erkannt, wenn sie ausdrücklich angeordnet wird.
- Formuliere bei Anweisungen niemals, dass eine Maßnahme bereits erfolgreich
  durchgeführt wurde. Antworte neutral, z. B. "Auftrag erkannt."
- Ob Personal, Zugang oder Material verfügbar ist, entscheidet ausschließlich
  der Simulator.
- "Legt einen Zugang" bedeutet einen grünen PVK.
- "Legt zwei Zugänge" bedeutet zwei grüne PVK.
- "Legt eine Arterie" oder "arterielle Kanüle legen" bedeutet insert_artery.
- Bei einer nicht näher bezeichneten BGA muss nach "arteriell oder venös?"
  gefragt werden. Dann darf keine BGA-Aktion zurückgegeben werden.
- "BZ messen" bedeutet measure_bz und niemals Glukosegabe.
- Die Gabe von Glukose ist nur bei einer ausdrücklichen Medikamentenanordnung
  erlaubt.

VERWENDE NUR DIESE AKTIONSNAMEN:

- ask_mental
- ask_skin
- ask_drainage
- ask_urine
- ask_allergy
- ask_auscultation
- measure_bz
- alert_surgeon
- insert_artery
- insert_pvk
- ventilate
- sono
- oxygen
- warming
- fluid
- norepi_bolus
- norepi_perfusor
- txa
- give_medication
- request_bga
- give_ek

AKTIONSPARAMETER:

PVK:
{
  "type": "insert_pvk",
  "quantity": 1,
  "size": "pink" oder "green" oder "orange"
}

BGA:
{
  "type": "request_bga",
  "mode": "arterial" oder "venous"
}

Medikament:
{
  "type": "give_medication",
  "medication": "englische interne Medikamenten-ID"
}

EK:
{
  "type": "give_ek",
  "quantity": 1
}

AKTUELL SICHTBARER SIMULATIONSZUSTAND:
${JSON.stringify(state ?? {}, null, 2)}

NACHRICHT DER LERNENDEN:
${message.trim()}

Gib ausschließlich gültiges JSON zurück:

{
  "reply": "Kurze sichtbare Antwort des Teams",
  "intent": "question",
  "actions": [],
  "requiresClarification": false
}

Zulässige Werte für intent:
- "question"
- "instruction"
- "unclear"

Für reine Fragen muss actions leer sein.
Für unklare Anweisungen muss actions leer und requiresClarification true sein.
Für konkrete Anweisungen müssen die erkannten Aktionen in actions stehen.
`.trim();
}

/* -------------------------------------------------------------------------- */
/*  Gemini-Anfrage                                                            */
/* -------------------------------------------------------------------------- */

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) =>
      typeof part?.text === "string" ? part.text : ""
    )
    .join("")
    .trim();
}

function parseModelJson(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

async function requestGemini(model, geminiRequestBody) {
  const url =
    "https://generativelanguage.googleapis.com/" +
    `v1beta/models/${encodeURIComponent(model)}` +
    ":generateContent";

  const geminiResponse = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify(geminiRequestBody)
  });

  const responseText = await geminiResponse.text();

  let responseData;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = {
      raw: responseText
    };
  }

  return {
    ok: geminiResponse.ok,
    status: geminiResponse.status,
    data: responseData
  };
}

async function requestGeminiWithFallback(
  geminiRequestBody
) {
  const primaryResult = await requestGemini(
    GEMINI_MODEL,
    geminiRequestBody
  );

  if (primaryResult.ok) {
    return {
      ...primaryResult,
      usedModel: GEMINI_MODEL
    };
  }

  const shouldUseFallback =
    Boolean(GEMINI_FALLBACK_MODEL) &&
    [429, 500, 502, 503, 504].includes(
      primaryResult.status
    );

  if (!shouldUseFallback) {
    return {
      ...primaryResult,
      usedModel: GEMINI_MODEL
    };
  }

  console.warn(
    `Gemini ${GEMINI_MODEL} antwortete mit ` +
      `${primaryResult.status}. ` +
      `Fallback auf ${GEMINI_FALLBACK_MODEL}.`
  );

  const fallbackResult = await requestGemini(
    GEMINI_FALLBACK_MODEL,
    geminiRequestBody
  );

  return {
    ...fallbackResult,
    usedModel: GEMINI_FALLBACK_MODEL
  };
}

/* -------------------------------------------------------------------------- */
/*  Chat-Endpunkt                                                             */
/* -------------------------------------------------------------------------- */

async function handleGeminiChat(request, response) {
  if (!GEMINI_API_KEY) {
    sendJson(response, 503, {
      error: "Gemini API key is not configured."
    });

    return;
  }

  try {
    const body = await readJsonBody(request);
    const message = body?.message;
    const state = body?.state ?? {};

    console.log(
      "Incoming /api/chat body:",
      JSON.stringify({
        message,
        state
      })
    );

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      sendJson(response, 400, {
        error: "Eine Chatnachricht fehlt."
      });

      return;
    }

    const prompt = buildGeminiPrompt(
      message,
      state
    );

    const geminiRequestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 1200
      }
    };

    const geminiResult =
      await requestGeminiWithFallback(
        geminiRequestBody
      );

    if (!geminiResult.ok) {
      console.error(
        "Gemini API error:",
        geminiResult.status,
        JSON.stringify(geminiResult.data)
      );

      sendJson(response, geminiResult.status, {
        error: "Gemini request failed.",
        status: geminiResult.status,
        details: geminiResult.data
      });

      return;
    }

    const modelText = extractGeminiText(
      geminiResult.data
    );

    if (!modelText) {
      console.error(
        "Gemini returned no usable text:",
        JSON.stringify(geminiResult.data)
      );

      sendJson(response, 502, {
        error: "Gemini returned no usable response."
      });

      return;
    }

    let parsedResult;

    try {
      parsedResult = parseModelJson(modelText);
    } catch (error) {
      console.error(
        "Invalid Gemini JSON:",
        modelText,
        error
      );

      sendJson(response, 502, {
        error: "Gemini returned invalid JSON.",
        raw: modelText
      });

      return;
    }

    const normalizedActions = Array.isArray(
      parsedResult.actions
    )
      ? parsedResult.actions
          .map(normalizeGeminiAction)
          .filter(Boolean)
      : [];

    const intentValues = new Set([
      "question",
      "instruction",
      "unclear"
    ]);

    const normalizedIntent = intentValues.has(
      parsedResult.intent
    )
      ? parsedResult.intent
      : normalizedActions.length > 0
        ? "instruction"
        : "unclear";

    /*
     * Bei erkannter Anweisung bewusst keine Behauptung,
     * dass sie bereits ausgeführt wurde.
     */
    let reply =
      typeof parsedResult.reply === "string" &&
      parsedResult.reply.trim()
        ? parsedResult.reply.trim()
        : normalizedActions.length > 0
          ? "Auftrag erkannt."
          : "Bitte präzisieren Sie die Anfrage.";

    if (
      normalizedIntent === "instruction" &&
      normalizedActions.length > 0
    ) {
      reply = "Auftrag erkannt.";
    }

    const result = {
      reply,
      intent: normalizedIntent,
      actions: normalizedActions,
      requiresClarification:
        Boolean(
          parsedResult.requiresClarification
        ),
      model: geminiResult.usedModel
    };

    console.log(
      "Normalized Gemini result:",
      JSON.stringify(result)
    );

    sendJson(response, 200, result);
  } catch (error) {
    console.error(
      "Gemini request failed:",
      error
    );

    sendJson(response, 500, {
      error: "Gemini request failed.",
      details:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  HTTP-Server                                                               */
/* -------------------------------------------------------------------------- */

const server = http.createServer(
  async (request, response) => {
    try {
      const requestUrl = new URL(
        request.url || "/",
        `http://${request.headers.host || "localhost"}`
      );

      const pathname = requestUrl.pathname;

      if (
        request.method === "GET" &&
        pathname === "/api/status"
      ) {
        sendJson(response, 200, {
          enabled: Boolean(GEMINI_API_KEY),
          model: GEMINI_MODEL,
          fallbackModel:
            GEMINI_FALLBACK_MODEL || null
        });

        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/chat"
      ) {
        await handleGeminiChat(
          request,
          response
        );

        return;
      }

      if (
        request.method === "GET" ||
        request.method === "HEAD"
      ) {
        await serveStaticFile(
          request,
          response,
          pathname
        );

        return;
      }

      sendText(
        response,
        405,
        "Method not allowed"
      );
    } catch (error) {
      console.error(
        "Unhandled server error:",
        error
      );

      if (!response.headersSent) {
        sendJson(response, 500, {
          error: "Internal server error."
        });
      } else {
        response.end();
      }
    }
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `TeleCare läuft auf Port ${PORT}`
    );

    console.log(
      `Gemini-Modell: ${GEMINI_MODEL}`
    );

    console.log(
      `Gemini aktiviert: ${
        GEMINI_API_KEY ? "ja" : "nein"
      }`
    );
  }
);
