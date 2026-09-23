// Vocabulário e regras de negócio do CRM NewPay Vendas Externas.
// Tudo que é "regra da operação" (pontuação, funil, níveis) mora
// aqui, para a API e a interface falarem a mesma língua.

/* ------------------------------------------------------------ calendário */

// Cada tipo carrega a paleta inteira: `color` para a marca (borda, ponto),
// `soft` para o fundo do bloco e `ink` para o texto sobre esse fundo — assim
// calendário, agenda e listas usam exatamente as mesmas cores.
export const EVENT_TYPES = {
  visita:      { label: 'Visita Comercial',    color: '#2563eb', soft: '#e7efff', ink: '#1d4ed8', dot: 'azul'     },
  interessado: { label: 'Cliente Interessado', color: '#16a34a', soft: '#e4f7ea', ink: '#15803d', dot: 'verde'    },
  followup:    { label: 'Follow-up',           color: '#eab308', soft: '#fdf4d8', ink: '#a16207', dot: 'amarelo'  },
  treinamento: { label: 'Treinamento',         color: '#9333ea', soft: '#f4e9fe', ink: '#7e22ce', dot: 'roxo'     },
  reuniao:     { label: 'Reunião Obrigatória', color: '#dc2626', soft: '#fde9e9', ink: '#b91c1c', dot: 'vermelho' },
  aviso:       { label: 'Aviso da Diretoria',  color: '#334155', soft: '#e9edf3', ink: '#334155', dot: 'preto'    },
};

export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES);
export const EVENT_STATUS = ['agendado', 'realizado', 'cancelado', 'nao_compareceu'];
export const TASK_KINDS = ['lembrete', 'tarefa', 'meta', 'compromisso'];
export const ANNOUNCEMENT_CATEGORIES = ['campanha', 'taxas', 'treinamento', 'meta', 'geral'];

export const RETURN_PRESETS = {
  amanha:  { label: 'Amanhã',    days: 1 },
  '3dias': { label: 'Em 3 dias', days: 3 },
  '7dias': { label: 'Em 7 dias', days: 7 },
};

/* --------------------------------------------------------------- cadastro */

export const SEGMENTOS = {
  mercadinho:          'Mercadinho',
  farmacia:            'Farmácia',
  material_construcao: 'Material de Construção',
  restaurante:         'Restaurante',
  lanchonete:          'Lanchonete',
  loja_roupas:         'Loja de Roupas',
  salao:               'Salão',
  oficina:             'Oficina',
  autonomo:            'Autônomo',
  outros:              'Outros',
};

/* ------------------------------------------------- tabelas de taxa ---- */
// A NewPay negocia por tabela, não por percentual solto: o vendedor escolhe
// qual tabela ofertou. Para incluir uma nova, basta acrescentar aqui — a lista
// vai para a interface pelo /api/meta.

export const TABELAS_TAXA = [
  '2mm',
  '3mm',
  'autos',
  'geral d0',
  'd0 retorno',
  'material de construção',
  'link12',
  'especial',
  '14m',
  '15m',
  '079',
];

/* --------------------------------------------- diagnóstico comercial */

export const MAQUINAS = {
  nao_possui:   'Não possui',
  ton:          'Ton',
  pagbank:      'PagBank',
  mercado_pago: 'Mercado Pago',
  stone:        'Stone',
  cielo:        'Cielo',
  rede:         'Rede',
  getnet:       'Getnet',
  outro:        'Outro',
};

export const FATURAMENTOS = {
  ate_5k:    { label: 'Até R$ 5 mil',          min: 0,     max: 5000   },
  '5k_10k':  { label: 'R$ 5 mil a R$ 10 mil',  min: 5000,  max: 10000  },
  '10k_30k': { label: 'R$ 10 mil a R$ 30 mil', min: 10000, max: 30000  },
  '30k_50k': { label: 'R$ 30 mil a R$ 50 mil', min: 30000, max: 50000  },
  acima_50k: { label: 'Acima de R$ 50 mil',    min: 50000, max: 120000 },
};

export const VOLUMES_CARTAO = {
  baixo: { label: 'Baixo', fator: 0.25 },
  medio: { label: 'Médio', fator: 0.45 },
  alto:  { label: 'Alto',  fator: 0.7 },
};

export const DORES = {
  taxas_altas:     'Taxas altas',
  demora_receber:  'Demora para receber',
  suporte_ruim:    'Suporte ruim',
  aluguel_maquina: 'Aluguel da máquina',
  sem_pix:         'Sem PIX',
  sem_tef:         'Sem TEF',
  outro:           'Outro',
};

