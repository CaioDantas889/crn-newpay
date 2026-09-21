// Popula o banco com uma operação NewPay fictícia no interior do Ceará:
// carteira com diagnóstico comercial, funil, visitas registradas, vendas,
// metas, KPIs diários, biblioteca e central de objeções.
// Tudo é gerado a partir de "hoje", então os painéis nunca ficam vazios.

import fs from 'node:fs';
import { replace, id, DB_PATH } from './store.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import { addDays, atHour, dateKey, startOfDay } from './lib/dates.js';
import { TABELAS_TAXA, calcularScore, temperaturaPorScore } from './domain.js';

/* ------------------------------------------------- banco vazio (produção) */
// `npm run seed:vazio` cria o banco sem nenhum dado fictício: só o primeiro
// gestor, que entra com senha provisória e troca no primeiro acesso.
if (process.argv.includes('--vazio')) {
  const { criarBancoVazio } = await import('./bootstrap.js');
  const forcar = process.argv.includes('--force');

  if (!forcar && fs.existsSync(DB_PATH)) {
    console.error('[seed] já existe um banco. Use --force para substituir (os dados atuais somem).');
    process.exit(1);
  }

  const argumento = (nome) => {
    const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.slice(nome.length + 3) : '';
  };

  try {
    const admin = criarBancoVazio({
      nome: argumento('nome') || config.admin.nome,
      email: argumento('email') || config.admin.email,
      senha: argumento('senha') || config.admin.senha,
      cidade: argumento('cidade') || config.admin.cidade,
    });
    console.log(`[seed] banco vazio criado em ${DB_PATH}`);
    console.log(`[seed] primeiro acesso: ${admin.email} — troca de senha obrigatória`);
    console.log('[seed] cadastre a equipe pelo próprio CRM, em Equipe.');
  } catch (erro) {
    console.error(`[seed] ${erro.message}`);
    console.error('[seed] informe NEWPAY_ADMIN_EMAIL e NEWPAY_ADMIN_SENHA, ou --email= e --senha=');
    process.exit(1);
  }
  process.exit(0);
}

// PRNG com semente fixa -> mesmo conjunto de dados a cada seed
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260916);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => rnd() - 0.5).slice(0, n);
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p) => rnd() < p;

const CIDADES = {
  Iguatu: { lat: -6.3594, lng: -39.2986, regiao: 'Centro Sul' },
  Icó: { lat: -6.4011, lng: -38.8622, regiao: 'Vale do Salgado' },
  Cedro: { lat: -6.6069, lng: -39.0622, regiao: 'Centro Sul' },
  Jucás: { lat: -6.5183, lng: -39.5272, regiao: 'Centro Sul' },
  Acopiara: { lat: -6.0903, lng: -39.4528, regiao: 'Sertão Central' },
  'Várzea Alegre': { lat: -6.7894, lng: -39.2969, regiao: 'Cariri' },
  Orós: { lat: -6.2428, lng: -38.9114, regiao: 'Vale do Salgado' },
  Quixelô: { lat: -6.2469, lng: -39.2117, regiao: 'Centro Sul' },
};

const now = new Date();
const hoje = startOfDay(now);
const mesAtual = dateKey(hoje).slice(0, 7);
const iso = (d) => new Date(d).toISOString();

/* ---------------------------------------------------------------- usuários */

const senha = hashPassword('newpay123');
// Demonstração: senha conhecida, mas o app exige troca no primeiro acesso real.

