// Fechamento diário obrigatório: os 4 números que sustentam todo o painel do
// gestor. O CRM já traz o que foi registrado; o vendedor confere e confirma.
// O formulário em si é o FecharDiaForm, o mesmo do atalho no Expediente.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, moeda } from '../lib/date.js';
import FecharDiaForm from '../components/FecharDiaForm.jsx';

export default function FecharDia() {
  const { meta } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(dateKey());

  const { dados: historico, recarregar: recarregarHistorico } = useRecurso(() => endpoints.kpiHistorico(14), [data]);

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
          aria-label="Dia do fechamento"
          value={data}
          max={dateKey()}
          onChange={(e) => setData(e.target.value)}
        />
      </div>

      {/* Formulário e histórico lado a lado quando a tela permite */}
      <div className="grid-auto-larga">
        <FecharDiaForm data={data} onFechado={recarregarHistorico} />

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
