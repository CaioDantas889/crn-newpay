// Tela inicial do vendedor: meta, comissão, atividades do dia e funil.
// Responde a: quanto falta para a meta, quem visitar, quem retornar e quanto já ganhei.

import { Router } from 'express';
import { table } from '../store.js';
import { requireAuth } from '../auth.js';
import { atividadesDoDia, faixaDoMes, funilDoVendedor, kpiCalculado, rankingDoMes, resumoVendedor } from '../metrics.js';
import { expandEvent } from '../serializers.js';
import { dateKey, endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { de, ate, mes } = faixaDoMes(req.query.mes);
  const userId = req.user.id;

  const resumo = resumoVendedor(userId, de, ate, mes);
  const ranking = rankingDoMes(mes);
  const minhaPosicao = ranking.find((r) => r.vendedor.id === userId);

  const hojeChave = dateKey();
  const kpiDeHoje = table('dailyKpis').find((k) => k.userId === userId && k.date === hojeChave);

  const agora = new Date();
  const proximos = table('events')
    .filter(
      (e) =>
        e.ownerId === userId &&
        e.status === 'agendado' &&
        new Date(e.start) >= agora &&
        new Date(e.start) <= endOfDay(agora)
    )
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 4)
    .map((e) => expandEvent(e, userId));

  const clientesQuentes = table('clients')
    .filter((c) => c.ownerId === userId && c.temperature === 'quente' && !['fechado', 'perdido'].includes(c.stage))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => ({
      id: c.id, name: c.name, company: c.company, city: c.city,
      score: c.score, stage: c.stage, tpvEstimado: c.tpvEstimado,
      lastContactAt: c.lastContactAt,
    }));

  res.json({
    mes,
    usuario: { id: req.user.id, name: req.user.name, color: req.user.color, city: req.user.city },
    resumo,
    ranking: {
      posicao: minhaPosicao?.posicao ?? null,
      total: ranking.length,
      lider: ranking[0]
        ? { name: ranking[0].vendedor.name, maquinas: ranking[0].maquinasAtivadas }
        : null,
    },
    atividades: atividadesDoDia(userId),
    funil: funilDoVendedor(userId),
    kpiHoje: {
      calculado: kpiCalculado(userId),
      fechado: Boolean(kpiDeHoje?.fechadoAt),
      registrado: kpiDeHoje ?? null,
    },
    proximosCompromissos: proximos,
    clientesQuentes,
  });
});

/** Série diária do mês para o gráfico de evolução */
router.get('/evolucao', (req, res) => {
  const { de, ate } = faixaDoMes(req.query.mes);
  const userId = req.user.id;
  const dias = [];

  for (let d = new Date(de); d <= ate && d <= new Date(); d.setDate(d.getDate() + 1)) {
    const ini = startOfDay(d);
    const fim = endOfDay(d);
    const vendas = table('deals').filter(
      (x) => x.userId === userId && x.fechamentoAt && new Date(x.fechamentoAt) >= ini && new Date(x.fechamentoAt) <= fim
    );
    dias.push({
      data: dateKey(d),
      visitas: table('visits').filter(
        (v) => v.userId === userId && new Date(v.at) >= ini && new Date(v.at) <= fim
      ).length,
      maquinas: vendas.reduce((s, x) => s + x.maquinas, 0),
      tpv: vendas.reduce((s, x) => s + x.tpvPrevisto, 0),
    });
  }

  res.json({ dias });
});

export default router;
