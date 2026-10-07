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

/* --------------------------------------------- venda e ativação ---- */
// O que o CRM guarda da maquininha que o cliente comprou: modelo e número de
// série (um por máquina). A lista de modelos é a da NewPay — ajuste aqui e ela
// chega à interface pelo /api/meta.

export const MODELOS_MAQUINA = {
  smart: 'Smart',
  pro:   'Pro',
  mini:  'Mini',
  link:  'Link de pagamento',
};

export const ATIVACAO = {
  // Venda sem ativação acima disso fica vermelha na tela "Hoje" e no painel
  prazoDias: 7,
  // Ativação declarada pelo vendedor só entra na meta e no ranking depois que
  // a gestão confirma. false = conta na hora.
  exigeConfirmacao: true,
};

export const STATUS_NEGOCIO = {
  proposta:   { label: 'Proposta',   cor: '#8b5cf6' },
  negociacao: { label: 'Negociação', cor: '#f59e0b' },
  fechado:    { label: 'Vendida',    cor: '#16a34a' },
  ativado:    { label: 'Ativada',    cor: '#0d9488' },
  perdido:    { label: 'Perdida',    cor: '#dc2626' },
};

/** A ativação deste negócio já conta na meta e no ranking? */
export const ativacaoConta = (negocio) =>
  negocio?.status === 'ativado' && (!ATIVACAO.exigeConfirmacao || Boolean(negocio.ativacaoConfirmadaAt));

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

  // No cadastro rápido o vendedor informa só o que passa no cartão: quem passa
  // R$ 10 mil no cartão fatura pelo menos isso.
  const faixa = FATURAMENTOS[faturamento] ?? FATURAMENTOS[diagnostico.faturamentoCartao];
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

// Lista fixa do resultado da visita: vale para o cadastro do lead, para a
// revisita e para a conclusão de qualquer follow-up. A chave "fechado" (rótulo
// "Fechou") é a mesma de antes, então venda continua abrindo negócio igual.
// `stage: null` não mexe no funil; `encerraCadencia` para o motor de follow-up.
export const RESULTADOS_VISITA = {
  fechado:     { label: 'Fechou',      stage: 'fechado',    temperatura: null,     cor: '#0d9488', emoji: '★', encerraCadencia: true },
  quente:      { label: 'Quente',      stage: 'negociacao', temperatura: 'quente', cor: '#dc2626', emoji: '▲' },
  morno:       { label: 'Morno',       stage: 'contatado',  temperatura: 'morno',  cor: '#f59e0b', emoji: '●' },
  frio:        { label: 'Frio',        stage: 'contatado',  temperatura: 'frio',   cor: '#3b82f6', emoji: '○' },
  sem_cnpj:    { label: 'Sem CNPJ',    stage: 'perdido',    temperatura: null,     cor: '#64748b', emoji: '⊘', encerraCadencia: true },
  nao_atendeu: { label: 'Não atendeu', stage: null,         temperatura: null,     cor: '#868f9b', emoji: '◌' },
};

// Visitas gravadas antes da lista fixa: continuam aparecendo com o nome antigo.
// `novo` é para onde a API manda quem ainda envia a chave antiga (app aberto
// numa versão anterior).
export const RESULTADOS_VISITA_ANTIGOS = {
  interessado:     { label: 'Interessado',     stage: 'negociacao', cor: '#16a34a', emoji: '✓', novo: 'quente' },
  nao_interessado: { label: 'Não interessado', stage: 'perdido',    cor: '#dc2626', emoji: '✕', novo: 'frio' },
  retornar:        { label: 'Retornar depois', stage: 'contatado',  cor: '#eab308', emoji: '↻', novo: 'nao_atendeu' },
};

export const resultadoVisita = (chave) =>
  RESULTADOS_VISITA[chave] ?? RESULTADOS_VISITA_ANTIGOS[chave] ?? null;

// Visita produtiva é a que deixa o lojista mais perto de comprar
export const RESULTADOS_PRODUTIVOS = ['fechado', 'quente', 'interessado'];
export const RESULTADOS_PERDIDOS = ['sem_cnpj', 'nao_interessado'];

/**
 * Etapa do funil depois de um resultado. Só anda para a frente — "Morno" num
 * cliente em proposta não devolve ele para "contatado". Fechado e perdido
 * valem sempre, e cliente perdido que voltou a conversar sai de "perdido".
 */
