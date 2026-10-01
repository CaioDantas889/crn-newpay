// Motor de follow-up: o lead não pode morrer.
//
// Todo lead que não fechou tem sempre UMA tarefa pendente, na cadência
// D+1 · D+3 · D+7 · D+15 · D+30 contada a partir do cadastro. A tarefa só sai
// da frente com resultado registrado — não existe "marcar como feito".
//
// O que fica gravado no próprio lead (para ninguém varrer a tabela de tarefas):
//   cadenciaInicio        de quando a cadência conta
//   cadenciaEtapa         último passo gerado (d1, d3...)
//   cadenciaDeslocamento  dias de ajuste quando o lojista marcou outra data
//   cadenciaEncerrada     por que parou: fechado, sem_cnpj, fim, fantasma
//   followupPendenteDesde vencimento da tarefa em aberto (ou null)

import { find, id, insert, save, table, update } from './store.js';
import {
  CADENCIA, HORA_FOLLOWUP, MAQUINAS, MODELOS_MENSAGEM, RESULTADOS_VISITA, ROTEIRO_LIGACAO,
  TAXA_NEWPAY, ehDiaDeTrabalho, etapaDepoisDe, scoreNaFaixa,
} from './domain.js';
import { addDays, atHour, daysBetween, endOfDay, startOfDay } from './lib/dates.js';
import { removerArquivo, salvarDataUrl } from './lib/uploads.js';
import { soDigitos } from './leads.js';

const AVULSO = { etapa: 'avulso', dia: null, acao: 'ligacao', label: 'Retorno combinado', apoio: 'Data marcada com o lojista' };

export const passoDaEtapa = (etapa) => CADENCIA.find((p) => p.etapa === etapa) ?? AVULSO;

export const pendenteDoCliente = (clientId) =>
  table('followups')
    .filter((f) => f.clientId === clientId && f.status === 'pendente')
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0] ?? null;

/** Mantém no lead o vencimento da tarefa em aberto */
export function atualizarPendencia(clientId) {
  const cliente = find('clients', clientId);
  if (!cliente) return;
  const desde = pendenteDoCliente(clientId)?.dueAt ?? null;
  if ((cliente.followupPendenteDesde ?? null) !== desde) {
    cliente.followupPendenteDesde = desde;
    save();
  }
}

/** Data de um passo: cadastro + D, com o ajuste do lojista; nunca no passado */
function dataDoPasso(cliente, passo, agora) {
  const inicio = startOfDay(cliente.cadenciaInicio ?? cliente.createdAt);
  const prevista = atHour(addDays(inicio, passo.dia + (Number(cliente.cadenciaDeslocamento) || 0)), HORA_FOLLOWUP);
  const amanha = atHour(addDays(agora, 1), HORA_FOLLOWUP);
  const quando = prevista < amanha ? amanha : prevista;
  // Domingo não tem expediente: a tarefa cai na segunda
  return ehDiaDeTrabalho(quando) ? quando : addDays(quando, 1);
}

function criar(cliente, passo, quando, { marcadoPeloLojista = false, agora = new Date() } = {}) {
  const tarefa = insert('followups', {
    id: id('fup'),
    clientId: cliente.id,
    userId: cliente.ownerId,
    etapa: passo.etapa,
    acao: passo.acao,
    dueAt: new Date(quando).toISOString(),
    marcadoPeloLojista,
    reagendamentos: 0,
    status: 'pendente',
    doneAt: null,
    resultado: null,
    notes: '',
    print: null,
    visitId: null,
    createdAt: agora.toISOString(),
  });
  atualizarPendencia(cliente.id);
  return tarefa;
}

/** Quantos dias a data marcada pelo lojista desloca a cadência dali em diante */
function deslocamento(cliente, passo, quando) {
  if (passo.dia == null) return Number(cliente.cadenciaDeslocamento) || 0;
  const original = addDays(startOfDay(cliente.cadenciaInicio ?? cliente.createdAt), passo.dia);
  return daysBetween(original, quando);
}

/**
 * Garante a próxima tarefa do lead. Se já existe uma em aberto, ela vale (e
 * muda de data quando o lojista marcou outra). Sem `proximoEm`, segue a
 * cadência; cadência encerrada só gera tarefa com data marcada.
 */
