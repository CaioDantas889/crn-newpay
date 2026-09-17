// Central de Notificações: as regras são avaliadas a cada requisição sobre o
// estado atual da agenda. Nada é agendado em background — o que fica gravado é
// apenas o que o usuário já leu ou dispensou (tabela notificationState).

import { table } from './store.js';
import { announcementReachesUser, reachesUser } from './domain.js';
import { daysBetween, endOfDay, minutesUntil, startOfDay } from './lib/dates.js';

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

  // 3. Follow-up vencido -------------------------------------------------
  for (const ev of meus) {
    if (ev.type !== 'followup' || ev.status !== 'agendado') continue;
    if (new Date(ev.start) >= now) continue;
    const dias = daysBetween(ev.start, now);
    push({
      id: `followup-vencido-${ev.id}`,
      kind: 'followup_vencido',
      severity: dias >= 2 ? 'critico' : 'alerta',
      title: 'Follow-up vencido',
      message: `${ev.title} estava marcado para ${dias === 0 ? 'hoje mais cedo' : `${dias} dia(s) atrás`}.`,
      at: ev.start,
      link: `/dia/${ev.start.slice(0, 10)}`,
      eventId: ev.id,
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

  // 5. Meta diária não alcançada ------------------------------------------
  if (user.dailyGoal > 0) {
    const realizadasHoje = meus.filter(
      (e) =>
        e.type === 'visita' &&
        e.status === 'realizado' &&
        new Date(e.start) >= hojeIni &&
        new Date(e.start) <= hojeFim
    ).length;

    if (now.getHours() >= 16 && realizadasHoje < user.dailyGoal) {
      push({
        id: `meta-diaria-${hojeIni.toISOString().slice(0, 10)}`,
        kind: 'meta_diaria',
        severity: 'alerta',
        title: 'Meta diária não alcançada',
        message: `${realizadasHoje} de ${user.dailyGoal} visitas realizadas. Faltam ${user.dailyGoal - realizadasHoje}.`,
        link: '/dia',
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
