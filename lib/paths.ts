// Where TraceIt keeps its files: the SQLite database, uploaded lectures and Notability PDFs, and the
// read-aloud audio cache. Everything lives under one data folder, TRACEIT_DATA_DIR (default `data`,
// relative to the project root; gitignored), so a host with a persistent volume (Railway: /data)
// only has to point that one variable at it. The older per-item variables still win when set:
//
//   TRACEIT_DB_PATH     default <data>/traceit.db
//   TRACEIT_UPLOAD_DIR  default <data>/uploads        (Notability PDFs: <uploads>/notability)
//   TRACEIT_TTS_DIR     default <data>/tts
//
// Values may be relative (to the project root) or absolute; callers resolve them against cwd.
// No `server-only` marker: scripts (tsx) and tests import this too. Keep scripts/start-prod.mjs in
// step with these defaults.
//
// The app was called Inkling before: every TRACEIT_* variable still falls back to its INKLING_*
// name, and a data folder that only has the old inkling.db keeps using it, so existing hosts (a
// Railway volume set up with INKLING_DATA_DIR) keep their settings and their notes.
import { existsSync } from "node:fs";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

const setting = (v: string | undefined) => v?.trim() || null;

/** TRACEIT_<name>, else the pre-rename INKLING_<name>; blank values count as unset. */
export function envSetting(env: Env, name: string): string | null {
  return setting(env[`TRACEIT_${name}`]) ?? setting(env[`INKLING_${name}`]);
}

export function dataDirSetting(env: Env = process.env): string {
  return envSetting(env, "DATA_DIR") ?? "data";
}

export function dbPathSetting(env: Env = process.env, exists: (path: string) => boolean = existsSync): string {
  const configured = envSetting(env, "DB_PATH");
  if (configured) return configured;
  const db = join(dataDirSetting(env), "traceit.db");
  const legacy = join(dataDirSetting(env), "inkling.db");
  return !exists(db) && exists(legacy) ? legacy : db;
}

export function uploadDirSetting(env: Env = process.env): string {
  return envSetting(env, "UPLOAD_DIR") ?? join(dataDirSetting(env), "uploads");
}

export function ttsDirSetting(env: Env = process.env): string {
  return envSetting(env, "TTS_DIR") ?? join(dataDirSetting(env), "tts");
}
