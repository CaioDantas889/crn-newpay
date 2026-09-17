// Registro de visita: o botão mais usado do app. Em dois toques o vendedor
// diz o que aconteceu, e o CRM move o funil, registra o contato e, quando é
// venda, já abre o negócio.

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { RESULTADOS_VISITA } from '../domain.js';
import { clientCard, expandEvent, userCard } from '../serializers.js';
import { removerAnexosDaVisita, salvarDataUrl, salvarVarios } from '../lib/uploads.js';
import { addDays, atHour, endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

const expandir = (v) => ({
  ...v,
  client: clientCard(v.clientId),
  user: userCard(v.userId),
  resultadoMeta: RESULTADOS_VISITA[v.resultado] ?? null,
});

/** GET /api/visits?clientId=&data=&userId= */
router.get('/', (req, res) => {
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  let lista = table('visits').filter((v) => (alvo === 'todos' ? true : v.userId === alvo));

  if (req.query.clientId) lista = lista.filter((v) => v.clientId === req.query.clientId);
  if (req.query.data) {
    const base = new Date(`${req.query.data}T12:00:00`);
    lista = lista.filter((v) => new Date(v.at) >= startOfDay(base) && new Date(v.at) <= endOfDay(base));
  }

  res.json(
    lista
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, Number(req.query.limite) || 100)
      .map(expandir)
  );
});

/**
 * POST /api/visits
 * body: { clientId, resultado, notes, fotos[], audio, lat, lng, eventId,
 *         retornarEmDias, venda: { maquinas, tpvPrevisto, taxaOfertada } }
 */
router.post('/', (req, res) => {
  const b = req.body ?? {};
  const cliente = find('clients', b.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const meta = RESULTADOS_VISITA[b.resultado];
  if (!meta) return res.status(400).json({ error: 'Informe o resultado da visita.' });

  const agora = new Date();
  const visita = insert('visits', {
    id: id('vst'),
    clientId: cliente.id,
    userId: req.user.id,
    at: agora.toISOString(),
    resultado: b.resultado,
    notes: b.notes ?? '',
    fotos: salvarVarios(b.fotos, `visita_${cliente.id}`),
    audio: b.audio ? salvarDataUrl(b.audio?.dataUrl ?? b.audio, `audio_${cliente.id}`) : null,
    lat: b.lat ?? cliente.lat,
    lng: b.lng ?? cliente.lng,
    duracaoMin: Number(b.duracaoMin) || null,
    eventId: b.eventId ?? null,
  });

  // A visita sempre conta como contato e empurra o funil
  const patchCliente = { lastContactAt: agora.toISOString(), stage: meta.stage };
  if (b.resultado === 'fechado') patchCliente.machines = (cliente.machines || 0) + (Number(b.venda?.maquinas) || 1);
  update('clients', cliente.id, patchCliente);

  // Fecha o compromisso da agenda, quando a visita veio de um agendamento
  if (b.eventId) {
    const evento = find('events', b.eventId);
    if (evento && evento.ownerId === req.user.id) {
      update('events', evento.id, { status: 'realizado', checkinAt: agora.toISOString(), outcome: b.resultado });
    }
  }

  // Retorno programado vira compromisso na agenda
  let retorno = null;
  if (b.resultado === 'retornar' || b.retornarEmDias) {
    const dias = Number(b.retornarEmDias) || 3;
    const quando = atHour(addDays(agora, dias), 9, 0);
    retorno = insert('events', {
      id: id('evt'),
      title: `Follow-up ${cliente.name.split(' ')[0]}`,
      type: 'followup',
      start: quando.toISOString(),
      end: new Date(quando.getTime() + 30 * 60000).toISOString(),
      scope: 'pessoal',
      ownerId: req.user.id,
      audience: null,
      audienceIds: [],
      requiresConfirmation: false,
      clientId: cliente.id,
      location: 'Telefone',
      notes: b.notes ?? '',
      status: 'agendado',
      checkinAt: null,
      outcome: null,
      createdBy: req.user.id,
      createdAt: agora.toISOString(),
    });
  }

  // Visita que fechou já abre o negócio (máquinas + TPV previsto)
  let negocio = null;
  if (b.resultado === 'fechado') {
    const maquinas = Number(b.venda?.maquinas) || 1;
    negocio = insert('deals', {
      id: id('deal'),
      clientId: cliente.id,
      userId: req.user.id,
      maquinas,
      tpvPrevisto: Number(b.venda?.tpvPrevisto) || (cliente.tpvEstimado || 0) * maquinas,
      taxaOfertada: Number(b.venda?.taxaOfertada) || null,
      status: 'fechado',
      propostaAt: agora.toISOString(),
      fechamentoAt: agora.toISOString(),
      ativacaoAt: null,
      tpvRealizado: 0,
      notes: b.notes ?? '',
      createdAt: agora.toISOString(),
    });
  }

  logActivity({ userId: req.user.id, action: 'visita_registrada', clientId: cliente.id, resultado: b.resultado });

  res.status(201).json({
    visita: expandir(visita),
    retorno: retorno ? expandEvent(retorno, req.user.id) : null,
    negocio,
    cliente: find('clients', cliente.id),
  });
});

router.delete('/:id', (req, res) => {
  const visita = find('visits', req.params.id);
  if (!visita) return res.status(404).json({ error: 'Visita não encontrada.' });
  if (visita.userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Visita de outro vendedor.' });
  }
  const anexos = removerAnexosDaVisita(visita);
  remove('visits', visita.id);
  res.json({ ok: true, anexosRemovidos: anexos });
});

export default router;
