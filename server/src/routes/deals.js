// Propostas, vendas e ativações — a parte do funil que vira faturamento.
//
// Um registro por negociação: a proposta vira venda (não nasce outra), a venda
// guarda quantidade, tabela e modelo, e a ativação tem data própria e passa
// pela confirmação da gestão antes de contar na meta e no ranking.

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth, requireRole } from '../auth.js';
import { etapaDepoisDe } from '../domain.js';
import { aplicarResultado } from '../followups.js';
import {
  STATUS_ABERTOS, STATUS_VENDIDOS, ativarVenda, confirmarAtivacao, dadosDaVenda, dataDeAtivacao,
  expandirNegocio, faltaNaVenda, negocioAberto, pendenciasDeAtivacao, recusarAtivacao,
} from '../vendas.js';

const router = Router();
router.use(requireAuth);

const STATUS = ['proposta', 'negociacao', 'fechado', 'ativado', 'perdido'];
const gestao = requireRole('gestor', 'diretoria');

/**
 * GET /api/deals?status=&clientId=&userId=
 * O vendedor vê os próprios. A gestão vê os de um vendedor (`userId`), da
 * equipe (`todos`) ou, por cliente, de quem for o dono.
 */
router.get('/', (req, res) => {
  const chefe = isManager(req.user);
  const alvo = chefe ? req.query.userId || (req.query.clientId ? 'todos' : req.user.id) : req.user.id;
  let lista = table('deals').filter((d) => (alvo === 'todos' ? true : d.userId === alvo));

  if (req.query.status) lista = lista.filter((d) => d.status === req.query.status);
  if (req.query.clientId) lista = lista.filter((d) => d.clientId === req.query.clientId);

  res.json(lista.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((d) => expandirNegocio(d)));
});

/** GET /api/deals/pendencias?userId= — vendidas sem ativar e ativações a confirmar */
router.get('/pendencias', (req, res) => {
  const alvo = isManager(req.user) ? req.query.userId || 'todos' : req.user.id;
  res.json(pendenciasDeAtivacao(alvo));
});

/**
 * POST /api/deals
 * body: { clientId, status, maquinas, taxaOfertada, modelo, notes,
 *         data (só para status 'ativado') }
 * Proposta por padrão. Com status 'fechado' é venda direta: a proposta aberta
 * do cliente, se houver, é a que vira venda.
 */
