import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

// Minimaler D1-Ersatz auf Basis von node:sqlite mit dem echten Migrationsschema.
async function createDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return {results: db.prepare(sql).all(...args)}; },
        async run() { db.prepare(sql).run(...args); return {success: true}; }
      };
      return stmt;
    }
  };
}
// Assets-Binding: liefert Dateien aus ./public wie Cloudflare.
const ASSETS = {
  async fetch(request) {
    const {pathname} = new URL(request.url);
    try { return new Response(await readFile(new URL(`../public${pathname}`, import.meta.url))); }
    catch { return new Response('Not found', {status: 404}); }
  }
};

async function setup(extra = {}) {
  const env = {DB: await createDb(), ASSETS, ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret', EVALUATION_SKIP_PASSWORD: 'skip', GEMINI_API_KEY: 'test', CHAT_LIMIT_PER_MINUTE: '3', ...extra};
  const call = (path, {method = 'GET', body, cookie, ip = '1.2.3.4'} = {}) => worker.fetch(new Request(`https://galen.example${path}`, {
    method,
    headers: {'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? {Cookie: cookie} : {})},
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  }), env);
  return {env, call};
}
const titleOf = async response => (await response.text()).match(/<title>([^<]*)/)?.[1];
const evaluation = {
  caseId: 'septic_shock_05', caseName: 'Frau Berger', difficulty: 'easy',
  answers: {
    system: {system_easy: 5, system_clear: 4, system_chat: 3, system_overview: 4, system_teaching: 5, system_more_cases: 5},
    case: {case_realistic: 4, case_reactions: 4, case_difficulty: 3, case_apply_knowledge: 4, case_understanding: 5, case_overwhelmed: 2, case_recommend: 5},
    technicalProblems: false, technicalProblemText: ''
  }
};

test('Seiten-Aliase zeigen auf die richtigen HTML-Dateien', async () => {
  const {call} = await setup();
  assert.match(await titleOf(await call('/')), /Clinical Simulation/);
  assert.match(await titleOf(await call('/simulator')), /Simulation auswählen/);
  assert.match(await titleOf(await call('/admin')), /Admin/);
  assert.match(await titleOf(await call('/shock')), /Schock-Simulation/);
  assert.match(await titleOf(await call('/unbekannt')), /Schock-Simulation/);
  assert.equal((await call('/fehlt.js')).status, 404);
  assert.equal((await call('/api/gibtsnicht')).status, 404);
});

test('Status meldet KI und Datenbank', async () => {
  const {call} = await setup();
  assert.deepEqual(await (await call('/api/status')).json(), {enabled: true, model: 'gemini-3.1-flash-lite', database: true});
});

test('Chat begrenzt Nachrichtenlänge und Anfragen pro IP', async () => {
  const {call} = await setup();
  assert.equal((await call('/api/chat', {method: 'POST', body: {message: 'x'.repeat(1001)}})).status, 400);
  assert.equal((await call('/api/chat', {method: 'POST', body: {message: ''}})).status, 400);
  assert.equal((await call('/api/chat', {method: 'POST', body: {message: ''}})).status, 400);
  const limited = await call('/api/chat', {method: 'POST', body: {message: ''}});
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  // Andere IP ist davon nicht betroffen.
  assert.equal((await call('/api/chat', {method: 'POST', body: {message: ''}, ip: '5.6.7.8'})).status, 400);
});

test('Admin-Login sperrt nach zehn Fehlversuchen', async () => {
  const {call} = await setup();
  for (let i = 0; i < 10; i++) {
    assert.equal((await call('/api/admin/login', {method: 'POST', body: {username: 'dozent', password: 'falsch'}})).status, 401);
  }
  assert.equal((await call('/api/admin/login', {method: 'POST', body: {username: 'dozent', password: 'pw'}})).status, 429);
});

test('Skip-Passwort wird geprüft', async () => {
  const {call} = await setup();
  assert.equal((await call('/api/evaluation/skip', {method: 'POST', body: {password: 'nein'}})).status, 401);
  assert.equal((await call('/api/evaluation/skip', {method: 'POST', body: {password: 'skip'}})).status, 200);
});

test('Ergebnisse speichern, im Adminbereich abrufen und löschen', async () => {
  const {call} = await setup();
  assert.equal((await call('/api/admin/results')).status, 401);
  assert.equal((await call('/api/results', {method: 'POST', body: {username: 'x'}})).status, 400);
  assert.equal((await call('/api/results', {method: 'POST', body: 'kein json'})).status, 400);

  const run = {clientRunId: 'run-1', username: 'Max Muster', caseName: 'Fall X', difficulty: 'medium', scorePercent: 70, summary: {a: 1}, details: {chat: []}};
  const first = await (await call('/api/results', {method: 'POST', body: run})).json();
  const second = await (await call('/api/results', {method: 'POST', body: {...run, scorePercent: 90}})).json();
  assert.equal(first.id, second.id, 'Gleicher Durchlauf wird aktualisiert statt doppelt gespeichert');

  const login = await call('/api/admin/login', {method: 'POST', body: {username: 'dozent', password: 'pw'}});
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);
  const cookie = setCookie.split(';')[0];
  assert.equal((await call('/api/admin/session', {cookie})).status, 200);
  assert.equal((await call('/api/admin/session', {cookie: cookie.slice(0, -2) + 'xx'})).status, 401);

  const {results} = await (await call('/api/admin/results?search=MUSTER', {cookie})).json();
  assert.equal(results.length, 1);
  assert.equal(results[0].score_percent, 90);
  assert.match(results[0].created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/);
  assert.equal((await (await call('/api/admin/results?search=100%25', {cookie})).json()).results.length, 0);

  const detail = await (await call(`/api/admin/results/${first.id}`, {cookie})).json();
  assert.deepEqual(detail.result.summary, {a: 1});
  assert.match(await (await call('/api/admin/export.csv', {cookie})).text(), /Max Muster;.*;Fall X;medium;0;beendet;90/);

  assert.equal((await call(`/api/admin/results/${first.id}`, {method: 'DELETE', cookie})).status, 200);
  assert.equal((await (await call('/api/admin/results', {cookie})).json()).results.length, 0);
});

test('Anonyme Evaluationen werden validiert und ausgewertet', async () => {
  const {call} = await setup();
  assert.equal((await call('/api/evaluations', {method: 'POST', body: {...evaluation, answers: {}}})).status, 400);
  assert.equal((await call('/api/evaluations', {method: 'POST', body: evaluation})).status, 201);
  const cookie = (await call('/api/admin/login', {method: 'POST', body: {username: 'dozent', password: 'pw'}})).headers.get('set-cookie').split(';')[0];

  const summary = await (await call('/api/admin/evaluations/summary', {cookie})).json();
  assert.equal(summary.system.count, 1);
  assert.equal(summary.system.overallAverage, 4.333);
  assert.equal(summary.cases[0].caseId, 'septic_shock_05');

  const {evaluations} = await (await call('/api/admin/evaluations?caseId=septic_shock_05', {cookie})).json();
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].answers.case.case_overwhelmed, 2);
  assert.match(evaluations[0].submitted_on, /^\d{4}-\d\d-\d\d$/);
  assert.equal(evaluations[0].username, undefined);
  assert.match(await (await call('/api/admin/evaluations/export.csv', {cookie})).text(), /Frau Berger;easy;5;4;3;4;5;5;4;4;3;4;5;2;5;nein;/);

  assert.equal((await call(`/api/admin/evaluations/${evaluations[0].id}`, {method: 'DELETE', cookie})).status, 200);
  assert.equal((await (await call('/api/admin/evaluations/summary', {cookie})).json()).system.count, 0);
});