export const INTERESSES = {
  imediato:  { label: 'Quer trocar imediatamente', pontos: 50 },
  avaliando: { label: 'Está avaliando',            pontos: 20 },
  sem_pressa:{ label: 'Sem pressa',                pontos: 5  },
  nao_quer:  { label: 'Não quer trocar agora',     pontos: 0  },
};

/**
 * Pontuação automática de oportunidade (0 a 100).
 * A régua é a da operação: máquina de concorrente, dor de taxa, faturamento
 * relevante e urgência de troca são o que realmente antecipa a venda.
 */
export const REGRAS_SCORE = [
  { chave: 'maquina_concorrente', label: 'Possui máquina de concorrente', pontos: 10 },
  { chave: 'dor_taxas',           label: 'Reclama das taxas',             pontos: 20 },
  { chave: 'faturamento_alto',    label: 'Fatura acima de R$ 10 mil',     pontos: 20 },
  { chave: 'interesse',           label: 'Quer trocar imediatamente',     pontos: 50 },
  { chave: 'volume_cartao',       label: 'Volume alto no cartão',         pontos: 10 },
  { chave: 'dores_extras',        label: 'Outras dores declaradas',       pontos: 5, porItem: true },
];

export function calcularScore(diagnostico = {}) {
  const { maquinaAtual, faturamento, volumeCartao, dores = [], interesse } = diagnostico;
  const detalhes = [];
  let total = 0;

  const soma = (chave, label, pontos) => {
    if (pontos <= 0) return;
    total += pontos;
    detalhes.push({ chave, label, pontos });
  };

  if (maquinaAtual && maquinaAtual !== 'nao_possui') {
    soma('maquina_concorrente', `Usa ${MAQUINAS[maquinaAtual] ?? 'outra máquina'}`, 10);
  }
  if (dores.includes('taxas_altas')) soma('dor_taxas', 'Reclama das taxas', 20);

  const faixa = FATURAMENTOS[faturamento];
  if (faixa && faixa.min >= 10000) {
    soma('faturamento_alto', `Fatura ${faixa.label.toLowerCase()}`, 20);
  }

  if (volumeCartao === 'alto') soma('volume_cartao', 'Volume alto no cartão', 10);
  else if (volumeCartao === 'medio') soma('volume_cartao', 'Volume médio no cartão', 5);

  const extras = dores.filter((d) => d !== 'taxas_altas');
  if (extras.length) {
    soma('dores_extras', extras.map((d) => DORES[d] ?? d).join(', '), Math.min(extras.length * 5, 15));
  }

  const interesseInfo = INTERESSES[interesse];
  if (interesseInfo?.pontos) soma('interesse', interesseInfo.label, interesseInfo.pontos);

  return { score: Math.min(100, total), detalhes };
}

export const TEMPERATURES = {
  frio:   { label: 'Frio',   min: 0,  max: 30,  score: 8,  cor: '#3b82f6' },
  morno:  { label: 'Morno',  min: 31, max: 60,  score: 22, cor: '#f59e0b' },
  quente: { label: 'Quente', min: 61, max: 100, score: 40, cor: '#dc2626' },
};

export const temperaturaPorScore = (score = 0) =>
  score >= 61 ? 'quente' : score >= 31 ? 'morno' : 'frio';

/* ------------------------------------------------------------------ funil */

export const FUNIL = {
  novo:       { label: 'Lead novo',  ordem: 1, cor: '#64748b' },
  contatado:  { label: 'Contatado',  ordem: 2, cor: '#0ea5e9' },
  proposta:   { label: 'Proposta',   ordem: 3, cor: '#8b5cf6' },
  negociacao: { label: 'Negociação', ordem: 4, cor: '#f59e0b' },
  fechado:    { label: 'Fechado',    ordem: 5, cor: '#16a34a' },
  perdido:    { label: 'Perdido',    ordem: 6, cor: '#dc2626' },
};

export const FUNIL_ATIVO = ['novo', 'contatado', 'proposta', 'negociacao', 'fechado'];

/**
 * Quem vale a pena visitar num dia. Cruza o que o CRM já sabe: oportunidade,
 * tempo sem contato, retorno prometido e a rota que o dia já tem.
 *
 * Devolve os pontos e, principalmente, os motivos — sugestao sem porque o
 * vendedor nao segue, e com razao: ele conhece a rua, o sistema nao.
 *
 * E aqui que se ajusta o peso de cada sinal.
 */
