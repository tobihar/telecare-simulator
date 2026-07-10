import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (body.length > 1_000_000) {
      throw new Error("Request body too large");
    }
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

function safeFilePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);

  const relativePath =
    cleanPath === "/"
      ? "index.html"
      : cleanPath.replace(/^\/+/, "");

  const absolutePath = path.resolve(__dirname, relativePath);

  if (!absolutePath.startsWith(__dirname)) {
    return null;
  }

  return absolutePath;
}

async function serveStaticFile(request, response) {
  const filePath = safeFilePath(request.url);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[extension] || "application/octet-stream"
    });

    response.end(file);
  } catch {
    try {
      const fallback = await readFile(
        path.join(__dirname, "index.html")
      );

      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });

      response.end(fallback);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  }
}

async function handleGeminiChat(request, response) {
  if (!GEMINI_API_KEY) {
    sendJson(response, 503, {
      error: "Gemini API key is not configured."
    });
    return;
  }

  try {
    const { message, state } = await readJsonBody(request);

    if (typeof message !== "string" || !message.trim()) {
      sendJson(response, 400, {
        error: "Eine Chatnachricht fehlt."
      });
      return;
    }

    const prompt = `
Du bist das Personal vor Ort in einer medizinischen Telekonsultations-Simulation
für Pflegeschüler.

WICHTIGE REGELN:
- Antworte auf Deutsch.
- Antworte kurz, professionell und realistisch.
- Verwende ausschließlich Informationen aus dem sichtbaren Simulationszustand.
- Erfinde keine Laborwerte, Zugänge, Medikamente oder Befunde.
- Verrate keine intern nicht erhobenen Werte.
- Führe niemals eigenständig Maßnahmen aus.
- Eine Frage ist keine Anweisung.
- Nur ausdrücklich angeordnete Maßnahmen dürfen als Aktion erkannt werden.
- Bei "Braucht der Patient Sauerstoff?" darf keine Sauerstoffgabe ausgelöst werden.
- Bei "Sind die Atemwege frei?" nur den Befund mitteilen.
- Bei "Legt einen Zugang" ist ein grüner PVK gemeint.
- Bei "Legt eine Arterie" ist eine arterielle Kanüle gemeint.
- Bei "Macht eine BGA" und fehlender Angabe muss nach arteriell oder venös gefragt werden.
- Antworte als Team vor Ort, nicht als beratende KI.

ZULÄSSIGE AKTIONEN:
- give_oxygen
- insert_pvk_pink
- insert_pvk_green
- insert_pvk_orange
- insert_arterial_line
- insert_cvc
- insert_shaldon
- insert_urinary_catheter
- request_nibp
- count_respiratory_rate
- measure_temperature
- request_bga_venous
- request_bga_arterial
- request_laboratory
- request_ecg
- request_sonography
- alert_surgical_team
- alert_anesthesia
- give_crystalloid
- request_uncrossed_rbc
- request_crossed_rbc
- transfuse_rbc
- start_norepinephrine_infusion
- give_norepinephrine_bolus
- start_ventilation
- auscultate
- measure_glucose
- administer_medication

AKTUELL SICHTBARER ZUSTAND:
${JSON.stringify(state, null, 2)}

NACHRICHT DER LERNENDEN:
${message.trim()}

Gib ausschließlich gültiges JSON in dieser Form zurück:

{
  "reply": "Kurze sichtbare Antwort des Teams",
  "intent": "question | instruction | unclear",
  "actions": [
    {
      "type": "eine_zulässige_aktion",
      "quantity": 1,
      "medication": null
    }
  ],
  "requiresClarification": false
}

Für reine Fragen muss "actions" leer sein.
Bei unklaren Anweisungen muss requiresClarification true sein.
`;

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
        temperature: 0.1
      }
    };

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_MODEL
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify(geminiRequestBody)
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error(
        "Gemini API error:",
        geminiResponse.status,
        JSON.stringify(geminiData)
      );

      sendJson(response, geminiResponse.status, {
        error: "Gemini request failed",
        status: geminiResponse.status,
        details: geminiData
      });
      return;
    }

    const modelText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!modelText) {
      console.error(
        "Gemini returned no usable text:",
        JSON.stringify(geminiData)
      );

      sendJson(response, 502, {
        error: "Gemini returned no usable response."
      });
      return;
    }

    let parsedResult;

    try {
      parsedResult = JSON.parse(modelText);
    } catch {
      console.error("Invalid Gemini JSON:", modelText);

      sendJson(response, 502, {
        error: "Gemini returned invalid JSON.",
        raw: modelText
      });
      return;
    }

    sendJson(response, 200, parsedResult);
  } catch (error) {
    console.error("Gemini request failed:", error);

    sendJson(response, 500, {
      error: "Gemini request failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`
  );

  if (
    request.method === "GET" &&
    requestUrl.pathname === "/api/status"
  ) {
    sendJson(response, 200, {
      enabled: Boolean(GEMINI_API_KEY),
      model: GEMINI_MODEL
    });

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === "/api/chat"
  ) {
    await handleGeminiChat(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStaticFile(request, response);
    return;
  }

  response.writeHead(405, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  response.end("Method not allowed");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TeleCare läuft auf Port ${PORT}`);
});
