// Lead novo: o que conta na meta diária, o que fica de fora e por quê.
//
// "Lead" aqui é o cliente que entrou com prova — presencial (GPS, horário e
// foto da fachada) ou remoto (CNPJ ativo e print com resposta). Cliente
// importado pela gestão não tem `origem` e não entra em contagem nenhuma.

import { table, update } from './store.js';
import {
  META_LEADS, STATUS_LEAD, SUSPEITA_REMOTO, ehDiaDeTrabalho,
} from './domain.js';
import { addDays, atHour, dateKey, daysBetween, endOfDay, startOfDay } from './lib/dates.js';

export const ehLead = (c) => c.origem === 'presencial' || c.origem === 'remoto';

/** Quem cadastrou o lead — é dele a contagem, mesmo que a carteira mude de mão */
export const donoDoLead = (c) => c.cadastradoPor ?? c.ownerId;

/**
 * Status do lead agora. Só "fantasma" e a validação ficam gravados; "suspeito"
 * é calculado na hora, porque depende de quanto tempo passou.
 *
 * `followupPendenteDesde` é mantido pelo motor de follow-up no próprio lead,
 * para esta conta não precisar varrer a tabela de tarefas a cada cliente.
 */
export function statusDoLead(c, agora = new Date()) {
  if (!ehLead(c)) return null;
  if (c.leadStatus === 'fantasma') return 'fantasma';
  if (c.origem === 'presencial') return 'validado';
  if (!c.validadoAt) return 'pendente';
  if (c.stage === 'fechado') return 'validado';

  const { diasFollowupAtrasado, diasSemAvanco } = SUSPEITA_REMOTO;
  if (c.followupPendenteDesde && daysBetween(c.followupPendenteDesde, agora) >= diasFollowupAtrasado) {
    return 'suspeito';
  }
  if (daysBetween(c.stageChangedAt ?? c.createdAt, agora) >= diasSemAvanco) return 'suspeito';
  return 'validado';
}

/** Por que o lead está com esse status — a frase que aparece na ficha */
export function motivoDoStatus(c, agora = new Date()) {
  const status = statusDoLead(c, agora);
  if (status === 'pendente') {
    if (!c.cnpjInfo?.ok) return 'Falta confirmar o CNPJ na Receita.';
    if (!c.print) return 'Falta o print da conversa com a resposta do lojista.';
    if (c.print.recusado) return `Print recusado pela gestão${c.print.motivoRecusa ? `: ${c.print.motivoRecusa}` : '.'}`;
    return 'O print enviado não mostra a resposta do lojista.';
  }
  if (status === 'suspeito') {
    const { diasFollowupAtrasado, diasSemAvanco } = SUSPEITA_REMOTO;
    return c.followupPendenteDesde && daysBetween(c.followupPendenteDesde, agora) >= diasFollowupAtrasado
      ? `Follow-up parado há ${daysBetween(c.followupPendenteDesde, agora)} dias. Registre o resultado para voltar a contar.`
      : `Sem avanço no funil há ${diasSemAvanco} dias ou mais.`;
  }
  if (status === 'fantasma') return 'A auditoria confirmou que o lojista não reconhece o contato.';
  return null;
}

export const statusMeta = (status) => (status ? { chave: status, ...STATUS_LEAD[status] } : null);

/**
 * Lead remoto valida com CNPJ ativo + print com resposta do lojista. Hoje a
 * prova de interação é o print; quando a confirmação automática pela API do
 * WhatsApp Business entrar, é aqui que ela passa a valer também
 * (validadoPor: 'whatsapp_api').
 */
export function tentarValidar(cliente, agora = new Date()) {
  if (cliente.origem !== 'remoto' || cliente.validadoAt) return cliente;
  const cnpjOk = cliente.cnpjInfo?.ok && cliente.cnpjInfo.ativa;
  const printOk = cliente.print?.comResposta && !cliente.print.recusado;
  if (!cnpjOk || !printOk) return cliente;
  return update('clients', cliente.id, { validadoAt: agora.toISOString(), validadoPor: 'print' });
}

