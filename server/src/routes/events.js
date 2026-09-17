import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth, visibleUserIds } from '../auth.js';
import { EVENT_STATUS, EVENT_TYPE_KEYS, reachesUser } from '../domain.js';
import { expandEvent } from '../serializers.js';
import { endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/events?from=&to=&userId=&type=
 * Vendedor enxerga a própria agenda + os eventos corporativos que o alcançam.
 * Gestor pode filtrar por vendedor ou ver a equipe inteira (userId=todos).
 */
router.get('/', (req, res) => {
  const { from, to, userId, type } = req.query;
  const inicio = from ? new Date(from) : null;
  const fim = to ? new Date(to) : null;

  const alvo = userId && isManager(req.user) ? userId : req.user.id;
  const escopo = alvo === 'todos' ? visibleUserIds(req.user) : [alvo];

  const lista = table('events').filter((ev) => {
    if (inicio && new Date(ev.start) < inicio) return false;
    if (fim && new Date(ev.start) > fim) return false;
    if (type && ev.type !== type) return false;
    return escopo.some((uid) => reachesUser(ev, uid));
  });

  res.json(
    lista
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .map((ev) => expandEvent(ev, req.user.id))
  );
});

/** GET /api/events/dia/:data — agenda de um dia específico (YYYY-MM-DD) */
router.get('/dia/:data', (req, res) => {
  const base = new Date(`${req.params.data}T12:00:00`);
  if (Number.isNaN(base.getTime())) return res.status(400).json({ error: 'Data inválida.' });

  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const ini = startOfDay(base);
  const fim = endOfDay(base);

  const eventos = table('events')
    .filter((ev) => {
      const quando = new Date(ev.start);
      return quando >= ini && quando <= fim && reachesUser(ev, alvo);
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map((ev) => expandEvent(ev, req.user.id));

  const tarefas = table('tasks')
    .filter((t) => t.ownerId === alvo && t.dueAt && new Date(t.dueAt) >= ini && new Date(t.dueAt) <= fim)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  const realizadas = eventos.filter((e) => e.type === 'visita' && e.status === 'realizado').length;
  const dono = find('users', alvo);

  res.json({
    data: req.params.data,
    eventos,
    tarefas,
    resumo: {
      total: eventos.length,
      realizados: eventos.filter((e) => e.status === 'realizado').length,
      pendentes: eventos.filter((e) => e.status === 'agendado').length,
      visitasRealizadas: realizadas,
      metaDiaria: dono?.dailyGoal ?? 0,
      tarefasConcluidas: tarefas.filter((t) => t.done).length,
      tarefasTotal: tarefas.length,
    },
  });
});

/** POST /api/events — compromisso pessoal ou corporativo (gestor) */
router.post('/', (req, res) => {
  const b = req.body ?? {};

  if (!b.title?.trim()) return res.status(400).json({ error: 'Informe o título do compromisso.' });
  if (!EVENT_TYPE_KEYS.includes(b.type)) return res.status(400).json({ error: 'Tipo inválido.' });
  if (!b.start) return res.status(400).json({ error: 'Informe a data e hora.' });

  const corporativo = b.scope === 'corporativo';
  if (corporativo && !isManager(req.user)) {
    return res.status(403).json({ error: 'Apenas gestores criam eventos corporativos.' });
  }

  const inicio = new Date(b.start);
  const fim = b.end ? new Date(b.end) : new Date(inicio.getTime() + 60 * 60000);

  const evento = insert('events', {
    id: id('evt'),
    title: b.title.trim(),
    type: b.type,
    start: inicio.toISOString(),
    end: fim.toISOString(),
    scope: corporativo ? 'corporativo' : 'pessoal',
    ownerId: corporativo ? null : b.ownerId && isManager(req.user) ? b.ownerId : req.user.id,
    audience: corporativo ? b.audience ?? 'todos' : null,
    audienceIds: corporativo && b.audience === 'selecionados' ? b.audienceIds ?? [] : [],
    requiresConfirmation: corporativo ? Boolean(b.requiresConfirmation) : false,
    clientId: b.clientId ?? null,
    location: b.location ?? '',
    notes: b.notes ?? '',
    status: 'agendado',
    checkinAt: null,
    outcome: null,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  });

  logActivity({ userId: req.user.id, action: 'evento_criado', eventId: evento.id, title: evento.title });
  res.status(201).json(expandEvent(evento, req.user.id));
});

router.patch('/:id', (req, res) => {
  const evento = find('events', req.params.id);
  if (!evento) return res.status(404).json({ error: 'Compromisso não encontrado.' });

  const podeEditar = evento.ownerId === req.user.id || isManager(req.user);
  if (!podeEditar) return res.status(403).json({ error: 'Você não pode editar este compromisso.' });

  const permitido = [
    'title', 'type', 'start', 'end', 'location', 'notes',
    'clientId', 'status', 'outcome', 'requiresConfirmation', 'audience', 'audienceIds',
  ];
  const patch = {};
  for (const campo of permitido) if (campo in req.body) patch[campo] = req.body[campo];

  if (patch.status && !EVENT_STATUS.includes(patch.status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  if (patch.status === 'realizado' && !evento.checkinAt) {
    patch.checkinAt = new Date().toISOString();
  }

  const atualizado = update('events', evento.id, patch);

  // Concluir uma visita/follow-up conta como contato com o cliente
  if (patch.status === 'realizado' && atualizado.clientId) {
    update('clients', atualizado.clientId, { lastContactAt: new Date().toISOString() });
  }

  res.json(expandEvent(atualizado, req.user.id));
});

router.delete('/:id', (req, res) => {
  const evento = find('events', req.params.id);
  if (!evento) return res.status(404).json({ error: 'Compromisso não encontrado.' });
  if (evento.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Você não pode excluir este compromisso.' });
  }
  remove('events', evento.id);
  res.json({ ok: true });
});

/** POST /api/events/:id/confirmar — presença em evento corporativo */
router.post('/:id/confirmar', (req, res) => {
  const evento = find('events', req.params.id);
  if (!evento) return res.status(404).json({ error: 'Compromisso não encontrado.' });
  if (!reachesUser(evento, req.user.id)) {
    return res.status(403).json({ error: 'Este evento não é da sua agenda.' });
  }

  const status = req.body?.status === 'recusado' ? 'recusado' : 'confirmado';
  const existente = table('confirmations').find(
    (c) => c.eventId === evento.id && c.userId === req.user.id
  );

  if (existente) {
    update('confirmations', existente.id, {
      status,
      note: req.body?.note ?? '',
      respondedAt: new Date().toISOString(),
    });
  } else {
    insert('confirmations', {
      id: id('cfm'),
      eventId: evento.id,
      userId: req.user.id,
      status,
      note: req.body?.note ?? '',
      respondedAt: new Date().toISOString(),
    });
  }

  logActivity({ userId: req.user.id, action: `presenca_${status}`, eventId: evento.id });
  res.json(expandEvent(evento, req.user.id));
});

export default router;
