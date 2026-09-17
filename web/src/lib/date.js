// Helpers de data em horário local, sem biblioteca externa.

export const pad = (n) => String(n).padStart(2, '0');

export const dateKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export const parseKey = (key) => new Date(`${key}T12:00:00`);

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const addMonths = (d, n) => {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
};

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const isSameDay = (a, b) => dateKey(a) === dateKey(b);
export const isToday = (d) => isSameDay(d, new Date());

export const hora = (d) =>
  new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const diaMes = (d) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export const diaExtenso = (d) =>
  new Date(d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export const mesExtenso = (d) =>
  new Date(d).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Matriz 6x7 cobrindo o mês inteiro, começando no domingo */
export function gradeDoMes(referencia) {
  const primeiro = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const inicio = addDays(primeiro, -primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
}

/** "há 3 dias", "em 2 h", "agora" */
export function relativo(data, base = new Date()) {
  const diff = new Date(data) - base;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return 'agora';
  const texto =
    min < 60 ? `${min} min` : abs < 86400000 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} dia(s)`;
  return diff > 0 ? `em ${texto}` : `há ${texto}`;
}

export const moeda = (v) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
