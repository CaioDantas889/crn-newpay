// Registro de visita a quem já está na base (revisita): o botão mais usado do
// app. Em dois toques o vendedor diz o que aconteceu, e o CRM move o funil,
// registra o contato, fecha o follow-up que estava em aberto, já deixa o
// próximo de pé e, quando é venda, abre o negócio.
//
// Revisita não conta como lead novo: tem contagem própria na tela "Hoje".
// A primeira visita de um lead nasce junto com o cadastro (routes/clients.js).

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { RESULTADOS_VISITA, RESULTADOS_VISITA_ANTIGOS, resultadoVisita } from '../domain.js';
import { clientCard, userCard } from '../serializers.js';
import { removerAnexosDaVisita, salvarDataUrl, salvarVarios } from '../lib/uploads.js';
import { addDays, atHour, dateKey, endOfDay, startOfDay } from '../lib/dates.js';
import {
  aplicarResultado, concluirFollowup, expandirFollowup, gerarProximo, pendenteDoCliente, salvarPrint,
} from '../followups.js';
import { expandirNegocio, faltaNaVenda, negocioAberto } from '../vendas.js';

const router = Router();
router.use(requireAuth);

const expandir = (v) => ({
  ...v,
  client: clientCard(v.clientId),
  user: userCard(v.userId),
  resultadoMeta: resultadoVisita(v.resultado),
  // Visita antiga não tem a marcação: sem coordenada é sem GPS
  semGps: v.semGps === true || !Number.isFinite(v.lat) || !Number.isFinite(v.lng),
});

/**
 * GET /api/visits?clientId=&data=&de=&ate=&resultado=&tipo=&userId=&limite=
 * O vendedor vê as próprias visitas. A gestão vê as da equipe inteira por
 * padrão e filtra por vendedor com `userId`.
 */
router.get('/', (req, res) => {
  const alvo = isManager(req.user) ? req.query.userId || 'todos' : req.user.id;
  let lista = table('visits').filter((v) => (alvo === 'todos' ? true : v.userId === alvo));

  if (req.query.clientId) lista = lista.filter((v) => v.clientId === req.query.clientId);
  if (req.query.data) {
    const base = new Date(`${req.query.data}T12:00:00`);
    lista = lista.filter((v) => new Date(v.at) >= startOfDay(base) && new Date(v.at) <= endOfDay(base));
  }
  // Período fechado (YYYY-MM-DD), para a lista de visitas da carteira
  if (req.query.de) {
    const ini = startOfDay(new Date(`${req.query.de}T12:00:00`));
    if (!Number.isNaN(ini.getTime())) lista = lista.filter((v) => new Date(v.at) >= ini);
  }
  if (req.query.ate) {
    const fim = endOfDay(new Date(`${req.query.ate}T12:00:00`));
    if (!Number.isNaN(fim.getTime())) lista = lista.filter((v) => new Date(v.at) <= fim);
  }
  if (req.query.resultado) lista = lista.filter((v) => v.resultado === req.query.resultado);
  if (req.query.tipo) lista = lista.filter((v) => (v.tipo ?? 'revisita') === req.query.tipo);

  res.json(
    lista
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, Math.min(Number(req.query.limite) || 100, 500))
      .map(expandir)
  );
});

/**
 * POST /api/visits
 * body: { clientId, resultado, notes, fotos[], audio, lat, lng, precisao,
 *         eventId, proximoEm, print, venda: { maquinas, taxaOfertada } }
 *
 * `resultado` é a lista fixa: fechado, quente, morno, frio, sem_cnpj,
 * nao_atendeu. `proximoEm` é o dia e hora que o lojista marcou.
 */