/* ------------------------------------------------------------ contagem -- */

const ZERO = () => ({
  total: 0,          // o que conta na meta
  presenciais: 0,
  remotos: 0,        // remotos validados que contam (até o teto do dia)
  remotosValidados: 0,
  excedentes: 0,     // remotos validados acima do teto: salvos, sem contar
  pendentes: 0,
  suspeitos: 0,
  fantasmas: 0,
  cadastrados: 0,
});

/** Conta os leads de UM dia aplicando o teto de remotos */
function contarDia(leads, agora) {
  const r = ZERO();
  for (const c of leads) {
    r.cadastrados += 1;
    const status = statusDoLead(c, agora);
    if (status === 'fantasma') r.fantasmas += 1;
    else if (c.origem === 'presencial') r.presenciais += 1;
    else if (status === 'pendente') r.pendentes += 1;
    else if (status === 'suspeito') r.suspeitos += 1;
    else r.remotosValidados += 1;
  }
  r.remotos = Math.min(r.remotosValidados, META_LEADS.maxRemotos);
  r.excedentes = r.remotosValidados - r.remotos;
  r.total = r.presenciais + r.remotos;
  return r;
}

const metaBatida = (r) => r.total >= META_LEADS.total && r.presenciais >= META_LEADS.minPresenciais;

/** Leads de cada vendedor num intervalo, agrupados por dia: Map<userId, Map<dia, lead[]>> */
export function leadsPorVendedorEDia(de, ate) {
  const mapa = new Map();
  for (const c of table('clients')) {
    if (!ehLead(c)) continue;
    const quando = new Date(c.createdAt);
    if (quando < de || quando > ate) continue;
    const dono = donoDoLead(c);
    const dia = dateKey(quando);
    if (!mapa.has(dono)) mapa.set(dono, new Map());
    const dias = mapa.get(dono);
    if (!dias.has(dia)) dias.set(dia, []);
    dias.get(dia).push(c);
  }
  return mapa;
}

/** Contagem de um dia de um vendedor a partir do agrupamento acima */
export function contagemDoDia(porDia, dia, agora = new Date()) {
  const r = contarDia(porDia?.get(dateKey(dia)) ?? [], agora);
  return { ...r, metaBatida: metaBatida(r) };
}

/** Soma de vários dias — o teto de remotos vale dia a dia, não no total */
export function contagemDoPeriodo(porDia, de, ate, agora = new Date()) {
  const soma = ZERO();
  let diasUteis = 0;
  for (let d = startOfDay(de); d <= ate; d = addDays(d, 1)) {
    if (ehDiaDeTrabalho(d)) diasUteis += 1;
    const r = contarDia(porDia?.get(dateKey(d)) ?? [], agora);
    for (const chave of Object.keys(soma)) soma[chave] += r[chave];
  }
  const meta = diasUteis * META_LEADS.total;
  return { ...soma, diasUteis, meta, percentual: meta ? Math.round((soma.total / meta) * 100) : 0 };
}

/**
 * Placar do dia do vendedor: "Hoje: 12/30 (9 presenciais · 3 remotos)", com
 * quanto falta e quanto tempo resta.
 */
export function placarDoDia(userId, agora = new Date()) {
  const porDia = leadsPorVendedorEDia(startOfDay(agora), endOfDay(agora)).get(userId);
  const r = contagemDoDia(porDia, agora, agora);

  const fim = atHour(agora, META_LEADS.fimDoDia);
  const minutosRestantes = Math.max(0, Math.round((fim - agora) / 60000));

  return {
    data: dateKey(agora),
    diaDeTrabalho: ehDiaDeTrabalho(agora),
    meta: META_LEADS.total,
    minPresenciais: META_LEADS.minPresenciais,
    maxRemotos: META_LEADS.maxRemotos,
    ...r,
    faltam: Math.max(0, META_LEADS.total - r.total),
    faltamPresenciais: Math.max(0, META_LEADS.minPresenciais - r.presenciais),
    percentual: Math.min(100, Math.round((r.total / META_LEADS.total) * 100)),
    minutosRestantes,
    fimDoDia: META_LEADS.fimDoDia,
  };
}

