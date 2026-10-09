// Venda e ativação da maquininha: a parte do funil que vira faturamento.
//
// Um registro por negociação: a proposta aberta é a que vira venda quando o
// cliente fecha (não nasce outra), a venda guarda quantidade, tabela e
// modelo, e a ativação tem data própria, declarada pelo vendedor e
// confirmada pela gestão antes de contar na meta e no ranking.
// Número de série não entra: a operação decidiu que não precisa dele no CRM.

import { find, id, insert, table, update } from './store.js';
import { isManager } from './auth.js';
import { ATIVACAO, MODELOS_MAQUINA, STATUS_NEGOCIO, TABELAS_TAXA, ativacaoConta } from './domain.js';
import { clientCard, userCard } from './serializers.js';
import { dateKey, daysBetween, startOfDay } from './lib/dates.js';

export const STATUS_ABERTOS = ['proposta', 'negociacao'];
export const STATUS_VENDIDOS = ['fechado', 'ativado'];

/**
 * Normaliza o que chega do app para os campos da venda. Só devolve o que veio
 * no corpo, para servir tanto ao cadastro quanto à edição.
 */
export function dadosDaVenda(b = {}) {
  const dados = {};
  if ('maquinas' in b) dados.maquinas = Math.max(1, Math.min(50, Number(b.maquinas) || 1));
  if ('taxaOfertada' in b) dados.taxaOfertada = String(b.taxaOfertada ?? '').trim().slice(0, 40) || null;
  if ('modelo' in b) dados.modelo = MODELOS_MAQUINA[b.modelo] ? b.modelo : null;
  if ('notes' in b) dados.notes = String(b.notes ?? '').trim().slice(0, 500);
  return dados;
}

/**
 * O que falta para a venda valer. Tabela de taxa e modelo da maquininha são
 * obrigatórios: venda sem tabela é venda sem preço, e sem o modelo ninguém
 * sabe que máquina o cliente levou. `base` é o negócio que vira a venda (a
 * proposta aberta): o que ela já tem não precisa ser informado de novo.
 */
export function faltaNaVenda(venda, base = {}) {
  const novos = Object.fromEntries(
    Object.entries(dadosDaVenda(venda ?? {})).filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
  );
  const v = { ...(base ?? {}), ...novos };
  if (!v.taxaOfertada) return 'Informe a tabela de taxa da venda.';
  if (!TABELAS_TAXA.includes(v.taxaOfertada)) return `Tabela de taxa desconhecida: ${v.taxaOfertada}.`;
  if (!v.modelo) return 'Informe qual maquininha foi vendida (modelo).';
  return null;
}

