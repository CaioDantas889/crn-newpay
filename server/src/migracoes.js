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

export function migrar() {
  const followups = followupsDaAgenda();
  const etapas = dataDaEtapa();
  if (followups || etapas) {
    save();
    if (followups) console.log(`[migração] ${followups} follow-up(s) da agenda agora exigem resultado (tela "Hoje").`);
    if (etapas) console.log(`[migração] ${etapas} cliente(s) ganharam a data da etapa do funil.`);
  }
}