const users = [
  {
    id: 'usr_gestor', name: 'Neto Almeida', email: 'gestor@newpay.com.br', password: senha,
    role: 'gestor', jobTitle: 'Gerente Comercial', city: 'Iguatu', phone: '(88) 99700-1000',
    color: '#0f172a', dailyGoal: 0, active: true,
    base: { lat: CIDADES.Iguatu.lat, lng: CIDADES.Iguatu.lng },
  },
  {
    id: 'usr_carlos', name: 'Carlos Mendes', email: 'carlos@newpay.com.br', password: senha,
    role: 'vendedor', jobTitle: 'Consultor Externo', city: 'Iguatu', phone: '(88) 99700-1001',
    color: '#2563eb', dailyGoal: 10, active: true,
    base: { lat: CIDADES.Iguatu.lat, lng: CIDADES.Iguatu.lng },
  },
  {
    id: 'usr_fernanda', name: 'Fernanda Lima', email: 'fernanda@newpay.com.br', password: senha,
    role: 'vendedor', jobTitle: 'Consultora Externa', city: 'Icó', phone: '(88) 99700-1002',
    color: '#db2777', dailyGoal: 8, active: true,
    base: { lat: CIDADES.Icó.lat, lng: CIDADES.Icó.lng },
  },
  {
    id: 'usr_rafael', name: 'Rafael Souza', email: 'rafael@newpay.com.br', password: senha,
    role: 'vendedor', jobTitle: 'Consultor Externo', city: 'Cedro', phone: '(88) 99700-1003',
    color: '#ea580c', dailyGoal: 8, active: true,
    base: { lat: CIDADES.Cedro.lat, lng: CIDADES.Cedro.lng },
  },
  {
    id: 'usr_juliana', name: 'Juliana Castro', email: 'juliana@newpay.com.br', password: senha,
    role: 'vendedor', jobTitle: 'Consultora Externa', city: 'Várzea Alegre', phone: '(88) 99700-1004',
    color: '#0d9488', dailyGoal: 9, active: true,
    base: { lat: CIDADES['Várzea Alegre'].lat, lng: CIDADES['Várzea Alegre'].lng },
  },
];

const vendedores = users.filter((u) => u.role === 'vendedor');

/* ------------------------------------------------------------------ metas */

const METAS = { usr_carlos: 25, usr_fernanda: 20, usr_rafael: 18, usr_juliana: 22 };

const goals = vendedores.flatMap((v) =>
  [0, -1].map((delta) => {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() + delta, 1);
    return {
      id: id('gol'),
      userId: v.id,
      mes: dateKey(ref).slice(0, 7),
      metaMaquinas: METAS[v.id] + (delta === 0 ? 0 : -2),
      metaVisitasDia: v.dailyGoal,
    };
  })
);

/* --------------------------------------------------------------- clientes */

const NOMES = [
  ['João Batista', 'Mercadinho São João', 'mercadinho'],
  ['Maria Ferreira', 'Boutique Maria Chic', 'loja_roupas'],
  ['Antônio Nunes', 'Posto Nunes Combustíveis', 'outros'],
  ['Luciana Alves', 'Farmácia Vida Nova', 'farmacia'],
  ['Pedro Henrique', 'Mercado Central', 'mercadinho'],
  ['Sandra Rocha', 'Padaria Pão Quente', 'lanchonete'],
  ['Marcos Vieira', 'Auto Peças Vieira', 'oficina'],
  ['Rita Cássia', 'Salão Rita Beleza', 'salao'],
  ['José Adriano', 'Depósito Adriano Materiais', 'material_construcao'],
  ['Carla Beatriz', 'Pet Shop Amigo Fiel', 'outros'],
  ['Francisco Gomes', 'Restaurante Sabor do Sertão', 'restaurante'],
  ['Tatiane Moura', 'Ótica Visão Clara', 'outros'],
  ['Edson Carvalho', 'Loja Carvalho Móveis', 'outros'],
  ['Patrícia Dias', 'Clínica Odonto Sorriso', 'outros'],
  ['Wesley Barros', 'Lanchonete do Wesley', 'lanchonete'],
  ['Aline Ramos', 'Distribuidora Ramos Bebidas', 'mercadinho'],
  ['Gilberto Lopes', 'Supermercado Lopes', 'mercadinho'],
  ['Nara Siqueira', 'Ateliê Nara Costuras', 'loja_roupas'],
  ['Cícero Matos', 'Borracharia Matos', 'oficina'],
  ['Helena Prado', 'Livraria Prado', 'outros'],
  ['Damião Sales', 'Construart Materiais', 'material_construcao'],
  ['Vanessa Lima', 'Drogaria Popular', 'farmacia'],
  ['Railson Costa', 'Pizzaria Forno de Barro', 'restaurante'],
  ['Socorro Teixeira', 'Mercadinho da Socorro', 'mercadinho'],
  ['Alan Ribeiro', 'Barbearia Alan Style', 'salao'],
  ['Cleide Martins', 'Moda Cleide Confecções', 'loja_roupas'],
  ['Ivan Pereira', 'Oficina do Ivan', 'oficina'],
  ['Marlene Duarte', 'Marlene Doces Caseiros', 'autonomo'],
];

