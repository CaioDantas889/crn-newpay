// Cria um acesso de administração direto no banco, sem depender de alguém já
// logado para cadastrar pela tela Equipe. Serve para começar a mexer numa base
// nova e para repor o acesso quando a senha do gestor se perdeu.
//
//   npm run criar:admin                                 perfil dev padrão
//   npm run criar:admin -- --email=voce@empresa.com.br  e-mail próprio
//   npm run criar:admin -- --senha="uma senha sua"      senha escolhida
//   npm run criar:admin -- --papel=gestor               em vez de diretoria
//   npm run criar:admin -- --trocar-senha               exige troca no 1º acesso
//
// E-mail que já existe não vira cadastro novo: o script promove a conta,
// reativa e troca a senha — e a sessão aberta nela cai junto.
//
// O servidor precisa estar parado (a trava do banco impede os dois juntos).

import {
  DB_PATH,
  acquireLock,
  id,
  insert,
  load,
  releaseLock,
  saveNow,
  table,
  update,
} from '../src/store.js';
import { gerarSenhaProvisoria, hashPassword, senhaVersao, validarSenha } from '../src/auth.js';
import { config } from '../src/config.js';

const args = process.argv.slice(2);
const flag = (nome) => args.includes(`--${nome}`);
const informou = (nome) => args.some((a) => a.startsWith(`--${nome}=`));
const arg = (nome, padrao = '') => {
  const achado = args.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
};

// Vendedor se cadastra pela tela, com senha provisória. Aqui só entra quem
// administra o CRM.
const PAPEIS = {
  diretoria: 'Diretor Comercial',
  gestor: 'Gerente Comercial',
};

// Cargos que o CRM escreve sozinho. Promover alguém que está com um deles
// atualiza o cargo junto; cargo escrito à mão é da pessoa e fica como está.
const CARGOS_PADRAO = ['Consultor Externo', 'Gerente Comercial', 'Diretor Comercial', 'Gestor'];

const email = arg('email', 'dev@newpay.com.br').trim().toLowerCase();
const papel = arg('papel', 'diretoria');
const nome = arg('nome', 'Dev Admin');
const cidade = arg('cidade', 'Iguatu');
const trocarSenha = flag('trocar-senha');

// Sem --senha o script sorteia uma e mostra no fim: senha padrão escrita em
// script é senha vazada no dia em que alguém roda isso no servidor.
const senha = arg('senha') || gerarSenhaProvisoria();

if (!(papel in PAPEIS)) {
  console.error(`\nPapel inválido: use --papel=${Object.keys(PAPEIS).join(' ou --papel=')}.\n`);
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`\nE-mail inválido: ${email}\n`);
  process.exit(1);
}
const recusa = validarSenha(senha);
if (recusa) {
  console.error(`\n${recusa}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------- trava ---- */

const trava = acquireLock('criar-admin');
if (!trava.ok) {
  console.error(
    `\nO servidor está no ar (pid ${trava.dono.pid}) usando o mesmo banco.\n` +
    'Pare ele (Ctrl+C no terminal do npm run dev) e rode de novo.\n'
  );
  process.exit(1);
}

load();

/* ----------------------------------------------------------- cadastro --- */

const existente = table('users').find((u) => String(u.email).toLowerCase() === email);

const conta = existente
  ? update('users', existente.id, {
      // Nome e cidade só mudam se vieram na linha de comando: repor o acesso
      // de alguém não é motivo para rebatizar a pessoa.
      ...(informou('nome') ? { name: nome } : {}),
      ...(informou('cidade') ? { city: cidade } : {}),
      ...(CARGOS_PADRAO.includes(existente.jobTitle) ? { jobTitle: PAPEIS[papel] } : {}),
      role: papel,
      active: true,
      password: hashPassword(senha),
      mustChangePassword: trocarSenha,
      passwordVersion: senhaVersao(existente) + 1,
    })
  : insert('users', {
      id: id('usr'),
      name: nome,
      email,
      password: hashPassword(senha),
      role: papel,
      jobTitle: PAPEIS[papel],
      city: cidade,
      phone: '',
      color: '#0f172a',
      dailyGoal: 0,
      active: true,
      base: { lat: 0, lng: 0 },
      mustChangePassword: trocarSenha,
      createdAt: new Date().toISOString(),
    });

saveNow();
releaseLock();

/* -------------------------------------------------------------- relato -- */

console.log(`\n===== ${existente ? 'Acesso reposto' : 'Acesso de administração criado'} =====`);
console.log(`Banco: ${DB_PATH}${config.producao ? '  (NODE_ENV=production)' : ''}`);
console.log(`Nome:  ${conta.name} · ${conta.jobTitle} · ${papel}`);
console.log('');
console.log(`  E-mail: ${conta.email}`);
console.log(`  Senha:  ${senha}`);
console.log('');
console.log(
  trocarSenha
    ? 'O CRM vai exigir a troca da senha no primeiro acesso.'
    : 'Sem troca obrigatória: entra e já está dentro.'
);
if (existente) console.log('A sessão que estava aberta nessa conta caiu — entre de novo.');
console.log('');