export function etapaDepoisDe(atual, alvo) {
  if (!alvo || alvo === atual) return atual;
  if (alvo === 'fechado' || alvo === 'perdido' || atual === 'perdido') return alvo;
  return (FUNIL[alvo]?.ordem ?? 0) > (FUNIL[atual]?.ordem ?? 0) ? alvo : atual;
}

/**
 * O vendedor disse "quente"? A pontuação fica dentro da faixa que ele
 * declarou, para a bolinha de score e a temperatura não se contradizerem.
 * O diagnóstico completo, quando preenchido, recalcula do zero.
 */
export function scoreNaFaixa(score, temperatura) {
  const faixa = TEMPERATURES[temperatura];
  if (!faixa) return score;
  return Math.min(faixa.max, Math.max(faixa.min, Number(score) || 0));
}

/* ------------------------------------------------- meta diária de leads -- */
// Três regras resumem a operação: a meta não pode ser esquecida, a visita não
// pode ser inventada e o lead não pode morrer. Os números delas moram aqui.

export const META_LEADS = {
  total: 30,          // leads novos por dia
  minPresenciais: 20, // dos 30, no mínimo 20 com visita
  maxRemotos: 10,     // remoto acima disso fica salvo, mas não soma
  fimDoDia: 18,       // "quanto tempo resta no dia": até o resumo das 18h
};

// Domingo não tem meta, semáforo nem lembrete de ritmo
export const ehDiaDeTrabalho = (d) => new Date(d).getDay() !== 0;

export const ORIGENS_LEAD = {
  presencial: { label: 'Presencial', descricao: 'Visita na loja', prova: 'GPS + horário + foto da fachada' },
  remoto:     { label: 'Remoto',     descricao: 'Indicação ou WhatsApp', prova: 'CNPJ válido + print da conversa' },
};

export const CANAIS_REMOTO = {
  indicacao: 'Indicação',
  whatsapp:  'Contato WhatsApp',
};

export const DECLARACAO_REMOTO =
  'Declaro que este contato é real, foi abordado por mim e autorizou o contato da NewPay.';

export const AVISO_FANTASMA = 'Lead fantasma = falta grave. Todo lead pode ser auditado.';

// Presencial nasce validado: a prova (GPS, horário, foto) vem no cadastro.
// Remoto nasce pendente e só valida com CNPJ ativo + print com resposta.
export const STATUS_LEAD = {
  validado: { label: 'Validado', contaNaMeta: true,  cor: '#0f9d63' },
  pendente: { label: 'Pendente', contaNaMeta: false, cor: '#868f9b' },
  suspeito: { label: 'Suspeito', contaNaMeta: false, cor: '#d97706' },
  fantasma: { label: 'Fantasma', contaNaMeta: false, cor: '#dc2626' },
};

// Remoto validado vira suspeito (e sai da contagem) quando abandona o
// follow-up ou não sai do lugar no funil.
export const SUSPEITA_REMOTO = {
  diasFollowupAtrasado: 7,
  diasSemAvanco: 30,
};

/* ----------------------------------------------------- motor de follow-up */
// Todo lead que não fechou gera a próxima tarefa sozinho, contada a partir do
// cadastro. A cadência para quando o lead fecha, vira "Sem CNPJ" ou fantasma.

export const CADENCIA = [
  { etapa: 'd1',  dia: 1,  acao: 'whatsapp',      label: 'WhatsApp com a comparação de taxa', apoio: 'Modelo de mensagem pronto, 1 clique' },
  { etapa: 'd3',  dia: 3,  acao: 'ligacao',       label: 'Ligação',                           apoio: 'Botão de ligar + roteiro curto' },
  { etapa: 'd7',  dia: 7,  acao: 'revisita',      label: 'Revisita',                          apoio: 'Endereço e rota no mapa' },
  { etapa: 'd15', dia: 15, acao: 'resgate',       label: 'Resgate',                           apoio: 'Modelo de mensagem de retomada' },
  { etapa: 'd30', dia: 30, acao: 'resgate_final', label: 'Resgate final',                     apoio: 'Lead vai para "frio" se não avançar' },
];

export const HORA_FOLLOWUP = 9; // horário padrão da tarefa quando o lojista não marcou

// Crédito à vista da campanha vigente: base da comparação de taxa
export const TAXA_NEWPAY = 1.89;