const MAQUINAS_CONCORRENTES = ['ton', 'pagbank', 'mercado_pago', 'stone', 'cielo', 'rede', 'getnet'];
const FAIXAS = ['ate_5k', '5k_10k', '10k_30k', '30k_50k', 'acima_50k'];
const DORES_LISTA = ['taxas_altas', 'demora_receber', 'suporte_ruim', 'aluguel_maquina', 'sem_pix', 'sem_tef'];
const INTERESSES_LISTA = ['imediato', 'avaliando', 'sem_pressa', 'nao_quer'];

const clients = NOMES.map(([name, company, segment], i) => {
  const cidade = i % 3 === 0 ? 'Iguatu' : pick(Object.keys(CIDADES));
  const c = CIDADES[cidade];
  const dono = vendedores[i % vendedores.length];

  const temMaquina = chance(0.72);
  const diagnostico = {
    maquinaAtual: temMaquina ? pick(MAQUINAS_CONCORRENTES) : 'nao_possui',
    faturamento: pick(FAIXAS),
    volumeCartao: pick(['baixo', 'medio', 'alto', 'alto']),
    dores: pickN(DORES_LISTA, int(0, 3)),
    interesse: pick(INTERESSES_LISTA),
    taxaAtual: temMaquina ? Number((2.5 + rnd() * 2.5).toFixed(2)) : null,
    observacoes: '',
    preenchidoAt: iso(addDays(now, -int(1, 60))),
  };

  const { score } = calcularScore(diagnostico);
  const temperature = temperaturaPorScore(score);
  const diasSemContato = temperature === 'quente' ? int(0, 6) : int(2, 24);

  // O funil acompanha a temperatura: lead quente costuma estar mais à frente
  const stage = score >= 75
    ? pick(['negociacao', 'proposta', 'fechado'])
    : score >= 50
      ? pick(['contatado', 'proposta', 'negociacao'])
      : score >= 30
        ? pick(['novo', 'contatado', 'contatado'])
        : pick(['novo', 'novo', 'perdido']);

  return {
    id: `cli_${String(i + 1).padStart(2, '0')}`,
    name,
    company,
    segment,
    cnpj: chance(0.8)
      ? `${int(10, 48)}.${int(100, 999)}.${int(100, 999)}/0001-${int(10, 99)}`
      : '',
    phone: `(88) 9${int(8000, 9999)}-${int(1000, 9999)}`,
    whatsapp: `(88) 9${int(8000, 9999)}-${int(1000, 9999)}`,
    city: cidade,
    region: c.regiao,
    address: `Rua ${pick(['São José', 'Principal', 'do Comércio', 'Dom Pedro', 'das Flores'])}, ${int(10, 900)} — Centro`,
    lat: Number((c.lat + (rnd() - 0.5) * 0.05).toFixed(5)),
    lng: Number((c.lng + (rnd() - 0.5) * 0.05).toFixed(5)),
    ownerId: dono.id,
    diagnostico,
    score,
    temperature,
    stage,
    machines: stage === 'fechado' ? int(1, 3) : 0,
    lastContactAt: iso(addDays(now, -diasSemContato)),
    notes: '',
    createdAt: iso(addDays(now, -int(5, 150))),
  };
});

const clientesDe = (userId) => clients.filter((c) => c.ownerId === userId);

/* ------------------------------------------------- visitas registradas */

const visits = [];
const RESULTADOS = ['interessado', 'nao_interessado', 'fechado', 'retornar'];

for (let d = -45; d <= 0; d++) {
  const dia = addDays(hoje, d);
  if (dia.getDay() === 0) continue;

  vendedores.forEach((v) => {
    const meus = clientesDe(v.id);
    const qtd = d === 0 ? int(0, 2) : dia.getDay() === 6 ? int(0, 2) : int(2, 6);
    for (let i = 0; i < qtd; i++) {
      const cli = pick(meus);
      const resultado = chance(0.15) ? 'fechado' : pick(RESULTADOS);
      visits.push({
        id: id('vst'),
        clientId: cli.id,
        userId: v.id,
        at: iso(atHour(dia, int(8, 17), pick([0, 15, 30, 45]))),
        resultado,
        notes: {
          interessado: 'Cliente gostou da proposta de taxa. Pediu simulação por escrito.',
          nao_interessado: 'Cliente tem contrato vigente com a concorrente.',
          fechado: 'Fechado na hora. Máquina entregue e cadastro enviado.',
          retornar: 'Dono não estava. Voltar na próxima semana.',
        }[resultado],
        fotos: [],
        audio: null,
        lat: cli.lat,
        lng: cli.lng,
        duracaoMin: int(10, 50),
      });
    }
  });
}

