// Autenticacao: hash scrypt + token HMAC assinado (sem dependencias externas).

import crypto from 'node:crypto';
import { table } from './store.js';

const SECRET = process.env.NEWPAY_SECRET || 'newpay-dev-secret-troque-em-producao';
const TTL_HOURS = 12;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored = '') {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

export function createToken(user) {
  const body = b64({
    sub: user.id,
    role: user.role,
    exp: Date.now() + TTL_HOURS * 3600_000,
  });
  return `${body}.${sign(body)}`;
}

export function readToken(token = '') {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp < Date.now()) return null;
  return payload;
}

export const publicUser = (user) => {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
};

/** Middleware: exige token valido e injeta req.user */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const payload = readToken(header.replace(/^Bearer /i, ''));
  if (!payload) return res.status(401).json({ error: 'Sessao expirada. Faca login novamente.' });

  const user = table('users').find((u) => u.id === payload.sub);
  if (!user || user.active === false) return res.status(401).json({ error: 'Usuario invalido.' });

  req.user = user;
  next();
}

/** Middleware: restringe a papeis especificos */
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso restrito a gestores.' });
  }
  next();
};

/** Gestor/diretoria enxerga a equipe inteira; vendedor so enxerga a si mesmo */
export const isManager = (user) => user.role === 'gestor' || user.role === 'diretoria';

export function visibleUserIds(user) {
  if (!isManager(user)) return [user.id];
  return table('users')
    .filter((u) => u.active !== false)
    .map((u) => u.id);
}