export function gerarProximo(cliente, { agora = new Date(), proximoEm = null } = {}) {
  const pendente = pendenteDoCliente(cliente.id);
  if (pendente) return proximoEm ? remarcar(pendente, cliente, proximoEm) : pendente;

  if (cliente.cadenciaEncerrada) {
    return proximoEm ? criar(cliente, AVULSO, proximoEm, { marcadoPeloLojista: true, agora }) : null;
  }

  const atual = CADENCIA.findIndex((p) => p.etapa === cliente.cadenciaEtapa);
  const passo = CADENCIA[atual + 1];
  if (!passo) {
    update('clients', cliente.id, { cadenciaEncerrada: 'fim' });
    return proximoEm ? criar(cliente, AVULSO, proximoEm, { marcadoPeloLojista: true, agora }) : null;
  }

  // Carteira antiga não tem cadência: ela começa a contar do primeiro contato
  const patch = { cadenciaEtapa: passo.etapa };
  if (!cliente.cadenciaInicio) patch.cadenciaInicio = cliente.origem ? cliente.createdAt : agora.toISOString();
  if (proximoEm) {
    patch.cadenciaDeslocamento = deslocamento({ ...cliente, ...patch }, passo, proximoEm);
  }
  const atualizado = update('clients', cliente.id, patch);

  const quando = proximoEm ?? dataDoPasso(atualizado, passo, agora);
  return criar(atualizado, passo, quando, { marcadoPeloLojista: Boolean(proximoEm), agora });
}

function remarcar(tarefa, cliente, quando) {
  const passo = passoDaEtapa(tarefa.etapa);
  update('clients', cliente.id, { cadenciaDeslocamento: deslocamento(cliente, passo, quando) });
  const atualizada = update('followups', tarefa.id, {
    dueAt: new Date(quando).toISOString(),
    marcadoPeloLojista: true,
    reagendamentos: (tarefa.reagendamentos || 0) + 1,
  });
  atualizarPendencia(cliente.id);
  return atualizada;
}

/**
 * Lojista marcou dia e hora. Só vale para tarefa que ainda não venceu: a
 * atrasada precisa de resultado — senão remarcar viraria o jeito de zerar os
 * atrasados sem falar com ninguém.
 */
export function reagendarFollowup(tarefa, quando, agora = new Date()) {
  if (tarefa.status !== 'pendente') return { erro: 'Este follow-up já foi concluído.' };
  if (new Date(tarefa.dueAt) < startOfDay(agora)) {
    return { erro: 'Follow-up atrasado não se remarca: registre o resultado do contato.' };
  }
  if (Number.isNaN(new Date(quando).getTime()) || new Date(quando) < agora) {
    return { erro: 'Escolha um dia e hora no futuro.' };
  }
  const cliente = find('clients', tarefa.clientId);
  if (!cliente) return { erro: 'Cliente não encontrado.' };
  return { tarefa: remarcar(tarefa, cliente, quando) };
}

export function cancelarPendentes(clientId, motivo) {
  const agora = new Date().toISOString();
  for (const f of table('followups')) {
    if (f.clientId === clientId && f.status === 'pendente') {
      update('followups', f.id, { status: 'cancelado', doneAt: agora, notes: motivo });
    }
  }
  atualizarPendencia(clientId);
}

/**
 * O que um resultado faz com o lead: move o funil (só para a frente), ajusta a
 * temperatura, abre o negócio quando fechou e para a cadência quando acabou.
 * Vale igual para visita e para follow-up.
 */
