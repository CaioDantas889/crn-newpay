import { Router } from 'express';
import { find, id, insert, remove, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { TASK_KINDS } from '../domain.js';
import { expandTask } from '../serializers.js';
import { endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

/** GET /api/tasks?data=YYYY-MM-DD&pendentes=1 */
router.get('/', (req, res) => {
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  let lista = table('tasks').filter((t) => t.ownerId === alvo);

  if (req.query.data) {
    const base = new Date(`${req.query.data}T12:00:00`);
    const ini = startOfDay(base);
    const fim = endOfDay(base);
    lista = lista.filter((t) => t.dueAt && new Date(t.dueAt) >= ini && new Date(t.dueAt) <= fim);
  }
  if (req.query.pendentes === '1') lista = lista.filter((t) => !t.done);

  res.json(
    lista
      .sort((a, b) => Number(a.done) - Number(b.done) || new Date(a.dueAt) - new Date(b.dueAt))
      .map(expandTask)
  );
});

router.post('/', (req, res) => {
  const { title, kind = 'tarefa', dueAt, clientId = null } = req.body ?? {};
  if (!title?.trim()) return res.status(400).json({ error: 'Descreva a tarefa.' });
  if (!TASK_KINDS.includes(kind)) return res.status(400).json({ error: 'Tipo de tarefa inválido.' });

  const tarefa = insert('tasks', {
    id: id('tsk'),
    ownerId: req.user.id,
    title: title.trim(),
    kind,
    dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    clientId,
    done: false,
    doneAt: null,
    createdAt: new Date().toISOString(),
  });

  res.status(201).json(expandTask(tarefa));
});

router.patch('/:id', (req, res) => {
  const tarefa = find('tasks', req.params.id);
  if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  // A gestão mexe na tarefa de qualquer um, como já faz com cliente, visita,
  // venda e compromisso — antes a tarefa era a única exceção.
  if (tarefa.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Tarefa de outro usuário.' });
  }

  const patch = {};
  for (const campo of ['title', 'kind', 'dueAt', 'clientId']) {
    if (campo in req.body) patch[campo] = req.body[campo];
  }
  if ('done' in req.body) {
    patch.done = Boolean(req.body.done);
    patch.doneAt = patch.done ? new Date().toISOString() : null;
  }

  res.json(expandTask(update('tasks', tarefa.id, patch)));
});

router.delete('/:id', (req, res) => {
  const tarefa = find('tasks', req.params.id);
  if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada.' });
  // A gestão mexe na tarefa de qualquer um, como já faz com cliente, visita,
  // venda e compromisso — antes a tarefa era a única exceção.
  if (tarefa.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Tarefa de outro usuário.' });
  }
  remove('tasks', tarefa.id);
  res.json({ ok: true });
});

export default router;
