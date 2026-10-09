// Carteira: lista filtrável, funil, mapa e visitas registradas.
// O vendedor vê a própria carteira. A gestão vê a equipe inteira e filtra por
// vendedor — é daqui que ela acompanha cliente e visita de todo mundo.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Carregando, Vazio } from '../components/ui.jsx';
import NovoCliente from '../components/NovoCliente.jsx';
import NovoLead from '../components/NovoLead.jsx';
import MapaClientes from '../components/MapaClientes.jsx';
import VisitasLista from '../components/VisitasLista.jsx';

const ORDENS = [
  { chave: 'score', label: 'Oportunidade' },
  { chave: 'contato', label: 'Sem contato' },
  { chave: 'nome', label: 'A–Z' },
];

const ABAS = [
  { chave: 'lista', label: 'Lista' },
  { chave: 'funil', label: 'Funil' },
  { chave: 'mapa', label: 'Mapa' },
  { chave: 'visitas', label: 'Visitas' },
];

export default function Carteira() {
  const { meta, user, ehGestor } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [aba, setAba] = useState(params.get('aba') ?? 'lista');
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [busca, setBusca] = useState('');
  // Uma busca por pausa na digitação, não por letra (no 4G cada letra era uma ida)
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaDigitada.trim()), 250);
    return () => clearTimeout(t);
  }, [buscaDigitada]);
  const [temperatura, setTemperatura] = useState(params.get('temperatura') ?? '');
  const [stage, setStage] = useState(params.get('stage') ?? '');
  const [ordem, setOrdem] = useState(params.get('ordem') ?? 'score');
  // Gestão: '' = equipe inteira, id de um vendedor, ou o próprio id (minha carteira)
  const [vendedor, setVendedor] = useState(params.get('userId') ?? '');
  const [novo, setNovo] = useState(false);

  const { dados: equipe } = useRecurso(
    () => (ehGestor ? endpoints.equipe() : Promise.resolve([])),
    [ehGestor]
  );

  const userId = ehGestor && vendedor ? vendedor : undefined;
  const { dados: clientes, carregando, recarregando, recarregar } = useRecurso(
    () => endpoints.clientes({ busca, temperatura, stage, ordem, userId }),
    [busca, temperatura, stage, ordem, userId],
    { manterAoTrocar: true }
  );
  const { dados: funil } = useRecurso(() => endpoints.funil(userId), [aba === 'funil', userId]);

  const gravarParam = (chave, valor) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    setParams(p, { replace: true });
  };

  const trocarAba = (nova) => {
    setAba(nova);
    gravarParam('aba', nova);
  };

  const trocarVendedor = (id) => {
    setVendedor(id);
    gravarParam('userId', id);
  };

  const lista = clientes ?? [];
  const vendedores = (equipe ?? []).filter((u) => u.role === 'vendedor');
  const escolhido = vendedores.find((v) => v.id === vendedor);
  const equipeInteira = ehGestor && !vendedor;

  const titulo = !ehGestor
    ? 'Carteira'
    : vendedor === user.id
      ? 'Minha carteira'
      : escolhido
        ? `Carteira de ${escolhido.name.split(' ')[0]}`
        : 'Carteira da equipe';

  const botaoNovo = (
    <button className="btn btn-primary" onClick={() => setNovo(true)}>
      {ehGestor ? '+ Novo cliente' : '+ Novo lead'}
    </button>
  );

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h1>{titulo}</h1>
          <p className="mini">
            {lista.length} cliente(s) · ordenados por {ORDENS.find((o) => o.chave === ordem)?.label.toLowerCase()}
          </p>
        </div>
        <div className="linha">
          {ehGestor && (
            <select
              className="select select-inline"
              value={vendedor}
              onChange={(e) => trocarVendedor(e.target.value)}
              aria-label="De quem é a carteira"
            >
              <option value="">Equipe inteira</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
              <option value={user.id}>Minha carteira</option>
            </select>
          )}
          {botaoNovo}
        </div>
      </div>

      <div className="card">
        <div className="abas">
          {ABAS.map((a) => (
            <button key={a.chave} className={`aba${aba === a.chave ? ' ativa' : ''}`} onClick={() => trocarAba(a.chave)}>
              {a.label}
            </button>
          ))}
        </div>

        {aba === 'lista' && (
          <>
            <div className="card-pad coluna">
              <input
                className="input"
                placeholder="Buscar por empresa, responsável, cidade ou telefone..."
                value={buscaDigitada}
                onChange={(e) => setBuscaDigitada(e.target.value)}
              />
              <div className="opcoes">
                {['', 'quente', 'morno', 'frio'].map((t) => (
                  <button
                    key={t || 'todas'}
                    className={`opcao${temperatura === t ? ' ativa' : ''}`}
                    onClick={() => setTemperatura(t)}
                  >
                    {t === '' ? 'Todos' : t === 'quente' ? '▲ Quentes' : t === 'morno' ? '● Mornos' : '○ Frios'}
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
              <div className="coluna" style={{ gap: 5 }}>
                <span className="selo">Ordenar por</span>
                <div className="opcoes">
                  {ORDENS.map((o) => (
                    <button
                      key={o.chave}
                      className={`opcao${ordem === o.chave ? ' ativa' : ''}`}
                      onClick={() => setOrdem(o.chave)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {recarregando && <p className="mini card-pad" style={{ paddingBottom: 0 }}>Buscando...</p>}
            {carregando && !clientes ? (
              <Carregando linhas={6} />
            ) : lista.length === 0 ? (
              <Vazio
                emoji="⌕"
                titulo="Nenhum cliente encontrado"
                texto={
                  equipeInteira
                    ? 'Ajuste os filtros ou cadastre um cliente para um vendedor.'
                    : 'Ajuste os filtros ou cadastre um novo cliente.'
                }
                acao={botaoNovo}
              />
            ) : (
              lista.map((c) => (
                <div
                  key={c.id}
                  className="cliente-linha linha-carteira"
                  onClick={() => navigate(`/carteira/${c.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/carteira/${c.id}`)}
                >
                  <span className={`score-bola ${c.temperature}`}>{c.score}</span>
                  <div className="info">
                    <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                    <span className="mini truncar" style={{ display: 'block' }}>
                      {c.segmentoLabel} · {c.city}
                      {/* Na carteira da equipe cada linha diz de quem é */}
                      {equipeInteira && c.owner ? ` · ${c.owner.name.split(' ')[0]}` : ''}
                      {c.leadStatus && c.leadStatus !== 'validado' && (
                        <span className={`chip chip-status ${c.leadStatus}`} style={{ marginLeft: 6 }}>{c.leadStatus}</span>
                      )}
                    </span>
                  </div>
                  <div className="etapa">
                    <span className="chip" style={{ color: c.stageMeta.cor, borderColor: c.stageMeta.cor }}>
                      {c.stageMeta.label}
                    </span>
                  </div>
                  <div
                    className="contato mini"
                    style={c.diasSemContato > 7 ? { color: 'var(--red)', fontWeight: 650 } : undefined}
                  >
                    {c.diasSemContato === 0 ? 'contato hoje' : `${c.diasSemContato}d sem contato`}
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
                        <p className="mini">{etapa.total} cliente(s)</p>
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

        {aba === 'mapa' && <MapaClientes userId={userId} />}

        {aba === 'visitas' && <VisitasLista userId={userId} dataInicial={params.get('data') ?? undefined} />}
      </div>

      {/* A gestão cadastra direto na carteira (sem prova); o vendedor cadastra lead com prova */}
      {novo && ehGestor && (
        <NovoCliente
          ownerIdPadrao={vendedor && vendedor !== user.id ? vendedor : ''}
          onFechar={() => setNovo(false)}
          onCriado={(cliente) => {
            recarregar();
            navigate(`/carteira/${cliente.id}?diagnostico=1`, { replace: true });
          }}
        />
      )}
      {novo && !ehGestor && <NovoLead onFechar={() => setNovo(false)} onCriado={recarregar} />}
    </div>
  );
}