/* ------------------------------------------------- propostas e vendas */

const deals = [];

for (const cli of clients) {
  if (!['proposta', 'negociacao', 'fechado'].includes(cli.stage)) continue;

  const propostaEm = addDays(now, -int(2, 50));
  const maquinas = cli.stage === 'fechado' ? Math.max(1, cli.machines) : int(1, 3);

  const fechado = cli.stage === 'fechado';
  const ativado = fechado && chance(0.8);

  deals.push({
    id: id('deal'),
    clientId: cli.id,
    userId: cli.ownerId,
    maquinas,
    taxaOfertada: pick(TABELAS_TAXA),
    status: ativado ? 'ativado' : fechado ? 'fechado' : cli.stage === 'negociacao' ? 'negociacao' : 'proposta',
    propostaAt: iso(propostaEm),
    fechamentoAt: fechado ? iso(addDays(propostaEm, int(1, 10))) : null,
    ativacaoAt: ativado ? iso(addDays(propostaEm, int(2, 14))) : null,
    notes: '',
    createdAt: iso(propostaEm),
  });
}

// Garante volume de vendas no mês corrente para o dashboard e o ranking
for (const v of vendedores) {
  const meus = clientesDe(v.id);
  const extras = v.id === 'usr_carlos' ? 7 : v.id === 'usr_fernanda' ? 6 : int(3, 5);
  for (let i = 0; i < extras; i++) {
    const cli = pick(meus);
    const quando = addDays(hoje, -int(0, hoje.getDate() - 1));
    const maquinas = int(1, 2);
    deals.push({
      id: id('deal'),
      clientId: cli.id,
      userId: v.id,
      maquinas,
      taxaOfertada: pick(TABELAS_TAXA),
      status: chance(0.75) ? 'ativado' : 'fechado',
      propostaAt: iso(addDays(quando, -int(1, 6))),
      fechamentoAt: iso(quando),
      ativacaoAt: iso(addDays(quando, 1)),
      notes: '',
      createdAt: iso(quando),
    });
  }
}

/* ------------------------------------------------------- KPIs diários */

const dailyKpis = [];
for (let d = -30; d <= -1; d++) {
  const dia = addDays(hoje, d);
  if (dia.getDay() === 0) continue;
  const chave = dateKey(dia);

  vendedores.forEach((v) => {
    // Um vendedor esquece de fechar o dia de vez em quando — isso aparece no painel
    if (v.id === 'usr_rafael' && chance(0.35)) return;

    const visitasDoDia = visits.filter((x) => x.userId === v.id && dateKey(x.at) === chave);
    const vendasDoDia = deals.filter(
      (x) => x.userId === v.id && x.fechamentoAt && dateKey(x.fechamentoAt) === chave
    );

    dailyKpis.push({
      id: id('kpi'),
      userId: v.id,
      date: chave,
      visitas: visitasDoDia.length,
      novosLeads: int(0, 3),
      propostas: deals.filter((x) => x.userId === v.id && dateKey(x.propostaAt) === chave).length,
      maquinas: vendasDoDia.reduce((s, x) => s + x.maquinas, 0),
      fechadoAt: iso(atHour(dia, 18, int(0, 59))),
    });
  });
}

/* ------------------------------------------------------------- eventos */

const events = [];
const confirmations = [];

function addEvent(data) {
  const ev = {
    id: id('evt'),
    scope: 'pessoal',
    status: 'agendado',
    audience: null,
    audienceIds: [],
    requiresConfirmation: false,
    clientId: null,
    location: '',
    notes: '',
    checkinAt: null,
    outcome: null,
    createdAt: iso(addDays(now, -2)),
    createdBy: data.ownerId ?? 'usr_gestor',
    ...data,
  };
  events.push(ev);
  return ev;
}

