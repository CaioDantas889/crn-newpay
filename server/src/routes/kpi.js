// KPI diário obrigatório. O CRM pré-preenche com o que foi registrado durante
// o dia; o vendedor confere e fecha. É isso que revela quem trabalha muito e
// vende pouco — e o contrário.

import { Router } from 'express';
import { id, insert, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { KPIS_DIARIOS } from '../domain.js';
import { kpiCalculado } from '../metrics.js';
import { addDays, dateKey } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

const CAMPOS = KPIS_DIARIOS.map((k) => k.chave);

/** GET /api/kpi?data=YYYY-MM-DD — o que o CRM registrou x o que foi fechado */
router.get('/', (req, res) => {
  const data = req.query.data ?? dateKey();
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const base = new Date(`${data}T12:00:00`);

  const registrado = table('dailyKpis').find((k) => k.userId === alvo && k.date === data) ?? null;

  res.json({
    data,
    campos: KPIS_DIARIOS,
    calculado: kpiCalculado(alvo, base),
    registrado,
    fechado: Boolean(registrado?.fechadoAt),
  });
});

/** GET /api/kpi/historico?dias=14 */
router.get('/historico', (req, res) => {
  const dias = Math.min(Number(req.query.dias) || 14, 60);
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const hoje = new Date();
  const lista = [];

  for (let i = dias - 1; i >= 0; i--) {
    const data = dateKey(addDays(hoje, -i));
    const registrado = table('dailyKpis').find((k) => k.userId === alvo && k.date === data);
    lista.push({
      data,
      fechado: Boolean(registrado?.fechadoAt),
      ...CAMPOS.reduce((acc, campo) => ({ ...acc, [campo]: registrado?.[campo] ?? 0 }), {}),
    });
  }

  const totais = CAMPOS.reduce(
    (acc, campo) => ({ ...acc, [campo]: lista.reduce((s, d) => s + d[campo], 0) }),
    {}
  );

  res.json({
    dias: lista,
    totais,
    diasSemFechamento: lista.filter((d) => !d.fechado).length,
  });
});

/** POST /api/kpi — fecha o dia (cria ou atualiza o registro) */
router.post('/', (req, res) => {
  const data = req.body?.data ?? dateKey();
  const base = new Date(`${data}T12:00:00`);
  const automatico = kpiCalculado(req.user.id, base);

  const valores = CAMPOS.reduce((acc, campo) => {
    const informado = req.body?.[campo];
    acc[campo] = informado === undefined || informado === null || informado === ''
      ? automatico[campo]
      : Math.max(0, Number(informado) || 0);
    return acc;
  }, {});

  const existente = table('dailyKpis').find((k) => k.userId === req.user.id && k.date === data);
  const registro = existente
    ? update('dailyKpis', existente.id, { ...valores, fechadoAt: new Date().toISOString() })
    : insert('dailyKpis', {
        id: id('kpi'),
        userId: req.user.id,
        date: data,
        ...valores,
        fechadoAt: new Date().toISOString(),
      });

  res.status(existente ? 200 : 201).json({ registro, calculado: automatico });
});

export default router;
