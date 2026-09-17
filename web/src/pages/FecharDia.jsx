// Fechamento diário obrigatório: os 5 números que sustentam todo o painel do
// gestor. O CRM já traz o que foi registrado; o vendedor confere e confirma.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, moeda } from '../lib/date.js';
import { Carregando } from '../components/ui.jsx';

export default function FecharDia() {
  const { meta, toast } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(dateKey());
  const [valores, setValores] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const { dados, carregando, recarregar } = useRecurso(() => endpoints.kpi(data), [data]);
  const { dados: historico, recarregar: recarregarHistorico } = useRecurso(() => endpoints.kpiHistorico(14), [data]);

  useEffect(() => {
    if (!dados) return;
    const base = dados.registrado ?? dados.calculado;
    setValores(
      Object.fromEntries((meta?.kpisDiarios ?? []).map((k) => [k.chave, base[k.chave] ?? 0]))
    );
  }, [dados, meta]);

  if (carregando || !dados || !valores) return <div className="page"><Carregando linhas={5} /></div>;

  const salvar = async () => {
    setSalvando(true);
    try {
      await endpoints.fecharDia({ data, ...valores });
      toast('Dia fechado. Seus números já estão no painel do gestor.');
      recarregar();
      recarregarHistorico();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h1>Fechar o dia</h1>
          <p className="mini">Confirme os números de hoje. Leva 30 segundos.</p>
        </div>
        <input
          type="date"
          className="input"
          style={{ width: 'auto' }}
          value={data}
          max={dateKey()}
          onChange={(e) => setData(e.target.value)}
        />
      </div>

      {/* Formulário e histórico lado a lado quando a tela permite */}
      <div className="grid-auto-larga">
      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>KPIs do dia</h2>
            <p className="mini">
              {dados.fechado ? '✅ Dia já fechado — você pode corrigir e salvar de novo.' : 'Ainda não fechado.'}
            </p>
          </div>
          {dados.fechado && <span className="chip chip-ok">Fechado</span>}
        </div>

        <div className="card-pad">
          {(meta?.kpisDiarios ?? []).map((k) => (
            <div key={k.chave} className="kpi-campo">
              <div>
                <div className="rotulo">
                  <span className="emoji">{k.emoji}</span>
                  {k.label}
                </div>
                <span className="auto">
                  CRM registrou: {k.moeda ? moeda(dados.calculado[k.chave]) : dados.calculado[k.chave]}
                </span>
              </div>
              <input
                className="input"
                type="number"
                min="0"
                value={valores[k.chave]}
                onChange={(e) => setValores({ ...valores, [k.chave]: Math.max(0, Number(e.target.value) || 0) })}
              />
            </div>
          ))}
        </div>

        <div className="card-pad" style={{ borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-brand btn-block" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : dados.fechado ? 'Salvar correção' : '✅ Fechar o dia'}
          </button>
          <p className="mini centro" style={{ marginTop: 8 }}>
            É desse registro que saem visitas, conversão e custo por venda no painel do gestor.
          </p>
        </div>
      </div>

      {historico && (
        <div className="card">
          <div className="card-header">
            <div className="crescer">
              <h2>Últimos 14 dias</h2>
              <p className="mini">
                {historico.diasSemFechamento === 0
                  ? 'Todos os dias fechados. Disciplina em dia.'
                  : `${historico.diasSemFechamento} dia(s) sem fechamento.`}
              </p>
            </div>
          </div>
          <div className="card-pad coluna">
            <div className="kpi-grade">
              {historico.dias.map((d) => (
                <span
                  key={d.data}
                  className={`kpi-dia ${d.fechado ? 'ok' : 'falta'}`}
                  title={`${d.data} · ${d.visitas} visitas · ${d.maquinas} máquinas`}
                >
                  {d.data.slice(-2)}
                </span>
              ))}
            </div>

            <div className="grid grid-4">
              {(meta?.kpisDiarios ?? []).map((k) => (
                <div key={k.chave} className="stat">
                  <div className="rotulo">{k.label}</div>
                  <div className="valor">
                    {k.moeda ? moeda(historico.totais[k.chave]) : historico.totais[k.chave]}
                  </div>
                  <div className="extra">no período</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>

      <button className="btn btn-block" onClick={() => navigate('/')}>Voltar para o início</button>
    </div>
  );
}
