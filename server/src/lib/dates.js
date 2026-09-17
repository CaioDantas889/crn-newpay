// Helpers de data em horario local (sem dependencias externas).

export const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' no fuso local */
export function dateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addMinutes(d, minutes) {
  return new Date(new Date(d).getTime() + minutes * 60000);
}

/** Cria uma data a partir de um dia + hora local. atHour(new Date(), 8, 30) */
export function atHour(d, hour, minute = 0) {
  const x = new Date(d);
  x.setHours(hour, minute, 0, 0);
  return x;
}

/** Diferenca em dias inteiros (positiva se `a` for anterior a `b`) */
export function daysBetween(a, b = new Date()) {
  return Math.floor((startOfDay(b) - startOfDay(a)) / 86400000);
}

export function minutesUntil(date, from = new Date()) {
  return Math.round((new Date(date) - from) / 60000);
}

export function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

/** Intervalo [from, to] cobrindo o mes de uma data 'YYYY-MM' ou Date */
export function monthRange(value) {
  const [y, m] = typeof value === 'string'
    ? value.split('-').map(Number)
    : [value.getFullYear(), value.getMonth() + 1];
  return {
    from: new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString(),
    to: new Date(y, m, 0, 23, 59, 59, 999).toISOString(),
  };
}

/** Proximo dia util (pula sabado/domingo) */
export function nextBusinessDay(d) {
  let x = addDays(d, 1);
  while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1);
  return x;
}