router.post('/', (req, res) => {
  const b = req.body ?? {};
  const cliente = find('clients', b.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (cliente.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const status = STATUS.includes(b.status) && b.status !== 'perdido' ? b.status : 'proposta';
  const agora = new Date();

  if (STATUS_VENDIDOS.includes(status)) {
    const falta = faltaNaVenda(b, negocioAberto(cliente.id));
    if (falta) return res.status(400).json({ error: falta });
    if (status === 'ativado') {
      const quando = dataDeAtivacao(b.data, {}, agora);
      if (quando.erro) return res.status(400).json({ error: quando.erro });
    }

    let { negocio } = aplicarResultado(cliente, 'fechado', {
      agora, venda: b, userId: req.user.id, notes: String(b.notes ?? '').trim(),
    });
    logActivity({ userId: req.user.id, action: 'venda_registrada', clientId: cliente.id, dealId: negocio.id });

    if (status === 'ativado') {
      const r = ativarVenda(negocio, { user: req.user, data: b.data, agora });
      if (r.erro) return res.status(400).json({ error: r.erro });
      negocio = r.negocio;
      logActivity({ userId: req.user.id, action: 'maquina_ativada', clientId: cliente.id, dealId: negocio.id });
    }
    return res.status(201).json(expandirNegocio(negocio));
  }

  const dados = dadosDaVenda(b);
  const quando = agora.toISOString();
  const negocio = insert('deals', {
    id: id('deal'),
    clientId: cliente.id,
    userId: req.user.id,
    maquinas: dados.maquinas ?? 1,
    taxaOfertada: dados.taxaOfertada ?? null,
    modelo: dados.modelo ?? null,
    status,
    propostaAt: quando,
    fechamentoAt: null,
    ativacaoAt: null,
    notes: dados.notes ?? '',
    createdAt: quando,
  });

  // A proposta move o funil (só para a frente) e conta como contato
  const stage = etapaDepoisDe(cliente.stage, status);
  update('clients', cliente.id, {
    stage,
    lastContactAt: quando,
    ...(stage !== cliente.stage ? { stageChangedAt: quando } : {}),
  });

  logActivity({ userId: req.user.id, action: 'proposta_enviada', clientId: cliente.id, dealId: negocio.id });
  res.status(201).json(expandirNegocio(negocio));
});

/**
 * PATCH /api/deals/:id
 * Edita a venda (máquinas, tabela, modelo) e avança o negócio: 'fechado'
 * converte a proposta em venda, 'ativado' declara a ativação (body.data = dia
 * real), 'perdido' encerra.
 */
router.patch('/:id', (req, res) => {
  const negocio = find('deals', req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (negocio.userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Negócio de outro vendedor.' });
  }

  const b = req.body ?? {};
  const agora = new Date();
  const cliente = find('clients', negocio.clientId);
  const dados = dadosDaVenda(b);

  // Só edição de campos
  if (!b.status || b.status === negocio.status) {
    if (STATUS_VENDIDOS.includes(negocio.status) && 'taxaOfertada' in dados && !dados.taxaOfertada) {
      return res.status(400).json({ error: 'Venda registrada precisa de tabela de taxa.' });
    }
    if (STATUS_VENDIDOS.includes(negocio.status) && 'modelo' in dados && !dados.modelo) {
      return res.status(400).json({ error: 'Venda registrada precisa do modelo da maquininha.' });
    }
    return res.json(expandirNegocio(update('deals', negocio.id, dados)));
  }

  if (!STATUS.includes(b.status)) return res.status(400).json({ error: 'Status inválido.' });
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

  if (STATUS_ABERTOS.includes(b.status)) {
    if (STATUS_VENDIDOS.includes(negocio.status)) {
      return res.status(409).json({ error: 'Venda registrada não volta para proposta. Se foi engano, exclua o negócio.' });
    }
    const stage = etapaDepoisDe(cliente.stage, b.status);
    update('clients', cliente.id, { stage, lastContactAt: agora.toISOString(), ...(stage !== cliente.stage ? { stageChangedAt: agora.toISOString() } : {}) });
    return res.json(expandirNegocio(update('deals', negocio.id, { ...dados, status: b.status })));
  }

  if (b.status === 'perdido') {
    if (negocio.status === 'ativado') {
      return res.status(409).json({ error: 'Máquina ativada não vira "perdida". Peça à gestão para recusar a ativação.' });
    }
    update('clients', cliente.id, { stage: 'perdido', stageChangedAt: agora.toISOString(), lastContactAt: agora.toISOString() });
    return res.json(expandirNegocio(update('deals', negocio.id, { ...dados, status: 'perdido' })));
  }

  // fechado / ativado: primeiro a venda vale, depois (se for o caso) a ativação
  let atual = negocio;
  if (!STATUS_VENDIDOS.includes(negocio.status)) {
    const falta = faltaNaVenda(dados, negocio);
    if (falta) return res.status(400).json({ error: falta });
    ({ negocio: atual } = aplicarResultado(cliente, 'fechado', {
      agora,
      venda: { ...dados, negocioId: negocio.id },
      userId: negocio.userId,
      notes: dados.notes ?? negocio.notes ?? '',
    }));
    logActivity({ userId: req.user.id, action: 'venda_registrada', clientId: cliente.id, dealId: atual.id });
  } else if (Object.keys(dados).length) {
    atual = update('deals', negocio.id, dados);
  }

  if (b.status === 'ativado') {
    if (negocio.status === 'ativado') return res.json(expandirNegocio(atual));
    const r = ativarVenda(atual, { user: req.user, data: b.data, agora });
    if (r.erro) return res.status(400).json({ error: r.erro });
    atual = r.negocio;
    update('clients', cliente.id, { lastContactAt: agora.toISOString() });
    logActivity({ userId: req.user.id, action: 'maquina_ativada', clientId: cliente.id, dealId: atual.id });
  }

  res.json(expandirNegocio(atual));
});

/** POST /api/deals/:id/confirmar-ativacao — a gestão reconheceu a ativação */
router.post('/:id/confirmar-ativacao', gestao, (req, res) => {
  const negocio = find('deals', req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (negocio.status !== 'ativado') return res.status(409).json({ error: 'Esta máquina ainda não foi ativada.' });
  if (negocio.ativacaoConfirmadaAt) return res.json(expandirNegocio(negocio));

  const atual = confirmarAtivacao(negocio, req.user);
  logActivity({ userId: req.user.id, action: 'ativacao_confirmada', clientId: negocio.clientId, dealId: negocio.id });
  res.json(expandirNegocio(atual));
});

/** POST /api/deals/:id/recusar-ativacao — body: { motivo }. Volta para "vendida". */
router.post('/:id/recusar-ativacao', gestao, (req, res) => {
  const negocio = find('deals', req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (negocio.status !== 'ativado') return res.status(409).json({ error: 'Esta máquina não está ativada.' });
  const motivo = String(req.body?.motivo ?? '').trim();
  if (!motivo) return res.status(400).json({ error: 'Diga por que a ativação não foi reconhecida.' });

  const atual = recusarAtivacao(negocio, req.user, motivo);
  logActivity({ userId: req.user.id, action: 'ativacao_recusada', clientId: negocio.clientId, dealId: negocio.id, motivo });
  res.json(expandirNegocio(atual));
});

router.delete('/:id', (req, res) => {
  const negocio = find('deals', req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (negocio.userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Negócio de outro vendedor.' });
  }

  // O contador de máquinas do cliente acompanha a venda que saiu
  const cliente = find('clients', negocio.clientId);
  if (cliente && STATUS_VENDIDOS.includes(negocio.status)) {
    update('clients', cliente.id, { machines: Math.max(0, (cliente.machines || 0) - (negocio.maquinas || 1)) });
  }
  remove('deals', negocio.id);
  res.json({ ok: true });
});

export default router;
