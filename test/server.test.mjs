import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 39000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: {
      ...process.env,
      PORT: String(PORT),
      GEMINI_API_KEY: 'test-key',
      ADMIN_PASSWORD: 'test-password',
      SESSION_SECRET: 'test-secret',
      CHAT_LIMIT_PER_MINUTE: '3',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => { if (String(chunk).includes('läuft')) resolve(); });
    server.on('exit', code => reject(new Error(`Server beendet (${code})`)));
  });
});

after(() => server?.kill());

const post = (path, data) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

test('Server liefert nur öffentliche Frontend-Dateien aus', async () => {
  for (const path of ['/', '/shock', '/simulator', '/admin', '/app.js', '/styles.css', '/vent.html']) {
    const response = await fetch(`${BASE}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
  }
  for (const path of ['/.env', '/.git/config', '/server.js', '/package.json', '/supabase-setup.sql', '/test/server.test.mjs', '/%2e%2e/server.js', '/foo/..%2fserver.js', '/missing.js']) {
    const response = await fetch(`${BASE}${path}`);
    assert.equal(response.status, 404, path);
  }
  assert.equal((await fetch(`${BASE}/%E0%A4%A`)).status, 400);
});

test('Chat begrenzt Nachrichtenlänge und Anfragen pro IP', async () => {
  const tooLong = await post('/api/chat', { message: 'x'.repeat(1001) });
  assert.equal(tooLong.status, 400);
  // Leere Nachrichten erreichen Gemini nicht, zählen aber für das Limit.
  assert.equal((await post('/api/chat', { message: '' })).status, 400);
  assert.equal((await post('/api/chat', { message: '' })).status, 400);
  const limited = await post('/api/chat', { message: '' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('Admin-Login sperrt nach zehn Fehlversuchen', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await post('/api/admin/login', { username: 'dozent', password: 'falsch' })).status, 401);
  }
  assert.equal((await post('/api/admin/login', { username: 'dozent', password: 'test-password' })).status, 429);
});
