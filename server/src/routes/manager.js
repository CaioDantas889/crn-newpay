// Painel do Gestor: execução da rotina (quem está onde agora) e resultado
// comercial (leads → visitas → propostas → vendas → ativações → TPV).

import { Router } from 'express';
import { table } from '../store.js';
import { requireAuth, requireRole } from '../auth.js';
import { SEGMENTOS, announcementReachesUser, reachesUser } from '../domain.js';
import { faixaDoMes, resumoVendedor } from '../metrics.js';
import { addDays, dateKey, endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth, requireRole('gestor', 'diretoria'));

const vendedores = () => table('users').filter((u) => u.role === 'vendedor' && u.active !== false);
const dentro = (data, de, ate) => data && new Date(data) >= de && new Date(data) <= ate;

/** GET /api/gestor/visao-geral?data=YYYY-MM-DD — agenda geral da equipe */
router.get('/visao-geral', (req, res) => {
  const base = req.query.data ? new Date(`${req.query.data}T12:00:00`) : new Date();
  const ini = startOfDay(base);
  const fim = endOfDay(base);
  const agora = new Date();
  const ehHoje = startOfDay(agora).getTime() === ini.getTime();
  const chave = dateKey(base);

  const equipe = vendedores().map((v) => {
    const eventos = table('events')
      .filter((e) => reachesUser(e, v.id) && dentro(e.start, ini, fim))
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    const ativos = eventos.filter((e) => e.status !== 'cancelado');
    const agoraEvento = ehHoje
      ? ativos.find((e) => new Date(e.start) <= agora && new Date(e.end) >= agora)
      : null;
    const proximo = ehHoje ? ativos.find((e) => new Date(e.start) > agora) : ativos[0];
    const atrasados = ehHoje
      ? ativos.filter((e) => e.status === 'agendado' && new Date(e.end) < agora)
      : [];

    const visitasDoDia = table('visits').filter((x) => x.userId === v.id && dentro(x.at, ini, fim));
    const vendasDoDia = table('deals').filter((d) => d.userId === v.id && dentro(d.fechamentoAt, ini, fim));
    const kpi = table('dailyKpis').find((k) => k.userId === v.id && k.date === chave);

    let situacao = 'livre';
    if (!ativos.length) situacao = 'sem_agenda';
    else if (agoraEvento) {
      situacao = agoraEvento.type === 'reuniao' || agoraEvento.type === 'treinamento' ? 'em_reuniao' : 'em_visita';
    } else if (atrasados.length) situacao = 'atrasado';
    else if (ehHoje && !proximo) situacao = 'dia_concluido';
    else situacao = 'em_rota';

    return {
      vendedor: { id: v.id, name: v.name, color: v.color, city: v.city, dailyGoal: v.dailyGoal },
      situacao,
      agora: agoraEvento
        ? { id: agoraEvento.id, title: agoraEvento.title, type: agoraEvento.type, location: agoraEvento.location, end: agoraEvento.end }
        : null,
      proximo: proximo ? { id: proximo.id, title: proximo.title, type: proximo.type, start: proximo.start } : null,
      kpiFechado: Boolean(kpi?.fechadoAt),
      totais: {
        compromissos: ativos.length,
        realizados: ativos.filter((e) => e.status === 'realizado').length,
        pendentes: ativos.filter((e) => e.status === 'agendado').length,
        atrasados: atrasados.length,
        visitasRegistradas: visitasDoDia.length,
        visitasProdutivas: visitasDoDia.filter((x) => ['interessado', 'fechado'].includes(x.resultado)).length,
        maquinasVendidas: vendasDoDia.reduce((s, d) => s + d.maquinas, 0),
        tarefas: table('tasks').filter((t) => t.ownerId === v.id && dentro(t.dueAt, ini, fim)).length,
        tarefasConcluidas: table('tasks').filter((t) => t.ownerId === v.id && t.done && dentro(t.dueAt, ini, fim)).length,
      },
      agenda: ativos.map((e) => ({
        id: e.id, title: e.title, type: e.type, start: e.start, end: e.end,
        status: e.status, location: e.location,
      })),
    };
  });

  res.json({
    data: chave,
    resumo: {
      totalVendedores: equipe.length,
      emReuniao: equipe.filter((e) => e.situacao === 'em_reuniao').length,
      emVisita: equipe.filter((e) => e.situacao === 'em_visita').length,
      semAgenda: equipe.filter((e) => e.situacao === 'sem_agenda').length,
      atrasados: equipe.filter((e) => e.totais.atrasados > 0).length,
      visitasRegistradas: equipe.reduce((s, e) => s + e.totais.visitasRegistradas, 0),
      maquinasVendidas: equipe.reduce((s, e) => s + e.totais.maquinasVendidas, 0),
      kpisPendentes: equipe.filter((e) => !e.kpiFechado).length,
    },
    equipe,
  });
});

/**
 * GET /api/gestor/indicadores?mes=YYYY-MM
 * O funil da operação inteiro, por vendedor, por cidade e por segmento.
 */
