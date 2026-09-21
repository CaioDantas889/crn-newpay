// Tira a operação fictícia do banco e deixa só o que é seu.
//
//   node scripts/limpar-demo.mjs                 simula o modo padrão
//   node scripts/limpar-demo.mjs --aplicar       executa (faz backup antes)
//   node scripts/limpar-demo.mjs --modo=tudo     zera a operação inteira
//
// Dois modos:
//
//   seed (padrão) — apaga o que veio pronto da demonstração: os clientes do
//     seed (id sequencial, cli_01…) com tudo que depende deles, os registros
//     dos quatro vendedores fictícios e o que o gestor do seed já trazia. O que
//     você cadastrou depois fica, mesmo que tenha usado uma conta de teste.
//
//   tudo — deixa o CRM zerado para a operação real começar: apaga clientes,
//     visitas, vendas, agenda, tarefas, metas e KPIs. Mantém a equipe, a
//     biblioteca e as objeções.
//
// O servidor precisa estar parado (a trava do banco impede os dois juntos).

import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_DIR,
  DB_PATH,
  acquireLock,
  load,
  releaseLock,
  remove,
  saveNow,
  table,
} from '../src/store.js';

const args = process.argv.slice(2);
const flag = (nome) => args.includes(`--${nome}`);
const arg = (nome, padrao = '') => {
  const achado = args.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
};

const APLICAR = flag('aplicar');
const MODO = arg('modo', 'seed');
const LIMPAR_BIBLIOTECA = flag('limpar-biblioteca');
const LIMPAR_INATIVOS = !flag('manter-inativos');

if (!['seed', 'tudo'].includes(MODO)) {
  console.error('Modo inválido. Use --modo=seed (padrão) ou --modo=tudo');
  process.exit(1);
}

// Ids fixos que o seed usa para a equipe de demonstração
const VENDEDORES_DEMO = ['usr_carlos', 'usr_fernanda', 'usr_rafael', 'usr_juliana'];
const GESTOR_DEMO = 'usr_gestor';

/* ------------------------------------------------------------- trava ---- */

const trava = acquireLock('limpeza');
if (!trava.ok) {
  console.error(
    `\nO servidor está no ar (pid ${trava.dono.pid}) usando o mesmo banco.\n` +
    'Pare ele (Ctrl+C no terminal do npm start) e rode de novo.\n'
  );
  process.exit(1);
}

load();

/**
 * Corte padrão: quando o primeiro usuário foi criado pelo app. Os cadastros do
 * seed não têm `createdAt`, então essa data marca o momento em que o CRM deixou
 * de ser só demonstração. Ancorar aqui (em vez de "hoje") mantém o resultado
 * igual amanhã e semana que vem.
 */
function corteAutomatico() {
  const datas = table('users').map((u) => u.createdAt).filter(Boolean).sort();
  if (datas.length) return new Date(datas[0]);
  const meiaNoite = new Date();
  meiaNoite.setHours(0, 0, 0, 0);
  return meiaNoite;
}

const CORTE = arg('desde') ? new Date(arg('desde')) : corteAutomatico();
if (Number.isNaN(CORTE.getTime())) {
  console.error('Data de corte inválida. Use --desde=2026-09-18');
  releaseLock();
  process.exit(1);
}

/* --------------------------------------------- o que conta como demo ---- */

const CAMPOS = {
  clients: 'ownerId',
  events: 'ownerId',
  tasks: 'ownerId',
  visits: 'userId',
  deals: 'userId',
  goals: 'userId',
  dailyKpis: 'userId',
  confirmations: 'userId',
  announcementReads: 'userId',
  notificationState: 'userId',
  activity: 'userId',
};

// A operação em si: o que some por inteiro no modo "tudo"
const OPERACAO = ['clients', 'visits', 'deals', 'events', 'tasks', 'goals', 'dailyKpis', 'confirmations'];

const dataDe = (linha) => linha.createdAt ?? linha.at ?? linha.start ?? null;
const antesDoCorte = (linha) => {
  const quando = dataDe(linha);
  return Boolean(quando) && new Date(quando) < CORTE;
};

// Cliente do seed tem id sequencial (cli_01); o que o app cria tem id aleatório
const clientesDoSeed = new Set(
  table('clients').filter((c) => /^cli_\d{1,3}$/.test(c.id)).map((c) => c.id)
);

