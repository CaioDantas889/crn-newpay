// A linha de um negócio (proposta, venda, ativação) do jeito que aparece na
// ficha do cliente, na tela "Hoje" e no painel do gestor: o que foi vendido,
// em que pé está e o que ainda falta (série, ativação, confirmação).

import { diaMes } from '../lib/date.js';

/** Situação em uma linha: "Vendida em 03/10 · há 9 dias sem ativar" */
export function situacaoDoNegocio(n) {
  if (n.status === 'perdido') return { texto: 'Perdida', tom: 'neutro' };
  if (['proposta', 'negociacao'].includes(n.status)) {
    return { texto: `${n.statusMeta?.label ?? 'Proposta'} em ${diaMes(n.propostaAt)}`, tom: 'neutro' };
  }
  if (n.status === 'fechado') {
    const dias = n.diasSemAtivar ?? 0;
    const idade = dias === 0 ? 'vendida hoje' : `há ${dias} dia(s) sem ativar`;
    const recusa = n.ativacaoRecusada ? ` · ativação recusada pela gestão: ${n.ativacaoRecusada.motivo}` : '';
    return {
      texto: `Vendida em ${diaMes(n.fechamentoAt)} · ${idade}${recusa}`,
      tom: n.ativacaoAtrasada || n.ativacaoRecusada ? 'erro' : 'alerta',
    };
  }
  if (n.aguardandoConfirmacao) {
    return { texto: `Ativada em ${diaMes(n.ativacaoAt)} · aguardando confirmação da gestão`, tom: 'alerta' };
  }
  return {
    texto: `Ativada em ${diaMes(n.ativacaoAt)}${n.confirmadaPor ? ` · confirmada por ${n.confirmadaPor.name.split(' ')[0]}` : ' · confirmada'}`,
    tom: 'ok',
  };
}

export function SeriesChips({ negocio: n }) {
  if (!n.series?.length && !n.faltamSeries) return null;
  return (
    <div className="series">
      {n.series.map((s) => <span key={s} className="serie" title="Número de série">{s}</span>)}
      {n.faltamSeries > 0 && <span className="chip chip-alerta">falta {n.faltamSeries} número(s) de série</span>}
      {n.fotoEtiqueta?.url && (
        <a className="chip" href={n.fotoEtiqueta.url} target="_blank" rel="noreferrer">etiqueta ↗</a>
      )}
    </div>
  );
}

/**
 * `acoes` são os botões da direita (variam por tela). `mostrarCliente` e
 * `mostrarVendedor` acrescentam de quem é a máquina.
 */
export function NegocioLinha({ negocio: n, acoes, mostrarCliente, mostrarVendedor, onClick }) {
  const situacao = situacaoDoNegocio(n);
  const titulo = [
    n.modeloLabel ?? 'Modelo não informado',
    `${n.maquinas} máquina(s)`,
    n.taxaOfertada ? `tabela ${n.taxaOfertada}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={`cliente-linha negocio ${n.status}${n.ativacaoAtrasada ? ' atrasada' : ''}${onClick ? ' clicavel' : ''}`}
      onClick={onClick}
    >
      <span className="avatar" style={{ background: n.statusMeta?.cor ?? '#8b5cf6' }}>{n.maquinas}x</span>
      <div className="info">
        {mostrarCliente && n.client && (
          <b className="truncar" style={{ display: 'block' }}>
            {n.client.company}{n.client.city ? ` · ${n.client.city}` : ''}
            {mostrarVendedor && n.user ? ` · ${n.user.name.split(' ')[0]}` : ''}
          </b>
        )}
        <b className={mostrarCliente ? 'menor' : undefined} style={mostrarCliente ? { display: 'block', fontWeight: 600 } : undefined}>
          {titulo}
        </b>
        <div className={`mini situacao-${situacao.tom}`}>{situacao.texto}</div>
        <SeriesChips negocio={n} />
      </div>
      {acoes && <div className="negocio-acoes" onClick={(e) => e.stopPropagation()}>{acoes}</div>}
    </div>
  );
}
