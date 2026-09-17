// Prévia da pontuação de oportunidade enquanto o vendedor preenche o
// diagnóstico. A conta oficial é sempre a do servidor; esta espelha as mesmas
// regras usando o vocabulário que veio de /api/meta.

export function calcularScoreLocal(diagnostico = {}, meta) {
  const { maquinaAtual, faturamento, volumeCartao, dores = [], interesse } = diagnostico;
  const detalhes = [];
  let total = 0;

  const soma = (label, pontos) => {
    if (pontos > 0) {
      total += pontos;
      detalhes.push({ label, pontos });
    }
  };

  if (maquinaAtual && maquinaAtual !== 'nao_possui') {
    soma(`Usa ${meta?.maquinas?.[maquinaAtual] ?? 'outra máquina'}`, 10);
  }
  if (dores.includes('taxas_altas')) soma('Reclama das taxas', 20);

  const faixa = meta?.faturamentos?.[faturamento];
  if (faixa && faixa.min >= 10000) soma(`Fatura ${faixa.label.toLowerCase()}`, 20);

  if (volumeCartao === 'alto') soma('Volume alto no cartão', 10);
  else if (volumeCartao === 'medio') soma('Volume médio no cartão', 5);

  const extras = dores.filter((d) => d !== 'taxas_altas');
  if (extras.length) {
    soma(
      extras.map((d) => meta?.dores?.[d] ?? d).join(', '),
      Math.min(extras.length * 5, 15)
    );
  }

  const info = meta?.interesses?.[interesse];
  if (info?.pontos) soma(info.label, info.pontos);

  const score = Math.min(100, total);
  return {
    score,
    detalhes,
    temperatura: score >= 61 ? 'quente' : score >= 31 ? 'morno' : 'frio',
  };
}

export const CORES_TEMPERATURA = {
  quente: '#dc2626',
  morno: '#f59e0b',
  frio: '#3b82f6',
};