/** No modo seed, o registro é fictício? */
function ehDemo(tabela, linha) {
  // Cliente é o caso fácil: o id diz a origem, sem depender de data nem de
  // quem cadastrou. Cliente que você criou pelo app fica, ponto.
  if (tabela === 'clients') return clientesDoSeed.has(linha.id);

  // Preso a um cliente: segue o destino dele. Não faz sentido guardar visita
  // de um cliente que deixou de existir, nem apagar visita de cliente que fica.
  if (linha.clientId) return clientesDoSeed.has(linha.clientId);

  // Sobra o que não tem cliente (compromisso pessoal, tarefa solta, aviso):
  // conta como demo se veio de conta de teste e é anterior ao corte.
  const dono = linha[CAMPOS[tabela]];
  if (VENDEDORES_DEMO.includes(dono)) return antesDoCorte(linha);
  if (dono == null || dono === GESTOR_DEMO) return antesDoCorte(linha);
  return false;
}

const alvos = {};
for (const tabela of Object.keys(CAMPOS)) {
  alvos[tabela] =
    MODO === 'tudo' && OPERACAO.includes(tabela)
      ? [...table(tabela)]
      : table(tabela).filter((linha) => ehDemo(tabela, linha));
}

// Avisos do mural: o seed não grava `createdBy`
alvos.announcements = table('announcements').filter((a) => !a.createdBy || antesDoCorte(a));

if (LIMPAR_BIBLIOTECA) {
  alvos.library = table('library').filter((m) => !m.createdBy);
  alvos.objections = table('objections').filter((o) => !o.createdBy);
}

/* ------------------------------------------------------------ usuários -- */

const usuariosDemo = table('users').filter((u) => VENDEDORES_DEMO.includes(u.id));

// Atividade, leitura de comunicado e estado de notificação são papelada
// interna: não seguram um cadastro de teste no CRM.
const TABELAS_DE_TRABALHO = [
  'clients', 'visits', 'deals', 'events', 'tasks', 'goals', 'dailyKpis', 'confirmations',
];

const sobraDepois = (usuario) =>
  TABELAS_DE_TRABALHO.some((tabela) =>
    table(tabela).some(
      (linha) => linha[CAMPOS[tabela]] === usuario.id && !alvos[tabela].includes(linha)
    )
  );

const inativosVazios = LIMPAR_INATIVOS
  ? table('users').filter(
      (u) => u.active === false && !VENDEDORES_DEMO.includes(u.id) && !sobraDepois(u)
    )
  : [];

const idsQueSaem = new Set([...usuariosDemo, ...inativosVazios].map((u) => u.id));

// Papelada que só faz sentido junto da pessoa: sai com ela.
const PAPELADA = ['goals', 'dailyKpis', 'confirmations', 'announcementReads', 'notificationState', 'activity'];
for (const tabela of PAPELADA) {
  for (const linha of table(tabela)) {
    if (idsQueSaem.has(linha[CAMPOS[tabela]]) && !alvos[tabela].includes(linha)) {
      alvos[tabela].push(linha);
    }
  }
}

/**
 * Trabalho de verdade que sobreviveu à limpeza mas está no nome de alguém que
 * vai embora — o caso de um cliente cadastrado por você usando a conta de
 * demonstração. Isso não se apaga: passa para quem fica.
 */
const TRANSFERIVEIS = ['clients', 'visits', 'deals', 'events', 'tasks'];

const alvoTransferencia = (() => {
  const escolhido = arg('transferir-para').toLowerCase();
  const candidatos = table('users').filter((u) => u.active !== false && !idsQueSaem.has(u.id));
  if (escolhido) {
    return candidatos.find(
      (u) => u.email.toLowerCase() === escolhido || u.id === escolhido
    ) ?? null;
  }
  return candidatos.find((u) => u.role === 'gestor' || u.role === 'diretoria') ?? candidatos[0] ?? null;
})();

const transferencias = [];
for (const tabela of TRANSFERIVEIS) {
  const campo = CAMPOS[tabela];
  for (const linha of table(tabela)) {
    if (idsQueSaem.has(linha[campo]) && !alvos[tabela].includes(linha)) {
      transferencias.push({ tabela, linha, campo });
    }
  }
}

if (transferencias.length && !alvoTransferencia) {
  console.error(
    `\n${transferencias.length} registro(s) ficariam sem dono e não há para quem transferir.` +
      '\nUse --transferir-para=email de alguém que continua no CRM.\n'
  );
  releaseLock();
  process.exit(1);
}

/* -------------------------------------------------------------- relato -- */

