import { Router } from 'express';
import { find, id, insert, logActivity, remove, table } from '../store.js';
import { isManager, requireAuth, requireRole } from '../auth.js';
import { ANNOUNCEMENT_CATEGORIES, announcementReachesUser } from '../domain.js';
import { expandAnnouncement } from '../serializers.js';

const router = Router();
router.use(requireAuth);

/** Mural de avisos: o vendedor vê o que o alcança; o gestor vê tudo com o placar de leitura */
router.get('/', (req, res) => {
  const agora = new Date();

  const lista = table('announcements')
    .filter((a) => (isManager(req.user) ? true : announcementReachesUser(a, req.user.id)))
    .filter((a) => (req.query.incluirExpirados === '1' ? true : !a.expiresAt || new Date(a.expiresAt) >= agora))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((a) => {
      const cheio = expandAnnouncement(a, req.user.id);
      const alvo = table('users').filter(
        (u) => u.role === 'vendedor' && u.active !== false && announcementReachesUser(a, u.id)
      );
      return {
        ...cheio,
        audienceCount: alvo.length,
        pendingReaders: isManager(req.user)
          ? alvo.filter((u) => !cheio.readBy.some((r) => r.userId === u.id))
              .map((u) => ({ id: u.id, name: u.name, color: u.color }))
          : undefined,
        readBy: isManager(req.user) ? cheio.readBy : undefined,
      };
    });

  res.json(lista);
});

/** "Li o comunicado" — é isso que alimenta o controle de leitura do gestor */
router.post('/:id/lido', (req, res) => {
  const aviso = find('announcements', req.params.id);
  if (!aviso) return res.status(404).json({ error: 'Comunicado não encontrado.' });

  const jaLeu = table('announcementReads').find(
    (r) => r.announcementId === aviso.id && r.userId === req.user.id
  );
  if (!jaLeu) {
    insert('announcementReads', {
      id: id('red'),
      announcementId: aviso.id,
      userId: req.user.id,
      readAt: new Date().toISOString(),
    });
    logActivity({ userId: req.user.id, action: 'aviso_lido', announcementId: aviso.id });
  }

  res.json(expandAnnouncement(aviso, req.user.id));
});

router.post('/', requireRole('gestor', 'diretoria'), (req, res) => {
  const { title, body, category = 'geral', priority = 'normal', audience = 'todos', audienceIds = [], expiresAt } =
    req.body ?? {};

  if (!title?.trim()) return res.status(400).json({ error: 'Informe o título do comunicado.' });
  if (!body?.trim()) return res.status(400).json({ error: 'Escreva o conteúdo do comunicado.' });
  if (!ANNOUNCEMENT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida.' });
  }

  const aviso = insert('announcements', {
    id: id('avs'),
    title: title.trim(),
    body: body.trim(),
    category,
    priority,
    audience,
    audienceIds: audience === 'selecionados' ? audienceIds : [],
    requiresAck: true,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  });

  res.status(201).json(expandAnnouncement(aviso, req.user.id));
});

router.delete('/:id', requireRole('gestor', 'diretoria'), (req, res) => {
  if (!find('announcements', req.params.id)) {
    return res.status(404).json({ error: 'Comunicado não encontrado.' });
  }
  const leituras = table('announcementReads').filter((r) => r.announcementId === req.params.id);
  for (const l of leituras) remove('announcementReads', l.id);
  remove('announcements', req.params.id);
  res.json({ ok: true, leiturasRemovidas: leituras.length });
});

export default router;
