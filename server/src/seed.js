// Popula o banco com uma operação NewPay fictícia no interior do Ceará:
// carteira com diagnóstico comercial, funil, visitas registradas, vendas,
// metas, KPIs diários, biblioteca e central de objeções.
// Tudo é gerado a partir de "hoje", então os painéis nunca ficam vazios.

import fs from 'node:fs';
import { replace, id, DB_PATH } from './store.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';
import path from 'node:path';
import { addDays, atHour, dateKey, startOfDay } from './lib/dates.js';
import {
  CADENCIA, DECLARACAO_REMOTO, HORA_FOLLOWUP, MODELOS_MAQUINA, RESULTADOS_VISITA, TABELAS_TAXA,
  calcularScore, ehDiaDeTrabalho, scoreNaFaixa, temperaturaPorScore,
} from './domain.js';
import { UPLOAD_DIR } from './lib/uploads.js';
import { formatarCnpj } from './lib/cnpj.js';
import { segundaDe } from './auditoria.js';

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

// Onboarding: faz as ligações da auditoria semanal
users.push({
  id: 'usr_onboarding', name: 'Paula Freitas', email: 'onboarding@newpay.com.br', password: senha,
  role: 'onboarding', jobTitle: 'Onboarding', city: 'Iguatu', phone: '(88) 99700-1005',
  color: '#7c3aed', dailyGoal: 0, active: true,
  base: { lat: CIDADES.Iguatu.lat, lng: CIDADES.Iguatu.lng },
});

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
    stageChangedAt: iso(addDays(now, -diasSemContato)),
    notes: '',
    createdAt: iso(addDays(now, -int(5, 150))),
  };
});

const clientesDe = (userId) => clients.filter((c) => c.ownerId === userId);

/* ------------------------------------------------- visitas registradas */

const visits = [];
const RESULTADOS = ['quente', 'morno', 'frio', 'nao_atendeu', 'sem_cnpj'];

// Os últimos dias ficam para os leads com prova (mais abaixo): revisita
// sorteada no mesmo horário de um lead acenderia alerta de "menos de 3 minutos".
for (let d = -45; d <= -5; d++) {
  const dia = addDays(hoje, d);
  if (dia.getDay() === 0) continue;

  vendedores.forEach((v) => {
    const meus = clientesDe(v.id);
    const qtd = dia.getDay() === 6 ? int(0, 2) : int(2, 6);
    for (let i = 0; i < qtd; i++) {
      const cli = pick(meus);
      const resultado = chance(0.15) ? 'fechado' : pick(RESULTADOS);
      visits.push({
        id: id('vst'),
        clientId: cli.id,
        userId: v.id,
        // Uma visita por hora, registrada perto da base do vendedor: histórico
        // limpo, sem acender alerta de suspeita na demonstração
        at: iso(atHour(dia, 8 + i, pick([0, 15, 30, 45]))),
        tipo: 'revisita',
        resultado,
        notes: {
          quente: 'Cliente gostou da proposta de taxa. Pediu simulação por escrito.',
          morno: 'Quer comparar com a máquina atual antes de decidir.',
          frio: 'Cliente tem contrato vigente com a concorrente.',
          fechado: 'Fechado na hora. Máquina entregue e cadastro enviado.',
          nao_atendeu: 'Dono não estava. Voltar na próxima semana.',
          sem_cnpj: 'Vende como pessoa física, sem CNPJ.',
        }[resultado],
        fotos: [],
        audio: null,
        lat: Number((v.base.lat + (rnd() - 0.5) * 0.04).toFixed(5)),
        lng: Number((v.base.lng + (rnd() - 0.5) * 0.04).toFixed(5)),
        precisao: int(8, 30),
        duracaoMin: int(10, 50),
      });
    }
  });
}

/* ------------------------------------------------- propostas e vendas */

const deals = [];

