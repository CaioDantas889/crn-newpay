// Perfil de um vendedor para a gestão: tudo que ele fez e em que pé está, em
// uma ida só ao servidor. O mês (funil e meta), o dia de hoje (placar,
// semáforo, ponto, follow-ups), a carteira, a disciplina (expediente,
// fechamento do dia, termo, ocorrências) e o histórico cronológico de tudo
// que ficou registrado em nome dele.

import { table } from './store.js';
import { MODELOS_MAQUINA, ativacaoConta, ehDiaDeTrabalho, resultadoVisita } from './domain.js';
import { faixaDoMes, funilDoVendedor, rankingDoMes, resumoVendedor } from './metrics.js';
import { contagemDoPeriodo, donoDoLead, ehLead, leadsPorVendedorEDia, placarDoDia, statusDoLead } from './leads.js';
import { painelSemaforo } from './semaforo.js';
import { followupsDoVendedor, passoDaEtapa } from './followups.js';
import { pendenciasDeAtivacao } from './vendas.js';
import { alertasDeSuspeita } from './suspeitas.js';
import { aceiteDe, expandirOcorrencia, segundaDe, termoVigente } from './auditoria.js';
import { clientCard } from './serializers.js';
import { addDays, dateKey, daysBetween, endOfDay, startOfDay } from './lib/dates.js';

export const DIAS_HISTORICO_PADRAO = 30;
export const DIAS_HISTORICO_MAXIMO = 90;
// Teto de itens devolvidos; quando corta, a resposta diz (truncado + total)
const LIMITE_HISTORICO = 1500;

const dentro = (data, de, ate) => Boolean(data) && new Date(data) >= de && new Date(data) <= ate;
const horas = (min = 0) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);

/* ------------------------------------------------------------ histórico */

// Cada tipo tem uma cor para a bolinha da linha do tempo na interface
export const TIPOS_HISTORICO = {
  lead:       { label: 'Lead novo',        cor: '#0f9d63' },
  visita:     { label: 'Visita',           cor: '#2563eb' },
  followup:   { label: 'Follow-up',        cor: '#eab308' },
  proposta:   { label: 'Proposta',         cor: '#8b5cf6' },
  venda:      { label: 'Venda',            cor: '#16a34a' },
  ativacao:   { label: 'Ativação',         cor: '#0d9488' },
  expediente: { label: 'Expediente',       cor: '#64748b' },
  fechamento: { label: 'Fechamento do dia', cor: '#334155' },
  conduta:    { label: 'Conduta',          cor: '#dc2626' },
};

/**
 * Tudo que o vendedor fez numa janela, do mais recente ao mais antigo. Vem das
 * tabelas de origem (não do log de atividade, que é curto e rotativo).
 */