const slot = (day, hour, minute, dur) => {
  const start = atHour(day, hour, minute);
  return { start: iso(start), end: iso(new Date(start.getTime() + dur * 60000)) };
};

const joao = clients.find((c) => c.name === 'João Batista');
const maria = clients.find((c) => c.name === 'Maria Ferreira');
const mercadoCentral = clients.find((c) => c.company === 'Mercado Central');

const reuniaoGeral = addEvent({
  title: 'Reunião Comercial NewPay', type: 'reuniao', scope: 'corporativo', audience: 'todos',
  requiresConfirmation: true, ownerId: null, createdBy: 'usr_gestor',
  location: 'Escritório Iguatu — Sala 1',
  notes: 'Alinhamento de metas da semana e resultados do mês.',
  ...slot(hoje, 8, 0, 60),
});
addEvent({
  title: 'Visita Cliente João', type: 'visita', ownerId: 'usr_carlos', clientId: joao.id,
  location: `${joao.company} — ${joao.city}`, notes: 'Levar maquininha NewSmart para demonstração.',
  ...slot(hoje, 9, 30, 60),
});
addEvent({
  title: 'Follow-up Maria', type: 'followup', ownerId: 'usr_carlos', clientId: maria.id,
  location: 'Telefone', notes: 'Retornar sobre a proposta de taxa enviada.',
  ...slot(hoje, 11, 0, 30),
});
addEvent({
  title: 'Proposta Mercado Central', type: 'interessado', ownerId: 'usr_carlos',
  clientId: mercadoCentral.id, location: `${mercadoCentral.company} — ${mercadoCentral.city}`,
  notes: 'Cliente pediu simulação para 3 maquininhas.',
  ...slot(hoje, 14, 0, 60),
});
const treinamento = addEvent({
  title: 'Treinamento Nova Campanha', type: 'treinamento', scope: 'corporativo', audience: 'todos',
  requiresConfirmation: true, ownerId: null, createdBy: 'usr_gestor',
  location: 'Online — Google Meet', notes: 'Campanha Semana do Cliente: taxas e argumentário.',
  ...slot(hoje, 16, 0, 60),
});
addEvent({
  title: 'Encerramento do Dia', type: 'aviso', ownerId: 'usr_carlos',
  notes: 'Fechar os KPIs do dia no CRM e enviar resumo ao gestor.',
  ...slot(hoje, 18, 0, 30),
});

vendedores
  .filter((v) => v.id !== 'usr_carlos')
  .forEach((v, vi) => {
    const meus = clientesDe(v.id);
    const qtd = vi === 2 ? 1 : int(2, 4);
    for (let i = 0; i < qtd; i++) {
      const cli = meus[(i + vi) % meus.length];
      addEvent({
        title: `${i % 2 === 0 ? 'Visita' : 'Follow-up'} ${cli.name.split(' ')[0]}`,
        type: i % 2 === 0 ? 'visita' : 'followup',
        ownerId: v.id, clientId: cli.id, location: `${cli.company} — ${cli.city}`,
        ...slot(hoje, 9 + i * 2, 0, 60),
      });
    }
  });

const atrasado = clientesDe('usr_carlos')[3];
addEvent({
  title: `Follow-up ${atrasado.name.split(' ')[0]}`, type: 'followup', ownerId: 'usr_carlos',
  clientId: atrasado.id, location: 'Telefone', notes: 'Cliente pediu para retornar depois do dia 10.',
  ...slot(addDays(hoje, -1), 15, 0, 30),
});

for (let d = -20; d <= 20; d++) {
  if (d === 0) continue;
  const dia = addDays(hoje, d);
  if (dia.getDay() === 0) continue;

  vendedores.forEach((v) => {
    const meus = clientesDe(v.id);
    const qtd = dia.getDay() === 6 ? int(0, 1) : int(1, 3);
    for (let i = 0; i < qtd; i++) {
      const cli = pick(meus);
      const tipo = pick(['visita', 'visita', 'followup', 'interessado']);
      const hora = pick([8, 9, 10, 11, 14, 15, 16, 17]);
      const passado = d < 0;
      const rotulo = tipo === 'visita' ? 'Visita' : tipo === 'followup' ? 'Follow-up' : 'Proposta';
      addEvent({
        title: `${rotulo} ${cli.name.split(' ')[0]}`,
        type: tipo, ownerId: v.id, clientId: cli.id,
        location: `${cli.company} — ${cli.city}`,
        status: passado ? pick(['realizado', 'realizado', 'realizado', 'cancelado']) : 'agendado',
        checkinAt: passado ? iso(atHour(dia, hora, int(0, 20))) : null,
        ...slot(dia, hora, 0, 60),
      });
    }
  });
}