/** A proposta/negociação em aberto mais recente do cliente */
export const negocioAberto = (clientId) =>
  table('deals')
    .filter((d) => d.clientId === clientId && STATUS_ABERTOS.includes(d.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] ?? null;

export const temVenda = (clientId) =>
  table('deals').some((d) => d.clientId === clientId && STATUS_VENDIDOS.includes(d.status));

/**
 * Cliente fechou. Se havia proposta aberta, é ela que vira venda — a conversão
 * "proposta → venda" só existe se o mesmo registro andar. Sem proposta, nasce
 * a venda direta. Não mexe no cliente: quem chama (aplicarResultado) cuida do
 * funil, do contador de máquinas e da cadência.
 */
export function fecharVenda(cliente, venda = {}, { userId, agora = new Date(), notes = '' } = {}) {
  const quando = agora.toISOString();
  const dados = dadosDaVenda(venda);

  const indicado = venda.negocioId ? find('deals', venda.negocioId) : null;
  const aberto =
    indicado && indicado.clientId === cliente.id && !STATUS_VENDIDOS.includes(indicado.status)
      ? indicado
      : negocioAberto(cliente.id);

  if (aberto) {
    return update('deals', aberto.id, {
      ...dados,
      maquinas: dados.maquinas ?? aberto.maquinas ?? 1,
      taxaOfertada: dados.taxaOfertada ?? aberto.taxaOfertada ?? null,
      modelo: dados.modelo ?? aberto.modelo ?? null,
      notes: dados.notes || aberto.notes || notes,
      status: 'fechado',
      fechamentoAt: quando,
      fechadoPor: userId,
      ativacaoAt: null,
    });
  }

  return insert('deals', {
    id: id('deal'),
    clientId: cliente.id,
    userId,
    maquinas: dados.maquinas ?? 1,
    taxaOfertada: dados.taxaOfertada ?? null,
    modelo: dados.modelo ?? null,
    status: 'fechado',
    propostaAt: quando,
    fechamentoAt: quando,
    fechadoPor: userId,
    ativacaoAt: null,
    notes: dados.notes || notes,
    createdAt: quando,
  });
}

/**
 * Data de ativação informada ('YYYY-MM-DD'): não pode ser futura nem anterior
 * à venda. Sem data, é agora. No dia de hoje fica a hora de agora; em dia
 * passado fica meio-dia, para cair no dia certo em qualquer fuso.
 */
export function dataDeAtivacao(valor, negocio = {}, agora = new Date()) {
  if (!valor) return { data: agora };
  const dia = new Date(`${String(valor).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(dia.getTime())) return { erro: 'Data de ativação inválida.' };
  if (startOfDay(dia) > startOfDay(agora)) return { erro: 'A data de ativação não pode ser no futuro.' };
  if (negocio.fechamentoAt && startOfDay(dia) < startOfDay(new Date(negocio.fechamentoAt))) {
    const venda = new Date(negocio.fechamentoAt).toLocaleDateString('pt-BR');
    return { erro: `A ativação não pode ser antes da venda (${venda}).` };
  }
  return { data: dateKey(dia) === dateKey(agora) ? agora : dia };
}

/**
 * Ativação da máquina, com a data real. O vendedor declara; a gestão confirma
 * — até lá aparece como "ativação declarada" e não soma. Gestor ativando já
 * confirma.
 */
export function ativarVenda(negocio, { user, data, agora = new Date() } = {}) {
  const quando = dataDeAtivacao(data, negocio, agora);
  if (quando.erro) return { erro: quando.erro };

  const confirma = isManager(user) || !ATIVACAO.exigeConfirmacao;
  const iso = quando.data.toISOString();
  return {
    negocio: update('deals', negocio.id, {
      status: 'ativado',
      fechamentoAt: negocio.fechamentoAt ?? iso,
      ativacaoAt: iso,
      ativacaoDeclaradaAt: agora.toISOString(),
      ativacaoDeclaradaPor: user.id,
      ativacaoConfirmadaAt: confirma ? agora.toISOString() : null,
      ativacaoConfirmadaPor: confirma ? user.id : null,
      ativacaoRecusada: null,
    }),
  };
}

export function confirmarAtivacao(negocio, user, agora = new Date()) {
  return update('deals', negocio.id, {
    ativacaoConfirmadaAt: agora.toISOString(),
    ativacaoConfirmadaPor: user.id,
    ativacaoRecusada: null,
  });
}

/** A gestão não reconheceu a ativação: a máquina volta para "vendida", com o motivo */
export function recusarAtivacao(negocio, user, motivo, agora = new Date()) {
  return update('deals', negocio.id, {
    status: 'fechado',
    ativacaoAt: null,
    ativacaoDeclaradaAt: null,
    ativacaoDeclaradaPor: null,
    ativacaoConfirmadaAt: null,
    ativacaoConfirmadaPor: null,
    ativacaoRecusada: {
      at: agora.toISOString(),
      por: user.id,
      motivo: String(motivo ?? '').trim().slice(0, 300),
      declaradaEm: negocio.ativacaoAt,
      declaradaPor: negocio.ativacaoDeclaradaPor ?? negocio.userId,
    },
  });
}

/** O negócio com o que a interface precisa: rótulos, pendências e idade */
export function expandirNegocio(d, agora = new Date()) {
  const diasSemAtivar =
    d.status === 'fechado' && d.fechamentoAt ? Math.max(0, daysBetween(new Date(d.fechamentoAt), agora)) : null;

  return {
    ...d,
    modeloLabel: MODELOS_MAQUINA[d.modelo] ?? null,
    statusMeta: STATUS_NEGOCIO[d.status] ?? STATUS_NEGOCIO.proposta,
    ativacaoConfirmada: ativacaoConta(d),
    aguardandoConfirmacao: d.status === 'ativado' && !ativacaoConta(d),
    diasSemAtivar,
    ativacaoAtrasada: diasSemAtivar !== null && diasSemAtivar > ATIVACAO.prazoDias,
    prazoAtivacaoDias: ATIVACAO.prazoDias,
    client: clientCard(d.clientId),
    user: userCard(d.userId),
    declaradaPor: d.ativacaoDeclaradaPor ? userCard(d.ativacaoDeclaradaPor) : null,
    confirmadaPor: d.ativacaoConfirmadaPor ? userCard(d.ativacaoConfirmadaPor) : null,
  };
}

/**
 * O que está parado entre a venda e o resultado: máquinas vendidas sem
 * ativação (mais velhas primeiro) e ativações declaradas que a gestão ainda
 * não confirmou. `userId` = 'todos' traz a equipe inteira.
 */
export function pendenciasDeAtivacao(userId, agora = new Date()) {
  const lista = table('deals').filter((d) => (userId === 'todos' ? true : d.userId === userId));

  const semAtivar = lista
    .filter((d) => d.status === 'fechado')
    .map((d) => expandirNegocio(d, agora))
    .sort((a, b) => (b.diasSemAtivar ?? 0) - (a.diasSemAtivar ?? 0));

  const declaradas = lista
    .filter((d) => d.status === 'ativado' && !ativacaoConta(d))
    .map((d) => expandirNegocio(d, agora))
    .sort((a, b) => new Date(a.ativacaoDeclaradaAt ?? a.ativacaoAt) - new Date(b.ativacaoDeclaradaAt ?? b.ativacaoAt));

  const maquinas = (itens) => itens.reduce((s, d) => s + (d.maquinas || 1), 0);

  return {
    prazoDias: ATIVACAO.prazoDias,
    exigeConfirmacao: ATIVACAO.exigeConfirmacao,
    semAtivar,
    declaradas,
    totais: {
      semAtivar: semAtivar.length,
      maquinasSemAtivar: maquinas(semAtivar),
      atrasadas: semAtivar.filter((d) => d.ativacaoAtrasada).length,
      declaradas: declaradas.length,
      maquinasDeclaradas: maquinas(declaradas),
    },
  };
}
