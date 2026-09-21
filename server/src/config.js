// Configuração de ambiente. Tudo que muda entre a máquina de quem desenvolve
// e o servidor de produção passa por aqui — inclusive os caminhos de dados,
// que em produção devem apontar para um disco persistente.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizServidor = path.join(__dirname, '..');

const texto = (valor, padrao = '') => String(valor ?? '').trim() || padrao;
const numero = (valor, padrao) => {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
};
const lista = (valor) => texto(valor).split(',').map((v) => v.trim()).filter(Boolean);
const booleano = (valor, padrao) => {
  const v = texto(valor).toLowerCase();
  if (!v) return padrao;
  return ['1', 'true', 'sim', 'on'].includes(v);
};

export const SEGREDO_DEV = 'newpay-dev-secret-troque-em-producao';
export const TAMANHO_MINIMO_SEGREDO = 24;
export const TAMANHO_MINIMO_SENHA = 8;

const producao = process.env.NODE_ENV === 'production';

export const config = {
  producao,
  porta: numero(process.env.API_PORT, 4000),

  // Assinatura dos tokens. Em produção não existe valor padrão: sem a variável
  // o servidor se recusa a subir (ver validarConfig).
  segredo: texto(process.env.NEWPAY_SECRET, producao ? '' : SEGREDO_DEV),
  // 30 dias: o vendedor entra uma vez por mês, não todo dia de manhã.
  horasSessao: numero(process.env.NEWPAY_HORAS_SESSAO, 720),

  // Disco: banco, anexos e backups. NEWPAY_DATA_DIR aponta para o volume
  // persistente do host (ex.: /data) — sem isso um deploy apaga tudo.
  dataDir: texto(process.env.NEWPAY_DATA_DIR, path.join(raizServidor, 'data')),
  backupMaximo: numero(process.env.NEWPAY_BACKUP_MAX, 20),
  backupIntervaloMin: numero(process.env.NEWPAY_BACKUP_INTERVALO_MIN, 30),

  // Front: o mesmo processo serve o build do Vite em produção.
  servirFront: booleano(process.env.NEWPAY_SERVIR_FRONT, producao),
  frontDir: texto(process.env.NEWPAY_FRONT_DIR, path.join(raizServidor, '..', 'web', 'dist')),

  // Origens liberadas no CORS. Vazio = só mesma origem (front servido aqui).
  origens: lista(process.env.NEWPAY_ORIGINS),

  // Banco novo: demo só fora de produção; em produção nasce vazio com este admin.
  seedDemo: booleano(process.env.NEWPAY_SEED_DEMO, !producao),
  admin: {
    nome: texto(process.env.NEWPAY_ADMIN_NOME, 'Administrador'),
    email: texto(process.env.NEWPAY_ADMIN_EMAIL).toLowerCase(),
    senha: texto(process.env.NEWPAY_ADMIN_SENHA),
    cidade: texto(process.env.NEWPAY_ADMIN_CIDADE, 'Iguatu'),
  },
};

/** Devolve a lista de impedimentos para subir com esta configuração. */
export function validarConfig(c = config) {
  const erros = [];
  if (!c.producao) return erros;

  if (!c.segredo) {
    erros.push('NEWPAY_SECRET não definida — sem ela qualquer um assina um token válido.');
  } else if (c.segredo === SEGREDO_DEV) {
    erros.push('NEWPAY_SECRET está com o valor de desenvolvimento; gere um segredo próprio.');
  } else if (c.segredo.length < TAMANHO_MINIMO_SEGREDO) {
    erros.push(`NEWPAY_SECRET precisa de ao menos ${TAMANHO_MINIMO_SEGREDO} caracteres.`);
  }

  if (c.seedDemo) {
    erros.push('NEWPAY_SEED_DEMO ligado em produção — o banco nasceria com clientes fictícios.');
  }
  return erros;
}

/** Instrução curta para quem estiver subindo o servidor pela primeira vez. */
export const dicaSegredo =
  'Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"';