addEvent({
  title: 'Reunião Geral NewPay', type: 'reuniao', scope: 'corporativo', audience: 'todos',
  requiresConfirmation: true, ownerId: null, createdBy: 'usr_gestor',
  location: 'Escritório Iguatu — Auditório',
  notes: 'Resultados do mês e lançamento da campanha ExpoAgro.',
  ...slot(addDays(hoje, 4), 8, 0, 120),
});
addEvent({
  title: 'Treinamento Obrigatório — Maquininha NewSmart', type: 'treinamento', scope: 'corporativo',
  audience: 'todos', requiresConfirmation: true, ownerId: null, createdBy: 'usr_gestor',
  location: 'Online — Google Meet', notes: 'Presença obrigatória. Duração de 90 minutos.',
  ...slot(addDays(hoje, 9), 19, 0, 90),
});
addEvent({
  title: 'Feirão ExpoAgro — Plantão NewPay', type: 'aviso', scope: 'corporativo',
  audience: 'selecionados', audienceIds: ['usr_carlos', 'usr_juliana'],
  requiresConfirmation: true, ownerId: null, createdBy: 'usr_gestor',
  location: 'Parque de Exposições — Iguatu', notes: 'Escala de plantão no estande da NewPay.',
  ...slot(addDays(hoje, 12), 8, 0, 480),
});

[
  { eventId: reuniaoGeral.id, userId: 'usr_carlos', status: 'confirmado' },
  { eventId: reuniaoGeral.id, userId: 'usr_fernanda', status: 'confirmado' },
  { eventId: reuniaoGeral.id, userId: 'usr_rafael', status: 'recusado' },
  { eventId: treinamento.id, userId: 'usr_fernanda', status: 'confirmado' },
].forEach((c) =>
  confirmations.push({
    id: id('cfm'), ...c,
    note: c.status === 'recusado' ? 'Estou em rota em Icó.' : '',
    respondedAt: iso(addDays(now, -1)),
  })
);

/* -------------------------------------------------------------- tarefas */

const tasks = [
  { ownerId: 'usr_carlos', title: 'Retornar José às 15h', kind: 'lembrete', dueAt: iso(atHour(hoje, 15, 0)) },
  { ownerId: 'usr_carlos', title: 'Buscar contrato assinado', kind: 'tarefa', dueAt: iso(atHour(hoje, 17, 0)) },
  { ownerId: 'usr_carlos', title: 'Entregar maquininha NewSmart', kind: 'tarefa', dueAt: iso(atHour(hoje, 10, 30)) },
  { ownerId: 'usr_carlos', title: 'Visitar 10 clientes hoje', kind: 'meta', dueAt: iso(atHour(hoje, 18, 0)) },
  { ownerId: 'usr_carlos', title: 'Fechar os KPIs do dia', kind: 'meta', dueAt: iso(atHour(hoje, 18, 30)) },
  { ownerId: 'usr_fernanda', title: 'Conferir estoque de bobinas', kind: 'tarefa', dueAt: iso(atHour(hoje, 12, 0)) },
  { ownerId: 'usr_fernanda', title: 'Visitar 8 clientes hoje', kind: 'meta', dueAt: iso(atHour(hoje, 18, 0)) },
  { ownerId: 'usr_rafael', title: 'Atualizar diagnóstico dos clientes de Cedro', kind: 'tarefa', dueAt: iso(atHour(hoje, 16, 0)) },
  { ownerId: 'usr_juliana', title: 'Levar material da campanha para Várzea Alegre', kind: 'tarefa', dueAt: iso(atHour(hoje, 8, 30)) },
].map((t, i) => ({
  id: id('tsk'),
  done: i === 2,
  doneAt: i === 2 ? iso(atHour(hoje, 10, 45)) : null,
  clientId: null,
  createdAt: iso(addDays(now, -1)),
  ...t,
}));

