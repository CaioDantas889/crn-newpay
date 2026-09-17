// Pipeline: o funil como quadro. Uma coluna por etapa, um cartão por cliente,
// totais no rodapé de cada coluna e arrastar para mover de etapa.

import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { moeda } from '../lib/date.js';
import { Avatar, Carregando, Stat } from '../components/ui.jsx';
import NovoCliente from '../components/NovoCliente.jsx';
import ConfirmarExclusao from '../components/ConfirmarExclusao.jsx';

const DIAS_PARA_ALERTA = 7;

export default function Pipeline() {
  const { meta, user, ehGestor, toast } = useApp();
  const navigate = useNavigate();
  const { busca } = useOutletContext();
  const [params, setParams] = useSearchParams();

  const [temperatura, setTemperatura] = useState(params.get('temperatura') ?? '');
  const [vendedor, setVendedor] = useState(params.get('userId') ?? '');
  const [novo, setNovo] = useState(false);
  const [arrastando, setArrastando] = useState(null);
  const [colunaAlvo, setColunaAlvo] = useState(null);
  const [menuCard, setMenuCard] = useState(null);
  const [excluir, setExcluir] = useState(null);

  const { dados: equipe } = useRecurso(
    () => (ehGestor ? endpoints.equipe() : Promise.resolve([])),
    [ehGestor]
  );
  const { dados, carregando, setDados } = useRecurso(
    () => endpoints.clientes({ temperatura, userId: vendedor || undefined, ordem: 'score' }),
    [temperatura, vendedor]
  );

  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return dados ?? [];
    return (dados ?? []).filter((c) =>
      `${c.company} ${c.name} ${c.city} ${c.segmentoLabel}`.toLowerCase().includes(termo)
    );
  }, [dados, busca]);

  const etapas = Object.entries(meta?.funil ?? {});
  const totalCarteira = clientes.length;
  const tpvTotal = clientes.reduce((s, c) => s + (c.tpvEstimado || 0), 0);

  /** Move o cliente de etapa: aplica na hora e desfaz se a API recusar */
  const mover = async (clienteId, stage) => {
    const cliente = (dados ?? []).find((c) => c.id === clienteId);
    setColunaAlvo(null);
    setArrastando(null);
    if (!cliente || cliente.stage === stage) return;

    const anterior = cliente.stage;
    setDados((lista) =>
      lista.map((c) => (c.id === clienteId ? { ...c, stage, stageMeta: meta.funil[stage] } : c))
    );

    try {
      await endpoints.atualizarCliente(clienteId, { stage });
      toast(
        stage === 'fechado'
          ? `${cliente.company} fechado! Registre a venda na ficha para contar na meta.`
          : `${cliente.company} → ${meta.funil[stage].label}.`
      );
    } catch (err) {
      setDados((lista) =>
        lista.map((c) => (c.id === clienteId ? { ...c, stage: anterior, stageMeta: meta.funil[anterior] } : c))
      );
      toast(err.message, 'erro');
    }
  };

  const trocarFiltro = (chave, valor, setter) => {
    setter(valor);
    const p = new URLSearchParams(params);
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    setParams(p, { replace: true });
  };

  if (carregando) return <div className="page"><Carregando linhas={6} /></div>;

  return (
    <>
      <div className="board-resumo">
        <Stat rotulo="Clientes no funil" valor={totalCarteira} destaque extra={`${clientes.filter((c) => c.temperature === 'quente').length} quentes`} />
        <Stat rotulo="TPV potencial" valor={moeda(tpvTotal)} cor="var(--brand-strong)" />
        <Stat
          rotulo="Em negociação"
          valor={clientes.filter((c) => ['proposta', 'negociacao'].includes(c.stage)).length}
          cor="var(--purple)"
        />
        <Stat
          rotulo="Precisam de retorno"
          valor={clientes.filter((c) => c.diasSemContato > DIAS_PARA_ALERTA && !['fechado', 'perdido'].includes(c.stage)).length}
          cor="var(--red)"
          extra={`sem contato há mais de ${DIAS_PARA_ALERTA} dias`}
        />
      </div>

      <div className="board-topo">
        <div className="opcoes">
          {['', 'quente', 'morno', 'frio'].map((t) => (
            <button
              key={t || 'todas'}
              className={`opcao${temperatura === t ? ' ativa' : ''}`}
              onClick={() => trocarFiltro('temperatura', t, setTemperatura)}
            >
              {t === '' ? 'Todos' : t === 'quente' ? '🔥 Quentes' : t === 'morno' ? '🌤️ Mornos' : '❄️ Frios'}
            </button>
          ))}
        </div>

        {ehGestor && (
          <select
            className="select select-inline"
            value={vendedor}
            onChange={(e) => trocarFiltro('userId', e.target.value, setVendedor)}
          >
            <option value="">Minha carteira</option>
            <option value="todos">Equipe inteira</option>
            {(equipe ?? []).filter((u) => u.role === 'vendedor').map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}

        <span className="mini" style={{ marginLeft: 'auto' }}>
          Arraste o cartão para mudar de etapa
        </span>
      </div>

      <div className="board">
        {etapas.map(([chave, info]) => {
          const daEtapa = clientes.filter((c) => c.stage === chave);
          const tpvEtapa = daEtapa.reduce((s, c) => s + (c.tpvEstimado || 0), 0);
          const participacao = totalCarteira ? Math.round((daEtapa.length / totalCarteira) * 100) : 0;

          return (
            <section
              key={chave}
              className={`pipe-coluna${colunaAlvo === chave ? ' alvo' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (colunaAlvo !== chave) setColunaAlvo(chave);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setColunaAlvo(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                mover(e.dataTransfer.getData('text/plain'), chave);
              }}
            >
              <div className="coluna-faixa" style={{ background: info.cor }} />
              <header className="coluna-topo">
                <span className="nome">{info.label}</span>
                <span className="contagem" style={{ background: info.cor }}>{daEtapa.length}</span>
              </header>

              <div className="coluna-corpo">
                {daEtapa.length === 0 ? (
                  <div className="cartao-vazio">Solte um cliente aqui</div>
                ) : (
                  daEtapa.map((c) => {
                    const atrasado =
                      c.diasSemContato > DIAS_PARA_ALERTA && !['fechado', 'perdido'].includes(c.stage);
                    const dono = ehGestor && vendedor === 'todos' ? c.ownerId : user.id;

                    return (
                      <article
                        key={c.id}
                        className={`cartao${atrasado ? ' atrasado' : ''}${c.stage === 'fechado' ? ' ganho' : ''}${arrastando === c.id ? ' arrastando' : ''}`}
                        style={{ borderLeftColor: atrasado ? undefined : info.cor }}
                        draggable
                        onDragStart={(e) => {
                          setArrastando(c.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', c.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setColunaAlvo(null);
                        }}
                        onClick={() => navigate(`/carteira/${c.id}`)}
                      >
                        <div className="cartao-titulo">{c.company}</div>

                        <div className="cartao-linhas">
                          <span className="cartao-linha">
                            <i style={{ background: meta.temperatures?.[c.temperature]?.cor ?? '#94a3b8' }} />
                            {c.name || 'Sem responsável'}
                          </span>
                          <span className="cartao-linha">
                            <i style={{ background: '#94a3b8' }} />
                            {c.segmentoLabel} · {c.city}
                          </span>
                          <span className="cartao-linha">
                            <i style={{ background: atrasado ? '#dc2626' : '#94a3b8' }} />
                            {c.diasSemContato === 0 ? 'Contato hoje' : `${c.diasSemContato} dias sem contato`}
                          </span>
                        </div>

                        <div className="cartao-rodape">
                          <span className={`score-bola ${c.temperature}`} style={{ width: 22, height: 22, borderRadius: 6, fontSize: '0.62rem' }}>
                            {c.score}
                          </span>
                          <span className="cartao-valor">{moeda(c.tpvEstimado)}</span>

                          {/* No celular não dá para arrastar: este menu move de etapa */}
                          <button
                            className="cartao-mover"
                            aria-label="Mover de etapa"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuCard(menuCard === c.id ? null : c.id);
                            }}
                          >
                            ⇄
                          </button>

                          <Avatar
                            nome={(equipe ?? []).find((u) => u.id === dono)?.name ?? user.name}
                            cor={(equipe ?? []).find((u) => u.id === dono)?.color ?? user.color}
                            pequeno
                          />
                        </div>

                        {menuCard === c.id && (
                          <div className="cartao-menu" onClick={(e) => e.stopPropagation()}>
                            <span className="selo">Mover para</span>
                            {etapas
                              .filter(([alvo]) => alvo !== chave)
                              .map(([alvo, dadosEtapa]) => (
                                <button
                                  key={alvo}
                                  onClick={() => {
                                    setMenuCard(null);
                                    mover(c.id, alvo);
                                  }}
                                >
                                  <i style={{ background: dadosEtapa.cor }} />
                                  {dadosEtapa.label}
                                </button>
                              ))}

                            <button
                              className="remover"
                              onClick={() => {
                                setMenuCard(null);
                                setExcluir(c);
                              }}
                            >
                              🗑️ Excluir cliente
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>

              <footer className="coluna-rodape">
                <div className="valor">{moeda(tpvEtapa)}</div>
                <div className="taxa">
                  {daEtapa.length} cliente(s) · {participacao}% do funil
                </div>
              </footer>
            </section>
          );
        })}
      </div>

      {excluir && (
        <ConfirmarExclusao
          titulo="Excluir cliente"
          alvo={excluir.company}
          descricao="Sai do funil e da carteira, com visitas, propostas e compromissos."
          textoBotao="Excluir cliente"
          onFechar={() => setExcluir(null)}
          onConfirmar={async () => {
            await endpoints.excluirCliente(excluir.id);
            toast(excluir.company + ' removido da carteira.');
            setDados((lista) => lista.filter((x) => x.id !== excluir.id));
          }}
        />
      )}

      {novo && (
        <NovoCliente
          onFechar={() => setNovo(false)}
          onCriado={(cliente) => navigate(`/carteira/${cliente.id}?diagnostico=1`)}
        />
      )}
    </>
  );
}
