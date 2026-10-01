// Auditoria semanal, ocorrências e Termo de Conduta.
//
// Quem entra aqui: o onboarding (faz as ligações) e a gestão (vê tudo, sorteia
// fora de hora, anula ocorrência e publica o termo). O vendedor só alcança o
// próprio termo — nunca a fila da auditoria.

import { Router } from 'express';
import { find, id, insert, logActivity, table } from '../store.js';
import { isManager, requireAuth, requireRole } from '../auth.js';
import { AUDITORIA, RESULTADOS_AUDITORIA, TERMO_CONDUTA_MODELO } from '../domain.js';
import { dateKey } from '../lib/dates.js';
import {
  aceiteDe, anularOcorrencia, expandirAuditoria, expandirOcorrencia, garantirSorteioDaSemana,
  registrarResultado, segundaDe, sortearAgora, termoVigente,
} from '../auditoria.js';

const router = Router();
router.use(requireAuth);

const auditores = requireRole('onboarding', 'gestor', 'diretoria');
const gestao = requireRole('gestor', 'diretoria');

/* ------------------------------------------------- termo de conduta ---- */

/** GET /api/auditoria/termo — o termo vigente e o aceite de quem pergunta */
router.get('/termo', (req, res) => {
  const termo = termoVigente();
  const aceite = termo ? aceiteDe(req.user.id, termo.id) : null;
  const resposta = { termo, aceito: Boolean(aceite), aceite };

  if (isManager(req.user)) {
    const vendedores = table('users').filter((u) => u.role === 'vendedor' && u.active !== false);
    resposta.modelo = TERMO_CONDUTA_MODELO;
    resposta.versoes = table('termosConduta').length;
    resposta.aceites = vendedores.map((v) => {
      const a = termo ? aceiteDe(v.id, termo.id) : null;
      return { vendedor: { id: v.id, name: v.name, color: v.color }, aceitoAt: a?.at ?? null, login: a?.login ?? null };
    });
  }
  res.json(resposta);
});

/** PUT /api/auditoria/termo — publica uma nova versão; todo vendedor aceita de novo */
router.put('/termo', gestao, (req, res) => {
  const texto = String(req.body?.texto ?? '').trim();
  if (texto.length < 80) {
    return res.status(400).json({ error: 'O termo está curto demais. Cole o texto completo fornecido pela NewPay.' });
  }
  if (texto.startsWith('MODELO')) {
    return res.status(400).json({ error: 'Tire a linha "MODELO" e revise o texto antes de publicar.' });
  }

  const termo = insert('termosConduta', {
    id: id('trm'),
    versao: (termoVigente()?.versao ?? 0) + 1,
    texto,
    publicadoAt: new Date().toISOString(),
    publicadoPor: req.user.id,
  });
  logActivity({ userId: req.user.id, action: 'termo_publicado', versao: termo.versao });
  res.status(201).json(termo);
});

/** POST /api/auditoria/termo/aceite — aceite digital, gravado com data, hora e login */
router.post('/termo/aceite', (req, res) => {
  const termo = termoVigente();
  if (!termo) return res.status(404).json({ error: 'Nenhum termo publicado.' });
  if (req.body?.termoId !== termo.id) {
    return res.status(409).json({ error: 'O termo foi atualizado. Leia a versão nova antes de aceitar.' });
  }

  const existente = aceiteDe(req.user.id, termo.id);
  if (existente) return res.json(existente);

  const aceite = insert('aceitesTermo', {
    id: id('act'),
    termoId: termo.id,
    versao: termo.versao,
    userId: req.user.id,
    login: req.user.email,
    nome: req.user.name,
    at: new Date().toISOString(),
    ip: req.ip ?? null,
    aparelho: String(req.headers['user-agent'] ?? '').slice(0, 200),
  });
  logActivity({ userId: req.user.id, action: 'termo_aceito', versao: termo.versao });
  res.status(201).json(aceite);
});

/* ------------------------------------------------------------ a fila ---- */

