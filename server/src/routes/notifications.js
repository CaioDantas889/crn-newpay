import { Router } from 'express';
import { id, insert, table, update } from '../store.js';
import { requireAuth } from '../auth.js';
import { buildNotifications } from '../notifications.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const lista = buildNotifications(req.user);
  res.json({
    total: lista.length,
    naoLidas: lista.filter((n) => !n.read).length,
    criticas: lista.filter((n) => n.severity === 'critico').length,
    itens: lista,
  });
});

function marcar(userId, notificationId, patch) {
  const atual = table('notificationState').find(
    (s) => s.userId === userId && s.notificationId === notificationId
  );
  if (atual) return update('notificationState', atual.id, patch);
  return insert('notificationState', {
    id: id('nst'),
    userId,
    notificationId,
    readAt: null,
    dismissedAt: null,
    ...patch,
  });
}

router.post('/:id/lida', (req, res) => {
  marcar(req.user.id, req.params.id, { readAt: new Date().toISOString() });
  res.json({ ok: true });
});

router.post('/:id/dispensar', (req, res) => {
  marcar(req.user.id, req.params.id, {
    readAt: new Date().toISOString(),
    dismissedAt: new Date().toISOString(),
  });
  res.json({ ok: true });
});

router.post('/ler-todas', (req, res) => {
  const agora = new Date().toISOString();
  for (const n of buildNotifications(req.user)) marcar(req.user.id, n.id, { readAt: agora });
  res.json({ ok: true });
});

export default router;
