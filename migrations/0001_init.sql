-- TeleCare: Tabellen für Cloudflare D1 (SQLite).

-- Personenbezogene Simulationsergebnisse (Benutzername, Verlauf, Score).
CREATE TABLE IF NOT EXISTS simulation_results (
  id TEXT PRIMARY KEY,
  client_run_id TEXT UNIQUE,
  username TEXT NOT NULL CHECK (length(username) BETWEEN 2 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  case_name TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  planned_duration_seconds INTEGER NOT NULL DEFAULT 0,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL,
  score_percent INTEGER NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  summary TEXT NOT NULL DEFAULT '{}',
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS simulation_results_created_at_idx ON simulation_results (created_at DESC);
CREATE INDEX IF NOT EXISTS simulation_results_username_idx ON simulation_results (username);

-- Anonyme Evaluationen: bewusst ohne Benutzer, Durchlauf-ID oder Uhrzeit,
-- damit sie sich nicht mit einem Simulationsergebnis verknüpfen lassen.
CREATE TABLE IF NOT EXISTS simulation_evaluations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  case_name TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  answers TEXT NOT NULL DEFAULT '{}',
  submitted_on TEXT NOT NULL DEFAULT (date('now'))
);
CREATE INDEX IF NOT EXISTS simulation_evaluations_case_idx ON simulation_evaluations (case_id, submitted_on DESC);

-- Zähler für Rate-Limits (KI-Chat, Login-Fehlversuche).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
