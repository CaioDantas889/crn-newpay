// Métricas comerciais compartilhadas por dashboard, ranking e painel do gestor.
// O funil da operação é Visitas → Propostas → Vendas → Ativações → TPV.

import { table } from './store.js';
import {
  FUNIL, calcularComissao, nivelPorAtivacoes, proximoNivel,
} from './domain.js';
import { dateKey, endOfDay, startOfDay } from './lib/dates.js';

/** Intervalo de um mês 'YYYY-MM' (ou do mês corrente) */
export function faixaDoMes(mes) {
  const [ano, m] = (mes ?? dateKey().slice(0, 7)).split('-').map(Number);
  return {
    mes: `${ano}-${String(m).padStart(2, '0')}`,
    de: new Date(ano, m - 1, 1, 0, 0, 0, 0),
    ate: new Date(ano, m, 0, 23, 59, 59, 999),
  };
}

const dentro = (data, de, ate) => {
  if (!data) return false;
  const d = new Date(data);
  return d >= de && d <= ate;
};

export const metaDoMes = (userId, mes) =>
  table('goals').find((g) => g.userId === userId && g.mes === mes) ?? {
    metaMaquinas: 0,
    metaTPV: 0,
    metaVisitasDia: 0,
  };

/**
 * Consolidado de um vendedor em um período.
 * Reúne o funil inteiro: visitas, propostas, vendas, ativações, TPV e comissão.
 */
export function resumoVendedor(userId, de, ate, mes) {
  const visitas = table('visits').filter((v) => v.userId === userId && dentro(v.at, de, ate));
  const negocios = table('deals').filter((d) => d.userId === userId);

  const propostas = negocios.filter((d) => dentro(d.propostaAt, de, ate));
  const vendas = negocios.filter((d) => dentro(d.fechamentoAt, de, ate));
  const ativacoes = negocios.filter((d) => d.status === 'ativado' && dentro(d.ativacaoAt, de, ate));

  const maquinasVendidas = vendas.reduce((s, d) => s + d.maquinas, 0);
  const maquinasAtivadas = ativacoes.reduce((s, d) => s + d.maquinas, 0);
  const tpvPrevisto = vendas.reduce((s, d) => s + d.tpvPrevisto, 0);
  const tpvRealizado = ativacoes.reduce((s, d) => s + (d.tpvRealizado || 0), 0);

  const novosLeads = table('clients').filter(
    (c) => c.ownerId === userId && dentro(c.createdAt, de, ate)
  ).length;

  const meta = metaDoMes(userId, mes ?? dateKey(de).slice(0, 7));
  const metaBatida = meta.metaMaquinas > 0 && maquinasAtivadas >= meta.metaMaquinas;
  const comissao = calcularComissao({ maquinasAtivadas, tpv: tpvRealizado, metaBatida });

  const visitasProdutivas = visitas.filter(
    (v) => v.resultado === 'interessado' || v.resultado === 'fechado'
  ).length;

  // Conversão de proposta olha o destino das propostas DO período (e não as
  // vendas do período, que podem vir de propostas antigas ou de venda direta).
  const propostasFechadas = propostas.filter((d) => d.fechamentoAt).length;

  return {
    visitas: visitas.length,
    visitasProdutivas,
    visitasPerdidas: visitas.filter((v) => v.resultado === 'nao_interessado').length,
    novosLeads,
    propostas: propostas.length,
    propostasFechadas,
    vendas: vendas.length,
    maquinasVendidas,
    maquinasAtivadas,
    tpvPrevisto,
    tpvRealizado,
    comissao,
    meta,
    metaBatida,
    percentualMeta: meta.metaMaquinas ? Math.round((maquinasAtivadas / meta.metaMaquinas) * 100) : 0,
    // Conversão da operação: de visita a venda
    conversaoVisitaVenda: visitas.length ? Math.round((vendas.length / visitas.length) * 100) : 0,
    conversaoPropostaVenda: propostas.length ? Math.round((propostasFechadas / propostas.length) * 100) : 0,
    ticketMedioMaquinas: vendas.length ? Number((maquinasVendidas / vendas.length).toFixed(1)) : 0,
    ticketMedioTPV: vendas.length ? Math.round(tpvPrevisto / vendas.length) : 0,
    nivel: nivelPorAtivacoes(maquinasAtivadas),
    proximoNivel: proximoNivel(maquinasAtivadas),
  };
}