router.post('/', (req, res) => {
  const b = req.body ?? {};
  const cliente = find('clients', b.clientId);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (cliente.ownerId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  // App aberto numa versão anterior ainda manda os nomes antigos
  const resultado = RESULTADOS_VISITA[b.resultado] ? b.resultado : RESULTADOS_VISITA_ANTIGOS[b.resultado]?.novo;
  if (!resultado) return res.status(400).json({ error: 'Informe o resultado da visita.' });

  // Reenvio da mesma visita (o 4G caiu depois de o servidor gravar): devolve a
  // que já está salva, sem gravar outra visita, concluir follow-up ou fechar
  // outra venda. Mesma chave com outro cliente ou outro resultado não é
  // reenvio: avisa em vez de esconder o que mudou.
  const chave = typeof b.chave === 'string' ? b.chave.slice(0, 64) : '';
  if (chave) {
    const jaSalva = table('visits').find((v) => v.chave === chave && v.userId === req.user.id);
    if (jaSalva && jaSalva.clientId === cliente.id && jaSalva.resultado === resultado) {
      return res.status(200).json({
        visita: expandir(jaSalva), retorno: null, negocio: null, cliente: find('clients', cliente.id), avisos: [], repetido: true,
      });
    }
    if (jaSalva) {
      const antes = resultadoVisita(jaSalva.resultado)?.label ?? jaSalva.resultado;
      return res.status(409).json({
        error: `Esta visita já tinha sido salva como "${antes}". Feche e registre uma nova visita para mudar.`,
      });
    }
  }

  // Venda sem tabela ou sem modelo não entra; o que a proposta aberta já tem vale
  if (resultado === 'fechado') {
    const falta = faltaNaVenda(b.venda, negocioAberto(cliente.id));
    if (falta) return res.status(400).json({ error: falta });
  }

  const agora = new Date();

  // Anexo recusado (formato estranho, arquivo grande demais) não pode sumir
  // calado: a visita é salva do mesmo jeito, mas o vendedor fica sabendo.
  const fotos = salvarVarios(b.fotos, `visita_${cliente.id}`);
  const audio = b.audio ? salvarDataUrl(b.audio?.dataUrl ?? b.audio, `audio_${cliente.id}`) : null;

  const avisos = [];
  const fotosEnviadas = (b.fotos ?? []).length;
  if (fotosEnviadas > fotos.length) {
    avisos.push(`${fotosEnviadas - fotos.length} foto(s) não foram aceitas (formato ou tamanho).`);
  }
  if (b.audio && !audio) {
    avisos.push('O áudio não foi aceito pelo servidor e não ficou guardado.');
  }
  if (avisos.length) console.warn(`[visitas] anexo recusado: ${avisos.join(' ')}`);

  // A posição é a do aparelho ou nenhuma: endereço de cadastro não prova que
  // o vendedor esteve lá.
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const comGps = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  const visita = insert('visits', {
    id: id('vst'),
    clientId: cliente.id,
    userId: req.user.id,
    at: agora.toISOString(),
    tipo: 'revisita',
    resultado,
    notes: b.notes ?? '',
    fotos,
    audio,
    lat: comGps ? lat : null,
    lng: comGps ? lng : null,
    precisao: comGps && Number.isFinite(Number(b.precisao)) ? Math.round(Number(b.precisao)) : null,
    semGps: !comGps,
    duracaoMin: Number(b.duracaoMin) || null,
    eventId: b.eventId ?? null,
    chave: chave || null,
  });

  // Fecha o compromisso da agenda, quando a visita veio de um agendamento
  if (b.eventId) {
    const evento = find('events', b.eventId);
    if (evento && (evento.ownerId === req.user.id || isManager(req.user))) {
      update('events', evento.id, { status: 'realizado', checkinAt: agora.toISOString(), outcome: resultado });
    }
  }

  // "retornarEmDias" é o formato antigo de "o lojista pediu para voltar em N dias"
  let proximoEm = b.proximoEm ? new Date(b.proximoEm) : null;
  if (proximoEm && (Number.isNaN(proximoEm.getTime()) || proximoEm <= agora)) proximoEm = null;
  if (!proximoEm && Number(b.retornarEmDias) > 0) {
    proximoEm = atHour(addDays(agora, Number(b.retornarEmDias)), 9, 0);
  }

  // A visita vale como resultado do follow-up que estava em aberto; sem
  // tarefa em aberto, ela mesma empurra o funil e gera a próxima.
  const venda = resultado === 'fechado' ? b.venda : undefined;
  const pendente = pendenteDoCliente(cliente.id);
  let negocio = null;
  let proximo = null;

  if (pendente) {
    const print = b.print ? salvarPrint(b.print, cliente.id, agora) : null;
    ({ negocio, proximo } = concluirFollowup(pendente, cliente, {
      resultado, notes: b.notes ?? '', print, visitId: visita.id, proximoEm, venda, userId: req.user.id, agora,
    }));
  } else {
    const efeito = aplicarResultado(cliente, resultado, { agora, venda, userId: req.user.id, notes: b.notes ?? '' });
    negocio = efeito.negocio;
    if (!efeito.cliente.cadenciaEncerrada || proximoEm) {
      proximo = gerarProximo(efeito.cliente, { agora, proximoEm });
    }
  }

  logActivity({ userId: req.user.id, action: 'visita_registrada', clientId: cliente.id, resultado });

  res.status(201).json({
    visita: expandir(visita),
    // `retorno.start` mantém o formato que a tela de visita já lia
    retorno: proximo ? { ...expandirFollowup(proximo, { agora }), type: 'followup', start: proximo.dueAt } : null,
    negocio: negocio ? expandirNegocio(negocio) : null,
    cliente: find('clients', cliente.id),
    avisos,
  });
});

/**
 * DELETE /api/visits/:id
 * A visita do cadastro é a prova do lead: não sai sozinha (apaga-se o lead).
 * Revisita o vendedor só apaga no próprio dia.
 */
router.delete('/:id', (req, res) => {
  const visita = find('visits', req.params.id);
  if (!visita) return res.status(404).json({ error: 'Visita não encontrada.' });

  const gestao = isManager(req.user);
  if (visita.userId !== req.user.id && !gestao) {
    return res.status(403).json({ error: 'Visita de outro vendedor.' });
  }
  if (!gestao && visita.tipo === 'lead') {
    return res.status(403).json({ error: 'Esta visita é a prova do cadastro do lead e não pode ser excluída.' });
  }
  if (!gestao && visita.tipo === 'revisita' && dateKey(visita.at) !== dateKey()) {
    return res.status(403).json({ error: 'Visita de outro dia só é excluída pela gestão.' });
  }

  const anexos = removerAnexosDaVisita(visita);
  remove('visits', visita.id);
  res.json({ ok: true, anexosRemovidos: anexos });
});

export default router;
