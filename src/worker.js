// Galen-Backend als Cloudflare Worker.
// Statische Dateien kommen aus ./public (Assets-Binding), Daten aus D1 (SQLite).
import { askGemini, DEFAULT_MODEL } from './gemini.js';

const SESSION_COOKIE = 'galen_admin';
const SESSION_MAX_AGE = 8 * 60 * 60;
const MAX_BODY_LENGTH = 4e6;
const MAX_CHAT_MESSAGE_LENGTH = 1000;
const MAX_CHAT_BODY_LENGTH = 200000;
const SYSTEM_KEYS = ['system_easy','system_clear','system_chat','system_overview','system_teaching','system_more_cases'];
const CASE_KEYS = ['case_realistic','case_reactions','case_difficulty','case_apply_knowledge','case_understanding','case_overwhelmed','case_recommend'];

// Seitenpfade ohne eigene Datei; alles andere liefert das Assets-Binding direkt.
const PAGE_ROUTES = {
  '/': '/landing.html',
  '/admin': '/admin.html', '/admin/': '/admin.html',
  '/simulator': '/simulator-hub.html', '/simulator/': '/simulator-hub.html',
  '/shock': '/index.html', '/shock/': '/index.html'
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store', ...headers}});
}
function text(status, value, contentType = 'text/plain; charset=utf-8', headers = {}) {
  return new Response(value, {status, headers: {'Content-Type':contentType,'Cache-Control':'no-store', ...headers}});
}
async function readJson(request, maxLength = MAX_BODY_LENGTH) {
  if (Number(request.headers.get('content-length')) > maxLength) throw new HttpError(413, 'Anfrage zu groß.');
  const raw = await request.text();
  if (raw.length > maxLength) throw new HttpError(413, 'Anfrage zu groß.');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Ungültiges JSON.'); }
}
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

// --- Rate-Limits (in D1, damit sie über alle Worker-Instanzen gelten) --------

async function rateLimitStatus(env, key) {
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?1').bind(key).first();
  return row && row.reset_at > Date.now() ? row : null;
}
async function retryAfter(env, key, max) {
  const row = await rateLimitStatus(env, key);
  return row && row.count >= max ? Math.ceil((row.reset_at - Date.now()) / 1000) : 0;
}
async function hitRateLimit(env, key, windowMs) {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END`).bind(key, now + windowMs, now).run();
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ?1').bind(now).run();
}
async function resetRateLimit(env, key) {
  await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?1').bind(key).run();
}
function tooManyRequests(seconds) {
  return json(429, {error:'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.'}, {'Retry-After':String(seconds)});
}
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_MAX_FAILURES = 10;

// --- Sitzung / Passwörter ----------------------------------------------------

const encoder = new TextEncoder();
function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64url(value) {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0)));
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
function constantTimeEqual(a, b) {
  const ab = encoder.encode(String(a)), bb = encoder.encode(String(b));
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
function adminUsername(env) { return env.ADMIN_USERNAME || 'dozent'; }
function parseCookies(request) {
  const result = {};
  for (const part of String(request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
    }
  }
  return result;
}
async function isAdmin(request, env) {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD) return false;
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!constantTimeEqual(await hmac(env.SESSION_SECRET, payload), sig)) return false;
  try {
    const data = JSON.parse(fromBase64url(payload));
    return data.u === adminUsername(env) && data.exp > Date.now();
  } catch { return false; }
}
async function requireAdmin(request, env) {
  if (!(await isAdmin(request, env))) throw new HttpError(401, 'Nicht angemeldet.');
}

async function adminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json(503, {error:'Dozentenlogin ist noch nicht konfiguriert.'});
  const key = `admin:${clientIp(request)}`;
  const wait = await retryAfter(env, key, PASSWORD_MAX_FAILURES);
  if (wait) return tooManyRequests(wait);
  const input = await readJson(request, 10000);
  if (!constantTimeEqual(input.username || '', adminUsername(env)) || !constantTimeEqual(input.password || '', env.ADMIN_PASSWORD)) {
    await hitRateLimit(env, key, PASSWORD_WINDOW_MS);
    return json(401, {error:'Benutzername oder Passwort falsch.'});
  }
  await resetRateLimit(env, key);
  const payload = base64url(encoder.encode(JSON.stringify({u:adminUsername(env), exp:Date.now() + SESSION_MAX_AGE * 1000})));
  const token = `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure}`;
  return json(200, {ok:true, username:adminUsername(env)}, {'Set-Cookie':cookie});
}
function adminLogout() {
  return json(200, {ok:true}, {'Set-Cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`});
}
async function adminSession(request, env) {
  const ok = await isAdmin(request, env);
  return json(ok ? 200 : 401, {authenticated:ok, username:ok ? adminUsername(env) : null, database:Boolean(env.DB)});
}

