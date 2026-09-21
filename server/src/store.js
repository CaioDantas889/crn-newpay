// Persistencia simples em arquivo JSON.
// A camada de acesso fica isolada aqui para trocar por Postgres/MySQL depois
// sem tocar nas rotas.
//
// Três cuidados que fazem este arquivo aguentar um servidor de verdade:
//   1. gravação atômica (escreve em .tmp e renomeia) — um desligamento no meio
//      da escrita não deixa o banco pela metade;
//   2. backup rotativo antes de sobrescrever;
//   3. leitura tolerante a falha — arquivo corrompido não vira banco vazio.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export const DATA_DIR = config.dataDir;
export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TMP_PATH = `${DB_PATH}.tmp`;
const LOCK_PATH = path.join(DATA_DIR, 'db.lock');

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
let ultimoBackup = 0;

export const bancoExiste = () => fs.existsSync(DB_PATH);

const ts = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function lerArquivo(caminho) {
  const raw = fs.readFileSync(caminho, 'utf8');
  const dados = JSON.parse(raw);
  if (!dados || typeof dados !== 'object') throw new Error('conteúdo inesperado');
  return dados;
}

/** Backups mais recentes primeiro */
function backups() {
  try {
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map((f) => path.join(BACKUP_DIR, f));
  } catch {
    return [];
  }
}

export function load() {
  if (db) return db;

  if (fs.existsSync(DB_PATH)) {
    try {
      db = { ...structuredClone(EMPTY), ...lerArquivo(DB_PATH) };
      return db;
    } catch (erro) {
      // Nunca sobrescrever um banco ilegível: guarda o arquivo e tenta o backup.
      const quarentena = path.join(DATA_DIR, `db.corrompido-${ts()}.json`);
      try { fs.renameSync(DB_PATH, quarentena); } catch { /* segue o jogo */ }
      console.error(`[store] banco ilegível (${erro.message}). Arquivo movido para ${quarentena}`);

      for (const backup of backups()) {
        try {
          db = { ...structuredClone(EMPTY), ...lerArquivo(backup) };
          console.warn(`[store] recuperado a partir do backup ${path.basename(backup)}`);
          saveNow();
          return db;
        } catch { /* tenta o próximo */ }
      }
      console.error('[store] nenhum backup utilizável — começando com banco vazio.');
    }
  }

  db = structuredClone(EMPTY);
  return db;
}

export function replace(next) {
  db = { ...structuredClone(EMPTY), ...next };
  saveNow();
  return db;
}

/** Copia o banco atual para backups/ respeitando o intervalo configurado */
function guardarBackup() {
  if (!fs.existsSync(DB_PATH)) return;
  const agora = Date.now();
  if (agora - ultimoBackup < config.backupIntervaloMin * 60_000) return;

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `db-${ts()}.json`));
    ultimoBackup = agora;

    for (const antigo of backups().slice(config.backupMaximo)) {
      try { fs.unlinkSync(antigo); } catch { /* já removido */ }
    }
  } catch (erro) {
    console.error('[store] falha ao gravar backup:', erro.message);
  }
}

export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!db) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  guardarBackup();

  // Escreve completo em um temporário e só então troca o arquivo bom pelo novo.
  fs.writeFileSync(TMP_PATH, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(TMP_PATH, DB_PATH);
}

/** Agrupa gravacoes em rajada para nao escrever o arquivo a cada campo alterado */
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 40);
}

/** Grava o que estiver pendente. Chamado ao encerrar o processo. */
export function flush() {
  if (saveTimer) saveNow();
}

/**
 * Trava de escrita: dois processos gravando o mesmo JSON se sobrescrevem.
 * A trava é consultiva — se o dono anterior morreu, o novo assume.
 */
export function acquireLock(dono = 'api') {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const atual = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (atual.pid !== process.pid && vivo(atual.pid)) {
      return { ok: false, dono: atual };
    }
  } catch { /* sem trava ou trava ilegível: pode seguir */ }

  fs.writeFileSync(
    LOCK_PATH,
    JSON.stringify({ pid: process.pid, dono, desde: new Date().toISOString() }),
    'utf8'
  );
  return { ok: true };
}

export function releaseLock() {
  try {
    const atual = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    if (atual.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch { /* nada a liberar */ }
}

function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let encerramentoRegistrado = false;
/** Garante que nada pendente se perca quando o host reinicia o serviço */
export function registrarEncerramento() {
  if (encerramentoRegistrado) return;
  encerramentoRegistrado = true;

  const encerrar = (sinal) => {
    flush();
    releaseLock();
    if (sinal) process.exit(0);
  };

  process.on('exit', () => encerrar());
  for (const sinal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sinal, () => encerrar(sinal));
  }
  process.on('uncaughtException', (erro) => {
    console.error('[api] erro não tratado:', erro);
    flush();
    releaseLock();
    process.exit(1);
  });
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
