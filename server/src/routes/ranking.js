// Ranking gamificado da equipe: máquinas vendidas, ativações e conversão.

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { NIVEIS } from '../domain.js';
import { rankingDoMes } from '../metrics.js';

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

export default router;