export function historicoDoVendedor(userId, { de, ate } = {}) {
  const itens = [];
  const push = (at, tipo, titulo, extra = {}) => {
    if (!dentro(at, de, ate)) return;
    itens.push({ at: new Date(at).toISOString(), tipo, titulo, detalhe: '', cliente: null, ...extra });
  };
  const cliente = (clientId) => (clientId ? clientCard(clientId) : null);
  const curto = (texto = '', max = 90) => {
    const t = String(texto ?? '').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  // Follow-up concluído por uma visita já aparece como a própria visita:
  // a linha do follow-up some e a visita diz qual passo ela fechou.
  const passoDaVisita = new Map();
  for (const f of table('followups')) {
    if (f.userId === userId && f.status === 'feito' && f.visitId) passoDaVisita.set(f.visitId, passoDaEtapa(f.etapa).label);
  }
  const visitasDele = new Set();

  for (const v of table('visits')) {
    if (v.userId !== userId) continue;
    visitasDele.add(v.id);
    const r = resultadoVisita(v.resultado);
    const passo = passoDaVisita.get(v.id);
    const nota = curto(v.notes);
    push(v.at, v.tipo === 'lead' ? 'lead' : 'visita',
      v.tipo === 'lead' ? `Lead cadastrado na visita · ${r?.label ?? v.resultado}` : `Visita · ${r?.label ?? v.resultado}`,
      {
        detalhe: [passo ? `concluiu o follow-up ${passo}` : '', nota].filter(Boolean).join(' · '),
        cliente: cliente(v.clientId), semGps: v.semGps === true, cor: r?.cor ?? null,
      });
  }

  for (const c of table('clients')) {
    if (c.origem !== 'remoto' || donoDoLead(c) !== userId) continue;
    push(c.createdAt, 'lead', 'Lead remoto cadastrado', {
      detalhe: `${c.canal === 'indicacao' ? 'Indicação' : 'WhatsApp'} · ${statusDoLead(c)}`,
      cliente: cliente(c.id),
    });
  }

  for (const d of table('deals')) {
    if (d.userId !== userId) continue;
    const modelo = MODELOS_MAQUINA[d.modelo] ?? null;
    const maquinas = `${d.maquinas || 1} máquina(s)${modelo ? ` ${modelo}` : ''}${d.taxaOfertada ? ` · tabela ${d.taxaOfertada}` : ''}`;
    if (d.propostaAt && d.propostaAt !== d.fechamentoAt) {
      push(d.propostaAt, 'proposta', 'Proposta enviada', { detalhe: maquinas, cliente: cliente(d.clientId) });
    }
    if (d.fechamentoAt) push(d.fechamentoAt, 'venda', 'Venda fechada', { detalhe: maquinas, cliente: cliente(d.clientId) });
    if (d.status === 'ativado' && d.ativacaoAt) {
      push(d.ativacaoAt, 'ativacao', ativacaoConta(d) ? 'Máquina ativada' : 'Ativação declarada (aguardando a gestão)', {
        detalhe: maquinas, cliente: cliente(d.clientId),
      });
    }
  }

  for (const f of table('followups')) {
    if (f.userId !== userId || f.status !== 'feito' || !f.doneAt) continue;
    if (f.visitId && visitasDele.has(f.visitId)) continue; // já está na visita
    const r = resultadoVisita(f.resultado);
    push(f.doneAt, 'followup', `Follow-up ${passoDaEtapa(f.etapa).label} · ${r?.label ?? f.resultado ?? ''}`, {
      detalhe: curto(f.notes), cliente: cliente(f.clientId),
    });
  }

  for (const j of table('jornadas')) {
    if (j.userId !== userId) continue;
    push(j.inicioAt, 'expediente', 'Iniciou o expediente', {
      detalhe: j.inicioEndereco ?? (j.inicioLocal ? 'com localização' : 'sem localização do aparelho'),
    });
    if (j.fimAt) {
      push(j.fimAt, 'expediente', 'Encerrou o expediente', {
        detalhe: `${horas(j.duracaoMin)} em campo${j.lancadoPor ? ' · lançado pela gestão' : ''}${j.revisar ? ' · a revisar' : ''}`,
      });
    }
  }

  for (const k of table('dailyKpis')) {
    if (k.userId !== userId || !k.fechadoAt) continue;
    push(k.fechadoAt, 'fechamento', `Fechou o dia ${k.date.slice(8)}/${k.date.slice(5, 7)}`, {
      detalhe: `${k.visitas ?? 0} visitas · ${k.novosLeads ?? 0} leads · ${k.propostas ?? 0} propostas · ${k.maquinas ?? 0} máquinas`,
    });
  }

  // A ocorrência fica no dia em que foi aberta; a anulação, no dia em que a
  // gestão anulou — são dois fatos diferentes.
  for (const o of table('ocorrencias')) {
    if (o.vendedorId !== userId) continue;
    const doLead = cliente(o.clientId) ?? (o.lead ? { company: o.lead.company, city: o.lead.city } : null);
    push(o.at, 'conduta', 'Ocorrência: lead fantasma', {
      detalhe: [o.status === 'anulada' ? 'anulada depois' : '', curto(o.notes ?? '')].filter(Boolean).join(' · '),
      cliente: doLead,
    });
    if (o.status === 'anulada' && o.anuladaAt) {
      push(o.anuladaAt, 'conduta', 'Ocorrência anulada pela gestão', {
        detalhe: curto(o.motivoAnulacao ?? ''), cliente: doLead, cor: '#64748b',
      });
    }
  }

  for (const a of table('aceitesTermo')) {
    if (a.userId !== userId) continue;
    push(a.at ?? a.createdAt, 'conduta', 'Aceitou o termo de conduta', { cor: '#0f9d63' });
  }

  return itens.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/* --------------------------------------------------------------- perfil */

export function perfilDoVendedor(vendedor, { mes, dias = DIAS_HISTORICO_PADRAO, agora = new Date() } = {}) {
  const id = vendedor.id;
  const janelaDias = Math.min(DIAS_HISTORICO_MAXIMO, Math.max(7, Number(dias) || DIAS_HISTORICO_PADRAO));
  const hojeIni = startOfDay(agora);
  const hojeFim = endOfDay(agora);
  const janela = startOfDay(addDays(agora, -(janelaDias - 1)));
  const hojeChave = dateKey(agora);

  /* ------------------------------------------------------------- mês */
  const { de, ate, mes: chaveMes } = faixaDoMes(mes);
  const ateContado = ate > hojeFim ? hojeFim : ate; // mês corrente conta até hoje
  const resumo = resumoVendedor(id, de, ate, chaveMes);
  const ranking = rankingDoMes(chaveMes);
  const posicao = ranking.find((l) => l.vendedor.id === id);
  const leadsDoMes = leadsPorVendedorEDia(de, ateContado).get(id);
  const leadsMes = contagemDoPeriodo(leadsDoMes, de, ateContado, agora);
  const segunda = segundaDe(agora);
  const leadsSemana = contagemDoPeriodo(leadsPorVendedorEDia(segunda, hojeFim).get(id), segunda, hojeFim, agora);

  /* ------------------------------------------------------------ hoje */
  const painel = painelSemaforo(agora, agora);
  const semaforo = painel.linhas.find((l) => l.vendedor.id === id) ?? null;
  const placar = placarDoDia(id, agora);
  const fups = followupsDoVendedor(id, agora);
  const jornadasHoje = table('jornadas').filter((j) => j.userId === id && j.data === hojeChave);
  const kpiHoje = table('dailyKpis').find((k) => k.userId === id && k.date === hojeChave) ?? null;
  const visitasHoje = table('visits').filter((v) => v.userId === id && dentro(v.at, hojeIni, hojeFim));

  /* -------------------------------------------------------- carteira */
  const clientes = table('clients').filter((c) => c.ownerId === id);
  const emAberto = (c) => !['fechado', 'perdido'].includes(c.stage);
  const carteira = {
    total: clientes.length,
    porEtapa: funilDoVendedor(id),
    quentes: clientes.filter((c) => c.temperature === 'quente' && emAberto(c)).length,
    semContato: clientes.filter((c) => emAberto(c) && c.lastContactAt && daysBetween(new Date(c.lastContactAt), agora) > 7).length,
    maquinasNaRua: clientes.reduce((s, c) => s + (c.machines || 0), 0),
    leadsComProva: clientes.filter((c) => ehLead(c)).length,
    leadsForaDaMeta: clientes.filter((c) => ehLead(c) && ['pendente', 'suspeito', 'fantasma'].includes(statusDoLead(c, agora))).length,
  };
  const ativacoes = pendenciasDeAtivacao(id, agora);

  /* ------------------------------------------------------ expediente */
  const jornadas = table('jornadas')
    .filter((j) => j.userId === id && new Date(j.inicioAt) >= janela)
    .sort((a, b) => new Date(b.inicioAt) - new Date(a.inicioAt));
  const encerradas = jornadas.filter((j) => j.fimAt);
  const diasEmCampo = new Set(encerradas.map((j) => j.data)).size;
  const totalMinutos = encerradas.reduce((s, j) => s + (j.duracaoMin || 0), 0);
  const expediente = {
    janelaDias,
    diasEmCampo,
    totalMinutos,
    mediaMinutos: diasEmCampo ? Math.round(totalMinutos / diasEmCampo) : 0,
    // Lançamento manual da gestão não tem GPS por natureza: não conta aqui
    semLocalizacao: encerradas.filter((j) => !j.inicioLocal && !j.lancadoPor).length,
    lancadosPelaGestao: jornadas.filter((j) => j.lancadoPor).length,
    aberto: jornadas.find((j) => !j.fimAt) ?? null,
    ultimo: jornadas[0] ?? null,
    hoje: jornadasHoje.sort((a, b) => new Date(a.inicioAt) - new Date(b.inicioAt)),
  };

  /* --------------------------------------------- fechamento do dia ---- */
  const diasUteis = [];
  for (let d = new Date(janela); d <= agora; d = addDays(d, 1)) if (ehDiaDeTrabalho(d)) diasUteis.push(dateKey(d));
  const fechados = table('dailyKpis').filter((k) => k.userId === id && k.fechadoAt && diasUteis.includes(k.date)).length;
  const fechamento = {
    diasUteis: diasUteis.length,
    fechados,
    percentual: diasUteis.length ? Math.round((fechados / diasUteis.length) * 100) : 0,
    hojeFechado: Boolean(kpiHoje?.fechadoAt),
  };

  /* ---------------------------------------------------------- conduta */
  const termo = termoVigente();
  const aceite = termo ? aceiteDe(id, termo.id) : null;
  const ocorrencias = table('ocorrencias')
    .filter((o) => o.vendedorId === id)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map(expandirOcorrencia);
  const auditorias = table('auditorias').filter((a) => a.vendedorId === id);
  const conduta = {
    termo: termo ? { versao: termo.versao, aceitoEm: aceite?.at ?? aceite?.createdAt ?? null } : null,
    ocorrenciasAtivas: ocorrencias.filter((o) => o.status === 'ativa').length,
    ocorrencias: ocorrencias.slice(0, 10),
    auditorias: {
      total: auditorias.length,
      confirmadas: auditorias.filter((a) => a.status === 'confirmado').length,
      naoReconhece: auditorias.filter((a) => a.status === 'nao_reconhece').length,
      pendentes: auditorias.filter((a) => !a.resultadoAt).length,
    },
    alertasSemana: alertasDeSuspeita({ de: startOfDay(addDays(agora, -6)), ate: hojeFim, userId: id }),
  };

  return {
    vendedor: {
      id: vendedor.id,
      name: vendedor.name,
      email: vendedor.email,
      phone: vendedor.phone ?? null,
      city: vendedor.city ?? null,
      jobTitle: vendedor.jobTitle ?? null,
      role: vendedor.role,
      color: vendedor.color,
      active: vendedor.active !== false,
      dailyGoal: vendedor.dailyGoal ?? null,
      raioRegiaoKm: vendedor.raioRegiaoKm ?? null,
      base: vendedor.base ?? null,
      createdAt: vendedor.createdAt ?? null,
      mustChangePassword: Boolean(vendedor.mustChangePassword),
    },
    mes: {
      chave: chaveMes,
      ...resumo,
      leads: leadsMes,
      posicao: posicao?.posicao ?? null,
      totalRanking: ranking.length,
    },
    semana: { leads: leadsSemana, segunda: dateKey(segunda) },
    hoje: {
      data: hojeChave,
      diaDeTrabalho: ehDiaDeTrabalho(agora),
      placar,
      semaforo: semaforo
        ? { cor: semaforo.semaforo.cor, motivos: semaforo.semaforo.motivos, sequencia: semaforo.sequencia, alertasNoDia: semaforo.alertasNoDia }
        : null,
      visitas: visitasHoje.length,
      followups: { atrasados: fups.atrasados.length, hoje: fups.hoje.length, proximos: fups.proximos, feitosHoje: fups.feitosHoje },
      expediente: expediente.hoje,
      kpiFechado: fechamento.hojeFechado,
    },
    carteira,
    ativacoes: {
      totais: ativacoes.totais,
      prazoDias: ativacoes.prazoDias,
      semAtivar: ativacoes.semAtivar.slice(0, 8),
      declaradas: ativacoes.declaradas.slice(0, 8),
    },
    expediente,
    fechamento,
    conduta,
    historico: historicoResumido(historicoDoVendedor(id, { de: janela, ate: hojeFim }), {
      de: dateKey(janela),
      ate: hojeChave,
      dias: janelaDias,
    }),
  };
}

/** Corta no teto e diz que cortou, para a tela não prometer a janela inteira */
function historicoResumido(lista, base) {
  const itens = lista.slice(0, LIMITE_HISTORICO);
  return {
    ...base,
    tipos: TIPOS_HISTORICO,
    total: lista.length,
    truncado: lista.length > itens.length,
    maisAntigo: itens.length ? itens[itens.length - 1].at : null,
    itens,
  };
}
