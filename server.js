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
    const requestBody = await readJsonBody(request);

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
        body: JSON.stringify(requestBody)
      }
    );

    const responseText = await geminiResponse.text();

    response.writeHead(geminiResponse.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });

    response.end(responseText);
  } catch (error) {
    console.error("Gemini request failed:", error);

    sendJson(response, 500, {
      error: "Gemini request failed."
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
