// Primeira subida do sistema: decide como o banco nasce.
// Fora de produção, com a base de demonstração; em produção, vazio e com o
// primeiro gestor vindo das variáveis de ambiente.

import { bancoExiste, id, replace } from './store.js';
import { hashPassword, validarSenha } from './auth.js';
import { config } from './config.js';

export function criarBancoVazio({ nome, email, senha, cidade } = {}) {
  const emailLimpo = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
    throw new Error('Informe um e-mail válido para o primeiro gestor.');
  }
  const recusa = validarSenha(senha);
  if (recusa) throw new Error(recusa);

  const admin = {
    id: id('usr'),
    name: String(nome ?? '').trim() || 'Administrador',
    email: emailLimpo,
    password: hashPassword(senha),
    role: 'gestor',
    jobTitle: 'Gerente Comercial',
    city: String(cidade ?? '').trim(),
    phone: '',
    color: '#0f172a',
    dailyGoal: 0,
    active: true,
    base: { lat: 0, lng: 0 },
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  };

  replace({ users: [admin] });
  return admin;
}

const INSTRUCOES = `
[api] Banco ainda não existe e a base de demonstração está desligada.
      Defina o primeiro gestor e suba de novo:

        NEWPAY_ADMIN_NOME="Seu Nome"
        NEWPAY_ADMIN_EMAIL="voce@empresa.com.br"
        NEWPAY_ADMIN_SENHA="uma senha forte"

      Ou crie o banco vazio manualmente com: npm run seed:vazio
`;

/** Garante um banco utilizável antes de abrir a porta. */
export async function garantirBanco() {
  if (bancoExiste()) return 'existente';

  if (config.seedDemo) {
    console.log('[api] banco não encontrado, gerando dados de demonstração...');
    await import('./seed.js');
    return 'demo';
  }

  const { email, senha } = config.admin;
  if (!email || !senha) {
    console.error(INSTRUCOES);
    throw new Error('primeiro gestor não configurado');
  }

  const admin = criarBancoVazio(config.admin);
  console.log(`[api] banco vazio criado. Primeiro acesso: ${admin.email} (troca de senha obrigatória)`);
  return 'vazio';
}
