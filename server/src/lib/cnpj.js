// Consulta de CNPJ na Receita, pela BrasilAPI (gratuita, sem chave).
//
// É a barreira do lead remoto: o sistema preenche razão social, endereço e
// situação, e CNPJ inexistente ou fora da situação "ATIVA" é recusado.
//
// Três respostas possíveis, e quem chama decide o que fazer com cada uma:
//   { ok: true, ...dados }               CNPJ existe — `ativa` diz se pode
//   { ok: false, motivo: 'inexistente' } a Receita não conhece esse número
//   { ok: false, motivo: 'indisponivel'} a consulta não respondeu (rede, limite)
//
// Indisponível não é recusa: o lead entra pendente e a validação consulta de
// novo depois. Travar o vendedor porque o serviço de fora caiu seria pior.

import { config } from '../config.js';

const URL_BASE = 'https://brasilapi.com.br/api/cnpj/v1';
const TEMPO_LIMITE_MS = 8000;

// O mesmo CNPJ é consultado no "Consultar" do formulário e de novo ao salvar:
// guardar a resposta por algumas horas evita bater duas vezes no serviço.
const cache = new Map();
const CACHE_MAXIMO = 500;
const CACHE_HORAS = 12;

export const digitosCnpj = (valor = '') => String(valor).replace(/\D/g, '');

/** CNPJ com dígitos verificadores corretos (a mesma conta do front) */
export function cnpjValido(valor = '') {
  const d = digitosCnpj(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;

  const digito = (ate) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = ate; i >= 1; i--) {
      soma += Number(d[ate - i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(d[12]) && digito(13) === Number(d[13]);
}

export const formatarCnpj = (valor = '') =>
  digitosCnpj(valor).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

function montar(dados, cnpj) {
  const situacao = String(dados.descricao_situacao_cadastral ?? '').trim().toUpperCase();
  const endereco = [
    [dados.descricao_tipo_de_logradouro, dados.logradouro].filter(Boolean).join(' '),
    dados.numero,
    dados.bairro,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    ok: true,
    cnpj: formatarCnpj(cnpj),
    razaoSocial: dados.razao_social ?? '',
    nomeFantasia: dados.nome_fantasia ?? '',
    situacao: situacao || 'DESCONHECIDA',
    ativa: situacao === 'ATIVA',
    endereco,
    municipio: dados.municipio ?? '',
    uf: dados.uf ?? '',
    fonte: 'receita',
    consultadoAt: new Date().toISOString(),
  };
}

/**
 * Consulta o CNPJ. Nunca lança.
 * Com NEWPAY_CONSULTAR_CNPJ=false (servidor sem internet) só confere os
 * dígitos verificadores, e o resultado sai marcado como `fonte: 'digitos'`.
 */
export async function consultarCnpj(valor) {
  const cnpj = digitosCnpj(valor);
  if (!cnpjValido(cnpj)) return { ok: false, motivo: 'invalido' };

  if (!config.consultarCnpj) {
    return {
      ok: true,
      cnpj: formatarCnpj(cnpj),
      razaoSocial: '',
      nomeFantasia: '',
      situacao: 'NÃO CONSULTADA',
      ativa: true,
      endereco: '',
      municipio: '',
      uf: '',
      fonte: 'digitos',
      consultadoAt: new Date().toISOString(),
    };
  }

  const guardado = cache.get(cnpj);
  if (guardado && Date.now() - guardado.em < CACHE_HORAS * 3600_000) return guardado.resposta;

  try {
    const resposta = await fetch(`${URL_BASE}/${cnpj}`, {
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { Accept: 'application/json', 'User-Agent': `NewPayCRM/1.0 (${config.contatoGeocodificacao})` },
    });

    let resultado;
    if (resposta.status === 404) resultado = { ok: false, motivo: 'inexistente' };
    else if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    else resultado = montar(await resposta.json(), cnpj);

    if (cache.size >= CACHE_MAXIMO) cache.delete(cache.keys().next().value);
    cache.set(cnpj, { em: Date.now(), resposta: resultado });
    return resultado;
  } catch (erro) {
    console.warn(`[cnpj] consulta de ${formatarCnpj(cnpj)} falhou: ${erro.message}`);
    return { ok: false, motivo: 'indisponivel' };
  }
}

/** Mensagem para o vendedor quando o CNPJ não serve */
export function motivoRecusaCnpj(consulta) {
  if (consulta.ok && !consulta.ativa) {
    return `CNPJ com situação "${consulta.situacao}" na Receita. Só CNPJ ativo entra como lead remoto.`;
  }
  if (consulta.motivo === 'invalido') return 'CNPJ inválido — confira os 14 números.';
  if (consulta.motivo === 'inexistente') return 'CNPJ não encontrado na Receita.';
  return null;
}
