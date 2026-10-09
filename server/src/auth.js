// Autenticacao: hash scrypt + token HMAC assinado (sem dependencias externas).
// O segredo vem de config.js — em producao o servidor nem sobe sem ele.

import crypto from 'node:crypto';
import { table } from './store.js';
import { config, TAMANHO_MINIMO_SENHA } from './config.js';

const SECRET = config.segredo;
const TTL_HOURS = config.horasSessao;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

/** Senha provisoria legivel para entregar ao vendedor no primeiro acesso */
export function gerarSenhaProvisoria() {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyz23456789';
  const sorteio = crypto.randomBytes(8);
  const corpo = [...sorteio].map((b) => alfabeto[b % alfabeto.length]).join('');
  return `newpay-${corpo}`;
}

/** Devolve o motivo da recusa, ou null quando a senha serve */
export function validarSenha(senha = '') {
  const valor = String(senha);
  if (valor.trim().length < TAMANHO_MINIMO_SENHA) {
    return `A senha precisa de ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (/^\d+$/.test(valor.trim())) return 'Evite senha só com números.';
  return null;
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

/** Versão da senha: muda a cada troca/reset e derruba os tokens antigos */
export const senhaVersao = (user) => Number(user?.passwordVersion) || 0;

export function createToken(user) {
  const body = b64({
    sub: user.id,
    role: user.role,
    pv: senhaVersao(user),
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
  // Nem o hash nem o contador de trocas saem da API: a interface nao usa nenhum
  // dos dois.
  const { password, passwordVersion, ...rest } = user;
  return rest;
};

// Faltando menos que isso para a sessão vencer, a resposta já leva um token
// novo (cabeçalho X-Token-Novo): quem usa o app todo dia não é derrubado no
// meio de um cadastro porque completou 30 dias de login.
const RENOVAR_ANTES_MS = 7 * 24 * 3600_000;

/**
 * Middleware: exige token valido e injeta req.user. Cada 401 diz o motivo em
 * `code`, para a tela saber se pode só pedir a senha de novo (sessao_vencida)
 * ou se tem de sair de vez (usuario_invalido, senha_mudou).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const payload = readToken(header.replace(/^Bearer /i, ''));
  if (!payload) {
    return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.', code: 'sessao_vencida' });
  }

  const user = table('users').find((u) => u.id === payload.sub);
  if (!user || user.active === false) {
    return res.status(401).json({ error: 'Usuário sem acesso.', code: 'usuario_invalido' });
  }

  // Sessao aberta antes da ultima troca de senha nao vale mais: e assim que um
  // celular perdido perde o acesso sem precisar esperar a sessao vencer.
  if ((Number(payload.pv) || 0) !== senhaVersao(user)) {
    return res.status(401).json({ error: 'Sua senha mudou. Entre novamente.', code: 'senha_mudou' });
  }

  if (payload.exp - Date.now() < RENOVAR_ANTES_MS) res.set('X-Token-Novo', createToken(user));

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
