// Persistencia simples em arquivo JSON.
// A camada de acesso fica isolada aqui para trocar por Postgres/MySQL depois
// sem tocar nas rotas.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY = {
  users: [],
  clients: [],
  events: [],
  confirmations: [],
  tasks: [],
  announcements: [],
  announcementReads: [],
  notificationState: [],
  activity: [],
  visits: [],
  deals: [],
  goals: [],
  dailyKpis: [],
  library: [],
  objections: [],
};

let db = null;
let saveTimer = null;

export function load() {
  if (db) return db;
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    db = { ...structuredClone(EMPTY), ...JSON.parse(raw) };
  } catch {
    db = structuredClone(EMPTY);
  }
  return db;
}

export function replace(next) {
  db = { ...structuredClone(EMPTY), ...next };
  saveNow();
  return db;
}

export function saveNow() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

/** Agrupa gravacoes em rajada para nao escrever o arquivo a cada campo alterado */
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 40);
}

export const table = (name) => load()[name];

export const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export function insert(name, row) {
  table(name).push(row);
  save();
  return row;
}

export function update(name, rowId, patch) {
  const row = table(name).find((r) => r.id === rowId);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  save();
  return row;
}

export function remove(name, rowId) {
  const list = table(name);
  const idx = list.findIndex((r) => r.id === rowId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  save();
  return true;
}

export const find = (name, rowId) => table(name).find((r) => r.id === rowId) ?? null;

export const where = (name, fn) => table(name).filter(fn);

export function logActivity(entry) {
  table('activity').push({ id: id('act'), at: new Date().toISOString(), ...entry });
  if (table('activity').length > 500) table('activity').shift();
  save();
}