router.get('/indicadores', (req, res) => {
  const { de, ate, mes } = faixaDoMes(req.query.mes);

  const porVendedor = vendedores().map((v) => {
    const r = resumoVendedor(v.id, de, ate, mes);
    const corporativos = table('events').filter(
      (e) => e.scope === 'corporativo' && e.requiresConfirmation && reachesUser(e, v.id) && dentro(e.start, de, ate)
    );
    const confirmados = corporativos.filter((e) =>
      table('confirmations').some((c) => c.eventId === e.id && c.userId === v.id && c.status === 'confirmado')
    );
    const avisosAlvo = table('announcements').filter((a) => announcementReachesUser(a, v.id));

    const diasUteis = [];
    for (let d = new Date(de); d <= ate && d <= new Date(); d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) diasUteis.push(dateKey(d));
    }
    const kpisFechados = table('dailyKpis').filter(
      (k) => k.userId === v.id && k.fechadoAt && diasUteis.includes(k.date)
    ).length;

    return {
      vendedor: { id: v.id, name: v.name, color: v.color, city: v.city },
      ...r,
      comissaoTotal: r.comissao.total,
      convocacoes: corporativos.length,
      presencasConfirmadas: confirmados.length,
      taxaComparecimento: corporativos.length
        ? Math.round((confirmados.length / corporativos.length) * 100)
        : 100,
      avisosLidos: avisosAlvo.filter((a) =>
        table('announcementReads').some((x) => x.announcementId === a.id && x.userId === v.id)
      ).length,
      avisosTotal: avisosAlvo.length,
      diasUteis: diasUteis.length,
      kpisFechados,
      disciplinaKpi: diasUteis.length ? Math.round((kpisFechados / diasUteis.length) * 100) : 0,
    };
  });

  const soma = (campo) => porVendedor.reduce((acc, v) => acc + (v[campo] ?? 0), 0);

  // Leads trabalhados = leads que receberam ao menos uma visita no período
  const leadsGerados = table('clients').filter((c) => dentro(c.createdAt, de, ate));
  const visitasPeriodo = table('visits').filter((v) => dentro(v.at, de, ate));
  const leadsTrabalhados = new Set(visitasPeriodo.map((v) => v.clientId));

  const vendasPeriodo = table('deals').filter((d) => dentro(d.fechamentoAt, de, ate));
  const porChave = (fn) => {
    const mapa = new Map();
    for (const d of vendasPeriodo) {
      const cliente = table('clients').find((c) => c.id === d.clientId);
      if (!cliente) continue;
      const chave = fn(cliente);
      const atual = mapa.get(chave) ?? { chave, vendas: 0, maquinas: 0, tpv: 0 };
      atual.vendas += 1;
      atual.maquinas += d.maquinas;
      atual.tpv += d.tpvPrevisto;
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => b.maquinas - a.maquinas);
  };

  const totalVendas = soma('vendas');
  const comissaoTotal = soma('comissaoTotal');

  res.json({
    mes,
    periodo: { de: dateKey(de), ate: dateKey(ate) },
    totais: {
      leadsGerados: leadsGerados.length,
      leadsTrabalhados: leadsTrabalhados.size,
      visitas: soma('visitas'),
      visitasProdutivas: soma('visitasProdutivas'),
      visitasPerdidas: soma('visitasPerdidas'),
      propostas: soma('propostas'),
      vendas: totalVendas,
      maquinasVendidas: soma('maquinasVendidas'),
      maquinasAtivadas: soma('maquinasAtivadas'),
      tpvPrevisto: soma('tpvPrevisto'),
      tpvRealizado: soma('tpvRealizado'),
      comissaoTotal,
      taxaConversao: soma('visitas') ? Math.round((totalVendas / soma('visitas')) * 100) : 0,
      conversaoPropostaVenda: soma('propostas') ? Math.round((soma('propostasFechadas') / soma('propostas')) * 100) : 0,
      // Custo comercial por venda = comissão paga dividida pelas vendas do período
      custoPorVenda: totalVendas ? Math.round(comissaoTotal / totalVendas) : 0,
      ticketMedioMaquinas: totalVendas ? Number((soma('maquinasVendidas') / totalVendas).toFixed(1)) : 0,
      ticketMedioTPV: totalVendas ? Math.round(soma('tpvPrevisto') / totalVendas) : 0,
      taxaComparecimento: porVendedor.length
        ? Math.round(porVendedor.reduce((s, v) => s + v.taxaComparecimento, 0) / porVendedor.length)
        : 100,
    },
    porVendedor: porVendedor.sort((a, b) => b.maquinasAtivadas - a.maquinasAtivadas),
    porCidade: porChave((c) => c.city),
    porSegmento: porChave((c) => SEGMENTOS[c.segment] ?? c.segment),
  });
});

/** GET /api/gestor/kpis?dias=7 — disciplina de registro diário da equipe */
router.get('/kpis', (req, res) => {
  const dias = Math.min(Number(req.query.dias) || 7, 30);
  const hoje = new Date();
  const datas = Array.from({ length: dias }, (_, i) => dateKey(addDays(hoje, -(dias - 1 - i))));

  res.json({
    datas,
    equipe: vendedores().map((v) => ({
      vendedor: { id: v.id, name: v.name, color: v.color },
      dias: datas.map((data) => {
        const k = table('dailyKpis').find((x) => x.userId === v.id && x.date === data);
        return {
          data,
          fechado: Boolean(k?.fechadoAt),
          visitas: k?.visitas ?? 0,
          novosLeads: k?.novosLeads ?? 0,
          propostas: k?.propostas ?? 0,
          maquinas: k?.maquinas ?? 0,
          tpvPrevisto: k?.tpvPrevisto ?? 0,
        };
      }),
    })),
  });
});

export default router;