const rotulos = {
  clients: 'clientes',
  events: 'compromissos',
  tasks: 'tarefas',
  visits: 'visitas',
  deals: 'propostas e vendas',
  goals: 'metas mensais',
  dailyKpis: 'fechamentos de dia',
  confirmations: 'confirmações de presença',
  announcementReads: 'leituras de comunicado',
  notificationState: 'notificações lidas',
  activity: 'registros de atividade',
  announcements: 'comunicados do mural',
  library: 'materiais da biblioteca',
  objections: 'objeções',
};

console.log('\n===== Limpeza dos dados de demonstração =====');
console.log(`Banco: ${DB_PATH}`);
console.log(`Modo:  ${MODO === 'tudo' ? 'TUDO — zera a operação inteira' : 'seed — só o que veio da demonstração'}`);
if (MODO === 'seed') {
  console.log(`Corte: registros de conta de teste anteriores a ${CORTE.toLocaleString('pt-BR')}`);
}
console.log('');

let total = 0;
for (const [tabela, linhas] of Object.entries(alvos)) {
  if (!linhas.length) continue;
  const restam = table(tabela).length - linhas.length;
  console.log(`  ${String(linhas.length).padStart(4)} ${(rotulos[tabela] ?? tabela).padEnd(28)} (ficam ${restam})`);
  total += linhas.length;
}

const clientesQueFicam = table('clients').filter((c) => !alvos.clients.includes(c));
if (clientesQueFicam.length) {
  console.log('\n  Clientes que continuam na carteira:');
  for (const c of clientesQueFicam.slice(0, 15)) {
    console.log(`      · ${c.company}${c.city ? ` (${c.city})` : ''} — cadastrado em ${dataDe(c)?.slice(0, 10) ?? 'data desconhecida'}`);
  }
  if (clientesQueFicam.length > 15) console.log(`      · ... e mais ${clientesQueFicam.length - 15}`);
} else {
  console.log('\n  Nenhum cliente continua na carteira.');
}

if (usuariosDemo.length) {
  console.log(`\n  ${usuariosDemo.length} vendedores de demonstração saem da equipe:`);
  for (const u of usuariosDemo) console.log(`      · ${u.name}`);
}
if (inativosVazios.length) {
  console.log(`\n  ${inativosVazios.length} cadastros inativos sem nenhum registro (resíduo de teste):`);
  for (const u of inativosVazios.slice(0, 6)) console.log(`      · ${u.name} <${u.email}>`);
  if (inativosVazios.length > 6) console.log(`      · ... e mais ${inativosVazios.length - 6}`);
}

if (transferencias.length) {
  const porTabela = {};
  for (const t of transferencias) porTabela[t.tabela] = (porTabela[t.tabela] ?? 0) + 1;
  console.log(`
  Passam para ${alvoTransferencia.name} (estavam no nome de quem sai):`);
  for (const [tabela, quantos] of Object.entries(porTabela)) {
    console.log(`      · ${quantos} ${rotulos[tabela] ?? tabela}`);
  }
}

const ficam = table('users').filter((u) => !idsQueSaem.has(u.id));
console.log(`\n  Continuam no CRM: ${ficam.map((u) => u.name).join(', ')}`);
console.log(`\n  Total de registros a apagar: ${total}`);

if (!LIMPAR_BIBLIOTECA) {
  console.log('\n  A biblioteca e as objeções ficam como estão (--limpar-biblioteca apaga as do seed).');
}

if (!APLICAR) {
  console.log('\nSimulação: nada foi gravado. Repita com --aplicar para limpar de verdade.\n');
  releaseLock();
  process.exit(0);
}

/* ------------------------------------------------------------ execução -- */

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const copia = path.join(
  BACKUP_DIR,
  `db-antes-da-limpeza-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
);
fs.copyFileSync(DB_PATH, copia);
console.log(`\nBackup em ${copia}`);

for (const [tabela, linhas] of Object.entries(alvos)) {
  for (const linha of linhas) remove(tabela, linha.id);
}
for (const { linha, campo } of transferencias) linha[campo] = alvoTransferencia.id;
for (const usuario of [...usuariosDemo, ...inativosVazios]) remove('users', usuario.id);

saveNow();
releaseLock();

console.log(`${total} registro(s) e ${idsQueSaem.size} cadastro(s) removidos.`);
if (transferencias.length) {
  console.log(`${transferencias.length} registro(s) passaram para ${alvoTransferencia.name}.`);
}
console.log('Pode subir o servidor de novo.\n');
