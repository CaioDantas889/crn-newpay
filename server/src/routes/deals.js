// Propostas, vendas e ativações — a parte do funil que vira faturamento.

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { clientCard, userCard } from '../serializers.js';

const router = Router();
router.use(requireAuth);

const STATUS = ['proposta', 'negociacao', 'fechado', 'ativado', 'perdido'];

const expandir = (d) => ({ ...d, client: clientCard(d.clientId), user: userCard(d.userId) });

router.get('/', (req, res) => {
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  let lista = table('deals').filter((d) => (alvo === 'todos' ? true : d.userId === alvo));

  if (req.query.status) lista = lista.filter((d) => d.status === req.query.status);
  if (req.query.clientId) lista = lista.filter((d) => d.clientId === req.query.clientId);

  res.json(lista.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(expandir));
});

/** POST /api/deals — envio de proposta (ou venda direta com status: 'fechado') */
router.post('/', (req, res) => {
  const b = req.body ?? {};
  const cliente = find('clients', b.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const maquinas = Number(b.maquinas) || 1;
  const status = STATUS.includes(b.status) ? b.status : 'proposta';
  const agora = new Date().toISOString();

  const negocio = insert('deals', {
    id: id('deal'),
    clientId: cliente.id,
    userId: req.user.id,
    maquinas,
    taxaOfertada: Number(b.taxaOfertada) || null,
    status,
    propostaAt: agora,
    fechamentoAt: status === 'fechado' || status === 'ativado' ? agora : null,
    ativacaoAt: status === 'ativado' ? agora : null,
    notes: b.notes ?? '',
    createdAt: agora,
  });

  // A proposta move o funil e conta como contato
  const novoStage = status === 'fechado' || status === 'ativado' ? 'fechado' : 'proposta';
  update('clients', cliente.id, { stage: novoStage, lastContactAt: agora });

  logActivity({ userId: req.user.id, action: 'proposta_enviada', clientId: cliente.id, dealId: negocio.id });
  res.status(201).json(expandir(negocio));
});

/** PATCH /api/deals/:id — avançar o negócio (fechar, ativar, perder) */
router.patch('/:id', (req, res) => {
  const negocio = find('deals', req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (negocio.userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Negócio de outro vendedor.' });
  }

  const patch = {};
  for (const campo of ['maquinas', 'taxaOfertada', 'notes']) {
    if (campo in req.body) patch[campo] = req.body[campo];
  }

  if (req.body.status) {
    if (!STATUS.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
    const agora = new Date().toISOString();
    patch.status = req.body.status;
    if (req.body.status === 'fechado' && !negocio.fechamentoAt) patch.fechamentoAt = agora;
    if (req.body.status === 'ativado') {
      patch.ativacaoAt = agora;
      if (!negocio.fechamentoAt) patch.fechamentoAt = agora;
    }

    const cliente = find('clients', negocio.clientId);
    if (cliente) {
      const stage = ['fechado', 'ativado'].includes(req.body.status)
        ? 'fechado'
        : req.body.status === 'perdido'
          ? 'perdido'
          : cliente.stage;
      update('clients', cliente.id, { stage, lastContactAt: agora });
    }
  }

  res.json(expandir(update('deals', negocio.id, patch)));
});

router.delete('/:id', (req, res) => {
  const negocio = find('deals', req.params.id);
  if (!negocio) return res.status(404).json({ error: 'Negócio não encontrado.' });
  if (negocio.userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Negócio de outro vendedor.' });
  }
  remove('deals', negocio.id);
  res.json({ ok: true });
});

export default router;