// Ativação antiga já vem confirmada pela gestão; uma ou outra fica
// "declarada", esperando o painel do gestor.
const modeloDemo = () => pick(Object.keys(MODELOS_MAQUINA));
const ativacaoDemo = (ativado, ativacaoAt, userId) => {
  if (!ativado) return {};
  const confirmada = chance(0.85);
  return {
    ativacaoDeclaradaAt: ativacaoAt,
    ativacaoDeclaradaPor: userId,
    ativacaoConfirmadaAt: confirmada ? ativacaoAt : null,
    ativacaoConfirmadaPor: confirmada ? 'usr_gestor' : null,
  };
};

for (const cli of clients) {
  if (!['proposta', 'negociacao', 'fechado'].includes(cli.stage)) continue;

  const propostaEm = addDays(now, -int(2, 50));
  const maquinas = cli.stage === 'fechado' ? Math.max(1, cli.machines) : int(1, 3);

  const fechado = cli.stage === 'fechado';
  const ativado = fechado && chance(0.8);
  const ativacaoAt = ativado ? iso(addDays(propostaEm, int(2, 14))) : null;

  deals.push({
    id: id('deal'),
    clientId: cli.id,
    userId: cli.ownerId,
    maquinas,
    taxaOfertada: pick(TABELAS_TAXA),
    modelo: modeloDemo(),
    status: ativado ? 'ativado' : fechado ? 'fechado' : cli.stage === 'negociacao' ? 'negociacao' : 'proposta',
    propostaAt: iso(propostaEm),
    fechamentoAt: fechado ? iso(addDays(propostaEm, int(1, 10))) : null,
    ativacaoAt,
    ...ativacaoDemo(ativado, ativacaoAt, cli.ownerId),
    notes: '',
    createdAt: iso(propostaEm),
  });
}

