// Central de Notificações: as regras são avaliadas a cada requisição sobre o
// estado atual da agenda. Nada é agendado em background — o que fica gravado é
// apenas o que o usuário já leu ou dispensou (tabela notificationState).

import { table } from './store.js';
import {
  HORA_RESUMO_GESTOR, LEMBRETES_RITMO, META_LEADS, REGRAS_SEMAFORO,
  announcementReachesUser, ehDiaDeTrabalho, reachesUser,
} from './domain.js';
import { atHour, dateKey, daysBetween, endOfDay, minutesUntil, startOfDay } from './lib/dates.js';
import { placarDoDia } from './leads.js';
import { painelSemaforo } from './semaforo.js';
import { termoVigente } from './auditoria.js';

const SEVERITY_ORDER = { critico: 0, alerta: 1, info: 2 };

const fmtMin = (min) =>
  min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`;

/** Eventos que alcançam o usuário (próprios + corporativos direcionados a ele) */
function eventsFor(userId) {
  return table('events').filter((e) => reachesUser(e, userId) && e.status !== 'cancelado');
}

/**
 * Avalia todas as regras e devolve as notificações do usuário, ordenadas por
 * severidade e horário. IDs são determinísticos para que "marcar como lida"
 * continue valendo na próxima chamada.
 */
export function buildNotifications(user, now = new Date()) {
  const out = [];
  const push = (n) => out.push({ severity: 'info', at: now.toISOString(), ...n });

  const meus = eventsFor(user.id);
  const hojeIni = startOfDay(now);
  const hojeFim = endOfDay(now);

  // 1/2. Compromissos se aproximando ------------------------------------
  for (const ev of meus) {
    if (ev.status !== 'agendado') continue;
    const min = minutesUntil(ev.start, now);
    if (min <= 0) continue;

    const ehReuniao = ev.type === 'reuniao' || ev.type === 'treinamento';
    const ehVisita = ev.type === 'visita' || ev.type === 'interessado';

    if (ehReuniao && min <= 60) {
      push({
        id: `lembrete-reuniao-${ev.id}`,
        kind: 'reuniao_proxima',
        severity: min <= 15 ? 'critico' : 'alerta',
        title: `${ev.type === 'reuniao' ? 'Reunião' : 'Treinamento'} em ${fmtMin(min)}`,
        message: `${ev.title}${ev.location ? ` · ${ev.location}` : ''}`,
        at: ev.start,
        link: `/dia/${ev.start.slice(0, 10)}`,
        eventId: ev.id,
      });
    }

    if (ehVisita && min <= 30) {
      push({
        id: `lembrete-visita-${ev.id}`,
        kind: 'visita_proxima',
        severity: min <= 10 ? 'critico' : 'alerta',
        title: `Visita em ${fmtMin(min)}`,
        message: `${ev.title}${ev.location ? ` · ${ev.location}` : ''}`,
        at: ev.start,
        link: `/dia/${ev.start.slice(0, 10)}`,
        eventId: ev.id,
      });
    }
  }

  // 3. Follow-ups atrasados ----------------------------------------------
  // Um aviso só, com o total: a lista (mais velhos primeiro) é a tela "Hoje".
  const hojeChave = dateKey(now);
  const pendentes = table('followups').filter((f) => f.userId === user.id && f.status === 'pendente');
  const atrasados = pendentes.filter((f) => new Date(f.dueAt) < hojeIni);
  const doDia = pendentes.filter((f) => new Date(f.dueAt) >= hojeIni && new Date(f.dueAt) <= hojeFim);

  if (atrasados.length) {
    const maisVelho = atrasados.reduce((a, b) => (new Date(a.dueAt) < new Date(b.dueAt) ? a : b));
    push({
      id: `followups-atrasados-${hojeChave}`,
      kind: 'followup_vencido',
      severity: atrasados.length > REGRAS_SEMAFORO.maxAtrasadosAmarelo ? 'critico' : 'alerta',
      title: `${atrasados.length} follow-up(s) atrasado(s)`,
      message: `O mais antigo venceu há ${daysBetween(maisVelho.dueAt, now)} dia(s). Só sai da lista com o resultado registrado.`,
      at: maisVelho.dueAt,
      link: '/',
    });
  }

  // 4. Cliente sem retorno há mais de 7 dias ------------------------------
  const semRetorno = table('clients')
    .filter((c) => c.ownerId === user.id && daysBetween(c.lastContactAt, now) > 7)
    .sort((a, b) => new Date(a.lastContactAt) - new Date(b.lastContactAt));

  for (const cli of semRetorno.slice(0, 5)) {
    const dias = daysBetween(cli.lastContactAt, now);
    push({
      id: `sem-retorno-${cli.id}`,
      kind: 'cliente_sem_retorno',
      severity: dias > 15 ? 'alerta' : 'info',
      title: `Cliente sem retorno há ${dias} dias`,
      message: `${cli.name} · ${cli.company} (${cli.city})`,
      at: cli.lastContactAt,
      link: `/clientes/${cli.id}`,
      clientId: cli.id,
    });
  }

  // 5. Ritmo da meta de leads (8h, 11h, 15h e 18h) -------------------------
  // A meta não pode ser esquecida: o sistema lembra o vendedor ao longo do dia.
  if (user.role === 'vendedor' && ehDiaDeTrabalho(now)) {
    const placar = placarDoDia(user.id, now);
    const hora = now.getHours();
    const lembrete = LEMBRETES_RITMO.find((l) => hora >= l.hora && hora < l.ate);
    const base = lembrete && {
      id: `ritmo-${lembrete.chave}-${hojeChave}`,
      kind: `ritmo_${lembrete.chave}`,
      at: atHour(now, lembrete.hora).toISOString(),
      link: '/',
    };

    if (lembrete?.chave === '8h') {
      const pendencias = atrasados.length + doDia.length;
      push({
        ...base,
        title: 'Bom dia!',
        message: `Hoje: ${META_LEADS.total} leads + ${pendencias} follow-up(s) pendente(s).`,
      });
    } else if (lembrete?.abaixoDe && placar.total < lembrete.abaixoDe) {
      push({
        ...base,
        severity: 'alerta',
        title: lembrete.chave === '11h' ? 'Você está atrás do ritmo' : 'Meta do dia em risco',
        message:
          lembrete.chave === '11h'
            ? `Você está atrás do ritmo. Faltam ${placar.faltam}.`
            : `Faltam ${placar.faltam} leads para bater a meta de hoje.`,
      });
    } else if (lembrete?.chave === '18h') {
      const feitos = table('followups').filter(
        (f) => f.userId === user.id && f.status === 'feito' && new Date(f.doneAt) >= hojeIni && new Date(f.doneAt) <= hojeFim
      ).length;
      push({
        ...base,
        severity: placar.metaBatida && atrasados.length === 0 ? 'info' : 'alerta',
        title: placar.metaBatida ? 'Resumo do dia: meta batida' : 'Resumo do dia',
        message:
          `${placar.total}/${META_LEADS.total} leads (${placar.presenciais} presenciais · ${placar.remotos} remotos) · ` +
          `${feitos} follow-up(s) feito(s) · ${atrasados.length + doDia.length} atrasado(s).`,
      });
    }
  }

  // 6. Campanhas e avisos não lidos ---------------------------------------
  const lidos = new Set(
    table('announcementReads')
      .filter((r) => r.userId === user.id)
      .map((r) => r.announcementId)
  );

  for (const av of table('announcements')) {
    if (!announcementReachesUser(av, user.id) || lidos.has(av.id)) continue;
    if (av.expiresAt && new Date(av.expiresAt) < now) continue;
    push({
      id: `aviso-${av.id}`,
      kind: av.category === 'campanha' ? 'nova_campanha' : 'aviso_nao_lido',
      severity: av.priority === 'alta' ? 'alerta' : 'info',
      title: av.category === 'campanha' ? 'Nova campanha disponível' : 'Comunicado não lido',
      message: av.title,
      at: av.createdAt,
      link: '/avisos',
      announcementId: av.id,
    });
  }

  // 7. Presença pendente em evento obrigatório -----------------------------
  const minhasConfirmacoes = new Set(
    table('confirmations')
      .filter((c) => c.userId === user.id)
      .map((c) => c.eventId)
  );

  for (const ev of meus) {
    if (!ev.requiresConfirmation || ev.scope !== 'corporativo') continue;
    if (new Date(ev.start) < now || minhasConfirmacoes.has(ev.id)) continue;
    push({
      id: `confirmar-${ev.id}`,
      kind: 'confirmacao_pendente',
      severity: 'alerta',
      title: 'Confirme sua presença',
      message: `${ev.title} · ${new Date(ev.start).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      at: ev.start,
      link: `/dia/${ev.start.slice(0, 10)}`,
      eventId: ev.id,
    });
  }

  // 8. Regras exclusivas do gestor -----------------------------------------
  if (user.role === 'gestor' || user.role === 'diretoria') {
    const vendedores = table('users').filter((u) => u.role === 'vendedor' && u.active !== false);

    const semAgenda = vendedores.filter(
      (v) =>
        !table('events').some(
          (e) =>
            e.ownerId === v.id &&
            e.status !== 'cancelado' &&
            new Date(e.start) >= hojeIni &&
            new Date(e.start) <= hojeFim
        )
    );
    if (semAgenda.length) {
      push({
        id: `equipe-sem-agenda-${hojeIni.toISOString().slice(0, 10)}`,
        kind: 'equipe_sem_agenda',
        severity: 'critico',
        title: `${semAgenda.length} vendedor(es) sem agenda hoje`,
        message: semAgenda.map((v) => v.name).join(', '),
        link: '/gestor',
      });
    }

    // Resumo das 19h: os vermelhos do dia e os alertas de suspeita
    if (ehDiaDeTrabalho(now) && now.getHours() >= HORA_RESUMO_GESTOR) {
      const painel = painelSemaforo(now, now);
      const vermelhos = painel.linhas.filter((l) => l.semaforo.cor === 'vermelho');
      push({
        id: `resumo-gestor-${hojeChave}`,
        kind: 'resumo_gestor',
        severity: vermelhos.length || painel.resumo.alertas ? 'critico' : 'info',
        title: vermelhos.length
          ? `Resumo do dia: ${vermelhos.length} vendedor(es) no vermelho`
          : 'Resumo do dia: ninguém no vermelho',
        message:
          `${vermelhos.length ? `${vermelhos.map((l) => l.vendedor.name.split(' ')[0]).join(', ')} · ` : ''}` +
          `${painel.resumo.alertas} alerta(s) de suspeita hoje · ${painel.resumo.leads} leads da equipe.`,
        at: atHour(now, HORA_RESUMO_GESTOR).toISOString(),
        link: '/gestor',
      });
    }

    // Lead fantasma confirmado pela auditoria
    for (const o of table('ocorrencias')) {
      if (o.status !== 'ativa' || daysBetween(o.at, now) > 14) continue;
      const vendedor = vendedores.find((v) => v.id === o.vendedorId);
      push({
        id: `fantasma-${o.id}`,
        kind: 'lead_fantasma',
        severity: 'critico',
        title: 'Lead fantasma confirmado',
        message: `${o.lead?.company ?? 'Lead'} · cadastrado por ${vendedor?.name ?? 'vendedor'}. O lojista não reconhece o contato.`,
        at: o.at,
        link: '/auditoria?aba=ocorrencias',
      });
    }

    if (!termoVigente() && vendedores.length) {
      push({
        id: 'termo-nao-publicado',
        kind: 'termo_pendente',
        severity: 'alerta',
        title: 'Termo de Conduta ainda não publicado',
        message: 'Publique o texto da NewPay para a equipe aceitar no próximo acesso.',
        link: '/auditoria?aba=termo',
      });
    }

    for (const av of table('announcements')) {
      if (!av.requiresAck) continue;
      const alvo = vendedores.filter((v) => announcementReachesUser(av, v.id));
      const leram = table('announcementReads').filter((r) => r.announcementId === av.id).length;
      if (alvo.length && leram < alvo.length && daysBetween(av.createdAt, now) >= 1) {
        push({
          id: `aviso-pendente-${av.id}`,
          kind: 'aviso_sem_leitura',
          severity: 'alerta',
          title: `${alvo.length - leram} de ${alvo.length} não leram o comunicado`,
          message: av.title,
          at: av.createdAt,
          link: '/avisos',
          announcementId: av.id,
        });
      }
    }
  }

  // 9. Onboarding: a fila de ligações da auditoria --------------------------
  if (user.role === 'onboarding') {
    const fila = table('auditorias').filter((a) => a.status === 'pendente');
    if (fila.length) {
      push({
        id: `auditoria-fila-${hojeChave}`,
        kind: 'auditoria_pendente',
        severity: 'alerta',
        title: `${fila.length} lead(s) para auditar`,
        message: 'Ligue para o lojista e registre: confirmado ou não reconhece o contato.',
        link: '/auditoria',
      });
    }
  }

  // Estado de leitura / dispensa -------------------------------------------
  const estado = new Map(
    table('notificationState')
      .filter((s) => s.userId === user.id)
      .map((s) => [s.notificationId, s])
  );

  return out
    .map((n) => ({
      ...n,
      read: Boolean(estado.get(n.id)?.readAt),
      dismissed: Boolean(estado.get(n.id)?.dismissedAt),
    }))
    .filter((n) => !n.dismissed)
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        new Date(a.at) - new Date(b.at)
    );
}