/** GET /api/auditoria — a fila de ligações da semana e o que já foi auditado */
router.get('/', auditores, (req, res) => {
  garantirSorteioDaSemana();

  const todas = table('auditorias').map(expandirAuditoria);
  const semana = dateKey(segundaDe());

  res.json({
    semana,
    regra: AUDITORIA,
    resultados: RESULTADOS_AUDITORIA,
    fila: todas
      .filter((a) => a.status === 'pendente')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    concluidas: todas
      .filter((a) => a.status !== 'pendente')
      .sort((a, b) => new Date(b.resultadoAt) - new Date(a.resultadoAt))
      .slice(0, 40),
    resumo: {
      pendentes: todas.filter((a) => a.status === 'pendente').length,
      confirmados: todas.filter((a) => a.status === 'confirmado' && a.semana === semana).length,
      naoReconhecem: todas.filter((a) => a.status === 'nao_reconhece' && a.semana === semana).length,
    },
  });
});

/** POST /api/auditoria/sortear — sorteio extra, fora da segunda (gestão) */
router.post('/sortear', gestao, (req, res) => {
  const sorteio = sortearAgora(req.user.id);
  logActivity({ userId: req.user.id, action: 'auditoria_sorteada', total: sorteio.total });
  res.status(201).json(sorteio);
});

/** POST /api/auditoria/:id/resultado — "Confirmado" ou "Não reconhece o contato" */
router.post('/:id/resultado', auditores, (req, res) => {
  const auditoria = find('auditorias', req.params.id);
  if (!auditoria) return res.status(404).json({ error: 'Auditoria não encontrada.' });
  if (auditoria.status !== 'pendente') return res.status(409).json({ error: 'Esta auditoria já tem resultado.' });

  const resultado = req.body?.resultado;
  if (!RESULTADOS_AUDITORIA[resultado]) {
    return res.status(400).json({ error: 'Informe o resultado: confirmado ou não reconhece o contato.' });
  }
  const notes = String(req.body?.notes ?? '').trim();
  if (resultado === 'nao_reconhece' && notes.length < 5) {
    return res.status(400).json({ error: 'Anote com quem falou e o que a pessoa disse: isso vira a ocorrência.' });
  }

  const { auditoria: atualizada, ocorrencia } = registrarResultado(auditoria, {
    resultado, notes, auditorId: req.user.id,
  });
  logActivity({ userId: req.user.id, action: `auditoria_${resultado}`, clientId: auditoria.clientId });
  res.json({ auditoria: expandirAuditoria(atualizada), ocorrencia: Boolean(ocorrencia) });
});

/* -------------------------------------------------------- ocorrências --- */

/** GET /api/auditoria/ocorrencias?vendedorId= — visível só para a gestão */
router.get('/ocorrencias', gestao, (req, res) => {
  const lista = table('ocorrencias')
    .filter((o) => (req.query.vendedorId ? o.vendedorId === req.query.vendedorId : true))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map(expandirOcorrencia);

  const porVendedor = new Map();
  for (const o of lista) {
    if (o.status !== 'ativa' || !o.vendedor) continue;
    const linha = porVendedor.get(o.vendedorId) ?? { vendedor: o.vendedor, total: 0 };
    linha.total += 1;
    porVendedor.set(o.vendedorId, linha);
  }

  res.json({
    ocorrencias: lista,
    porVendedor: [...porVendedor.values()].sort((a, b) => b.total - a.total),
  });
});

/** POST /api/auditoria/ocorrencias/:id/anular — com motivo, que fica gravado */
router.post('/ocorrencias/:id/anular', gestao, (req, res) => {
  const ocorrencia = find('ocorrencias', req.params.id);
  if (!ocorrencia) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  if (ocorrencia.status !== 'ativa') return res.status(409).json({ error: 'Esta ocorrência já foi anulada.' });

  const motivo = String(req.body?.motivo ?? '').trim();
  if (motivo.length < 5) return res.status(400).json({ error: 'Explique o motivo (mínimo de 5 letras).' });

  const anulada = anularOcorrencia(ocorrencia, { motivo, userId: req.user.id });
  logActivity({ userId: req.user.id, action: 'ocorrencia_anulada', targetId: ocorrencia.id });
  res.json(expandirOcorrencia(anulada));
});

export default router;