export const MODELOS_MENSAGEM = {
  comparacao:
    'Olá, {nome}! Aqui é {vendedor}, da NewPay. Como combinamos, fiz a comparação para a {empresa}: {comparacao} ' +
    'Posso passar aí para te mostrar a maquininha?',
  retomada:
    'Olá, {nome}! Aqui é {vendedor}, da NewPay. Passando para retomar nossa conversa sobre a maquininha da {empresa}. ' +
    'Esta semana consegui uma condição boa para você. Tem 5 minutos para eu te mostrar?',
};

export const ROTEIRO_LIGACAO = [
  'Apresente-se: "Oi, {nome}, aqui é {vendedor}, da NewPay. Estive aí na {empresa}."',
  'Lembre a dor: "Você comentou da taxa da {maquina}. Te mandei a comparação no WhatsApp, deu para ver?"',
  'Descubra o que falta: "O que te impede de testar a NewPay do lado da máquina que você já tem?"',
  'Feche o próximo passo: dia e hora para levar a maquininha. Registre o resultado aqui no CRM.',
];

/* ------------------------------------------------- semáforo do gestor ---- */

export const SEMAFORO = {
  vermelho: { label: 'Vermelho', ordem: 1, cor: '#dc2626' },
  amarelo:  { label: 'Amarelo',  ordem: 2, cor: '#d97706' },
  verde:    { label: 'Verde',    ordem: 3, cor: '#0f9d63' },
};

export const REGRAS_SEMAFORO = {
  minLeadsAmarelo: 20,     // abaixo disso, vermelho
  maxAtrasadosAmarelo: 5,  // acima disso, vermelho
  maxPctSuspeitos: 30,     // % de remotos suspeitos acima disso, vermelho
  // Suspeita só aparece 7 dias depois do cadastro, então o percentual olha os
  // remotos em acompanhamento (cadência de 30 dias), não só os da semana.
  janelaSuspeitosDias: 30,
  janelaFantasmaDias: 7,   // fantasma confirmado nos últimos 7 dias pinta de vermelho
};

/**
 * Cor do dia de um vendedor e o porquê. Vermelho é avaliado primeiro: basta
 * uma condição. Verde exige tudo. O resto é amarelo.
 */
export function corDoSemaforo({ leads, presenciais, atrasados, pctSuspeitos, fantasmas }) {
  const r = REGRAS_SEMAFORO;
  const vermelhos = [];
  if (leads < r.minLeadsAmarelo) vermelhos.push(`${leads} leads (mínimo ${r.minLeadsAmarelo})`);
  if (atrasados > r.maxAtrasadosAmarelo) vermelhos.push(`${atrasados} follow-ups atrasados`);
  if (pctSuspeitos > r.maxPctSuspeitos) vermelhos.push(`${pctSuspeitos}% dos remotos suspeitos`);
  if (fantasmas > 0) vermelhos.push(`${fantasmas} lead(s) fantasma confirmado(s)`);
  if (vermelhos.length) return { cor: 'vermelho', motivos: vermelhos };

  const verde =
    leads >= META_LEADS.total && presenciais >= META_LEADS.minPresenciais && atrasados === 0;
  if (verde) return { cor: 'verde', motivos: ['meta completa e follow-up em dia'] };

  const motivos = [];
  if (leads < META_LEADS.total) motivos.push(`${leads} de ${META_LEADS.total} leads`);
  else if (presenciais < META_LEADS.minPresenciais) {
    motivos.push(`${presenciais} presenciais (mínimo ${META_LEADS.minPresenciais})`);
  }
  if (atrasados > 0) motivos.push(`${atrasados} follow-up(s) atrasado(s)`);
  return { cor: 'amarelo', motivos };
}

/* ------------------------------------------------- alertas de suspeita --- */
// Alerta não bloqueia nada: aponta para o gestor olhar. Os limites ficam aqui
// para calibrar com a rua (galeria de lojas tem vizinho a menos de 30 m).

export const ALERTAS_SUSPEITA = {
  raioMesmoPontoM: 30,
  minVisitasMesmoPonto: 3,      // "várias visitas no mesmo ponto"
  minutosEntreVisitas: 3,
  raioRegiaoKmPadrao: 60,       // região do vendedor: raio em volta da base
  minRemotosSemVenda: 5,        // remotos com conversão zero enquanto presencial converte
  remotosEmSequencia: 4,        // tantos remotos...
  minutosSequenciaRemotos: 10,  // ...dentro desta janela
  distanciaPrintParecido: 16,   // bits diferentes (de 256) para print "muito parecido"
};

