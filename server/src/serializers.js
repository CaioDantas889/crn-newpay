// Hidrata os registros com os dados que a interface precisa em uma única ida ao
// servidor (cliente, dono do compromisso, confirmações de presença).

import { find, table } from './store.js';
import { EVENT_TYPES } from './domain.js';

export function clientCard(clientId) {
  const c = find('clients', clientId);
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    city: c.city,
    region: c.region,
    phone: c.phone,
    temperature: c.temperature,
    potential: c.potential,
    lat: c.lat,
    lng: c.lng,
  };
}

export function userCard(userId) {
  const u = find('users', userId);
  if (!u) return null;
  return { id: u.id, name: u.name, color: u.color, role: u.role, city: u.city };
}

export function expandEvent(event, viewerId) {
  const confirmacoes =
    event.scope === 'corporativo'
      ? table('confirmations')
          .filter((c) => c.eventId === event.id)
          .map((c) => ({ ...c, user: userCard(c.userId) }))
      : [];

  return {
    ...event,
    typeMeta: EVENT_TYPES[event.type] ?? EVENT_TYPES.aviso,
    client: event.clientId ? clientCard(event.clientId) : null,
    owner: event.ownerId ? userCard(event.ownerId) : null,
    author: userCard(event.createdBy),
    confirmations: confirmacoes,
    myConfirmation: confirmacoes.find((c) => c.userId === viewerId) ?? null,
    isMine: event.ownerId === viewerId,
  };
}

export function expandTask(task) {
  return { ...task, client: task.clientId ? clientCard(task.clientId) : null };
}

export function expandAnnouncement(announcement, viewerId) {
  const leituras = table('announcementReads').filter(
    (r) => r.announcementId === announcement.id
  );
  return {
    ...announcement,
    author: userCard(announcement.createdBy),
    readCount: leituras.length,
    readBy: leituras.map((r) => ({ ...r, user: userCard(r.userId) })),
    read: leituras.some((r) => r.userId === viewerId),
  };
}
