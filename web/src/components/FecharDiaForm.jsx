// O fechamento diário em um cartão só: os 4 números do dia, pré-preenchidos
// com o que o CRM registrou, e o botão que fecha. É usado pela tela
// "Fechar o dia" e pelo atalho no Expediente — encerrou o ponto, fecha o dia
// ali mesmo, sem trocar de tela.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, hora, moeda } from '../lib/date.js';
import { Carregando, Falha } from './ui.jsx';

/**
 * modo 'pagina' (padrão): cartão completo, sempre aberto.
 * modo 'atalho': uma linha com a situação do dia; o formulário abre no toque
 *   ou sozinho quando `abrir` muda para um número maior que zero (expediente
 *   encerrado e dia ainda não fechado) e recolhe quando volta a zero (o
 *   vendedor reabriu o ponto). Dia já fechado fica na linha, com "Corrigir".
 * `destacar`: a linha recolhida ganha o estilo de alerta — só faz sentido
 *   quando o expediente de hoje já acabou; com o ponto aberto é uma linha
 *   neutra, porque fechar o dia no meio do expediente registra número parcial.
 * `versao` muda → recarrega os números (depois de uma batida, por exemplo).
 * `onEstado(fechado)` avisa quem embute o cartão se o dia já está fechado.
 */
