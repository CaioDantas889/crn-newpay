// Follow-ups e a tela "Hoje" do vendedor.
//
// A ordem da tela é a da cobrança: atrasados (em vermelho), follow-ups do dia
// e o placar da meta de leads novos. Follow-up só sai da lista com resultado
// registrado — e, no lead remoto, com o print da conversa.

import { Router } from 'express';
import { find, id, insert, logActivity, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { AVISO_FANTASMA, RESULTADOS_VISITA } from '../domain.js';
import { endOfDay, startOfDay } from '../lib/dates.js';
import { consultarCnpj } from '../lib/cnpj.js';
import { salvarVarios } from '../lib/uploads.js';
import { faltaNaVenda, negocioAberto } from '../vendas.js';
import {
  atrasadosEm, motivoDoStatus, placarDoDia, sequenciaMetaCompleta, statusDoLead, tentarValidar,
} from '../leads.js';
import {
  concluirFollowup, expandirFollowup, followupsDoVendedor, reagendarFollowup, salvarPrint,
} from '../followups.js';

const router = Router();
router.use(requireAuth);

const alvoDe = (req) => (req.query.userId && isManager(req.user) ? req.query.userId : req.user.id);

/** GET /api/followups/hoje — tudo que a tela "Hoje" mostra, em uma ida */
router.get('/hoje', (req, res) => {
  const alvo = alvoDe(req);
  const agora = new Date();
  const ini = startOfDay(agora);
  const fim = endOfDay(agora);
  const hoje = (iso) => new Date(iso) >= ini && new Date(iso) <= fim;

  const tarefas = followupsDoVendedor(alvo, agora);

  // Remotos que ainda não contam: aparecem em cinza, com o que falta
  const semContar = table('clients')
    .filter((c) => c.origem === 'remoto' && (c.cadastradoPor ?? c.ownerId) === alvo)
    .map((c) => ({ c, status: statusDoLead(c, agora) }))
    .filter(({ c, status }) => (status === 'pendente' && hoje(c.createdAt)) || status === 'suspeito')
    .sort((a, b) => new Date(b.c.createdAt) - new Date(a.c.createdAt))
    .slice(0, 12)
    .map(({ c, status }) => ({
      id: c.id,
      company: c.company,
      name: c.name,
      status,
      motivo: motivoDoStatus(c, agora),
      createdAt: c.createdAt,
    }));

  res.json({
    placar: placarDoDia(alvo, agora),
    followups: tarefas,
    contagens: {
      // Revisita e follow-up não contam como lead novo: têm contagem própria
      revisitas: table('visits').filter((v) => v.userId === alvo && v.tipo === 'revisita' && hoje(v.at)).length,
      followupsFeitos: tarefas.feitosHoje,
      followupsPendentes: tarefas.atrasados.length + tarefas.hoje.length,
    },
    semContar,
    sequencia: sequenciaMetaCompleta(alvo, agora),
    aviso: AVISO_FANTASMA,
  });
});

/** GET /api/followups/placar — o placar que fica no topo de todas as telas */
router.get('/placar', (req, res) => {
  const agora = new Date();
  res.json({ ...placarDoDia(req.user.id, agora), atrasados: atrasadosEm(req.user.id, agora) });
});

/**
 * POST /api/followups/:id/concluir
 * body: { resultado, notes, print: { dataUrl, assinatura, comResposta },
 *         lat, lng, precisao, fotos[], proximoEm, venda }
 */
router.post('/:id/concluir', async (req, res, next) => {
  try {
    const tarefa = find('followups', req.params.id);
    if (!tarefa) return res.status(404).json({ error: 'Follow-up não encontrado.' });
    if (tarefa.userId !== req.user.id && !isManager(req.user)) {
      return res.status(403).json({ error: 'Follow-up de outro vendedor.' });
    }
    const b = req.body ?? {};
    const chave = typeof b.chave === 'string' ? b.chave.slice(0, 64) : '';
    if (tarefa.status !== 'pendente') {
      // O mesmo envio chegou antes e a resposta se perdeu no 4G: está salvo
      if (chave && tarefa.chave === chave) {
        return res.status(200).json({ followup: tarefa, proximo: null, negocio: null, repetido: true });
      }
      // Concluído por outro caminho (Visitei, auditoria): este resultado NÃO foi salvo
      return res.status(409).json({
        error: 'Este follow-up já tinha sido concluído por outro registro (uma visita, por exemplo). O que você preencheu agora não foi salvo: confira a ficha do cliente.',
      });
    }

    if (!RESULTADOS_VISITA[b.resultado]) {
      return res.status(400).json({ error: 'Follow-up só é concluído com o resultado do contato.' });
    }
    if (b.resultado === 'fechado') {
      const falta = faltaNaVenda(b.venda, negocioAberto(tarefa.clientId));
      if (falta) return res.status(400).json({ error: falta });
    }

    const cliente = find('clients', tarefa.clientId);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const agora = new Date();
    const revisita = tarefa.acao === 'revisita';
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    const comGps = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

    // Revisita sem GPS (dentro da loja, 4G fraco) salva igual ao "Visitei":
    // marcada "sem GPS", e a gestão recebe o alerta. Antes ela travava aqui e
    // o vendedor ficava parado na frente do lojista.

    const exigePrint = cliente.origem === 'remoto' && !revisita;
    const print = b.print ? salvarPrint(b.print, cliente.id, agora) : null;
    if (exigePrint && !print) {
      return res.status(400).json({ error: 'Lead remoto: anexe o print da conversa para concluir o follow-up.' });
    }

    let proximoEm = b.proximoEm ? new Date(b.proximoEm) : null;
    if (proximoEm && (Number.isNaN(proximoEm.getTime()) || proximoEm <= agora)) proximoEm = null;

    // Revisita é visita: fica no histórico do cliente e no mapa do gestor
    let visita = null;
    if (revisita) {
      visita = insert('visits', {
        id: id('vst'),
        clientId: cliente.id,
        userId: req.user.id,
        at: agora.toISOString(),
        tipo: 'revisita',
        resultado: b.resultado,
        notes: b.notes ?? '',
        fotos: salvarVarios(b.fotos, `visita_${cliente.id}`),
        audio: null,
        lat: comGps ? lat : null,
        lng: comGps ? lng : null,
        precisao: comGps && Number.isFinite(Number(b.precisao)) ? Math.round(Number(b.precisao)) : null,
        semGps: !comGps,
        duracaoMin: null,
        eventId: null,
      });
    }

    const feito = concluirFollowup(tarefa, cliente, {
      resultado: b.resultado,
      notes: String(b.notes ?? '').trim(),
      print,
      visitId: visita?.id ?? null,
      proximoEm,
      venda: b.resultado === 'fechado' ? b.venda : undefined,
      userId: req.user.id,
      agora,
    });

    if (chave) update('followups', tarefa.id, { chave });

    // Print com a resposta do lojista também é o que valida o remoto pendente
    let atual = feito.cliente;
    if (print?.comResposta && atual.origem === 'remoto' && !atual.validadoAt && atual.leadStatus !== 'fantasma') {
      const patch = {};
      if (!atual.print || atual.print.recusado || !atual.print.comResposta) patch.print = print;
      if (!atual.cnpjInfo?.ok) {
        const consulta = await consultarCnpj(atual.cnpj);
        if (consulta.ok) patch.cnpjInfo = consulta;
      }
      if (Object.keys(patch).length) atual = update('clients', atual.id, patch);
      atual = tentarValidar(atual, agora);
    }

    logActivity({ userId: req.user.id, action: 'followup_concluido', clientId: cliente.id, resultado: b.resultado });

    res.json({
      followup: feito.followup,
      proximo: feito.proximo ? expandirFollowup(feito.proximo, { agora }) : null,
      negocio: feito.negocio,
      cliente: { id: atual.id, company: atual.company, stage: atual.stage, temperature: atual.temperature },
      placar: placarDoDia(req.user.id, agora),
    });
  } catch (erro) {
    next(erro);
  }
});

/** POST /api/followups/:id/reagendar — o lojista marcou dia e hora */
router.post('/:id/reagendar', (req, res) => {
  const tarefa = find('followups', req.params.id);
  if (!tarefa) return res.status(404).json({ error: 'Follow-up não encontrado.' });
  if (tarefa.userId !== req.user.id && !isManager(req.user)) {
    return res.status(403).json({ error: 'Follow-up de outro vendedor.' });
  }

  const remarcado = reagendarFollowup(tarefa, req.body?.quando);
  if (remarcado.erro) return res.status(409).json({ error: remarcado.erro });

  logActivity({ userId: req.user.id, action: 'followup_reagendado', clientId: tarefa.clientId });
  res.json(expandirFollowup(remarcado.tarefa));
});

export default router;
