// Biblioteca Comercial e Central de Objeções.
// As objeções podem vir personalizadas para um cliente: o CRM troca os
// marcadores da resposta pelos números reais daquele lojista.

import { Router } from 'express';
import { find, table } from '../store.js';
import { requireAuth } from '../auth.js';

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

/** GET /api/content/objections?clientId=cli_01 */
router.get('/objections', (req, res) => {
  const cliente = req.query.clientId ? find('clients', req.query.clientId) : null;

  const tpv = cliente?.tpvEstimado || 20000;
  const taxaAtual = cliente?.diagnostico?.taxaAtual || 3.5;
  const custoAtual = (tpv * taxaAtual) / 100;
  const custoNewpay = (tpv * TAXA_NEWPAY) / 100;

  const ativosNaCidade = cliente
    ? table('clients').filter((c) => c.city === cliente.city && c.stage === 'fechado').length
    : table('clients').filter((c) => c.stage === 'fechado').length;

  const valores = {
    '{taxa_atual}': real(taxaAtual),
    '{taxa_newpay}': real(TAXA_NEWPAY),
    '{tpv}': real(tpv),
    '{custo_atual}': real(custoAtual),
    '{custo_newpay}': real(custoNewpay),
    '{economia}': real(Math.max(0, custoAtual - custoNewpay)),
    '{clientes_ativos}': String(Math.max(3, ativosNaCidade)),
  };

  const aplicar = (texto) =>
    Object.entries(valores).reduce((acc, [chave, valor]) => acc.split(chave).join(valor), texto);

  res.json({
    cliente: cliente
      ? { id: cliente.id, name: cliente.name, company: cliente.company, city: cliente.city }
      : null,
    simulacao: cliente
      ? {
          tpv,
          taxaAtual,
          taxaNewpay: TAXA_NEWPAY,
          custoAtual: Math.round(custoAtual),
          custoNewpay: Math.round(custoNewpay),
          economiaMensal: Math.round(Math.max(0, custoAtual - custoNewpay)),
          economiaAnual: Math.round(Math.max(0, custoAtual - custoNewpay) * 12),
        }
      : null,
    itens: table('objections').map((o) => ({ ...o, resposta: aplicar(o.resposta) })),
  });
});

export default router;
