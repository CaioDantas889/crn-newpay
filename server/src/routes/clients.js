// Cadastro de clientes, diagnóstico comercial, funil e mapa.

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import {
  FUNIL, RESULTADOS_VISITA, RETURN_PRESETS, SEGMENTOS,
  calcularScore, temperaturaPorScore,
} from '../domain.js';
import { expandEvent, userCard } from '../serializers.js';
import { haversine } from '../lib/geo.js';
import { removerAnexosDaVisita } from '../lib/uploads.js';
import { addDays, atHour, daysBetween } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

const enriquecer = (c) => ({
  ...c,
  diasSemContato: daysBetween(c.lastContactAt),
  segmentoLabel: SEGMENTOS[c.segment] ?? c.segment,
  stageMeta: FUNIL[c.stage] ?? FUNIL.novo,
});

/** GET /api/clients?busca=&temperatura=&cidade=&stage=&segmento=&ordem= */
router.get('/', (req, res) => {
  const { busca = '', temperatura, cidade, stage, segmento, ordem } = req.query;
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const termo = String(busca).toLowerCase();

  let lista = table('clients')
    .filter((c) => (alvo === 'todos' && isManager(req.user) ? true : c.ownerId === alvo))
    .filter((c) => (temperatura ? c.temperature === temperatura : true))
    .filter((c) => (cidade ? c.city === cidade : true))
    .filter((c) => (stage ? c.stage === stage : true))
    .filter((c) => (segmento ? c.segment === segmento : true))
    .filter((c) =>
      termo ? `${c.name} ${c.company} ${c.city} ${c.phone}`.toLowerCase().includes(termo) : true
    )
    .map(enriquecer);

  const ordenacoes = {
    score: (a, b) => b.score - a.score,
    contato: (a, b) => b.diasSemContato - a.diasSemContato,
    nome: (a, b) => a.company.localeCompare(b.company),
  };
  lista.sort(ordenacoes[ordem] ?? ordenacoes.score);

  res.json(lista);
});