// Garante volume de vendas no mês corrente para o dashboard e o ranking.
// Cliente que tinha proposta aberta: é ela que vira a venda (um registro só).
for (const v of vendedores) {
  const meus = clientesDe(v.id);
  const extras = v.id === 'usr_carlos' ? 7 : v.id === 'usr_fernanda' ? 6 : int(3, 5);
  for (let i = 0; i < extras; i++) {
    const cli = pick(meus);
    const quando = addDays(hoje, -int(0, hoje.getDate() - 1));
    const ativado = chance(0.75);
    const ativacaoAt = iso(addDays(quando, 1));
    const aberta = deals.find((d) => d.clientId === cli.id && ['proposta', 'negociacao'].includes(d.status));
    const maquinas = aberta?.maquinas ?? int(1, 2);
    const venda = {
      maquinas,
      status: ativado ? 'ativado' : 'fechado',
      fechamentoAt: iso(quando),
      ativacaoAt: ativado ? ativacaoAt : null,
      ...ativacaoDemo(ativado, ativacaoAt, v.id),
    };
    // Quem comprou está em "fechado" no funil, com as máquinas na ficha
    cli.stage = 'fechado';
    cli.stageChangedAt = iso(quando);
    cli.machines = (cli.machines || 0) + maquinas;
    if ('cadenciaEncerrada' in cli && !cli.cadenciaEncerrada) cli.cadenciaEncerrada = 'fechado';
    if (aberta) {
      Object.assign(aberta, venda);
      continue;
    }
    deals.push({
      id: id('deal'),
      clientId: cli.id,
      userId: v.id,
      taxaOfertada: pick(TABELAS_TAXA),
      modelo: modeloDemo(),
      propostaAt: iso(addDays(quando, -int(1, 6))),
      notes: '',
      createdAt: iso(quando),
      ...venda,
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
        title: `${i % 2 === 0 ? 'Visita' : 'Proposta'} ${cli.name.split(' ')[0]}`,
        type: i % 2 === 0 ? 'visita' : 'interessado',
        ownerId: v.id, clientId: cli.id, location: `${cli.company} — ${cli.city}`,
        ...slot(hoje, 9 + i * 2, 0, 60),
      });
    }
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
      const tipo = pick(['visita', 'visita', 'visita', 'interessado']);
      const hora = pick([8, 9, 10, 11, 14, 15, 16, 17]);
      const passado = d < 0;
      const rotulo = tipo === 'visita' ? 'Visita' : 'Proposta';
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

/* ------------------------------ meta diária, follow-up e anti-fantasma */
// A operação de 30 leads por dia, com prova, e a cadência de follow-up.
// Cada vendedor tem um perfil, para o semáforo do gestor mostrar as três cores:
//   Juliana  — já bateu a meta de hoje, follow-up em dia
//   Fernanda — abaixo da meta, com alguns follow-ups atrasados
//   Carlos   — a conta de demonstração: dia em andamento (9 presenciais · 3 remotos)
//   Rafael   — poucos leads e os sinais clássicos de lead fantasma

const followups = [];
const whatsappAberturas = [];
const sorteiosAuditoria = [];
const auditorias = [];
const ocorrencias = [];

// Um arquivo só serve de foto e de print em toda a demonstração
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.writeFileSync(path.join(UPLOAD_DIR, 'demo_anexo.png'), Buffer.from(PIXEL, 'base64'));
const ANEXO_DEMO = '/uploads/demo_anexo.png';

const hex = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

/** CNPJ com dígitos verificadores corretos, para a demonstração passar na validação */
function cnpjDemo(n) {
  const base = `${String(21000000 + n * 137).padStart(8, '0')}0001`;
  const dv = (digitos) => {
    let peso = digitos.length - 7;
    let soma = 0;
    for (const d of digitos) {
      soma += Number(d) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(base);
  return formatarCnpj(`${base}${d1}${dv(`${base}${d1}`)}`);
}

const COMERCIOS = ['Mercadinho', 'Farmácia', 'Padaria', 'Lanchonete', 'Salão', 'Oficina', 'Depósito', 'Bazar', 'Açougue', 'Sorveteria', 'Pet Shop', 'Ótica', 'Barbearia', 'Papelaria', 'Restaurante'];
const COMPLEMENTOS = ['do Zé', 'Central', 'Popular', 'São Francisco', 'da Praça', 'Bom Preço', 'Nova Era', 'do Povo', 'Sertão', 'Avenida', 'Santa Luzia', 'Progresso', 'Esperança', 'do Vale', 'Ideal'];
const DONOS = ['José', 'Maria', 'Antônio', 'Francisca', 'Paulo', 'Ana', 'Raimundo', 'Luzia', 'Pedro', 'Socorro', 'Cícero', 'Vera', 'João', 'Rita', 'Marcos'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Alves', 'Pereira', 'Gomes', 'Costa', 'Ribeiro', 'Martins'];
const SEGMENTO_DO_COMERCIO = {
  Mercadinho: 'mercadinho', Farmácia: 'farmacia', Padaria: 'lanchonete', Lanchonete: 'lanchonete',
  Salão: 'salao', Oficina: 'oficina', Depósito: 'material_construcao', Barbearia: 'salao',
  Restaurante: 'restaurante',
};

let sequencial = clients.length;
const inicioDeHoje = startOfDay(now);

function criarLead({ v, quando, origem, resultado = null, validado = true, print = null, ponto = null, precisao = null }) {
  sequencial += 1;
  const n = sequencial;
  const cidade = CIDADES[v.city];
  const presencial = origem === 'presencial';
  const comercio = pick(COMERCIOS);
  const criado = iso(quando);

  const diagnostico = {
    maquinaAtual: presencial ? (chance(0.75) ? pick(MAQUINAS_CONCORRENTES) : 'nao_possui') : null,
    faturamento: null,
    faturamentoCartao: presencial ? pick(FAIXAS) : null,
    volumeCartao: null,
    dores: [],
    interesse: null,
    taxaAtual: presencial && chance(0.4) ? Number((2.6 + rnd() * 2).toFixed(2)) : null,
    observacoes: '',
    preenchidoAt: null,
  };

  let { score } = calcularScore(diagnostico);
  let temperature = temperaturaPorScore(score);
  const meta = RESULTADOS_VISITA[resultado];
  if (meta?.temperatura) {
    temperature = meta.temperatura;
    score = scoreNaFaixa(score, temperature);
  }

  const lat = ponto?.lat ?? Number((cidade.lat + (rnd() - 0.5) * 0.03).toFixed(6));
  const lng = ponto?.lng ?? Number((cidade.lng + (rnd() - 0.5) * 0.03).toFixed(6));
  const fone = `(88) 97${String(n).padStart(3, '0')}-${1000 + n}`;
  const anexo = (hash) => ({ url: ANEXO_DEMO, tipo: 'image/png', tamanho: 70, hash });

  const lead = {
    id: `cli_${String(n).padStart(3, '0')}`,
    name: `${pick(DONOS)} ${pick(SOBRENOMES)}`,
    company: `${comercio} ${pick(COMPLEMENTOS)}`,
    segment: SEGMENTO_DO_COMERCIO[comercio] ?? 'outros',
    cnpj: presencial ? '' : cnpjDemo(n),
    phone: fone,
    whatsapp: fone,
    city: v.city,
    region: cidade.regiao,
    address: `Rua ${pick(['São José', 'Principal', 'do Comércio', 'Dom Pedro', 'das Flores'])}, ${int(10, 900)} — Centro`,
    lat: presencial ? lat : cidade.lat,
    lng: presencial ? lng : cidade.lng,
    ownerId: v.id,
    cadastradoPor: v.id,
    diagnostico,
    score,
    temperature,
    stage: meta?.stage ?? 'novo',
    stageChangedAt: criado,
    machines: 0,
    lastContactAt: criado,
    notes: '',
    createdAt: criado,

    origem,
    canal: presencial ? null : pick(['whatsapp', 'whatsapp', 'indicacao']),
    indicadoPor: null,
    razaoSocial: presencial ? '' : `${comercio.toUpperCase()} ${n} LTDA`,
    cnpjInfo: presencial
      ? null
      : { ok: true, cnpj: cnpjDemo(n), razaoSocial: `${comercio.toUpperCase()} ${n} LTDA`, situacao: 'ATIVA', ativa: true, fonte: 'receita', consultadoAt: criado },
    declaracao: presencial ? null : { texto: DECLARACAO_REMOTO, at: criado, userId: v.id, login: v.email },
    prova: presencial ? { lat, lng, precisao: precisao ?? int(6, 28), at: criado, foto: anexo(`fachada-${n}`) } : null,
    print: print ? { ...anexo(print.hash ?? `print-${n}`), assinatura: print.assinatura ?? hex(64), comResposta: true, at: criado } : null,
    validadoAt: presencial || (validado && print) ? criado : null,
    validadoPor: presencial ? 'visita' : validado && print ? 'print' : null,
    whatsappIniciadoAt: presencial ? null : iso(new Date(new Date(quando).getTime() - 20 * 60000)),
    leadStatus: null,
    ultimoResultado: resultado,
    cadenciaInicio: criado,
    cadenciaEtapa: null,
    cadenciaDeslocamento: 0,
    cadenciaEncerrada: meta?.encerraCadencia ? resultado : null,
    followupPendenteDesde: null,
  };
  if (lead.canal === 'indicacao') lead.indicadoPor = pick(clientesDe(v.id)).id;

  clients.push(lead);

  if (presencial) {
    visits.push({
      id: id('vst'), clientId: lead.id, userId: v.id, at: criado, tipo: 'lead', resultado,
      notes: '', fotos: [lead.prova.foto], audio: null, lat, lng, precisao: lead.prova.precisao,
      duracaoMin: null, eventId: null,
    });
  }
  if (resultado === 'fechado') venderPara(lead, quando);
  return lead;
}

function venderPara(lead, quando) {
  lead.stage = 'fechado';
  lead.stageChangedAt = iso(quando);
  lead.machines = 1;
  lead.cadenciaEncerrada = 'fechado';
  deals.push({
    id: id('deal'), clientId: lead.id, userId: lead.ownerId, maquinas: 1, taxaOfertada: pick(TABELAS_TAXA),
    modelo: modeloDemo(),
    status: 'fechado', propostaAt: iso(quando), fechamentoAt: iso(quando), ativacaoAt: null,
    notes: '', createdAt: iso(quando),
  });
}

/**
 * Monta a cadência de um lead como ela estaria hoje. `disciplina` é a chance
 * de cada passo vencido ter resultado: 1 = follow-up em dia.
 */
function cadenciaDemo(lead, { disciplina, feitosHoje = disciplina }) {
  if (lead.cadenciaEncerrada) return;
  const remoto = lead.origem === 'remoto';

  for (const passo of CADENCIA) {
    let vence = atHour(addDays(startOfDay(lead.createdAt), passo.dia), HORA_FOLLOWUP);
    if (!ehDiaDeTrabalho(vence)) vence = addDays(vence, 1);
    lead.cadenciaEtapa = passo.etapa;

    const tarefa = {
      id: id('fup'), clientId: lead.id, userId: lead.ownerId, etapa: passo.etapa, acao: passo.acao,
      dueAt: iso(vence), marcadoPeloLojista: false, reagendamentos: 0, status: 'pendente',
      doneAt: null, resultado: null, notes: '', print: null, visitId: null, createdAt: lead.createdAt,
    };
    followups.push(tarefa);

    const venceHoje = vence >= inicioDeHoje && vence <= now;
    const feito = vence < inicioDeHoje ? chance(disciplina) : venceHoje && chance(feitosHoje);
    if (!feito) {
      lead.followupPendenteDesde = tarefa.dueAt;
      return;
    }

    const fechou = remoto && lead.ownerId !== 'usr_rafael' && chance(0.12);
    const feitoEm = new Date(Math.min(vence.getTime() + int(10, 240) * 60000, now.getTime() - 60000));
    tarefa.status = 'feito';
    tarefa.doneAt = iso(feitoEm);
    tarefa.resultado = fechou ? 'fechado' : pick(['morno', 'morno', 'frio', 'nao_atendeu', 'quente']);
    tarefa.concluidoPor = lead.ownerId;
    if (remoto) tarefa.print = { url: ANEXO_DEMO, hash: `fup-${tarefa.id}`, assinatura: hex(64), comResposta: true, at: tarefa.doneAt };
    lead.ultimoResultado = tarefa.resultado;
    if (tarefa.resultado !== 'nao_atendeu') lead.lastContactAt = tarefa.doneAt;

    if (fechou) return venderPara(lead, feitoEm);
  }
  lead.cadenciaEncerrada = 'fim';
}

const RESULTADOS_DE_RUA = ['quente', 'morno', 'morno', 'frio', 'frio', 'nao_atendeu', 'sem_cnpj', 'fechado'];

/** Um dia inteiro de trabalho, com as visitas espalhadas das 8h às 17h30 */
function diaDeLeads(v, dia, presenciais, remotos) {
  const leads = [];
  const passo = 560 / presenciais;
  for (let i = 0; i < presenciais; i++) {
    const quando = new Date(atHour(dia, 8, 10).getTime() + (i * passo + rnd() * (passo - 5)) * 60000);
    leads.push(criarLead({ v, quando, origem: 'presencial', resultado: pick(RESULTADOS_DE_RUA) }));
  }
  for (let i = 0; i < remotos; i++) {
    const quando = new Date(atHour(dia, 8, 40).getTime() + (i * (520 / remotos) + rnd() * 12) * 60000);
    leads.push(criarLead({ v, quando, origem: 'remoto', print: {} }));
  }
  return leads;
}

/** O dia de hoje, contado de trás para frente a partir de agora */
function leadsDeHoje(v, presenciais, remotos, { pendentes = 0 } = {}) {
  const total = presenciais + remotos + pendentes;
  const minutosDeRua = Math.max(90, (now - atHour(now, 7, 45)) / 60000);
  const passo = Math.max(5, Math.min(18, minutosDeRua / total));
  const leads = [];
  for (let i = 0; i < total; i++) {
    const quando = new Date(Math.max(now.getTime() - (4 + i * passo + rnd() * 2) * 60000, inicioDeHoje.getTime() + (total - i) * 60000));
    const remoto = i % 3 === 2 && leads.filter((l) => l.origem === 'remoto').length < remotos + pendentes;
    const semPrint = remoto && leads.filter((l) => l.origem === 'remoto' && !l.print).length < pendentes;
    leads.push(
      remoto
        ? criarLead({ v, quando, origem: 'remoto', print: semPrint ? null : {} })
        : criarLead({ v, quando, origem: 'presencial', resultado: pick(RESULTADOS_DE_RUA) })
    );
  }
  return leads;
}

// Os três últimos dias de expediente antes de hoje
const diasAnteriores = [];
for (let d = 1; diasAnteriores.length < 3; d++) {
  const dia = addDays(inicioDeHoje, -d);
  if (ehDiaDeTrabalho(dia)) diasAnteriores.push(dia);
}

const PERFIS = {
  usr_juliana:  { ontem: [22, 9],  hoje: [22, 9],  disciplina: 1,    feitosHoje: 1 },
  usr_carlos:   { ontem: [22, 9],  hoje: [9, 3],   disciplina: 1,    feitosHoje: 0.9, pendentes: 1 },
  usr_fernanda: { ontem: [17, 6],  hoje: [17, 6],  disciplina: 0.98, feitosHoje: 0.9 },
  usr_rafael:   { ontem: [8, 3],   hoje: [2, 0],   disciplina: 0.55, feitosHoje: 0.3 },
};

const leadsAnteriores = {};
for (const v of vendedores) {
  const perfil = PERFIS[v.id];
  leadsAnteriores[v.id] = diasAnteriores.flatMap((dia) => diaDeLeads(v, dia, ...perfil.ontem));
  const hojeLeads = leadsDeHoje(v, ...perfil.hoje, { pendentes: perfil.pendentes });
  for (const lead of [...leadsAnteriores[v.id], ...hojeLeads]) cadenciaDemo(lead, perfil);
}

/* -- Rafael: o que o painel do gestor precisa enxergar -------------------- */
const rafael = vendedores.find((v) => v.id === 'usr_rafael');
const perfilRafael = PERFIS.usr_rafael;
const minutosAtras = (m) => new Date(Math.max(now.getTime() - m * 60000, inicioDeHoje.getTime() + 60000));

// Três "visitas" no mesmo ponto, com dois minutos entre uma e outra
const pontoUnico = { lat: Number((CIDADES.Cedro.lat + 0.004).toFixed(6)), lng: Number((CIDADES.Cedro.lng - 0.003).toFixed(6)) };
[58, 56, 54].forEach((m, i) =>
  cadenciaDemo(
    criarLead({
      v: rafael, quando: minutosAtras(m), origem: 'presencial', resultado: 'morno',
      ponto: { lat: pontoUnico.lat + i * 0.00004, lng: pontoUnico.lng },
    }),
    perfilRafael
  )
);

// Cinco remotos em seis minutos — dois com o mesmo print e dois quase iguais
const assinaturaBase = hex(64);
const quaseIgual = `${assinaturaBase.slice(0, 62)}${assinaturaBase.slice(62) === 'ff' ? '00' : 'ff'}`;
[
  { m: 40, print: { hash: 'print-reaproveitado' } },
  { m: 39, print: { hash: 'print-reaproveitado' } },
  { m: 37, print: { assinatura: assinaturaBase } },
  { m: 36, print: { assinatura: quaseIgual } },
  { m: 34, print: {} },
].forEach(({ m, print }) =>
  cadenciaDemo(criarLead({ v: rafael, quando: minutosAtras(m), origem: 'remoto', print }), perfilRafael)
);

// Remotos de 9 a 12 dias atrás com o follow-up parado: viram "suspeito"
for (const [v, quantos] of [[rafael, 6], [vendedores.find((x) => x.id === 'usr_fernanda'), 1]]) {
  for (let i = 0; i < quantos; i++) {
    const lead = criarLead({ v, quando: atHour(addDays(inicioDeHoje, -(9 + (i % 4))), 10 + i, 15), origem: 'remoto', print: {} });
    cadenciaDemo(lead, { disciplina: 0 });
  }
}

/* -- Auditoria da semana: a fila do onboarding ---------------------------- */
const semana = dateKey(segundaDe(now));
const sorteio = {
  id: id('srt'), semana, de: iso(addDays(segundaDe(now), -7)), ate: iso(addDays(segundaDe(now), -1)),
  at: iso(atHour(segundaDe(now), 6, 0)), manual: false, feitoPor: null, total: 0,
};
sorteiosAuditoria.push(sorteio);

const auditar = (lead, extra = {}) => {
  auditorias.push({
    id: id('aud'), sorteioId: sorteio.id, semana, clientId: lead.id, vendedorId: lead.ownerId,
    origem: lead.origem, status: 'pendente', resultadoAt: null, auditorId: null, notes: '',
    createdAt: sorteio.at, ...extra,
  });
  sorteio.total += 1;
  return auditorias[auditorias.length - 1];
};

for (const v of vendedores) {
  const urna = leadsAnteriores[v.id];
  [
    ...pickN(urna.filter((l) => l.origem === 'remoto' && l.validadoAt), 3),
    ...pickN(urna.filter((l) => l.origem === 'presencial'), 1),
  ].forEach((lead) => auditar(lead));
}

// Uma ligação já feita em cada sentido: um confirmado e um fantasma
const confirmada = auditorias.find((a) => a.vendedorId === 'usr_carlos');
Object.assign(confirmada, {
  status: 'confirmado', resultadoAt: iso(addDays(now, -1)), auditorId: 'usr_onboarding',
  notes: 'Dono confirmou a visita e lembrou do nome do vendedor.',
});

const fantasma = clients.find((c) => c.id === auditorias.find((a) => a.vendedorId === 'usr_rafael' && a.origem === 'remoto').clientId);
const auditoriaFantasma = auditorias.find((a) => a.clientId === fantasma.id);
Object.assign(auditoriaFantasma, {
  status: 'nao_reconhece', resultadoAt: iso(addDays(now, -1)), auditorId: 'usr_onboarding',
  notes: 'Falei com a proprietária: nunca conversou com ninguém da NewPay e não usa WhatsApp comercial.',
});
Object.assign(fantasma, { leadStatus: 'fantasma', fantasmaAt: auditoriaFantasma.resultadoAt, cadenciaEncerrada: 'fantasma', followupPendenteDesde: null });
for (const f of followups) {
  if (f.clientId === fantasma.id && f.status === 'pendente') Object.assign(f, { status: 'cancelado', doneAt: auditoriaFantasma.resultadoAt });
}
ocorrencias.push({
  id: id('oco'), tipo: 'lead_fantasma', vendedorId: 'usr_rafael', clientId: fantasma.id,
  auditoriaId: auditoriaFantasma.id, at: auditoriaFantasma.resultadoAt, status: 'ativa',
  auditorId: 'usr_onboarding', notes: auditoriaFantasma.notes,
  lead: {
    company: fantasma.company, name: fantasma.name, phone: fantasma.phone, whatsapp: fantasma.whatsapp,
    cnpj: fantasma.cnpj, city: fantasma.city, origem: fantasma.origem, canal: fantasma.canal,
    cadastradoAt: fantasma.createdAt, validadoAt: fantasma.validadoAt, declaracao: fantasma.declaracao,
  },
  prints: [ANEXO_DEMO], fotos: [], visitas: [],
});

/* -- Retornos combinados na carteira antiga (tarefas avulsas) -------------- */
const avulso = (cliente, quando, combinado) => {
  followups.push({
    id: id('fup'), clientId: cliente.id, userId: cliente.ownerId, etapa: 'avulso', acao: 'ligacao',
    dueAt: iso(quando), marcadoPeloLojista: true, reagendamentos: 0, status: 'pendente', doneAt: null,
    resultado: null, notes: '', combinado, print: null, visitId: null, createdAt: iso(addDays(now, -3)),
  });
  cliente.followupPendenteDesde = iso(quando);
  cliente.cadenciaEncerrada = 'fim';
};
avulso(clientesDe('usr_carlos')[1], atHour(hoje, 11, 0), 'Retornar sobre a proposta de taxa enviada.');
avulso(clientesDe('usr_carlos')[3], atHour(addDays(hoje, -1), 15, 0), 'Cliente pediu para retornar depois do dia 10.');

/* -- Termo de Conduta ------------------------------------------------------ */
const termosConduta = [{
  id: 'trm_demo', versao: 1, demo: true, publicadoAt: iso(addDays(now, -20)), publicadoPor: 'usr_gestor',
  texto:
    'TERMO DE CONDUTA — TEXTO DE DEMONSTRAÇÃO\n\n' +
    '1. Todo lead cadastrado corresponde a um contato real, feito por mim, com um comerciante que autorizou o contato da NewPay.\n' +
    '2. A visita presencial é registrada no local, com GPS, horário e foto da fachada tirada pela câmera do aplicativo.\n' +
    '3. O lead remoto é registrado com CNPJ ativo e com o print da conversa em que o lojista responde.\n' +
    '4. Qualquer lead pode ser auditado por telefone, a qualquer momento.\n' +
    '5. Lead fantasma é falta grave e pode levar a advertência, perda de bonificação ou rescisão, conforme o contrato.',
}];
const aceitesTermo = vendedores.map((v, i) => ({
  id: id('act'), termoId: 'trm_demo', versao: 1, userId: v.id, login: v.email, nome: v.name,
  at: iso(addDays(now, -19 + i)), ip: null, aparelho: 'demonstração',
}));

/* ------------------------------------------------------------- gravação */

const force = process.argv.includes('--force');
if (!force && fs.existsSync(DB_PATH)) {
  console.log('[seed] banco já existe, nada a fazer. Use "npm run seed" para recriar.');
  process.exit(0);
}

replace({
  users, clients, events, confirmations, tasks, announcements, announcementReads,
  notificationState: [], activity: [], visits, deals, goals, dailyKpis, library, objections,
  followups, whatsappAberturas, sorteiosAuditoria, auditorias, ocorrencias, termosConduta, aceitesTermo,
});

console.log(`[seed] banco criado em ${DB_PATH}`);
console.log(
  `[seed] ${users.length} usuários · ${clients.length} clientes · ${events.length} eventos · ` +
  `${visits.length} visitas · ${deals.length} negócios · ${dailyKpis.length} KPIs diários`
);
console.log(
  `[seed] ${clients.filter((c) => c.origem).length} leads com prova · ${followups.length} follow-ups · ` +
  `${auditorias.length} auditorias · ${ocorrencias.length} ocorrência(s)`
);
console.log(`[seed] hoje = ${dateKey(hoje)} | login: carlos@newpay.com.br / newpay123`);
