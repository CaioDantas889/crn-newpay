// Carteira: lista filtrável, funil e mapa de clientes.

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { moeda } from '../lib/date.js';
import { Carregando, Vazio } from '../components/ui.jsx';
import NovoCliente from '../components/NovoCliente.jsx';
import MapaClientes from '../components/MapaClientes.jsx';

const ORDENS = [
  { chave: 'score', label: 'Oportunidade' },
  { chave: 'contato', label: 'Sem contato' },
  { chave: 'tpv', label: 'TPV' },
  { chave: 'nome', label: 'A–Z' },
];

export default function Carteira() {
  const { meta } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [aba, setAba] = useState(params.get('aba') ?? 'lista');
  const [busca, setBusca] = useState('');
  const [temperatura, setTemperatura] = useState(params.get('temperatura') ?? '');
  const [stage, setStage] = useState(params.get('stage') ?? '');
  const [ordem, setOrdem] = useState(params.get('ordem') ?? 'score');
  const [novo, setNovo] = useState(false);

  const filtros = { busca, temperatura, stage, ordem };
  const { dados: clientes, carregando, recarregar } = useRecurso(
    () => endpoints.clientes(filtros),
    [busca, temperatura, stage, ordem]
  );
  const { dados: funil } = useRecurso(() => endpoints.funil(), [aba === 'funil']);

  const trocarAba = (nova) => {
    setAba(nova);
    const p = new URLSearchParams(params);
    p.set('aba', nova);
    setParams(p, { replace: true });
  };

  const lista = clientes ?? [];

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h1>Carteira</h1>
          <p className="mini">{lista.length} cliente(s) · ordenados por {ORDENS.find((o) => o.chave === ordem)?.label.toLowerCase()}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setNovo(true)}>+ Novo cliente</button>
      </div>

      <div className="card">
        <div className="abas">
          <button className={`aba${aba === 'lista' ? ' ativa' : ''}`} onClick={() => trocarAba('lista')}>Lista</button>
          <button className={`aba${aba === 'funil' ? ' ativa' : ''}`} onClick={() => trocarAba('funil')}>Funil</button>
          <button className={`aba${aba === 'mapa' ? ' ativa' : ''}`} onClick={() => trocarAba('mapa')}>Mapa</button>
        </div>

        {aba === 'lista' && (
          <>
            <div className="card-pad coluna">
              <input
                className="input"
                placeholder="Buscar por empresa, responsável, cidade ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <div className="opcoes">
                {['', 'quente', 'morno', 'frio'].map((t) => (
                  <button
                    key={t || 'todas'}
                    className={`opcao${temperatura === t ? ' ativa' : ''}`}
                    onClick={() => setTemperatura(t)}
                  >
                    {t === '' ? 'Todos' : t === 'quente' ? '🔥 Quentes' : t === 'morno' ? '🌤️ Mornos' : '❄️ Frios'}
                  </button>
                ))}
              </div>
              <div className="opcoes">
                <button className={`opcao${stage === '' ? ' ativa' : ''}`} onClick={() => setStage('')}>
                  Todo o funil
                </button>
                {Object.entries(meta?.funil ?? {}).map(([chave, info]) => (
                  <button
                    key={chave}
                    className={`opcao${stage === chave ? ' ativa' : ''}`}
                    onClick={() => setStage(chave)}
                    style={stage === chave ? { background: info.cor, borderColor: info.cor } : undefined}
                  >
                    {info.label}
                  </button>
                ))}
              </div>
              <div className="linha" style={{ flexWrap: 'wrap' }}>
                <span className="selo">Ordenar por:</span>
                {ORDENS.map((o) => (
                  <button
                    key={o.chave}
                    className={`btn btn-sm${ordem === o.chave ? ' btn-primary' : ''}`}
                    onClick={() => setOrdem(o.chave)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {carregando ? (
              <Carregando linhas={6} />
            ) : lista.length === 0 ? (
              <Vazio
                emoji="🔍"
                titulo="Nenhum cliente encontrado"
                texto="Ajuste os filtros ou cadastre um novo cliente."
                acao={<button className="btn btn-brand" onClick={() => setNovo(true)}>+ Novo cliente</button>}
              />
            ) : (
              lista.map((c) => (
                <div
                  key={c.id}
                  className="cliente-linha"
                  onClick={() => navigate(`/carteira/${c.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/carteira/${c.id}`)}
                >
                  <span className={`score-bola ${c.temperature}`}>{c.score}</span>
                  <div className="info">
                    <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                    <span className="mini">
                      {c.segmentoLabel} · {c.city} · {moeda(c.tpvEstimado)} de TPV
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="chip" style={{ color: c.stageMeta.cor, borderColor: c.stageMeta.cor }}>
                      {c.stageMeta.label}
                    </span>
                    <div
                      className="mini"
                      style={{ marginTop: 4, color: c.diasSemContato > 7 ? 'var(--red)' : 'var(--text-3)' }}
                    >
                      {c.diasSemContato === 0 ? 'contato hoje' : `${c.diasSemContato}d sem contato`}
                    </div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {aba === 'funil' && (
          <div className="card-pad">
            {!funil ? (
              <Carregando linhas={5} />
            ) : (
              <div className="grid-auto">
                {funil.map((etapa) => (
                  <div key={etapa.chave} className="card" style={{ borderTop: `3px solid ${etapa.cor}` }}>
                    <div className="card-header">
                      <div className="crescer">
                        <h3>{etapa.label}</h3>
                        <p className="mini">{etapa.total} clientes · {moeda(etapa.tpvPotencial)}</p>
                      </div>
                    </div>
                    {etapa.clientes.length === 0 ? (
                      <p className="vazio mini">Nenhum cliente aqui.</p>
                    ) : (
                      etapa.clientes.map((c) => (
                        <div key={c.id} className="cliente-linha" onClick={() => navigate(`/carteira/${c.id}`)}>
                          <span className="score-bola" style={{ width: 30, height: 30, fontSize: '0.74rem' }}>
                            {c.score}
                          </span>
                          <div className="info">
                            <b className="truncar" style={{ display: 'block', fontSize: '0.84rem' }}>{c.company}</b>
                            <span className="mini">{c.city}</span>
                          </div>
                        </div>
                      ))
                    )}
                    {etapa.total > etapa.clientes.length && (
                      <button className="btn btn-ghost btn-sm btn-block" onClick={() => { trocarAba('lista'); setStage(etapa.chave); }}>
                        ver todos os {etapa.total}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === 'mapa' && <MapaClientes />}
      </div>

      {novo && (
        <NovoCliente
          onFechar={() => setNovo(false)}
          onCriado={(cliente) => {
            recarregar();
            navigate(`/carteira/${cliente.id}?diagnostico=1`);
          }}
        />
      )}
    </div>
  );
}