/** GET /api/clients/mapa?raio=3 — "Você tem 12 leads a menos de 3 km" */
router.get('/mapa', (req, res) => {
  const raio = Number(req.query.raio) || 3;
  const origem =
    req.query.lat && req.query.lng
      ? { lat: Number(req.query.lat), lng: Number(req.query.lng) }
      : req.user.base;

  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;

  const pontos = table('clients')
    .filter((c) => (alvo === 'todos' && isManager(req.user) ? true : c.ownerId === alvo))
    .map((c) => ({
      ...enriquecer(c),
      distanciaKm: Number(haversine(origem, c).toFixed(1)),
    }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);

  const proximos = pontos.filter((p) => p.distanciaKm <= raio);
  const leadsProximos = proximos.filter((p) => !['fechado', 'perdido'].includes(p.stage));

  res.json({
    origem,
    raio,
    destaque: leadsProximos.length
      ? `Você tem ${leadsProximos.length} lead(s) a menos de ${raio} km.`
      : `Nenhum lead a menos de ${raio} km. Amplie o raio para ver mais clientes.`,
    totais: {
      ativos: pontos.filter((p) => p.stage === 'fechado').length,
      leads: pontos.filter((p) => !['fechado', 'perdido'].includes(p.stage)).length,
      proximos: proximos.length,
      leadsProximos: leadsProximos.length,
    },
    pontos,
  });
});

/** Distribuição da carteira no funil */
router.get('/funil', (req, res) => {
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const meus = table('clients').filter(
    (c) => (alvo === 'todos' && isManager(req.user) ? true : c.ownerId === alvo)
  );

  res.json(
    Object.entries(FUNIL).map(([chave, info]) => {
      const doEstagio = meus.filter((c) => c.stage === chave);
      return {
        chave,
        ...info,
        total: doEstagio.length,
        clientes: doEstagio
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((c) => ({ id: c.id, company: c.company, name: c.name, score: c.score, city: c.city })),
      };
    })
  );
});

router.get('/:id', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (cliente.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const agenda = table('events')
    .filter((e) => e.clientId === cliente.id)
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .map((e) => expandEvent(e, req.user.id));

  const visitas = table('visits')
    .filter((v) => v.clientId === cliente.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map((v) => ({ ...v, user: userCard(v.userId), resultadoMeta: RESULTADOS_VISITA[v.resultado] ?? null }));

  const negocios = table('deals')
    .filter((d) => d.clientId === cliente.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const { detalhes } = calcularScore(cliente.diagnostico ?? {});

  res.json({
    ...enriquecer(cliente),
    owner: userCard(cliente.ownerId),
    scoreDetalhes: detalhes,
    visitas,
    negocios,
    historico: agenda.filter((e) => new Date(e.start) < new Date()),
    proximos: agenda.filter((e) => new Date(e.start) >= new Date()).reverse(),
  });
});

/** POST /api/clients — cadastro rápido em campo */
router.post('/', (req, res) => {
  const b = req.body ?? {};
  if (!b.company?.trim() && !b.name?.trim()) {
    return res.status(400).json({ error: 'Informe ao menos o nome ou a empresa.' });
  }

  const diagnostico = {
    maquinaAtual: b.diagnostico?.maquinaAtual ?? null,
    faturamento: b.diagnostico?.faturamento ?? null,
    volumeCartao: b.diagnostico?.volumeCartao ?? null,
    dores: b.diagnostico?.dores ?? [],
    interesse: b.diagnostico?.interesse ?? null,
    taxaAtual: b.diagnostico?.taxaAtual ?? null,
    observacoes: b.diagnostico?.observacoes ?? '',
    preenchidoAt: b.diagnostico ? new Date().toISOString() : null,
  };

  const { score } = calcularScore(diagnostico);

  // Gestor pode cadastrar direto na carteira de um vendedor (é assim que a
  // importação da carteira real funciona); vendedor só cadastra para si.
  let responsavel = req.user;
  if (b.ownerId && b.ownerId !== req.user.id) {
    if (!isManager(req.user)) {
      return res.status(403).json({ error: 'Só a gestão cadastra na carteira de outro vendedor.' });
    }
    const dono = find('users', b.ownerId);
    if (!dono) return res.status(400).json({ error: 'Vendedor informado não existe.' });
    responsavel = dono;
  }

  const base = responsavel.base ?? { lat: 0, lng: 0 };

  const cliente = insert('clients', {
    id: id('cli'),
    name: (b.name ?? '').trim(),
    company: (b.company ?? b.name ?? '').trim(),
    segment: b.segment ?? 'outros',
    cnpj: b.cnpj ?? '',
    phone: b.phone ?? '',
    whatsapp: b.whatsapp ?? b.phone ?? '',
    city: b.city ?? responsavel.city,
    region: b.region ?? '',
    address: b.address ?? '',
    lat: Number(b.lat) || base.lat,
    lng: Number(b.lng) || base.lng,
    ownerId: responsavel.id,
    diagnostico,
    score,
    temperature: temperaturaPorScore(score),
    stage: b.stage ?? 'novo',
    machines: 0,
    lastContactAt: new Date().toISOString(),
    notes: b.notes ?? '',
    createdAt: new Date().toISOString(),
  });

  logActivity({ userId: req.user.id, action: 'cliente_cadastrado', clientId: cliente.id });
  res.status(201).json(enriquecer(cliente));
});

router.patch('/:id', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (cliente.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const patch = {};
  const campos = [
    'name', 'company', 'segment', 'cnpj', 'phone', 'whatsapp',
    'city', 'region', 'address', 'lat', 'lng', 'notes', 'stage',
  ];
  for (const campo of campos) if (campo in req.body) patch[campo] = req.body[campo];

  if (patch.stage && !FUNIL[patch.stage]) return res.status(400).json({ error: 'Etapa inválida.' });

  res.json(enriquecer(update('clients', cliente.id, patch)));
});

/** PUT /api/clients/:id/diagnostico — recalcula score e temperatura */
router.put('/:id/diagnostico', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (cliente.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const diagnostico = {
    maquinaAtual: req.body?.maquinaAtual ?? null,
    faturamento: req.body?.faturamento ?? null,
    volumeCartao: req.body?.volumeCartao ?? null,
    dores: Array.isArray(req.body?.dores) ? req.body.dores : [],
    interesse: req.body?.interesse ?? null,
    taxaAtual: req.body?.taxaAtual ? Number(req.body.taxaAtual) : null,
    observacoes: req.body?.observacoes ?? '',
    preenchidoAt: new Date().toISOString(),
  };

  const { score, detalhes } = calcularScore(diagnostico);
  const atualizado = update('clients', cliente.id, {
    diagnostico,
    score,
    temperature: temperaturaPorScore(score),
    lastContactAt: new Date().toISOString(),
    stage: cliente.stage === 'novo' ? 'contatado' : cliente.stage,
  });

  logActivity({ userId: req.user.id, action: 'diagnostico_preenchido', clientId: cliente.id, score });
  res.json({ ...enriquecer(atualizado), scoreDetalhes: detalhes });
});

/** POST /api/clients/:id/agendar-retorno — integração com a agenda */
router.post('/:id/agendar-retorno', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const { preset, date, hour = 9, minute = 0, type = 'followup', notes = '' } = req.body ?? {};

  let quando;
  if (preset && RETURN_PRESETS[preset]) {
    quando = atHour(addDays(new Date(), RETURN_PRESETS[preset].days), Number(hour), Number(minute));
  } else if (date) {
    quando = new Date(date);
    if (Number.isNaN(quando.getTime())) return res.status(400).json({ error: 'Data inválida.' });
  } else {
    return res.status(400).json({ error: 'Escolha um prazo ou uma data personalizada.' });
  }

  const evento = insert('events', {
    id: id('evt'),
    title: `${type === 'visita' ? 'Visita' : 'Follow-up'} ${(cliente.name || cliente.company).split(' ')[0]}`,
    type,
    start: quando.toISOString(),
    end: new Date(quando.getTime() + 30 * 60000).toISOString(),
    scope: 'pessoal',
    ownerId: cliente.ownerId,
    audience: null,
    audienceIds: [],
    requiresConfirmation: false,
    clientId: cliente.id,
    location: type === 'visita' ? `${cliente.company} — ${cliente.city}` : 'Telefone',
    notes,
    status: 'agendado',
    checkinAt: null,
    outcome: null,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  });

  logActivity({ userId: req.user.id, action: 'retorno_agendado', clientId: cliente.id, eventId: evento.id });
  res.status(201).json(expandEvent(evento, req.user.id));
});

/**
 * DELETE /api/clients/:id — remove o cliente e tudo que depende dele.
 * Cliente com máquina ativada carrega o resultado do mês: o vendedor não
 * apaga (recebe 409 e a orientação de marcar como perdido); o gestor pode
 * forçar com ?forcar=1.
 */
router.delete('/:id', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (cliente.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const negocios = table('deals').filter((d) => d.clientId === cliente.id);
  const ativados = negocios.filter((d) => d.status === 'ativado');
  const podeForcar = isManager(req.user) && req.query.forcar === '1';

  if (ativados.length && !podeForcar) {
    const maquinas = ativados.reduce((s, d) => s + d.maquinas, 0);
    return res.status(409).json({
      error:
        `${cliente.company} tem ${maquinas} máquina(s) ativada(s) e entra no resultado do mês. ` +
        'Marque como "perdido" em vez de excluir, ou peça ao gestor.',
      maquinasAtivadas: maquinas,
    });
  }

  const visitas = table('visits').filter((v) => v.clientId === cliente.id);
  const eventos = table('events').filter((e) => e.clientId === cliente.id);
  const tarefas = table('tasks').filter((t) => t.clientId === cliente.id);

  let anexos = 0;
  for (const v of visitas) {
    anexos += removerAnexosDaVisita(v);
    remove('visits', v.id);
  }
  for (const d of negocios) remove('deals', d.id);
  for (const e of eventos) remove('events', e.id);
  for (const t of tarefas) remove('tasks', t.id);
  remove('clients', cliente.id);

  logActivity({ userId: req.user.id, action: 'cliente_excluido', clientId: cliente.id, company: cliente.company });

  res.json({
    ok: true,
    removidos: {
      cliente: cliente.company,
      visitas: visitas.length,
      negocios: negocios.length,
      compromissos: eventos.length,
      tarefas: tarefas.length,
      anexos,
    },
  });
});

/** Registra contato sem criar compromisso (zera o contador de dias) */
router.post('/:id/contato', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const patch = { lastContactAt: new Date().toISOString() };
  if (req.body?.stage && FUNIL[req.body.stage]) patch.stage = req.body.stage;

  res.json(enriquecer(update('clients', cliente.id, patch)));
});

export default router;