/* ----------------------------------------------- follow-ups atrasados --- */

/**
 * Follow-ups de um vendedor que estavam atrasados no fim de um dia: venciam
 * antes daquele dia e ainda não tinham resultado. Para hoje, é o que está
 * pendente de dias anteriores.
 */
export function atrasadosEm(userId, dia = new Date()) {
  const inicio = startOfDay(dia);
  const fim = endOfDay(dia);
  return table('followups').filter((f) => {
    if (f.userId !== userId || new Date(f.dueAt) >= inicio) return false;
    if (f.status === 'pendente') return true;
    return f.status === 'feito' && new Date(f.doneAt) > fim;
  }).length;
}

/**
 * Sequência de dias com a meta completa: 30 leads (20 presenciais) e nenhum
 * follow-up atrasado. O dia de hoje entra quando já fechou; enquanto não
 * fecha, não quebra a sequência. Domingo é pulado.
 */
export function sequenciaMetaCompleta(userId, agora = new Date(), limiteDias = 90) {
  const porDia = leadsPorVendedorEDia(startOfDay(addDays(agora, -limiteDias)), endOfDay(agora)).get(userId);
  const completo = (dia) => contagemDoDia(porDia, dia, agora).metaBatida && atrasadosEm(userId, dia) === 0;

  let sequencia = 0;
  for (let i = 0; i <= limiteDias; i++) {
    const dia = addDays(agora, -i);
    if (!ehDiaDeTrabalho(dia)) continue;
    if (completo(dia)) sequencia += 1;
    else if (i > 0) break;
  }
  return sequencia;
}

/* ---------------------------------------------------------- duplicados -- */

export const soDigitos = (valor = '') => String(valor ?? '').replace(/\D/g, '');

/** Telefone sem 0 de operadora e sem o 55 da frente, para "(88) 99999-0000" e "+55 88 99999-0000" baterem */
export function telefoneChave(valor) {
  let d = soDigitos(valor).replace(/^0+/, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.length >= 10 ? d : '';
}

/** 10 ou 11 dígitos com DDD; com 11, o 9 do celular logo depois do DDD */
export function telefoneValido(valor) {
  const d = telefoneChave(valor);
  if (d.length !== 10 && d.length !== 11) return false;
  if (d[0] === '0') return false;
  return d.length === 10 || d[2] === '9';
}

/**
 * Telefone ou documento que já existe na base. Devolve null quando está livre,
 * ou o motivo do bloqueio. Telefone de alguém da própria equipe também barra:
 * é o jeito mais simples de inventar um lead que "atende".
 */
export function buscarDuplicado({ telefones = [], documento = '', exceto = null }) {
  const chaves = [...new Set(telefones.map(telefoneChave).filter(Boolean))];
  const doc = soDigitos(documento);

  if (chaves.length) {
    const colega = table('users').find((u) => chaves.includes(telefoneChave(u.phone)));
    if (colega) {
      return { tipo: 'equipe', mensagem: 'Este número é de alguém da equipe NewPay, não de um lojista.' };
    }
  }

  const onde = (c) => {
    const dono = table('users').find((u) => u.id === c.ownerId)?.name?.split(' ')[0];
    return `${c.company || c.name}${dono ? `, na carteira de ${dono}` : ''}`;
  };

  for (const c of table('clients')) {
    if (c.id === exceto) continue;
    if (chaves.length && [c.phone, c.whatsapp].some((t) => chaves.includes(telefoneChave(t)))) {
      return { tipo: 'telefone', clientId: c.id, mensagem: `Telefone já cadastrado (${onde(c)}). Lead duplicado não entra.` };
    }
    if (doc.length >= 11 && soDigitos(c.cnpj) === doc) {
      return { tipo: 'documento', clientId: c.id, mensagem: `CNPJ já cadastrado (${onde(c)}). Lead duplicado não entra.` };
    }
  }
  return null;
}
