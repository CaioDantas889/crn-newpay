import fs from 'node:fs';
import express from 'express';
import cors from 'cors';

import { DB_PATH, load } from './store.js';
import { UPLOAD_DIR } from './lib/uploads.js';
import * as dominio from './domain.js';

import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import eventRoutes from './routes/events.js';
import taskRoutes from './routes/tasks.js';
import clientRoutes from './routes/clients.js';
import visitRoutes from './routes/visits.js';
import dealRoutes from './routes/deals.js';
import kpiRoutes from './routes/kpi.js';
import rankingRoutes from './routes/ranking.js';
import contentRoutes from './routes/content.js';
import announcementRoutes from './routes/announcements.js';
import notificationRoutes from './routes/notifications.js';
import agendaRoutes from './routes/agenda.js';
import managerRoutes from './routes/manager.js';

// Primeira execução: cria o banco com a base de demonstração.
if (!fs.existsSync(DB_PATH)) {
  console.log('[api] banco não encontrado, gerando dados iniciais...');
  await import('./seed.js');
}
load();

const app = express();
// API_PORT (e não PORT) para não colidir com a porta reservada ao front.
const PORT = process.env.API_PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '25mb' })); // fotos e áudios de visita chegam em base64

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/** Vocabulário e regras do CRM, consumidos pela interface */
app.get('/api/meta', (req, res) =>
  res.json({
    eventTypes: dominio.EVENT_TYPES,
    taskKinds: dominio.TASK_KINDS,
    announcementCategories: dominio.ANNOUNCEMENT_CATEGORIES,
    returnPresets: dominio.RETURN_PRESETS,
    segmentos: dominio.SEGMENTOS,
    maquinas: dominio.MAQUINAS,
    faturamentos: dominio.FATURAMENTOS,
    volumesCartao: dominio.VOLUMES_CARTAO,
    dores: dominio.DORES,
    interesses: dominio.INTERESSES,
    regrasScore: dominio.REGRAS_SCORE,
    temperatures: dominio.TEMPERATURES,
    funil: dominio.FUNIL,
    resultadosVisita: dominio.RESULTADOS_VISITA,
    comissao: dominio.COMISSAO,
    niveis: dominio.NIVEIS,
    kpisDiarios: dominio.KPIS_DIARIOS,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/gestor', managerRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

app.use((err, req, res, next) => {
  console.error('[api] erro:', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

app.listen(PORT, () => {
  console.log(`[api] CRM NewPay rodando em http://localhost:${PORT}`);
});