export default function FecharDiaForm({
  data = dateKey(), modo = 'pagina', abrir = 0, destacar = false, versao = 0, onFechado, onEstado,
}) {
  const { meta, toast } = useApp();
  const navigate = useNavigate();
  const { dados, carregando, recarregando, erro, recarregar, setDados } = useRecurso(() => endpoints.kpi(data), [data, versao], {
    manterAoTrocar: modo === 'atalho',
  });
  // Trocou o dia na tela de fechamento e os números ainda são do dia anterior:
  // nada se salva até chegarem os do dia certo
  const numerosDeOutroDia = Boolean(dados && dados.data && dados.data !== data);
  const [valores, setValores] = useState(null);
  const [editado, setEditado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [expandido, setExpandido] = useState(false);

  // Trocar o dia descarta o que estava digitado do dia anterior
  useEffect(() => {
    setEditado(false);
  }, [data]);

  // Os campos seguem o servidor até o vendedor mexer neles: a batida de ponto
  // recarrega os números sem apagar uma edição em andamento.
  useEffect(() => {
    if (!dados || editado) return;
    const base = dados.registrado ?? dados.calculado;
    setValores(Object.fromEntries((meta?.kpisDiarios ?? []).map((k) => [k.chave, base[k.chave] ?? 0])));
  }, [dados, meta, editado]);

  useEffect(() => {
    if (dados) onEstado?.(Boolean(dados.fechado));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  // O atalho abre sozinho no momento certo e recolhe quando o ponto reabre
  useEffect(() => {
    setExpandido(abrir > 0);
  }, [abrir]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const { registro, calculado } = await endpoints.fecharDia({ data, ...valores });
      toast('Dia fechado. Seus números já estão no painel do gestor.');
      // O que o servidor devolveu já é o estado novo: nada de esperar outro GET
      setEditado(false);
      setExpandido(false);
      setDados((atual) => ({ ...(atual ?? {}), registrado: registro, calculado, fechado: true }));
      onFechado?.();
    } catch (err) {
      toast(err.message, 'erro');
      recarregar();
    } finally {
      setSalvando(false);
    }
  };

  const atalho = modo === 'atalho';
  // Só a primeira carga esconde o cartão; recarregar mantém o que está na tela
  if (!atalho && erro && (!dados || numerosDeOutroDia)) {
    return <Falha erro={erro} titulo="Não consegui carregar os números deste dia" />;
  }
  if (!dados || !valores || (!atalho && (carregando || numerosDeOutroDia))) {
    return atalho ? null : <div className="card"><Carregando linhas={5} /></div>;
  }
  const ocupado = salvando || recarregando;

  const campos = meta?.kpisDiarios ?? [];
  const formatar = (k, origem) => (k.moeda ? moeda(origem[k.chave]) : origem[k.chave]);
  const resumo = (origem) => campos.map((k) => `${formatar(k, origem)} ${k.unidade ?? k.label.toLowerCase()}`).join(' · ');

  // O que o CRM registrou depois do fechamento (o painel do gestor não vê).
  // Compara com o que o CRM contava na hora de fechar — não com o número que o
  // vendedor gravou, que pode ter sido corrigido para baixo de propósito.
  // Fechamento antigo (sem esse registro) não tem com o que comparar: sem aviso
  const naHoraDeFechar = dados.registrado?.calculadoNoFechamento;
  const novos = dados.fechado && naHoraDeFechar
    ? campos
        .map((k) => ({ k, n: (dados.calculado[k.chave] ?? 0) - (naHoraDeFechar[k.chave] ?? 0) }))
        .filter(({ n }) => n > 0)
    : [];
  const atualizarFechamento = async () => {
    setSalvando(true);
    try {
      // Soma só o que entrou depois: a correção que o vendedor fez continua valendo
      const extra = Object.fromEntries(novos.map(({ k, n }) => [k.chave, n]));
      const valoresNovos = Object.fromEntries(
        campos.map((k) => [k.chave, (dados.registrado?.[k.chave] ?? 0) + (extra[k.chave] ?? 0)])
      );
      const { registro, calculado } = await endpoints.fecharDia({ data, ...valoresNovos });
      setEditado(false);
      setDados((atual) => ({ ...(atual ?? {}), registrado: registro, calculado, fechado: true }));
      toast('Fechamento atualizado. O painel do gestor já tem os números novos.');
      onFechado?.();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };
  const avisoNovos = novos.length > 0 && (
    <div className="linha" style={{ flexWrap: 'wrap' }}>
      <span className="mini crescer">
        O CRM registrou {novos.map(({ k, n }) => `+${n} ${k.unidade ?? k.label.toLowerCase()}`).join(' · ')} depois do fechamento.
      </span>
      <button type="button" className="btn btn-sm btn-brand" onClick={atualizarFechamento} disabled={ocupado}>
        {salvando ? 'Atualizando...' : 'Atualizar'}
      </button>
    </div>
  );

  // Linha do atalho: a situação do dia e um toque para abrir
  if (atalho && (dados.fechado || !expandido)) {
    if (dados.fechado) {
      return (
        <div className="card card-pad coluna" style={{ gap: 8 }}>
          <div className="entre">
            <span className="linha mini" style={{ flexWrap: 'wrap' }}>
              <span className="chip chip-ok">✓ Dia fechado</span>
              <span>
                {dados.registrado?.fechadoAt ? `às ${hora(dados.registrado.fechadoAt)} · ` : ''}
                {resumo(dados.registrado ?? dados.calculado)}
              </span>
            </span>
            <button className="btn btn-sm" onClick={() => navigate('/fechar-dia')}>Corrigir</button>
          </div>
          {avisoNovos}
        </div>
      );
    }
    if (destacar) {
      return (
        <button className="card card-pad linha alerta-kpi" onClick={() => setExpandido(true)}>
          <span style={{ fontSize: '1.4rem' }}>▤</span>
          <div className="crescer" style={{ textAlign: 'left' }}>
            <b>Você ainda não fechou o dia</b>
            <p className="mini">{resumo(dados.calculado)} registrados até agora.</p>
          </div>
          <span className="btn btn-sm">Fechar agora</span>
        </button>
      );
    }
    return (
      <div className="card card-pad entre">
        <span className="linha mini" style={{ flexWrap: 'wrap' }}>
          <b>Fechar o dia</b>
          <span>{resumo(dados.calculado)} registrados até agora.</span>
        </span>
        <button className="btn btn-sm" onClick={() => setExpandido(true)}>Fechar o dia</button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="crescer">
          <h2>{atalho ? 'Fechar o dia' : 'KPIs do dia'}</h2>
          <p className="mini">
            {dados.fechado
              ? '✓ Dia já fechado — você pode corrigir e salvar de novo.'
              : atalho
                ? 'Confira os números de hoje e feche. Leva 30 segundos.'
                : 'Ainda não fechado.'}
          </p>
        </div>
        {dados.fechado && <span className="chip chip-ok">Fechado</span>}
        {atalho && (
          <button className="btn btn-ghost btn-sm" onClick={() => setExpandido(false)}>Depois</button>
        )}
      </div>

      {avisoNovos && <div className="card-pad" style={{ paddingBottom: 0 }}>{avisoNovos}</div>}

      <div className="card-pad">
        {campos.map((k) => {
          const idCampo = `kpi-${k.chave}`;
          return (
            <div key={k.chave} className="kpi-campo">
              <div>
                <label className="rotulo" htmlFor={idCampo}>
                  <span className="emoji">{k.emoji}</span>
                  {k.label}
                </label>
                <span className="auto">CRM registrou: {formatar(k, dados.calculado)}</span>
              </div>
              <input
                id={idCampo}
                className="input"
                type="number"
                min="0"
                value={valores[k.chave]}
                onChange={(e) => {
                  setEditado(true);
                  setValores({ ...valores, [k.chave]: Math.max(0, Number(e.target.value) || 0) });
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="card-pad" style={{ borderTop: '1px solid var(--line)' }}>
        <button className="btn btn-brand btn-block" onClick={salvar} disabled={ocupado}>
          {salvando ? 'Salvando...' : dados.fechado ? 'Salvar correção' : '✓ Fechar o dia'}
        </button>
        <p className="mini centro" style={{ marginTop: 8 }}>
          É desse registro que saem visitas, propostas e máquinas do dia no painel do gestor.
        </p>
      </div>
    </div>
  );
}
