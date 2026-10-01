// Auditoria semanal — a prova mais forte contra lead fantasma.
//
// Toda segunda o sistema sorteia, por vendedor, 3 leads remotos e 1 presencial
// da semana anterior e põe na fila do onboarding, que liga para o lojista e
// pergunta se alguém da NewPay falou com ele. "Não reconhece o contato" vira
// fantasma e gera ocorrência no perfil do vendedor.
//
// O vendedor nunca vê o que foi sorteado: nada daqui sai nas rotas dele.

import crypto from 'node:crypto';
import { find, id, insert, table, update } from './store.js';
import { AUDITORIA, CANAIS_REMOTO } from './domain.js';
import { addDays, dateKey, endOfDay, startOfDay } from './lib/dates.js';
import { donoDoLead, ehLead } from './leads.js';
import { cancelarPendentes } from './followups.js';

/** Segunda-feira da semana de uma data */
export function segundaDe(d = new Date()) {
  const dia = startOfDay(d);
  const recuo = (dia.getDay() + 6) % 7; // domingo recua 6, segunda recua 0
  return addDays(dia, -recuo);
}

const sortear = (lista, quantos) => {
  const urna = [...lista];
  const escolhidos = [];
  while (urna.length && escolhidos.length < quantos) {
    escolhidos.push(...urna.splice(crypto.randomInt(urna.length), 1));
  }
  return escolhidos;
};

/**
 * Sorteia a auditoria sobre os leads cadastrados em [de, ate]. Lead já
 * auditado, fantasma ou remoto que nunca validou (não contou na meta) fica
 * fora da urna.
 */
function realizarSorteio({ semana, de, ate, agora, manual = false, feitoPor = null }) {
  const jaAuditados = new Set(table('auditorias').map((a) => a.clientId));
  const vendedores = table('users').filter((u) => u.role === 'vendedor' && u.active !== false);

  const sorteio = insert('sorteiosAuditoria', {
    id: id('srt'),
    semana,
    de: de.toISOString(),
    ate: ate.toISOString(),
    at: agora.toISOString(),
    manual,
    feitoPor,
    total: 0,
  });

  let total = 0;
  for (const v of vendedores) {
    const urna = table('clients').filter(
      (c) =>
        ehLead(c) &&
        donoDoLead(c) === v.id &&
        c.leadStatus !== 'fantasma' &&
        !jaAuditados.has(c.id) &&
        new Date(c.createdAt) >= de &&
        new Date(c.createdAt) <= ate
    );

    const escolhidos = [
      ...sortear(urna.filter((c) => c.origem === 'remoto' && c.validadoAt), AUDITORIA.remotosPorVendedor),
      ...sortear(urna.filter((c) => c.origem === 'presencial'), AUDITORIA.presenciaisPorVendedor),
    ];

    for (const c of escolhidos) {
      insert('auditorias', {
        id: id('aud'),
        sorteioId: sorteio.id,
        semana,
        clientId: c.id,
        vendedorId: v.id,
        origem: c.origem,
        status: 'pendente',
        resultadoAt: null,
        auditorId: null,
        notes: '',
        createdAt: agora.toISOString(),
      });
      total += 1;
    }
  }

  return update('sorteiosAuditoria', sorteio.id, { total });
}

/**
 * Garante o sorteio da semana corrente. Não há job em segundo plano que
 * dependa de o servidor estar no ar à meia-noite de segunda: a primeira
 * consulta da semana (ou o relógio de hora em hora do index.js) faz o sorteio.
 */
export function garantirSorteioDaSemana(agora = new Date()) {
  const segunda = segundaDe(agora);
  const semana = dateKey(segunda);
  const existente = table('sorteiosAuditoria').find((s) => s.semana === semana && !s.manual);
  if (existente) return existente;

  return realizarSorteio({
    semana,
    de: addDays(segunda, -7),
    ate: endOfDay(addDays(segunda, -1)),
    agora,
  });
}

/** Sorteio extra pedido pela gestão: olha os últimos 7 dias até agora */
export function sortearAgora(feitoPor, agora = new Date()) {
  return realizarSorteio({
    semana: dateKey(segundaDe(agora)),
    de: startOfDay(addDays(agora, -7)),
    ate: agora,
    agora,
    manual: true,
    feitoPor,
  });
}