/* --------------------------------------------------------------- avisos */

const announcements = [
  {
    title: 'Nova campanha da Semana do Cliente',
    body: 'De 20 a 27/09 toda maquininha NewSmart sai com taxa promocional de 0,99% no débito e 1,89% no crédito à vista. O material de divulgação já está na Biblioteca Comercial. Meta: 3 ativações por vendedor.',
    category: 'campanha', priority: 'alta',
  },
  {
    title: 'Alteração de taxas — vigência imediata',
    body: 'A tabela de crédito parcelado de 7 a 12x foi ajustada. Baixe a nova tabela na Biblioteca antes de enviar qualquer proposta. Propostas com a tabela antiga não serão honradas.',
    category: 'taxas', priority: 'alta',
  },
  {
    title: 'Treinamento obrigatório sexta-feira',
    body: 'Treinamento da nova maquininha NewSmart às 19h, online. Presença obrigatória para toda a equipe comercial. Confirme presença pela agenda.',
    category: 'treinamento', priority: 'alta',
  },
  {
    title: 'Meta especial da ExpoAgro',
    body: 'Durante a ExpoAgro cada ativação vale pontos em dobro no ranking. O primeiro colocado leva bônus de R$ 1.500,00.',
    category: 'meta', priority: 'normal',
  },
].map((a, i) => ({
  id: id('avs'),
  audience: 'todos', audienceIds: [], requiresAck: true, createdBy: 'usr_gestor',
  createdAt: iso(addDays(now, -i)),
  expiresAt: iso(addDays(now, 20 - i)),
  ...a,
}));

const announcementReads = [
  { announcementId: announcements[0].id, userId: 'usr_fernanda' },
  { announcementId: announcements[1].id, userId: 'usr_fernanda' },
  { announcementId: announcements[1].id, userId: 'usr_juliana' },
].map((r) => ({ id: id('red'), ...r, readAt: iso(addDays(now, -1)) }));

/* --------------------------------------------------- biblioteca comercial */

const library = [
  { tipo: 'video', categoria: 'abordagem', titulo: 'Como abordar o lojista em 30 segundos', descricao: 'A abertura que funciona no comércio de rua: o que falar antes de mostrar a maquininha.', duracao: '4 min', url: 'https://www.youtube.com/results?search_query=abordagem+vendas+maquininha' },
  { tipo: 'video', categoria: 'venda', titulo: 'Demonstração da NewSmart passo a passo', descricao: 'Como demonstrar PIX, débito, crédito e TEF na frente do cliente.', duracao: '7 min', url: 'https://www.youtube.com/results?search_query=demonstracao+maquininha+cartao' },
  { tipo: 'video', categoria: 'objecoes', titulo: 'Quebrando as 5 objeções mais comuns', descricao: '"Está caro", "vou pensar", "já tenho máquina", "vou falar com meu sócio" e "depois eu vejo".', duracao: '9 min', url: 'https://www.youtube.com/results?search_query=quebra+de+objecoes+vendas' },
  { tipo: 'pdf', categoria: 'taxas', titulo: 'Tabela oficial de taxas NewPay', descricao: 'Débito, crédito à vista e parcelado 2x a 12x. Versão vigente.', paginas: 2, url: '#' },
  { tipo: 'pdf', categoria: 'comparativo', titulo: 'Comparativo NewPay x concorrentes', descricao: 'Ton, PagBank, Mercado Pago, Stone e Cielo lado a lado: taxa, prazo e aluguel.', paginas: 3, url: '#' },
  { tipo: 'pdf', categoria: 'argumentario', titulo: 'Argumentário de campo', descricao: 'Perguntas de diagnóstico, gatilhos e fechamento para cada segmento.', paginas: 6, url: '#' },
  { tipo: 'pdf', categoria: 'campanha', titulo: 'Arte da Semana do Cliente', descricao: 'Material de divulgação para enviar no WhatsApp do lojista.', paginas: 1, url: '#' },
].map((m) => ({ id: id('lib'), ...m, createdAt: iso(addDays(now, -int(1, 40))) }));

/* ----------------------------------------------------- central de objeções */

