// Cadastro da equipe: criar, editar, inativar e resetar senha.
// Restrito a gestor/diretoria — é por aqui que a operação entra no ar sem
// depender do seed.

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { removerAnexosDaVisita } from '../lib/uploads.js';
import {
  gerarSenhaProvisoria,
  hashPassword,
  isManager,
  publicUser,
  requireAuth,
  requireRole,
  senhaVersao,
  validarSenha,
} from '../auth.js';

const router = Router();
router.use(requireAuth, requireRole('gestor', 'diretoria'));

const PAPEIS = ['vendedor', 'gestor', 'diretoria'];
const CORES = ['#2563eb', '#db2777', '#ea580c', '#0d9488', '#7c3aed', '#0891b2', '#b45309', '#16a34a'];

const normalizarEmail = (valor) => String(valor ?? '').trim().toLowerCase();

const emailEmUso = (email, exceto) =>
  table('users').some((u) => u.email.toLowerCase() === email && u.id !== exceto);

const gestoresAtivos = () =>
  table('users').filter((u) => u.active !== false && isManager(u));

/** GET /api/users — equipe inteira, inclusive inativos */
router.get('/', (req, res) => {
  res.json(
    table('users')
      .map(publicUser)
      .sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || a.name.localeCompare(b.name))
  );
});