export function aplicarResultado(cliente, resultado, { agora = new Date(), venda, userId, notes = '' } = {}) {
  const meta = RESULTADOS_VISITA[resultado];
  const quando = agora.toISOString();
  const patch = { ultimoResultado: resultado };

  const etapa = etapaDepoisDe(cliente.stage, meta.stage);
  if (etapa !== cliente.stage) {
    patch.stage = etapa;
    patch.stageChangedAt = quando;
  }
  if (meta.temperatura) {
    patch.temperature = meta.temperatura;
    patch.score = scoreNaFaixa(cliente.score, meta.temperatura);
  }
  // "Não atendeu" é tentativa, não contato: não zera os dias sem contato
  if (resultado !== 'nao_atendeu') patch.lastContactAt = quando;

  let negocio = null;
  if (resultado === 'fechado') {
    const maquinas = Math.max(1, Number(venda?.maquinas) || 1);
    patch.machines = (cliente.machines || 0) + maquinas;
    negocio = insert('deals', {
      id: id('deal'),
      clientId: cliente.id,
      userId,
      maquinas,
      taxaOfertada: String(venda?.taxaOfertada ?? '').trim().slice(0, 40) || null,
      status: 'fechado',
      propostaAt: quando,
      fechamentoAt: quando,
      ativacaoAt: null,
      notes,
      createdAt: quando,
    });
  }

  if (meta.encerraCadencia) patch.cadenciaEncerrada = resultado;
  const atualizado = update('clients', cliente.id, patch);
  if (meta.encerraCadencia) cancelarPendentes(cliente.id, `Cadência encerrada: ${meta.label}`);

  return { cliente: atualizado, negocio };
}

/**
 * Print de conversa: só imagem. Guarda a impressão digital do arquivo (print
 * repetido) e a "assinatura visual" calculada no aparelho (print parecido).
 */
export function salvarPrint(print, clienteId, agora = new Date()) {
  const dataUrl = print?.dataUrl ?? print;
  const salvo = salvarDataUrl(dataUrl, `print_${clienteId}`);
  if (!salvo) return null;
  if (!salvo.tipo.startsWith('image/')) {
    removerArquivo(salvo.url);
    return null;
  }
  const assinatura = String(print?.assinatura ?? '').toLowerCase();
  return {
    url: salvo.url,
    hash: salvo.hash,
    assinatura: /^[0-9a-f]{64}$/.test(assinatura) ? assinatura : null,
    tamanho: salvo.tamanho,
    comResposta: Boolean(print?.comResposta),
    at: agora.toISOString(),
  };
}

/**
 * Conclui o follow-up com resultado e já deixa a próxima tarefa de pé.
 * Depois do resgate final (D+30) a cadência acaba: sem avanço, o lead vai
 * para "frio".
 */
export function concluirFollowup(tarefa, cliente, {
  resultado, notes = '', print = null, visitId = null, proximoEm = null, venda, userId, agora = new Date(),
}) {
  const feita = update('followups', tarefa.id, {
    status: 'feito',
    doneAt: agora.toISOString(),
    resultado,
    notes,
    print,
    visitId,
    concluidoPor: userId,
  });

  const efeito = aplicarResultado(cliente, resultado, { agora, venda, userId, notes });
  let atual = efeito.cliente;
  let proximo = null;

  if (!atual.cadenciaEncerrada) {
    if (tarefa.etapa === 'd30') {
      const esfriou = !['quente', 'morno'].includes(resultado);
      atual = update('clients', atual.id, {
        cadenciaEncerrada: 'fim',
        ...(esfriou ? { temperature: 'frio', score: scoreNaFaixa(atual.score, 'frio') } : {}),
      });
    }
    proximo = gerarProximo(atual, { agora, proximoEm });
  } else if (proximoEm && atual.cadenciaEncerrada === 'fim') {
    proximo = gerarProximo(atual, { agora, proximoEm });
  }

  atualizarPendencia(cliente.id);
  return { followup: feita, proximo, negocio: efeito.negocio, cliente: find('clients', cliente.id) };
}

/* ------------------------------------------------------ apoio na tela --- */

const primeiroNome = (nome = '') => String(nome).trim().split(' ')[0] || '';

function comparacaoDeTaxa(cliente) {
  const taxa = Number(cliente.diagnostico?.taxaAtual);
  const nossa = TAXA_NEWPAY.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  if (taxa > TAXA_NEWPAY) {
    const economia = Math.round((taxa - TAXA_NEWPAY) * 100);
    return (
      `hoje você paga ${taxa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% e na NewPay o crédito à vista ` +
      `sai a ${nossa}%. Em cada R$ 10 mil no cartão, são R$ ${economia} a mais no seu caixa.`
    );
  }
  const maquina = MAQUINAS[cliente.diagnostico?.maquinaAtual];
  const atual = maquina && cliente.diagnostico.maquinaAtual !== 'nao_possui' ? ` na ${maquina}` : '';
  return (
    `na NewPay o crédito à vista sai a ${nossa}%. Me diz quanto você paga hoje${atual} ` +
    'que eu faço a conta de quanto sobra no seu caixa.'
  );
}

