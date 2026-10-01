// Ranking gamificado da equipe.
//
// Dois placares: o do mês, por máquinas ativadas (com os níveis), e o do dia
// e da semana, por leads validados e vendas — pendente e suspeito ficam de
// fora, senão o ranking premiaria justamente o lead que não se sustenta.

import { Router } from 'express';
import { table } from '../store.js';
import { requireAuth } from '../auth.js';
import { NIVEIS } from '../domain.js';
import { rankingDoMes } from '../metrics.js';
import { endOfDay, startOfDay } from '../lib/dates.js';
import { contagemDoPeriodo, leadsPorVendedorEDia, sequenciaMetaCompleta } from '../leads.js';
import { segundaDe } from '../auditoria.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const linhas = rankingDoMes(req.query.mes);
  const minha = linhas.find((l) => l.vendedor.id === req.user.id) ?? null;

  res.json({
    mes: req.query.mes ?? new Date().toISOString().slice(0, 7),
    niveis: NIVEIS,
    linhas: linhas.map((l) => ({
      posicao: l.posicao,
      vendedor: l.vendedor,
      maquinasVendidas: l.maquinasVendidas,
      maquinasAtivadas: l.maquinasAtivadas,
      visitas: l.visitas,
      conversao: l.conversaoVisitaVenda,
      percentualMeta: l.percentualMeta,
      nivel: l.nivel,
      proximoNivel: l.proximoNivel,
    })),
    equipe: {
      maquinasAtivadas: linhas.reduce((s, l) => s + l.maquinasAtivadas, 0),
      maquinasVendidas: linhas.reduce((s, l) => s + l.maquinasVendidas, 0),
    },
    minhaPosicao: minha
      ? {
          posicao: minha.posicao,
          nivel: minha.nivel,
          proximoNivel: minha.proximoNivel,
          maquinasAtivadas: minha.maquinasAtivadas,
          faltamParaProximo: minha.proximoNivel
            ? Math.max(0, minha.proximoNivel.min - minha.maquinasAtivadas)
            : 0,
          faltamParaLiderar: linhas[0]
            ? Math.max(0, linhas[0].maquinasAtivadas - minha.maquinasAtivadas)
            : 0,
        }
      : null,
  });
});

/** GET /api/ranking/leads?periodo=dia|semana — leads validados e vendas */
router.get('/leads', (req, res) => {
  const periodo = req.query.periodo === 'semana' ? 'semana' : 'dia';
  const agora = new Date();
  const de = periodo === 'semana' ? segundaDe(agora) : startOfDay(agora);
  const ate = endOfDay(agora);
  const leads = leadsPorVendedorEDia(de, ate);

  const linhas = table('users')
    .filter((u) => u.role === 'vendedor' && u.active !== false)
    .map((u) => {
      const c = contagemDoPeriodo(leads.get(u.id), de, ate, agora);
      const vendas = table('deals').filter(
        (d) => d.userId === u.id && d.fechamentoAt && new Date(d.fechamentoAt) >= de && new Date(d.fechamentoAt) <= ate
      );
      return {
        vendedor: { id: u.id, name: u.name, color: u.color, city: u.city },
        // Validados de verdade: presenciais + remotos com CNPJ e print
        leadsValidados: c.presenciais + c.remotosValidados,
        presenciais: c.presenciais,
        remotos: c.remotosValidados,
        foraDoRanking: c.pendentes + c.suspeitos,
        vendas: vendas.length,
        maquinas: vendas.reduce((s, d) => s + d.maquinas, 0),
        sequencia: sequenciaMetaCompleta(u.id, agora),
      };
    })
    .sort((a, b) => b.leadsValidados - a.leadsValidados || b.vendas - a.vendas || b.sequencia - a.sequencia)
    .map((l, i) => ({ ...l, posicao: i + 1 }));

  res.json({
    periodo,
    linhas,
    minha: linhas.find((l) => l.vendedor.id === req.user.id) ?? null,
    equipe: {
      leadsValidados: linhas.reduce((s, l) => s + l.leadsValidados, 0),
      vendas: linhas.reduce((s, l) => s + l.vendas, 0),
    },
  });
});

export default router;