/** Distribuição da carteira pelo funil */
export function funilDoVendedor(userId) {
  const meus = table('clients').filter((c) => (userId ? c.ownerId === userId : true));
  return Object.entries(FUNIL).map(([chave, info]) => {
    const doEstagio = meus.filter((c) => c.stage === chave);
    return {
      chave,
      ...info,
      total: doEstagio.length,
      tpvPotencial: doEstagio.reduce((s, c) => s + (c.tpvEstimado || 0), 0),
    };
  });
}

/** Ranking do mês, ordenado por máquinas ativadas e depois por TPV */
export function rankingDoMes(mes) {
  const { de, ate, mes: chaveMes } = faixaDoMes(mes);

  return table('users')
    .filter((u) => u.role === 'vendedor' && u.active !== false)
    .map((u) => ({
      vendedor: { id: u.id, name: u.name, color: u.color, city: u.city },
      ...resumoVendedor(u.id, de, ate, chaveMes),
    }))
    .sort(
      (a, b) =>
        b.maquinasAtivadas - a.maquinasAtivadas ||
        b.tpvRealizado - a.tpvRealizado ||
        b.visitas - a.visitas
    )
    .map((linha, i) => ({ ...linha, posicao: i + 1 }));
}

/** Agenda e pendências do dia — o que o vendedor precisa executar hoje */
export function atividadesDoDia(userId, base = new Date()) {
  const ini = startOfDay(base);
  const fim = endOfDay(base);
  const agora = new Date();

  const eventos = table('events').filter(
    (e) => e.ownerId === userId && e.status !== 'cancelado' && dentro(e.start, ini, fim)
  );

  const clientes = table('clients').filter((c) => c.ownerId === userId);
  const paraRetornar = clientes.filter((c) => {
    const dias = Math.floor((startOfDay(agora) - startOfDay(new Date(c.lastContactAt))) / 86400000);
    return dias > 7 && c.stage !== 'perdido' && c.stage !== 'fechado';
  });

  return {
    visitasAgendadas: eventos.filter((e) => e.type === 'visita' || e.type === 'interessado').length,
    visitasRealizadas: table('visits').filter((v) => v.userId === userId && dentro(v.at, ini, fim)).length,
    followupsPendentes: eventos.filter((e) => e.type === 'followup' && e.status === 'agendado').length,
    followupsVencidos: table('events').filter(
      (e) => e.ownerId === userId && e.type === 'followup' && e.status === 'agendado' && new Date(e.start) < agora
    ).length,
    clientesParaRetornar: paraRetornar.length,
    propostasEnviadas: table('deals').filter((d) => d.userId === userId && dentro(d.propostaAt, ini, fim)).length,
    compromissos: eventos.length,
    compromissosRealizados: eventos.filter((e) => e.status === 'realizado').length,
  };
}

/** KPI do dia: o que o CRM já registrou (base para o fechamento diário) */
export function kpiCalculado(userId, base = new Date()) {
  const ini = startOfDay(base);
  const fim = endOfDay(base);
  const vendas = table('deals').filter((d) => d.userId === userId && dentro(d.fechamentoAt, ini, fim));

  return {
    visitas: table('visits').filter((v) => v.userId === userId && dentro(v.at, ini, fim)).length,
    novosLeads: table('clients').filter((c) => c.ownerId === userId && dentro(c.createdAt, ini, fim)).length,
    propostas: table('deals').filter((d) => d.userId === userId && dentro(d.propostaAt, ini, fim)).length,
    maquinas: vendas.reduce((s, d) => s + d.maquinas, 0),
    tpvPrevisto: vendas.reduce((s, d) => s + d.tpvPrevisto, 0),
  };
}