/** POST /api/users — novo integrante; devolve a senha provisória uma única vez */
router.post('/', (req, res) => {
  const b = req.body ?? {};
  const nome = String(b.name ?? '').trim();
  const email = normalizarEmail(b.email);

  if (nome.length < 3) return res.status(400).json({ error: 'Informe o nome completo.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  if (emailEmUso(email)) return res.status(409).json({ error: 'Já existe alguém com esse e-mail.' });

  const role = PAPEIS.includes(b.role) ? b.role : 'vendedor';
  if (role !== 'vendedor' && req.user.role !== 'diretoria' && req.user.role !== 'gestor') {
    return res.status(403).json({ error: 'Apenas a gestão cria outro gestor.' });
  }

  const senha = String(b.senha ?? '').trim() || gerarSenhaProvisoria();
  const recusa = validarSenha(senha);
  if (recusa) return res.status(400).json({ error: recusa });

  const base = {
    lat: Number(b.base?.lat) || Number(req.user.base?.lat) || 0,
    lng: Number(b.base?.lng) || Number(req.user.base?.lng) || 0,
  };

  const usuario = insert('users', {
    id: id('usr'),
    name: nome,
    email,
    password: hashPassword(senha),
    role,
    jobTitle: String(b.jobTitle ?? '').trim() || (role === 'vendedor' ? 'Consultor Externo' : 'Gestor'),
    city: String(b.city ?? req.user.city ?? '').trim(),
    phone: String(b.phone ?? '').trim(),
    color: b.color ?? CORES[table('users').length % CORES.length],
    dailyGoal: role === 'vendedor' ? Number(b.dailyGoal) || 8 : 0,
    active: true,
    base,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });

  logActivity({ userId: req.user.id, action: 'usuario_criado', targetId: usuario.id });
  res.status(201).json({ user: publicUser(usuario), senhaProvisoria: senha });
});

/** PATCH /api/users/:id — dados do integrante, papel e ativação */
router.patch('/:id', (req, res) => {
  const usuario = find('users', req.params.id);
  if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const b = req.body ?? {};
  const patch = {};

  for (const campo of ['name', 'jobTitle', 'city', 'phone', 'color']) {
    if (campo in b) patch[campo] = String(b[campo] ?? '').trim();
  }
  if ('dailyGoal' in b) patch.dailyGoal = Math.max(0, Number(b.dailyGoal) || 0);
  if (b.base) {
    patch.base = { lat: Number(b.base.lat) || 0, lng: Number(b.base.lng) || 0 };
  }

  if ('email' in b) {
    const email = normalizarEmail(b.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (emailEmUso(email, usuario.id)) return res.status(409).json({ error: 'Já existe alguém com esse e-mail.' });
    patch.email = email;
  }

  if ('role' in b) {
    if (!PAPEIS.includes(b.role)) return res.status(400).json({ error: 'Papel inválido.' });
    if (usuario.id === req.user.id && b.role !== req.user.role) {
      return res.status(400).json({ error: 'Você não pode mudar o próprio papel.' });
    }
    if (isManager(usuario) && b.role === 'vendedor' && gestoresAtivos().length <= 1) {
      return res.status(400).json({ error: 'A operação precisa de pelo menos um gestor.' });
    }
    patch.role = b.role;
  }

  if ('active' in b) {
    const ativo = Boolean(b.active);
    if (!ativo && usuario.id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode inativar a própria conta.' });
    }
    if (!ativo && isManager(usuario) && gestoresAtivos().length <= 1) {
      return res.status(400).json({ error: 'A operação precisa de pelo menos um gestor ativo.' });
    }
    patch.active = ativo;
  }

  const atualizado = update('users', usuario.id, patch);
  logActivity({ userId: req.user.id, action: 'usuario_editado', targetId: usuario.id });
  res.json(publicUser(atualizado));
});

/** POST /api/users/:id/senha — reset; a nova senha aparece uma vez para o gestor */
router.post('/:id/senha', (req, res) => {
  const usuario = find('users', req.params.id);
  if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const senha = String(req.body?.senha ?? '').trim() || gerarSenhaProvisoria();
  const recusa = validarSenha(senha);
  if (recusa) return res.status(400).json({ error: recusa });

  update('users', usuario.id, {
    password: hashPassword(senha),
    mustChangePassword: true,
    passwordVersion: senhaVersao(usuario) + 1, // derruba a sessao que estiver aberta
  });
  logActivity({ userId: req.user.id, action: 'senha_resetada', targetId: usuario.id });
  res.json({ ok: true, senhaProvisoria: senha });
});

/* ------------------------------------------------------------- remoção -- */

// Tudo que aponta para uma pessoa. `transfere` marca o que faz sentido passar
// para outro vendedor (carteira e agenda); o resto é histórico pessoal — meta,
// fechamento de dia, leitura de comunicado — que não tem dono novo.
const VINCULOS = [
  { tabela: 'clients', campo: 'ownerId', rotulo: 'clientes na carteira', transfere: true },
  { tabela: 'visits', campo: 'userId', rotulo: 'visitas registradas', transfere: true },
  { tabela: 'deals', campo: 'userId', rotulo: 'propostas e vendas', transfere: true },
  { tabela: 'events', campo: 'ownerId', rotulo: 'compromissos na agenda', transfere: true },
  { tabela: 'tasks', campo: 'ownerId', rotulo: 'tarefas', transfere: true },
  { tabela: 'goals', campo: 'userId', rotulo: 'metas mensais', transfere: false },
  { tabela: 'dailyKpis', campo: 'userId', rotulo: 'fechamentos de dia', transfere: false },
  { tabela: 'confirmations', campo: 'userId', rotulo: 'confirmações de presença', transfere: false },
  { tabela: 'announcementReads', campo: 'userId', rotulo: 'leituras de comunicado', transfere: false },
  { tabela: 'notificationState', campo: 'userId', rotulo: 'notificações lidas', transfere: false },
  { tabela: 'activity', campo: 'userId', rotulo: 'registros de atividade', transfere: false },
];

const linhasDe = (usuario, vinculo) =>
  table(vinculo.tabela).filter((linha) => linha[vinculo.campo] === usuario.id);

function inventario(usuario) {
  const itens = VINCULOS.map((v) => ({
    tabela: v.tabela,
    rotulo: v.rotulo,
    transfere: v.transfere,
    quantidade: linhasDe(usuario, v).length,
  })).filter((i) => i.quantidade > 0);

  return { itens, total: itens.reduce((s, i) => s + i.quantidade, 0) };
}

/** Motivo para não deixar remover, ou null */
function impedimento(usuario, quemPede) {
  if (usuario.id === quemPede.id) return 'Você não pode remover a própria conta.';
  if (isManager(usuario) && gestoresAtivos().length <= 1 && usuario.active !== false) {
    return 'A operação precisa de pelo menos um gestor ativo.';
  }
  return null;
}

/** GET /api/users/:id/remocao — o que existe preso a esta pessoa */
router.get('/:id/remocao', (req, res) => {
  const usuario = find('users', req.params.id);
  if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const { itens, total } = inventario(usuario);
  res.json({
    usuario: publicUser(usuario),
    total,
    itens,
    impedimento: impedimento(usuario, req.user),
    destinos: table('users')
      .filter((u) => u.id !== usuario.id && u.active !== false)
      .map((u) => ({ id: u.id, name: u.name, role: u.role, city: u.city })),
  });
});

/**
 * DELETE /api/users/:id?transferirPara=<id>&forcar=1
 *
 * Remoção é para cadastro errado, duplicado ou teste. Para quem saiu da
 * empresa, o caminho certo é inativar: o histórico continua nos relatórios.
 */
router.delete('/:id', (req, res) => {
  const usuario = find('users', req.params.id);
  if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const bloqueio = impedimento(usuario, req.user);
  if (bloqueio) return res.status(400).json({ error: bloqueio });

  const { itens, total } = inventario(usuario);
  const destinoId = req.query.transferirPara;
  const forcar = req.query.forcar === '1';

  if (total > 0 && !destinoId && !forcar) {
    return res.status(409).json({
      error:
        `${usuario.name} tem ${total} registro(s) no CRM. Transfira a carteira para outra ` +
        'pessoa, force a remoção de tudo, ou apenas inative o acesso.',
      itens,
      total,
    });
  }

  let destino = null;
  if (destinoId) {
    destino = find('users', destinoId);
    if (!destino) return res.status(400).json({ error: 'Pessoa de destino não encontrada.' });
    if (destino.id === usuario.id) return res.status(400).json({ error: 'Escolha outra pessoa para receber a carteira.' });
    if (destino.active === false) return res.status(400).json({ error: 'A pessoa de destino está sem acesso.' });
  }

  const transferidos = {};
  const removidos = {};
  let anexos = 0;

  for (const vinculo of VINCULOS) {
    const linhas = linhasDe(usuario, vinculo);
    if (!linhas.length) continue;

    if (destino && vinculo.transfere) {
      for (const linha of linhas) update(vinculo.tabela, linha.id, { [vinculo.campo]: destino.id });
      transferidos[vinculo.tabela] = linhas.length;
      continue;
    }

    if (vinculo.tabela === 'visits') {
      for (const visita of linhas) anexos += removerAnexosDaVisita(visita);
    }
    for (const linha of linhas) remove(vinculo.tabela, linha.id);
    removidos[vinculo.tabela] = linhas.length;
  }

  remove('users', usuario.id);
  logActivity({
    userId: req.user.id,
    action: 'usuario_removido',
    targetId: usuario.id,
    nome: usuario.name,
    transferidoPara: destino?.id ?? null,
  });

  res.json({
    ok: true,
    removido: usuario.name,
    transferidoPara: destino ? { id: destino.id, name: destino.name } : null,
    transferidos,
    removidos,
    anexos,
  });
});

export default router;