export const TIPOS_ALERTA = {
  gps_mesmo_ponto:   'Várias visitas no mesmo ponto',
  intervalo_curto:   'Visitas com menos de 3 minutos',
  fora_da_regiao:    'Visita fora da região',
  gps_impreciso:     'GPS impreciso',
  sem_gps:           'Revisita sem GPS',
  conversao_remota:  'Remotos sem conversão',
  print_repetido:    'Print repetido',
  print_parecido:    'Print muito parecido',
  remotos_sequencia: 'Remotos em sequência',
};

/* ------------------------------------------------- lembretes de ritmo ---- */
// Avaliados a cada consulta da central (sem job em segundo plano). Cada
// lembrete vale do seu horário até o próximo; o das 11h e o das 15h somem
// sozinhos quando o vendedor recupera o ritmo.

export const LEMBRETES_RITMO = [
  { hora: 8,  ate: 11, chave: '8h' },
  { hora: 11, ate: 15, chave: '11h', abaixoDe: 8 },
  { hora: 15, ate: 18, chave: '15h', abaixoDe: 18 },
  { hora: 18, ate: 24, chave: '18h' },
];

export const HORA_RESUMO_GESTOR = 19;

/* ------------------------------------------------------------ auditoria -- */

export const AUDITORIA = {
  remotosPorVendedor: 3,
  presenciaisPorVendedor: 1,
};

export const RESULTADOS_AUDITORIA = {
  confirmado:    { label: 'Confirmado' },
  nao_reconhece: { label: 'Não reconhece o contato' },
};

// Ponto de partida para a gestão: o texto oficial é da NewPay e substitui este
// pela tela de Auditoria antes de publicar.
export const TERMO_CONDUTA_MODELO = `MODELO — substitua pelo texto oficial da NewPay antes de publicar.

TERMO DE CONDUTA DO VENDEDOR EXTERNO

1. Todo lead cadastrado no CRM corresponde a um contato real, feito por mim, com um comerciante que autorizou o contato da NewPay.
2. A visita presencial é registrada no local, com GPS, horário e foto da fachada tirada na hora pela câmera do aplicativo.
3. O lead remoto é registrado com CNPJ ativo e com o print da conversa em que o lojista responde.
4. Estou ciente de que qualquer lead pode ser auditado pela NewPay, por telefone, a qualquer momento.
5. Lead fantasma (contato inventado, duplicado de propósito ou não reconhecido pelo lojista) é falta grave e pode levar a advertência, perda de bonificação ou rescisão, conforme o contrato.`;

/* ------------------------------------------------ níveis do ranking ---- */
// A NewPay paga salário fixo ao vendedor externo: não existe cálculo de
// comissão aqui. O ranking é reconhecimento, medido em máquinas ativadas.

export const NIVEIS = [
  { chave: 'bronze',   label: 'Bronze',       emoji: '◔', min: 0,  cor: '#b45309' },
  { chave: 'prata',    label: 'Prata',        emoji: '◑', min: 5,  cor: '#64748b' },
  { chave: 'ouro',     label: 'Ouro',         emoji: '◕', min: 10, cor: '#d97706' },
  { chave: 'diamante', label: 'Diamante',     emoji: '◆', min: 20, cor: '#0ea5e9' },
  { chave: 'elite',    label: 'Elite NewPay', emoji: '★', min: 30, cor: '#7c3aed' },
];

export const nivelPorAtivacoes = (ativacoes = 0) =>
  [...NIVEIS].reverse().find((n) => ativacoes >= n.min) ?? NIVEIS[0];

export const proximoNivel = (ativacoes = 0) => NIVEIS.find((n) => ativacoes < n.min) ?? null;

/* --------------------------------------------------------- KPI diário */

export const KPIS_DIARIOS = [
  { chave: 'visitas',     label: 'Visitas realizadas',      emoji: '→', unidade: 'visitas' },
  { chave: 'novosLeads',  label: 'Novos leads cadastrados', emoji: '⊕', unidade: 'leads' },
  { chave: 'propostas',   label: 'Propostas enviadas',      emoji: '▭', unidade: 'propostas' },
  { chave: 'maquinas',    label: 'Máquinas vendidas',       emoji: '◰', unidade: 'máquinas' },
];

/* ------------------------------------------------------------ expediente */

// Margem de erro (em metros) acima da qual a batida de ponto não diz a rua:
// o aparelho estimou a posição pela antena ou pelo IP em vez de usar o GPS.
// Computador sem GPS chega a ±50 km — e o endereço dessa estimativa pode cair
// em outra cidade. O gestor vê a batida marcada como imprecisa.
export const PRECISAO_MAXIMA_PONTO_M = 500;

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
