// Biblioteca Comercial e Central de Objeções.
// As objeções podem vir personalizadas para um cliente: o CRM troca os
// marcadores da resposta pelos números reais daquele lojista.

import express, { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { requireAuth, requireRole } from '../auth.js';
import {
  TAMANHO_MAXIMO_MATERIAL,
  removerArquivo,
  salvarBinario,
  salvarDataUrl,
} from '../lib/uploads.js';

const router = Router();
router.use(requireAuth);

const TAXA_NEWPAY = 1.89; // crédito à vista da campanha vigente
const real = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

router.get('/library', (req, res) => {
  const { tipo, categoria } = req.query;
  const lista = table('library')
    .filter((m) => (tipo ? m.tipo === tipo : true))
    .filter((m) => (categoria ? m.categoria === categoria : true))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    itens: lista,
    categorias: [...new Set(table('library').map((m) => m.categoria))],
  });
});

/* ------------------------------------------- manutenção da biblioteca --- */
// Só gestão publica material: é o que a equipe inteira vai mostrar ao cliente.

const TIPOS_MATERIAL = ['video', 'audio', 'pdf', 'link'];
const soGestao = [requireRole('gestor', 'diretoria')];

/** Monta o material a partir do corpo, guardando o PDF quando vier arquivo */
function montarMaterial(b, anterior = null) {
  const titulo = String(b.titulo ?? '').trim();
  if (!titulo) return { erro: 'Informe o título do material.' };

  const tipo = TIPOS_MATERIAL.includes(b.tipo) ? b.tipo : anterior?.tipo ?? 'link';

  let url = String(b.url ?? '').trim();
  let arquivoNovo = null;

  if (b.arquivo) {
    arquivoNovo = salvarDataUrl(b.arquivo?.dataUrl ?? b.arquivo, 'material');
    if (!arquivoNovo) {
      return { erro: 'Arquivo não aceito. Envie um PDF ou imagem de até 8 MB.' };
    }
    url = arquivoNovo.url;
  }

  if (!url && !anterior) return { erro: 'Informe o link ou envie um arquivo.' };

  return {
    material: {
      tipo,
      categoria: String(b.categoria ?? '').trim().toLowerCase() || 'geral',
      titulo,
      descricao: String(b.descricao ?? '').trim(),
      duracao: String(b.duracao ?? '').trim(),
      url: url || anterior?.url,
    },
    arquivoNovo,
  };
}

/**
 * POST /api/content/library/arquivo — recebe o arquivo em binário puro.
 * O front manda o conteúdo no corpo e o tipo no Content-Type; a resposta traz
 * a URL para usar no material. Vídeo de treinamento entra por aqui.
 */
router.post(
  '/library/arquivo',
  ...soGestao,
  express.raw({ type: '*/*', limit: TAMANHO_MAXIMO_MATERIAL }),
  (req, res) => {
    const { url, tipo, tamanho, erro } = salvarBinario(req.body, req.headers['content-type']?.split(';')[0]);
    if (erro) return res.status(400).json({ error: erro });

    logActivity({ userId: req.user.id, action: 'arquivo_enviado', url });
    res.status(201).json({ url, tipo, tamanho });
  }
);

/** POST /api/content/library */
router.post('/library', ...soGestao, (req, res) => {
  const { material, erro } = montarMaterial(req.body ?? {});
  if (erro) return res.status(400).json({ error: erro });

  const criado = insert('library', {
    id: id('lib'),
    ...material,
    createdAt: new Date().toISOString(),
    createdBy: req.user.id,
  });

  logActivity({ userId: req.user.id, action: 'material_publicado', titulo: criado.titulo });
  res.status(201).json(criado);
});

/** PATCH /api/content/library/:id */
router.patch('/library/:id', ...soGestao, (req, res) => {
  const atual = find('library', req.params.id);
  if (!atual) return res.status(404).json({ error: 'Material não encontrado.' });

  const { material, erro, arquivoNovo } = montarMaterial({ ...atual, ...req.body }, atual);
  if (erro) return res.status(400).json({ error: erro });

  // Trocou o arquivo: o antigo sai do disco junto
  if (arquivoNovo && atual.url?.startsWith('/uploads/')) removerArquivo(atual.url);

  logActivity({ userId: req.user.id, action: 'material_editado', titulo: material.titulo });
  res.json(update('library', atual.id, material));
});

/** DELETE /api/content/library/:id */
router.delete('/library/:id', ...soGestao, (req, res) => {
  const material = find('library', req.params.id);
  if (!material) return res.status(404).json({ error: 'Material não encontrado.' });

  const arquivoApagado = material.url?.startsWith('/uploads/') ? removerArquivo(material.url) : false;
  remove('library', material.id);

  logActivity({ userId: req.user.id, action: 'material_removido', titulo: material.titulo });
  res.json({ ok: true, removido: material.titulo, arquivoApagado });
});

/**
 * GET /api/content/objections?clientId=cli_01
 *
 * Só as respostas e as dicas. A simulação de economia saiu junto com o TPV:
 * a NewPay não acompanha volume transacionado, e número inventado na frente do
 * lojista é pior do que argumento nenhum. Os marcadores que restam ({taxa_atual},
 * {taxa_newpay}, {clientes_ativos}) são dados que o CRM tem de fato.
 */
router.get('/objections', (req, res) => {
  const cliente = req.query.clientId ? find('clients', req.query.clientId) : null;
  const taxaAtual = cliente?.diagnostico?.taxaAtual ?? null;

  const ativosNaCidade = cliente
    ? table('clients').filter((c) => c.city === cliente.city && c.stage === 'fechado').length
    : table('clients').filter((c) => c.stage === 'fechado').length;

  const valores = {
    '{taxa_atual}': taxaAtual ? real(taxaAtual) : 'a que ele paga hoje',
    '{taxa_newpay}': real(TAXA_NEWPAY),
    '{clientes_ativos}': String(Math.max(3, ativosNaCidade)),
  };

  const aplicar = (texto) =>
    Object.entries(valores).reduce((acc, [chave, valor]) => acc.split(chave).join(valor), texto);

  res.json({
    cliente: cliente
      ? { id: cliente.id, name: cliente.name, company: cliente.company, city: cliente.city }
      : null,
    taxaNewpay: TAXA_NEWPAY,
    itens: table('objections').map((o) => ({ ...o, resposta: aplicar(o.resposta) })),
  });
});

export default router;
