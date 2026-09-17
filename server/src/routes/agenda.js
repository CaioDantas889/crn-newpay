// Agenda Comercial Inteligente: quem visitar hoje e em que ordem.

import { Router } from 'express';
import { find, id, insert, table } from '../store.js';
import { requireAuth } from '../auth.js';
import { FUNIL } from '../domain.js';
import { expandEvent } from '../serializers.js';
import { buildRoute, haversine, mapsUrl } from '../lib/geo.js';
import { addDays, atHour, daysBetween, endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

const VELOCIDADE_KMH = 45;
const MINUTOS_POR_VISITA = 45;

/**
 * Prioridade de visita = oportunidade (score do diagnóstico) + urgência de
 * retorno + proximidade. O score do diagnóstico pesa mais: é ele que diz quem
 * está perto de comprar.
 */
function pontuar(cliente, base) {
  const dias = daysBetween(cliente.lastContactAt);
  const distancia = haversine(base, cliente);

  const pOportunidade = (cliente.score ?? 0) * 0.6;   // até 60
  const pTempo = Math.min(dias * 2, 25);              // até 25
  const pDistancia = Math.max(0, 15 - distancia / 4); // até 15

  const motivos = [];
  if (cliente.temperature === 'quente') motivos.push(`Lead quente (${cliente.score} pts)`);
  else motivos.push(`Oportunidade ${cliente.score} pts`);
  if (dias > 7) motivos.push(`${dias} dias sem contato`);
  else if (dias === 0) motivos.push('Contato hoje');
  if (FUNIL[cliente.stage] && ['proposta', 'negociacao'].includes(cliente.stage)) {
    motivos.push(`Em ${FUNIL[cliente.stage].label.toLowerCase()}`);
  }
  if (cliente.tpvEstimado >= 15000) {
    motivos.push(`TPV estimado de R$ ${cliente.tpvEstimado.toLocaleString('pt-BR')}`);
  }
  if (cliente.diagnostico?.dores?.includes('taxas_altas')) motivos.push('Reclama das taxas');
  if (distancia <= 5) motivos.push('Perto da sua base');

  return {
    score: Math.round(pOportunidade + pTempo + pDistancia),
    dias,
    distanciaKm: Number(distancia.toFixed(1)),
    motivos,
  };
}

/** GET /api/agenda/sugestoes — "Você possui 5 clientes quentes na região de Iguatu." */
router.get('/sugestoes', (req, res) => {
  const base = req.user.base ?? { lat: 0, lng: 0 };
  const hojeIni = startOfDay(new Date());
  const hojeFim = endOfDay(new Date());

  const jaAgendados = new Set(
    table('events')
      .filter(
        (e) =>
          e.ownerId === req.user.id &&
          e.clientId &&
          e.status === 'agendado' &&
          new Date(e.start) >= hojeIni &&
          new Date(e.start) <= hojeFim
      )
      .map((e) => e.clientId)
  );

  const sugeridos = table('clients')
    .filter((c) => c.ownerId === req.user.id && !['fechado', 'perdido'].includes(c.stage) && !jaAgendados.has(c.id))
    .map((c) => ({ ...c, ...pontuar(c, base) }))
    .sort((a, b) => b.score - a.score);

  // Agrupamento por cidade para a frase de destaque
  const porCidade = new Map();
  for (const c of sugeridos) {
    const g = porCidade.get(c.city) ?? { cidade: c.city, regiao: c.region, total: 0, quentes: 0, clientes: [] };
    g.total += 1;
    if (c.temperature === 'quente') g.quentes += 1;
    g.clientes.push(c.id);
    porCidade.set(c.city, g);
  }

  const grupos = [...porCidade.values()].sort((a, b) => b.quentes - a.quentes || b.total - a.total);
  const top = grupos[0];

  res.json({
    destaque: top
      ? {
          texto:
            top.quentes > 0
              ? `Você possui ${top.quentes} cliente${top.quentes > 1 ? 's' : ''} quente${top.quentes > 1 ? 's' : ''} na região de ${top.cidade}.`
              : `Você tem ${top.total} cliente(s) sem retorno na região de ${top.cidade}.`,
          cidade: top.cidade,
          quantidade: top.quentes || top.total,
          clientIds: top.clientes.slice(0, 8),
        }
      : null,
    grupos,
    sugeridos: sugeridos.slice(0, 12),
    agendadosHoje: jaAgendados.size,
  });
});

/** POST /api/agenda/rota — ordena as paradas pelo trajeto mais curto */
router.post('/rota', (req, res) => {
  const { clientIds = [] } = req.body ?? {};
  if (!clientIds.length) return res.status(400).json({ error: 'Selecione ao menos um cliente.' });

  const base = req.user.base ?? { lat: 0, lng: 0 };
  const pontos = clientIds
    .map((cid) => find('clients', cid))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, company: c.company, city: c.city, lat: c.lat, lng: c.lng, temperature: c.temperature }));

  if (!pontos.length) return res.status(404).json({ error: 'Nenhum cliente válido na seleção.' });

  const { stops, totalKm } = buildRoute(base, pontos);
  const minutosDeslocamento = Math.round((totalKm / VELOCIDADE_KMH) * 60);

  res.json({
    origem: { ...base, label: `Base ${req.user.city}` },
    paradas: stops.map((s, i) => ({ ...s, ordem: i + 1 })),
    totalKm,
    minutosDeslocamento,
    minutosTotais: minutosDeslocamento + stops.length * MINUTOS_POR_VISITA,
    mapsUrl: mapsUrl(base, stops),
  });
});

/** POST /api/agenda/rota/agendar — transforma a rota em visitas na agenda */
router.post('/rota/agendar', (req, res) => {
  const { clientIds = [], data, horaInicio = 8 } = req.body ?? {};
  if (!clientIds.length) return res.status(400).json({ error: 'Selecione ao menos um cliente.' });

  const base = req.user.base ?? { lat: 0, lng: 0 };
  const dia = data ? new Date(`${data}T12:00:00`) : addDays(new Date(), 1);
  const pontos = clientIds.map((cid) => find('clients', cid)).filter(Boolean);
  if (!pontos.length) return res.status(404).json({ error: 'Nenhum cliente válido na seleção.' });

  const { stops } = buildRoute(base, pontos.map((c) => ({ ...c })));

  let cursor = atHour(dia, Number(horaInicio), 0);
  const criados = stops.map((parada) => {
    const deslocamento = Math.round((parada.legKm / VELOCIDADE_KMH) * 60);
    const inicio = new Date(cursor.getTime() + deslocamento * 60000);
    const fim = new Date(inicio.getTime() + MINUTOS_POR_VISITA * 60000);
    cursor = fim;

    return insert('events', {
      id: id('evt'),
      title: `Visita ${parada.name.split(' ')[0]}`,
      type: 'visita',
      start: inicio.toISOString(),
      end: fim.toISOString(),
      scope: 'pessoal',
      ownerId: req.user.id,
      audience: null,
      audienceIds: [],
      requiresConfirmation: false,
      clientId: parada.id,
      location: `${parada.company} — ${parada.city}`,
      notes: `Rota inteligente · ${parada.legKm} km da parada anterior.`,
      status: 'agendado',
      checkinAt: null,
      outcome: null,
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
    });
  });

  res.status(201).json({
    criados: criados.length,
    eventos: criados.map((e) => expandEvent(e, req.user.id)),
    data: criados[0]?.start.slice(0, 10),
  });
});

export default router;