export function avaliarVisita(cliente, { diasSemContato = 0, followupVencido = false, cidadesDoDia = [] } = {}) {
  const motivos = [];
  let pontos = 0;

  // Oportunidade: metade da nota do diagnostico
  const score = Number(cliente.score) || 0;
  pontos += score * 0.5;
  if (score >= 70) motivos.push(`oportunidade ${score}`);

  // Retorno prometido e nao cumprido e o sinal mais forte que existe
  if (followupVencido) {
    pontos += 30;
    motivos.push('follow-up vencido');
  }

  // Esfriando: cada dia sem contato pesa, ate um mes
  if (diasSemContato >= 7) {
    pontos += Math.min(diasSemContato, 30) * 1.2;
    motivos.push(`${diasSemContato} dias sem contato`);
  }

  if (cliente.temperature === 'quente') {
    pontos += 12;
    motivos.push('lead quente');
  } else if (cliente.temperature === 'morno') {
    pontos += 5;
  }

  if (cliente.stage === 'proposta' || cliente.stage === 'negociacao') {
    pontos += 10;
    motivos.push(`${FUNIL[cliente.stage].label.toLowerCase()} em aberto`);
  }

  // Rota: se o dia ja leva o vendedor aquela cidade, o custo da visita e quase
  // zero. E o sinal que economiza estrada.
  if (cliente.city && cidadesDoDia.includes(cliente.city)) {
    pontos += 14;
    motivos.push(`ja vai a ${cliente.city}`);
  }

  return { pontos: Math.round(pontos), motivos };
}

/* --------------------------------------------------------------- visitas */

export const RESULTADOS_VISITA = {
  interessado:     { label: 'Interessado',      stage: 'negociacao', cor: '#16a34a', emoji: '😀' },
  nao_interessado: { label: 'Não interessado',  stage: 'perdido',    cor: '#dc2626', emoji: '🚫' },
  fechado:         { label: 'Fechado',          stage: 'fechado',    cor: '#0d9488', emoji: '🤝' },
  retornar:        { label: 'Retornar depois',  stage: 'contatado',  cor: '#eab308', emoji: '🔁' },
};

/* ------------------------------------------------ níveis do ranking ---- */
// A NewPay paga salário fixo ao vendedor externo: não existe cálculo de
// comissão aqui. O ranking é reconhecimento, medido em máquinas ativadas.

export const NIVEIS = [
  { chave: 'bronze',   label: 'Bronze',       emoji: '🥉', min: 0,  cor: '#b45309' },
  { chave: 'prata',    label: 'Prata',        emoji: '🥈', min: 5,  cor: '#64748b' },
  { chave: 'ouro',     label: 'Ouro',         emoji: '🥇', min: 10, cor: '#d97706' },
  { chave: 'diamante', label: 'Diamante',     emoji: '💎', min: 20, cor: '#0ea5e9' },
  { chave: 'elite',    label: 'Elite NewPay', emoji: '👑', min: 30, cor: '#7c3aed' },
];

export const nivelPorAtivacoes = (ativacoes = 0) =>
  [...NIVEIS].reverse().find((n) => ativacoes >= n.min) ?? NIVEIS[0];

export const proximoNivel = (ativacoes = 0) => NIVEIS.find((n) => ativacoes < n.min) ?? null;

/* --------------------------------------------------------- KPI diário */

export const KPIS_DIARIOS = [
  { chave: 'visitas',     label: 'Visitas realizadas',      emoji: '🎯', unidade: 'visitas' },
  { chave: 'novosLeads',  label: 'Novos leads cadastrados', emoji: '🆕', unidade: 'leads' },
  { chave: 'propostas',   label: 'Propostas enviadas',      emoji: '📄', unidade: 'propostas' },
  { chave: 'maquinas',    label: 'Máquinas vendidas',       emoji: '💳', unidade: 'máquinas' },
];

/* ------------------------------------------------------------ utilidades */

export const isCorporate = (event) => event.scope === 'corporativo';

export function reachesUser(event, userId) {
  if (event.ownerId === userId) return true;
  if (!isCorporate(event)) return false;
  if (event.audience === 'todos') return true;
  return Array.isArray(event.audienceIds) && event.audienceIds.includes(userId);
}

export function announcementReachesUser(announcement, userId) {
  if (announcement.audience === 'todos') return true;
  return Array.isArray(announcement.audienceIds) && announcement.audienceIds.includes(userId);
}