/** O que o onboarding precisa para fazer a ligação */
export function expandirAuditoria(a) {
  const c = find('clients', a.clientId);
  const vendedor = find('users', a.vendedorId);
  const auditor = a.auditorId ? find('users', a.auditorId) : null;
  return {
    ...a,
    lead: c
      ? {
          id: c.id,
          company: c.company,
          name: c.name,
          phone: c.phone,
          whatsapp: c.whatsapp || c.phone,
          city: c.city,
          address: c.address,
          cnpj: c.cnpj,
          origem: c.origem,
          canal: CANAIS_REMOTO[c.canal] ?? null,
          cadastradoAt: c.createdAt,
        }
      : null,
    vendedor: vendedor ? { id: vendedor.id, name: vendedor.name, color: vendedor.color, city: vendedor.city } : null,
    auditor: auditor ? { id: auditor.id, name: auditor.name } : null,
  };
}

/**
 * Registra o resultado da ligação. "Não reconhece" marca o lead como fantasma,
 * para a cadência e abre a ocorrência com tudo que serve de prova: os dados do
 * lead, os prints, a foto e onde/quando foi registrado.
 */
export function registrarResultado(auditoria, { resultado, notes = '', auditorId, agora = new Date() }) {
  const atualizada = update('auditorias', auditoria.id, {
    status: resultado,
    resultadoAt: agora.toISOString(),
    auditorId,
    notes,
  });

  let ocorrencia = null;
  const cliente = find('clients', auditoria.clientId);

  if (resultado === 'nao_reconhece' && cliente) {
    update('clients', cliente.id, {
      leadStatus: 'fantasma',
      fantasmaAt: agora.toISOString(),
      cadenciaEncerrada: 'fantasma',
    });
    cancelarPendentes(cliente.id, 'Lead fantasma confirmado pela auditoria');

    const visitas = table('visits').filter((v) => v.clientId === cliente.id);
    const prints = [
      cliente.print?.url,
      ...table('followups').filter((f) => f.clientId === cliente.id && f.print?.url).map((f) => f.print.url),
    ].filter(Boolean);

    ocorrencia = insert('ocorrencias', {
      id: id('oco'),
      tipo: 'lead_fantasma',
      vendedorId: auditoria.vendedorId,
      clientId: cliente.id,
      auditoriaId: auditoria.id,
      at: agora.toISOString(),
      status: 'ativa',
      auditorId,
      notes,
      // Cópia do que existia no dia: a ocorrência não muda se o lead for
      // editado ou apagado depois.
      lead: {
        company: cliente.company,
        name: cliente.name,
        phone: cliente.phone,
        whatsapp: cliente.whatsapp,
        cnpj: cliente.cnpj,
        city: cliente.city,
        origem: cliente.origem,
        canal: cliente.canal ?? null,
        cadastradoAt: cliente.createdAt,
        validadoAt: cliente.validadoAt ?? null,
        declaracao: cliente.declaracao ?? null,
      },
      prints,
      fotos: visitas.flatMap((v) => (v.fotos ?? []).map((f) => f.url)),
      visitas: visitas.map((v) => ({ at: v.at, lat: v.lat, lng: v.lng, precisao: v.precisao ?? null })),
    });
  }

  return { auditoria: atualizada, ocorrencia };
}

/** A gestão anula a ocorrência (engano na ligação, lojista confirmou depois) */
export function anularOcorrencia(ocorrencia, { motivo, userId, agora = new Date() }) {
  const anulada = update('ocorrencias', ocorrencia.id, {
    status: 'anulada',
    anuladaAt: agora.toISOString(),
    anuladaPor: userId,
    motivoAnulacao: motivo,
  });

  const cliente = find('clients', ocorrencia.clientId);
  if (cliente?.leadStatus === 'fantasma') {
    update('clients', cliente.id, { leadStatus: null, fantasmaAt: null, cadenciaEncerrada: 'fim' });
  }
  return anulada;
}

export function expandirOcorrencia(o) {
  const vendedor = find('users', o.vendedorId);
  const auditor = o.auditorId ? find('users', o.auditorId) : null;
  const anulou = o.anuladaPor ? find('users', o.anuladaPor) : null;
  return {
    ...o,
    vendedor: vendedor ? { id: vendedor.id, name: vendedor.name, color: vendedor.color } : null,
    auditor: auditor ? { id: auditor.id, name: auditor.name } : null,
    anuladaPorNome: anulou?.name ?? null,
    leadExiste: Boolean(find('clients', o.clientId)),
  };
}

/* ------------------------------------------------- termo de conduta ---- */

export const termoVigente = () =>
  [...table('termosConduta')].sort((a, b) => b.versao - a.versao)[0] ?? null;

export const aceiteDe = (userId, termoId) =>
  table('aceitesTermo').find((a) => a.userId === userId && a.termoId === termoId) ?? null;

/** Vendedor com termo publicado e ainda sem aceite: o CRM não abre antes */
export function termoPendente(user) {
  if (user?.role !== 'vendedor') return false;
  const termo = termoVigente();
  return Boolean(termo) && !aceiteDe(user.id, termo.id);
}
