// Ajustes no banco que já existe, feitos uma vez ao subir o servidor.
// Cada passo confere antes de mexer, então rodar de novo não muda nada — e o
// backup rotativo do store.js guarda o arquivo de antes.

import { id, save, table } from './store.js';
import { atualizarPendencia } from './followups.js';

/**
 * Follow-up virou tarefa do motor de cadência (só sai com resultado). O que
 * estava como compromisso "follow-up" pendente na agenda, preso a um cliente,
 * passa para lá — senão o retorno já combinado sumiria da tela "Hoje".
 */
function followupsDaAgenda() {
  const eventos = table('events');
  const clientes = new Set(table('clients').map((c) => c.id));
  let migrados = 0;

  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i];
    const migrar =
      e.type === 'followup' && e.status === 'agendado' && e.scope !== 'corporativo' &&
      e.ownerId && e.clientId && clientes.has(e.clientId);
    if (!migrar) continue;

    table('followups').push({
      id: id('fup'),
      clientId: e.clientId,
      userId: e.ownerId,
      etapa: 'avulso',
      acao: 'ligacao',
      dueAt: e.start,
      marcadoPeloLojista: true,
      reagendamentos: 0,
      status: 'pendente',
      doneAt: null,
      resultado: null,
      notes: '',
      combinado: e.notes ?? '',
      print: null,
      visitId: null,
      migradoDoEvento: e.id,
      createdAt: e.createdAt ?? e.start,
    });
    eventos.splice(i, 1);
    atualizarPendencia(e.clientId);
    migrados += 1;
  }
  return migrados;
}

/** "Sem avanço de status em 30 dias" precisa saber quando a etapa mudou */
function dataDaEtapa() {
  let ajustados = 0;
  for (const c of table('clients')) {
    if (c.stageChangedAt) continue;
    c.stageChangedAt = c.updatedAt ?? c.createdAt ?? new Date().toISOString();
    ajustados += 1;
  }
  return ajustados;
}

/**
 * A venda passou a guardar modelo e números de série, e a ativação passou a
 * ser confirmada pela gestão. O que já estava ativado continua contando — a
 * confirmação é carimbada como migração, não como decisão de alguém.
 */
function maquinasDaVenda() {
  let ajustados = 0;
  let confirmados = 0;
  for (const d of table('deals')) {
    let mudou = false;
    if (!Array.isArray(d.series)) { d.series = []; mudou = true; }
    if (d.modelo === undefined) { d.modelo = null; mudou = true; }
    // Registro de antes da confirmação (nunca teve "declarada em"). O que já
    // nasceu como declaração do vendedor fica esperando a gestão.
    if (d.status === 'ativado' && !d.ativacaoConfirmadaAt && d.ativacaoDeclaradaAt === undefined) {
      d.ativacaoDeclaradaAt = d.ativacaoAt ?? d.updatedAt ?? d.createdAt;
      d.ativacaoDeclaradaPor = d.userId;
      d.ativacaoConfirmadaAt = d.ativacaoDeclaradaAt;
      d.ativacaoConfirmadaPor = 'migracao';
      confirmados += 1;
      mudou = true;
    }
    if (mudou) ajustados += 1;
  }
  return { ajustados, confirmados };
}

/**
 * Antes, "Fechou" criava uma venda nova e deixava a proposta do mesmo cliente
 * aberta para sempre. Proposta aberta do mesmo vendedor, anterior à venda, era
 * a mesma negociação: a venda herda a data da proposta (a conversão passa a
 * creditar a proposta) e a proposta some.
 */
function propostasQueViraramVenda() {
  const deals = table('deals');
  const porCliente = new Map();
  for (const d of deals) {
    if (!porCliente.has(d.clientId)) porCliente.set(d.clientId, []);
    porCliente.get(d.clientId).push(d);
  }

  const fundidas = new Set();
  for (const lista of porCliente.values()) {
    const vendas = lista
      .filter((d) => ['fechado', 'ativado'].includes(d.status) && d.fechamentoAt)
      .sort((a, b) => new Date(a.fechamentoAt) - new Date(b.fechamentoAt));
    for (const venda of vendas) {
      const aberta = lista
        .filter(
          (d) =>
            ['proposta', 'negociacao'].includes(d.status) && d.userId === venda.userId && !fundidas.has(d.id) &&
            new Date(d.createdAt) <= new Date(venda.fechamentoAt)
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      if (!aberta) continue;
      venda.propostaAt = aberta.propostaAt ?? aberta.createdAt;
      if (!venda.taxaOfertada && aberta.taxaOfertada) venda.taxaOfertada = aberta.taxaOfertada;
      if (!venda.modelo && aberta.modelo) venda.modelo = aberta.modelo;
      fundidas.add(aberta.id);
    }
  }

  for (let i = deals.length - 1; i >= 0; i--) if (fundidas.has(deals[i].id)) deals.splice(i, 1);
  return fundidas.size;
}

export function migrar() {
  const followups = followupsDaAgenda();
  const etapas = dataDaEtapa();
  const maquinas = maquinasDaVenda();
  const fundidas = propostasQueViraramVenda();
  if (followups || etapas || maquinas.ajustados || fundidas) {
    save();
    if (followups) console.log(`[migração] ${followups} follow-up(s) da agenda agora exigem resultado (tela "Hoje").`);
    if (etapas) console.log(`[migração] ${etapas} cliente(s) ganharam a data da etapa do funil.`);
    if (maquinas.ajustados) {
      console.log(`[migração] ${maquinas.ajustados} negócio(s) ganharam modelo e número de série; ${maquinas.confirmados} ativação(ões) antigas seguem contando.`);
    }
    if (fundidas) console.log(`[migração] ${fundidas} proposta(s) que já tinham virado venda foram fundidas à venda.`);
  }
}