const objections = [
  {
    objecao: 'Está caro',
    quando: 'Cliente compara a taxa com a máquina atual.',
    resposta: 'Entendo. A sua taxa hoje é {taxa_atual}% e a da NewPay é {taxa_newpay}%. Pega o extrato do mês passado e faz a conta comigo: em cada R$ 1.000 que passa no cartão, essa diferença fica no seu caixa. Quer que eu faça essa conta agora com o seu número?',
    dicas: ['Faça a conta na frente do cliente', 'Fale em reais por mês, nunca em percentual', 'Mostre o comparativo da Biblioteca'],
    categoria: 'preco',
  },
  {
    objecao: 'Vou pensar',
    quando: 'Cliente evita decidir na hora.',
    resposta: 'Claro, decisão de custo tem que ser pensada mesmo. Só me diz uma coisa para eu não te atrapalhar: o que ainda falta ficar claro, a taxa ou o prazo de recebimento? Se for só isso, eu resolvo agora e você decide com tudo na mão.',
    dicas: ['Nunca aceite o "vou pensar" sem descobrir a real objeção', 'Marque o retorno na agenda antes de sair', 'Deixe a simulação impressa ou no WhatsApp'],
    categoria: 'adiamento',
  },
  {
    objecao: 'Já tenho máquina',
    quando: 'Cliente já usa concorrente.',
    resposta: 'Ótimo, então você já conhece o serviço. A NewPay não precisa substituir a sua: coloca do lado, sem aluguel e sem fidelidade. Você passa uma semana usando as duas e fica com a que te paga melhor. Se a minha não for melhor, eu mesmo venho buscar.',
    dicas: ['Ofereça a máquina como segunda opção, não como troca', 'Sem aluguel e sem fidelidade derruba o risco', 'Volte em 7 dias para comparar os extratos'],
    categoria: 'concorrencia',
  },
  {
    objecao: 'Preciso falar com meu sócio',
    quando: 'Decisão compartilhada.',
    resposta: 'Perfeito, decisão boa é decisão alinhada. Vamos fazer assim: eu deixo a simulação pronta com os dois cenários e a gente marca 10 minutos amanhã com ele junto. Prefere de manhã ou no fim da tarde?',
    dicas: ['Nunca deixe sem data', 'Ofereça duas opções de horário', 'Registre o retorno na agenda na hora'],
    categoria: 'adiamento',
  },
  {
    objecao: 'A maquininha demora para cair o dinheiro',
    quando: 'Cliente teve má experiência com prazo.',
    resposta: 'Esse é justamente o ponto que mais ouço aqui na região. Na NewPay o débito cai em 1 dia útil e o crédito você escolhe: 30 dias sem custo ou antecipação na hora com taxa fechada. Você prefere receber mais rápido ou pagar menos?',
    dicas: ['Deixe o cliente escolher o modelo', 'Mostre o app com o extrato'],
    categoria: 'recebimento',
  },
  {
    objecao: 'Não confio em marca que não conheço',
    quando: 'Cliente desconfia da bandeira.',
    resposta: 'Justo. A NewPay opera com as mesmas bandeiras e a mesma segurança do mercado, e aqui na região já são {clientes_ativos} lojistas usando. Quer que eu te mostre dois clientes aqui perto que você conhece?',
    dicas: ['Cite clientes da mesma rua ou segmento', 'Mostre fotos de instalações na região'],
    categoria: 'confianca',
  },
].map((o) => ({ id: id('obj'), ...o }));

/* ------------------------------------------------------------- gravação */

const force = process.argv.includes('--force');
if (!force && fs.existsSync(DB_PATH)) {
  console.log('[seed] banco já existe, nada a fazer. Use "npm run seed" para recriar.');
  process.exit(0);
}

replace({
  users, clients, events, confirmations, tasks, announcements, announcementReads,
  notificationState: [], activity: [], visits, deals, goals, dailyKpis, library, objections,
});

console.log(`[seed] banco criado em ${DB_PATH}`);
console.log(
  `[seed] ${users.length} usuários · ${clients.length} clientes · ${events.length} eventos · ` +
  `${visits.length} visitas · ${deals.length} negócios · ${dailyKpis.length} KPIs diários`
);
console.log(`[seed] hoje = ${dateKey(hoje)} | login: carlos@newpay.com.br / newpay123`);