function preencher(texto, cliente, vendedor) {
  const maquina = MAQUINAS[cliente.diagnostico?.maquinaAtual];
  return texto
    .replaceAll('{nome}', primeiroNome(cliente.name) || 'tudo bem')
    .replaceAll('{empresa}', cliente.company || 'sua loja')
    .replaceAll('{vendedor}', primeiroNome(vendedor?.name))
    .replaceAll('{maquina}', maquina && cliente.diagnostico.maquinaAtual !== 'nao_possui' ? maquina : 'máquina atual')
    .replaceAll('{comparacao}', comparacaoDeTaxa(cliente));
}

/** wa.me precisa do número com o 55 na frente */
export function linkWhatsApp(telefone, texto = '') {
  let d = soDigitos(telefone);
  if (!d) return null;
  if (!(d.length > 11 && d.startsWith('55'))) d = `55${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/** A tarefa com tudo que a tela "Hoje" precisa para agir em um toque */
export function expandirFollowup(f, { agora = new Date() } = {}) {
  const cliente = find('clients', f.clientId);
  const vendedor = find('users', f.userId);
  const passo = passoDaEtapa(f.etapa);
  const atraso = f.status === 'pendente' ? Math.max(0, daysBetween(f.dueAt, agora)) : 0;

  let mensagem = null;
  if (cliente && (f.acao === 'whatsapp' || f.acao === 'resgate' || f.acao === 'resgate_final')) {
    mensagem = preencher(
      f.acao === 'whatsapp' ? MODELOS_MENSAGEM.comparacao : MODELOS_MENSAGEM.retomada,
      cliente,
      vendedor
    );
  }

  const temGps = cliente && Number.isFinite(cliente.lat) && Number.isFinite(cliente.lng) && (cliente.lat || cliente.lng);

  return {
    ...f,
    passo: { etapa: passo.etapa, dia: passo.dia, acao: f.acao, label: passo.label, apoio: passo.apoio },
    diasAtraso: atraso,
    atrasado: f.status === 'pendente' && new Date(f.dueAt) < startOfDay(agora),
    exigePrint: cliente?.origem === 'remoto' && f.acao !== 'revisita',
    exigeGps: f.acao === 'revisita',
    mensagem,
    roteiro: cliente && f.acao === 'ligacao' ? ROTEIRO_LIGACAO.map((l) => preencher(l, cliente, vendedor)) : null,
    client: cliente
      ? {
          id: cliente.id,
          company: cliente.company,
          name: cliente.name,
          phone: cliente.phone,
          whatsapp: cliente.whatsapp || cliente.phone,
          city: cliente.city,
          address: cliente.address,
          origem: cliente.origem ?? null,
          temperature: cliente.temperature,
          stage: cliente.stage,
          rota: temGps ? `https://www.google.com/maps/dir/?api=1&destination=${cliente.lat},${cliente.lng}` : null,
        }
      : null,
  };
}

/** Atrasados primeiro (os mais velhos no topo), depois os do dia */
export function followupsDoVendedor(userId, agora = new Date()) {
  const inicio = startOfDay(agora);
  const fim = endOfDay(agora);
  const meus = table('followups').filter((f) => f.userId === userId);
  const pendentes = meus
    .filter((f) => f.status === 'pendente')
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  return {
    atrasados: pendentes.filter((f) => new Date(f.dueAt) < inicio).map((f) => expandirFollowup(f, { agora })),
    hoje: pendentes
      .filter((f) => new Date(f.dueAt) >= inicio && new Date(f.dueAt) <= fim)
      .map((f) => expandirFollowup(f, { agora })),
    proximos: pendentes.filter((f) => new Date(f.dueAt) > fim).length,
    feitosHoje: meus.filter((f) => f.status === 'feito' && new Date(f.doneAt) >= inicio && new Date(f.doneAt) <= fim).length,
  };
}
