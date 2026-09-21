// Expediente do vendedor externo: a que horas começou e terminou o dia, e de
// onde bateu a entrada.
//
// O registro é do momento da batida — o CRM não fica rastreando ninguém ao
// longo do dia. Quando o aparelho não informa a posição, a jornada abre do
// mesmo jeito e fica marcada como "sem localização", porque travar o começo do
// expediente por causa de GPS seria pior do que registrar sem ele.

import { Router } from 'express';
import { find, id, insert, logActivity, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import { dateKey, endOfDay, startOfDay } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

const MAXIMO_HORAS = 18; // jornada aberta além disso é esquecimento, não trabalho

const minutosEntre = (inicio, fim) =>
  Math.max(0, Math.round((new Date(fim) - new Date(inicio)) / 60000));

/** Posição do aparelho no momento da batida, quando o navegador informou */
function lerLocal(corpo = {}) {
  const lat = Number(corpo.lat);
  const lng = Number(corpo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return {
    lat,
    lng,
    precisao: Number.isFinite(Number(corpo.precisao)) ? Math.round(Number(corpo.precisao)) : null,
  };
}

const expandir = (j) => ({
  ...j,
  emAndamento: !j.fimAt,
  duracaoMin: j.fimAt ? j.duracaoMin : minutosEntre(j.inicioAt, new Date()),
});

const jornadaAberta = (userId) =>
  table('jornadas').find((j) => j.userId === userId && !j.fimAt) ?? null;

/** GET /api/jornada?userId=&dias=14 — expediente de hoje e o histórico recente */
router.get('/', (req, res) => {
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const dias = Math.min(Number(req.query.dias) || 14, 90);

  const limite = new Date();
  limite.setDate(limite.getDate() - dias);

  const minhas = table('jornadas')
    .filter((j) => j.userId === alvo && new Date(j.inicioAt) >= startOfDay(limite))
    .sort((a, b) => new Date(b.inicioAt) - new Date(a.inicioAt))
    .map(expandir);

  const hoje = dateKey();
  const doDia = minhas.filter((j) => j.data === hoje);

  res.json({
    hoje: doDia[0] ?? null,
    aberta: minhas.find((j) => j.emAndamento) ?? null,
    minutosHoje: doDia.reduce((s, j) => s + j.duracaoMin, 0),
    historico: minhas,
    totalMinutos: minhas.reduce((s, j) => s + j.duracaoMin, 0),
  });
});

/** POST /api/jornada/entrada — começa o expediente e guarda de onde */
router.post('/entrada', (req, res) => {
  const aberta = jornadaAberta(req.user.id);
  if (aberta) {
    return res.status(409).json({
      error: 'Seu expediente já está aberto. Encerre o atual antes de começar outro.',
      jornada: expandir(aberta),
    });
  }

  const agora = new Date();
  const local = lerLocal(req.body);

  const jornada = insert('jornadas', {
    id: id('jor'),
    userId: req.user.id,
    data: dateKey(agora),
    inicioAt: agora.toISOString(),
    inicioLocal: local,
    fimAt: null,
    fimLocal: null,
    duracaoMin: 0,
    observacao: String(req.body?.observacao ?? '').trim(),
    createdAt: agora.toISOString(),
  });

  logActivity({ userId: req.user.id, action: 'expediente_iniciado', comLocal: Boolean(local) });
  res.status(201).json(expandir(jornada));
});

/** POST /api/jornada/saida — encerra o expediente aberto */
router.post('/saida', (req, res) => {
  const aberta = jornadaAberta(req.user.id);
  if (!aberta) {
    return res.status(409).json({ error: 'Não há expediente aberto para encerrar.' });
  }

  const agora = new Date();
  const duracaoMin = minutosEntre(aberta.inicioAt, agora);

  const jornada = update('jornadas', aberta.id, {
    fimAt: agora.toISOString(),
    fimLocal: lerLocal(req.body),
    duracaoMin,
    // Jornada esquecida aberta a noite inteira fica marcada, para o gestor
    // saber que aquele número não é hora trabalhada de verdade.
    revisar: duracaoMin > MAXIMO_HORAS * 60,
  });

  logActivity({ userId: req.user.id, action: 'expediente_encerrado', minutos: duracaoMin });
  res.json(expandir(jornada));
});

/** GET /api/jornada/equipe?data=YYYY-MM-DD — quem já começou o dia (gestor) */
router.get('/equipe', (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Acesso restrito a gestores.' });

  const base = req.query.data ? new Date(`${req.query.data}T12:00:00`) : new Date();
  const ini = startOfDay(base);
  const fim = endOfDay(base);

  const linhas = table('users')
    .filter((u) => u.role === 'vendedor' && u.active !== false)
    .map((u) => {
      const doDia = table('jornadas').filter(
        (j) => j.userId === u.id && new Date(j.inicioAt) >= ini && new Date(j.inicioAt) <= fim
      );
      const aberta = doDia.find((j) => !j.fimAt);

      return {
        vendedor: { id: u.id, name: u.name, color: u.color, city: u.city },
        comecou: doDia.length > 0,
        emAndamento: Boolean(aberta),
        inicioAt: doDia[0]?.inicioAt ?? null,
        fimAt: doDia.find((j) => j.fimAt)?.fimAt ?? null,
        inicioLocal: doDia[0]?.inicioLocal ?? null,
        minutos: doDia.reduce((s, j) => s + (j.fimAt ? j.duracaoMin : minutosEntre(j.inicioAt, new Date())), 0),
      };
    })
    .sort((a, b) => Number(b.comecou) - Number(a.comecou) || a.vendedor.name.localeCompare(b.vendedor.name));

  res.json({
    data: dateKey(base),
    emCampo: linhas.filter((l) => l.emAndamento).length,
    naoComecaram: linhas.filter((l) => !l.comecou).length,
    linhas,
  });
});

/** PATCH /api/jornada/:id — correção pelo gestor, com justificativa */
router.patch('/:id', (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Só a gestão corrige expediente.' });

  const jornada = find('jornadas', req.params.id);
  if (!jornada) return res.status(404).json({ error: 'Expediente não encontrado.' });

  const justificativa = String(req.body?.justificativa ?? '').trim();
  if (justificativa.length < 5) {
    return res.status(400).json({ error: 'Explique o motivo da correção (mínimo de 5 letras).' });
  }

  const patch = { justificativa, corrigidoPor: req.user.id, corrigidoAt: new Date().toISOString() };
  for (const campo of ['inicioAt', 'fimAt']) {
    if (req.body[campo]) {
      const data = new Date(req.body[campo]);
      if (Number.isNaN(data.getTime())) return res.status(400).json({ error: `Horário inválido em ${campo}.` });
      patch[campo] = data.toISOString();
    }
  }

  const inicio = patch.inicioAt ?? jornada.inicioAt;
  const fim = patch.fimAt ?? jornada.fimAt;
  if (fim) {
    if (new Date(fim) < new Date(inicio)) {
      return res.status(400).json({ error: 'O fim não pode ser antes do início.' });
    }
    patch.duracaoMin = minutosEntre(inicio, fim);
    patch.revisar = patch.duracaoMin > MAXIMO_HORAS * 60;
  }

  logActivity({ userId: req.user.id, action: 'expediente_corrigido', targetId: jornada.id });
  res.json(expandir(update('jornadas', jornada.id, patch)));
});

export default router;