async function verifyEvaluationSkip(request, env) {
  if (!env.EVALUATION_SKIP_PASSWORD) return json(503, {error:'Überspringen ist nicht konfiguriert.'});
  const key = `skip:${clientIp(request)}`;
  const wait = await retryAfter(env, key, PASSWORD_MAX_FAILURES);
  if (wait) return tooManyRequests(wait);
  const input = await readJson(request, 10000);
  if (!constantTimeEqual(input.password || '', env.EVALUATION_SKIP_PASSWORD)) {
    await hitRateLimit(env, key, PASSWORD_WINDOW_MS);
    return json(401, {error:'Passwort falsch.'});
  }
  await resetRateLimit(env, key);
  return json(200, {ok:true});
}

// --- KI-Chat -----------------------------------------------------------------

async function chat(request, env) {
  if (!env.GEMINI_API_KEY) return json(503, {error:'Kein GEMINI_API_KEY gesetzt.'});
  const ipKey = `chat:${clientIp(request)}`;
  const perMinute = Number(env.CHAT_LIMIT_PER_MINUTE) || 60;
  const perHour = Number(env.CHAT_LIMIT_PER_HOUR) || 600;
  const wait = (await retryAfter(env, ipKey, perMinute)) || (await retryAfter(env, 'chat:all', perHour));
  if (wait) return tooManyRequests(wait);
  await hitRateLimit(env, ipKey, 60 * 1000);
  await hitRateLimit(env, 'chat:all', 60 * 60 * 1000);

  const {message, state} = await readJson(request, MAX_CHAT_BODY_LENGTH);
  if (typeof message !== 'string' || !message.trim()) return json(400, {error:'Nachricht fehlt.'});
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) return json(400, {error:`Nachricht zu lang (maximal ${MAX_CHAT_MESSAGE_LENGTH} Zeichen).`});
  try {
    const result = await askGemini(env.GEMINI_API_KEY, env.GEMINI_MODEL, message.trim(), state);
    if (!result?.ok) {
      console.error(`Gemini error [${result?.model}] ${result?.status || 502} ${result?.code || ''}: ${result?.error || 'Unbekannter Fehler'}`);
      return json(result?.status || 502, {error:result?.error || 'Gemini-Anfrage fehlgeschlagen.', code:result?.code || '', model:result?.model});
    }
    return json(200, {reply:result.reply, actions:result.actions, model:result.model});
  } catch (e) {
    console.error(e);
    return json(502, {error:e instanceof Error ? e.message : String(e)});
  }
}

// --- Ergebnisse und Evaluationen -----------------------------------------------

const parseJsonColumn = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const cleanUsername = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
const cleanCaseId = value => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);

