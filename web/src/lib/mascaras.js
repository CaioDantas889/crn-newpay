// Máscaras dos campos que o vendedor digita no celular.
// Todas trabalham em cima dos dígitos: o que a pessoa digita é formatado na
// hora, e apagar sempre funciona (nenhuma máscara prende o cursor).

export const somenteNumeros = (valor = '') => String(valor).replace(/\D/g, '');

/**
 * CPF ou CNPJ, decidido pela quantidade de dígitos.
 * Até 11 → 000.000.000-00; daí em diante → 00.000.000/0000-00.
 */
export function mascaraDocumento(valor = '') {
  const d = somenteNumeros(valor).slice(0, 14);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** (88) 99999-0000 para celular, (88) 3581-0000 para fixo */
export function mascaraTelefone(valor = '') {
  const d = somenteNumeros(valor).slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, '($1');
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,4})/, '($1) $2');
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/** Valor em reais enquanto digita: 1234 → 12,34 */
export function mascaraMoeda(valor = '') {
  const d = somenteNumeros(valor).slice(0, 12);
  if (!d) return '';
  return (Number(d) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** CPF válido? (dígitos verificadores) */
export function cpfValido(valor = '') {
  const d = somenteNumeros(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** CNPJ válido? (dígitos verificadores) */
export function cnpjValido(valor = '') {
  const d = somenteNumeros(valor);
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

/**
 * Motivo da recusa do documento, ou null quando está vazio ou correto.
 * Campo opcional: vazio nunca é erro — quem está na rua nem sempre tem o CNPJ
 * do lojista na hora.
 */
export function validarDocumento(valor = '') {
  const d = somenteNumeros(valor);
  if (!d) return null;
  if (d.length === 11) return cpfValido(d) ? null : 'CPF inválido — confira os números.';
  if (d.length === 14) return cnpjValido(d) ? null : 'CNPJ inválido — confira os números.';
  return 'Documento incompleto: CPF tem 11 dígitos e CNPJ tem 14.';
}

/** Motivo da recusa do telefone, ou null */
export function validarTelefone(valor = '') {
  const d = somenteNumeros(valor);
  if (!d) return null;
  if (d.length < 10) return 'Telefone incompleto — inclua o DDD.';
  return null;
}
