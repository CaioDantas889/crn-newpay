import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';

import { config, dicaSegredo, validarConfig } from './config.js';
import { acquireLock, load, registrarEncerramento } from './store.js';
import { garantirBanco } from './bootstrap.js';
import { UPLOAD_DIR } from './lib/uploads.js';
import * as dominio from './domain.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
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
import managerRoutes from './routes/manager.js';

/* ------------------------------------------------- checagens de ambiente */

const erros = validarConfig();
if (erros.length) {
  console.error('\n[api] não dá para subir em produção com esta configuração:\n');
  for (const erro of erros) console.error(`  · ${erro}`);
  console.error(`\n  ${dicaSegredo}\n`);
  process.exit(1);
}

// Um único processo escrevendo o JSON. Duas cópias do servidor no mesmo disco
// se sobrescrevem sem perceber.
const trava = acquireLock('api');
if (!trava.ok) {
  console.error(
    `[api] já existe um servidor usando ${config.dataDir} (pid ${trava.dono.pid}, desde ${trava.dono.desde}).`
  );
  process.exit(1);
}
registrarEncerramento();

try {
  await garantirBanco();
} catch {
  process.exit(1);
}
load();

/* ------------------------------------------------------------ aplicação */

const app = express();
const PORT = config.porta; // API_PORT (e não PORT) para não colidir com o front

if (config.producao) app.set('trust proxy', 1);

// Sem NEWPAY_ORIGINS em produção o front é servido por este mesmo processo,
// então nenhuma origem externa precisa de liberação.
if (config.origens.length) {
  app.use(cors({
    origin: (origem, cb) =>
      !origem || config.origens.includes(origem)
        ? cb(null, true)
        : cb(new Error('Origem não autorizada.')),
  }));
} else if (!config.producao) {
  app.use(cors());
}

app.use(express.json({ limit: '25mb' })); // fotos e áudios de visita chegam em base64

if (config.producao) {
  app.use('/api', (req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
      console.log(`[api] ${res.statusCode} ${req.method} ${req.originalUrl} ${Date.now() - inicio}ms`);
    });
    next();
  });
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

/** Vocabulário e regras do CRM, consumidos pela interface */
app.get('/api/meta', (req, res) =>
  res.json({
    // O login só oferece as contas de teste quando o banco é o de demonstração
    demo: config.seedDemo,
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
    niveis: dominio.NIVEIS,
    kpisDiarios: dominio.KPIS_DIARIOS,
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
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
app.use('/api/gestor', managerRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

/* ------------------------------------------- front em produção (web/dist) */

const indexHtml = path.join(config.frontDir, 'index.html');
const temBuild = fs.existsSync(indexHtml);

if (config.servirFront && temBuild) {
  // O service worker não pode ficar preso em cache: é ele que entrega a versão
  // nova do app para quem já instalou.
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(config.frontDir, 'sw.js'));
  });

  // Arquivos do Vite levam hash no nome, então podem ficar em cache para sempre.
  app.use(
    '/assets',
    express.static(path.join(config.frontDir, 'assets'), { immutable: true, maxAge: '365d' })
  );
  // O resto (ícones, manifest) muda de vez em quando: cache curto.
  app.use(express.static(config.frontDir, { index: false, maxAge: '1h' }));
  // Qualquer rota do app cai no index.html; anexo que não existe continua 404.
  app.get('*', (req, res, next) =>
    req.path.startsWith('/uploads/') ? next() : res.sendFile(indexHtml)
  );
} else if (config.servirFront) {
  console.warn(`[api] build do front não encontrado em ${config.frontDir} — rode "npm run build".`);
}

app.use((err, req, res, next) => {
  console.error('[api] erro:', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

app.listen(PORT, () => {
  console.log(`[api] CRM NewPay rodando em http://localhost:${PORT}`);
  console.log(`[api] ambiente: ${config.producao ? 'produção' : 'desenvolvimento'} · dados em ${config.dataDir}`);
  if (config.servirFront && temBuild) console.log(`[api] front servido de ${config.frontDir}`);
});