async function saveResult(request, env) {
  const input = await readJson(request);
  const username = cleanUsername(input.username);
  if (username.length < 2) return json(400, {error:'Ein Benutzername mit mindestens 2 Zeichen ist erforderlich.'});
  const record = [
    crypto.randomUUID(),
    String(input.clientRunId || '').slice(0, 100) || null,
    username,
    String(input.caseName || 'Postoperative Blutung').slice(0, 120),
    String(input.difficulty || 'easy').slice(0, 20),
    Math.round(Number(input.plannedDurationSeconds) || 0),
    Math.round(Number(input.elapsedSeconds) || 0),
    String(input.outcome || 'beendet').slice(0, 120),
    Math.round(Math.max(0, Math.min(100, Number(input.scorePercent) || 0))),
    JSON.stringify(input.summary && typeof input.summary === 'object' ? input.summary : {}),
    JSON.stringify(input.details && typeof input.details === 'object' ? input.details : {})
  ];
  // Wiederholtes Speichern desselben Durchlaufs (client_run_id) aktualisiert den Eintrag.
  const row = await env.DB.prepare(`INSERT INTO simulation_results
      (id, client_run_id, username, case_name, difficulty, planned_duration_seconds, elapsed_seconds, outcome, score_percent, summary, details)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
      ON CONFLICT(client_run_id) DO UPDATE SET
        username = excluded.username, case_name = excluded.case_name, difficulty = excluded.difficulty,
        planned_duration_seconds = excluded.planned_duration_seconds, elapsed_seconds = excluded.elapsed_seconds,
        outcome = excluded.outcome, score_percent = excluded.score_percent, summary = excluded.summary, details = excluded.details
      RETURNING id`).bind(...record).first();
  return json(201, {ok:true, id:row?.id ?? null});
}

async function saveEvaluation(request, env) {
  const input = await readJson(request);
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {};
  const system = answers.system || {}, caseAnswers = answers.case || {};
  const valid = v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5;
  if (!SYSTEM_KEYS.every(k => valid(system[k])) || !CASE_KEYS.every(k => valid(caseAnswers[k])) || typeof answers.technicalProblems !== 'boolean') {
    return json(400, {error:'Die Evaluation ist unvollständig.'});
  }
  const caseId = cleanCaseId(input.caseId);
  const caseName = String(input.caseName || '').trim().slice(0, 120);
  const difficulty = ['easy','medium','hard'].includes(String(input.difficulty)) ? String(input.difficulty) : 'easy';
  if (!caseId || !caseName) return json(400, {error:'Fallangabe fehlt.'});
  const stored = {
    system, case:caseAnswers,
    technicalProblems:Boolean(answers.technicalProblems),
    technicalProblemText:String(answers.technicalProblemText || '').trim().slice(0, 1000)
  };
  // Bewusst ohne Benutzer, Durchlauf-ID oder Uhrzeit: nur Kalendertag (UTC).
  await env.DB.prepare('INSERT INTO simulation_evaluations (id, case_id, case_name, difficulty, answers) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(crypto.randomUUID(), caseId, caseName, difficulty, JSON.stringify(stored)).run();
  return json(201, {ok:true});
}

async function listResults(request, env, url) {
  await requireAdmin(request, env);
  const search = (url.searchParams.get('search') || '').trim().slice(0, 80);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
  const columns = 'id, username, created_at, case_name, difficulty, planned_duration_seconds, elapsed_seconds, outcome, score_percent';
  const stmt = search
    ? env.DB.prepare(`SELECT ${columns} FROM simulation_results WHERE username LIKE ?1 ESCAPE '\\' ORDER BY created_at DESC LIMIT ?2`)
        .bind(`%${search.replace(/[\\%_]/g, c => `\\${c}`)}%`, limit)
    : env.DB.prepare(`SELECT ${columns} FROM simulation_results ORDER BY created_at DESC LIMIT ?1`).bind(limit);
  const {results} = await stmt.all();
  return json(200, {results});
}
async function getResult(request, env, id) {
  await requireAdmin(request, env);
  const row = await env.DB.prepare('SELECT * FROM simulation_results WHERE id = ?1').bind(id).first();
  if (!row) return json(404, {error:'Ergebnis nicht gefunden.'});
  return json(200, {result:{...row, summary:parseJsonColumn(row.summary), details:parseJsonColumn(row.details)}});
}
async function deleteResult(request, env, id) {
  await requireAdmin(request, env);
  await env.DB.prepare('DELETE FROM simulation_results WHERE id = ?1').bind(id).run();
  return json(200, {ok:true});
}
async function listEvaluations(request, env, url) {
  await requireAdmin(request, env);
  const caseId = cleanCaseId(url.searchParams.get('caseId'));
  if (!caseId) return json(400, {error:'Fallangabe fehlt.'});
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
  const {results} = await env.DB.prepare(`SELECT id, case_id, case_name, difficulty, answers, submitted_on FROM simulation_evaluations
    WHERE case_id = ?1 ORDER BY submitted_on DESC, rowid DESC LIMIT ?2`).bind(caseId, limit).all();
  return json(200, {evaluations:results.map(r => ({...r, answers:parseJsonColumn(r.answers)}))});
}
async function deleteEvaluation(request, env, id) {
  await requireAdmin(request, env);
  await env.DB.prepare('DELETE FROM simulation_evaluations WHERE id = ?1').bind(id).run();
  return json(200, {ok:true});
}

function averageFrom(items, key) {
  const values = items.map(x => Number(x?.[key])).filter(v => Number.isFinite(v) && v >= 1 && v <= 5);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function buildSummary(items, section, keys, invertedKeys = []) {
  const objects = items.map(x => x.answers?.[section] || {});
  const averages = Object.fromEntries(keys.map(k => [k, Number(averageFrom(objects, k).toFixed(3))]));
  const scored = keys.map(k => invertedKeys.includes(k) ? 6 - averages[k] : averages[k]).filter(Number.isFinite);
  const overallAverage = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
  const technicalYes = items.filter(x => x.answers?.technicalProblems === true).length;
  return {count:items.length, averages, overallAverage:Number(overallAverage.toFixed(3)), technicalProblems:{yes:technicalYes, total:items.length}};
}
async function evaluationSummary(request, env) {
  await requireAdmin(request, env);
  const {results} = await env.DB.prepare('SELECT case_id, case_name, answers FROM simulation_evaluations LIMIT 10000').all();
  const evaluations = results.map(r => ({...r, answers:parseJsonColumn(r.answers)}));
  const groups = new Map();
  for (const item of evaluations) {
    const key = `${item.case_id}\u0000${item.case_name}`;
    if (!groups.has(key)) groups.set(key, {caseId:item.case_id, caseName:item.case_name, items:[]});
    groups.get(key).items.push(item);
  }
  const cases = [...groups.values()]
    .map(g => ({caseId:g.caseId, caseName:g.caseName, ...buildSummary(g.items, 'case', CASE_KEYS, ['case_overwhelmed'])}))
    .sort((a, b) => a.caseName.localeCompare(b.caseName, 'de'));
  return json(200, {system:buildSummary(evaluations, 'system', SYSTEM_KEYS), cases});
}

const csvCell = value => { const s = String(value ?? ''); return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function csvResponse(rows, name) {
  const csv = '﻿' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  return text(200, csv, 'text/csv; charset=utf-8', {'Content-Disposition':`attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`});
}
async function exportCsv(request, env) {
  await requireAdmin(request, env);
  const {results} = await env.DB.prepare(`SELECT username, created_at, case_name, difficulty, elapsed_seconds, outcome, score_percent
    FROM simulation_results ORDER BY created_at DESC LIMIT 5000`).all();
  const rows = [['Benutzername','Datum','Fall','Schwierigkeit','Spieldauer (s)','Ergebnis','Score (%)']];
  for (const r of results) rows.push([r.username, r.created_at, r.case_name, r.difficulty, r.elapsed_seconds, r.outcome, r.score_percent]);
  return csvResponse(rows, 'galen-ergebnisse');
}
async function exportEvaluationCsv(request, env) {
  await requireAdmin(request, env);
  const {results} = await env.DB.prepare(`SELECT case_name, difficulty, answers, submitted_on FROM simulation_evaluations
    ORDER BY submitted_on DESC, rowid DESC LIMIT 10000`).all();
  const rows = [['Datum','Fall','Schwierigkeit','Bedienung einfach','Oberfläche übersichtlich','Chat verstanden','Patient überblickt','Pflegeunterricht geeignet','Weitere Fälle','Fall realistisch','Reaktionen nachvollziehbar','Schwierigkeit angemessen','Kenntnisse angewendet','Verständnis verbessert','Überfordert','Empfehlung','Technische Probleme','Technik-Kommentar']];
  for (const r of results) {
    const a = parseJsonColumn(r.answers), sys = a.system || {}, cas = a.case || {};
    rows.push([r.submitted_on, r.case_name, r.difficulty, ...SYSTEM_KEYS.map(k => sys[k] ?? ''), ...CASE_KEYS.map(k => cas[k] ?? ''),
      a.technicalProblems === true ? 'ja' : a.technicalProblems === false ? 'nein' : '', a.technicalProblemText ?? '']);
  }
  return csvResponse(rows, 'galen-anonyme-evaluationen');
}

// --- Routing -------------------------------------------------------------------

async function route(request, env, url) {
  const {pathname} = url, method = request.method;
  if (method === 'GET' && pathname === '/api/status') {
    return json(200, {enabled:Boolean(env.GEMINI_API_KEY), model:env.GEMINI_MODEL || DEFAULT_MODEL, database:Boolean(env.DB)});
  }
  if (method === 'POST' && pathname === '/api/chat') return chat(request, env);
  if (method === 'POST' && pathname === '/api/results') return saveResult(request, env);
  if (method === 'POST' && pathname === '/api/evaluations') return saveEvaluation(request, env);
  if (method === 'POST' && pathname === '/api/evaluation/skip') return verifyEvaluationSkip(request, env);
  if (method === 'POST' && pathname === '/api/admin/login') return adminLogin(request, env);
  if (method === 'POST' && pathname === '/api/admin/logout') return adminLogout();
  if (method === 'GET' && pathname === '/api/admin/session') return adminSession(request, env);
  if (method === 'GET' && pathname === '/api/admin/results') return listResults(request, env, url);
  if (method === 'GET' && pathname === '/api/admin/export.csv') return exportCsv(request, env);
  if (method === 'GET' && pathname === '/api/admin/evaluations/export.csv') return exportEvaluationCsv(request, env);
  if (method === 'GET' && pathname === '/api/admin/evaluations/summary') return evaluationSummary(request, env);
  if (method === 'GET' && pathname === '/api/admin/evaluations') return listEvaluations(request, env, url);
  const evaluationDetail = pathname.match(/^\/api\/admin\/evaluations\/([a-zA-Z0-9-]+)$/);
  if (method === 'DELETE' && evaluationDetail) return deleteEvaluation(request, env, evaluationDetail[1]);
  const detail = pathname.match(/^\/api\/admin\/results\/([a-zA-Z0-9-]+)$/);
  if (method === 'GET' && detail) return getResult(request, env, detail[1]);
  if (method === 'DELETE' && detail) return deleteResult(request, env, detail[1]);
  if (pathname.startsWith('/api/')) return json(404, {error:'Unbekannter Endpunkt.'});

  if (method !== 'GET' && method !== 'HEAD') return text(405, 'Method not allowed');
  const page = PAGE_ROUTES[pathname];
  if (page) return env.ASSETS.fetch(new Request(new URL(page, url), request));
  // Unbekannte Pfade ohne Dateiendung landen wie bisher im Schock-Simulator.
  const lastSegment = pathname.split('/').pop();
  if (!lastSegment.includes('.')) return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
  return text(404, 'Not found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return await route(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, {error:e.message});
      console.error('Unhandled error:', e);
      return json(500, {error:'Interner Serverfehler.'});
    }
  }
};
