// Visitas registradas, uma linha por visita: resultado, cliente, quem fez,
// GPS e anexos. O vendedor vê as próprias; a gestão vê as da equipe inteira
// (ou de um vendedor só) e exclui o que foi registrado errado.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { addDays, dateKey, diaMes, hora } from '../lib/date.js';
import { Avatar, Carregando, Stat, Vazio } from './ui.jsx';
import ConfirmarExclusao from './ConfirmarExclusao.jsx';

const PERIODOS = [
  { chave: 'hoje', label: 'Hoje', dias: 0 },
  { chave: '7', label: '7 dias', dias: 6 },
  { chave: '30', label: '30 dias', dias: 29 },
  { chave: 'dia', label: 'Escolher o dia' },
];

const PRODUTIVOS = ['fechado', 'quente'];

/**
 * `userId` segue o seletor da carteira (vazio = tudo que a pessoa pode ver);
 * `dataInicial` abre a lista já num dia específico — é como o painel do
 * gestor manda para cá.
 */
export default function VisitasLista({ userId, dataInicial }) {
  const { meta, ehGestor, toast } = useApp();
  const navigate = useNavigate();

  const [periodo, setPeriodo] = useState(dataInicial ? 'dia' : '7');
  const [dia, setDia] = useState(dataInicial ?? dateKey());
  const [resultado, setResultado] = useState('');
  const [excluir, setExcluir] = useState(null);

  const faixa = useMemo(() => {
    if (periodo === 'dia') return { data: dia };
    const dias = PERIODOS.find((p) => p.chave === periodo)?.dias ?? 6;
    return { de: dateKey(addDays(new Date(), -dias)), ate: dateKey() };
  }, [periodo, dia]);

  const { dados, carregando, recarregar } = useRecurso(
    () => endpoints.visitas({ ...faixa, userId, resultado, limite: 500 }),
    [faixa.data, faixa.de, faixa.ate, userId, resultado]
  );

  const lista = dados ?? [];
  const hojeChave = dateKey();
  const semGps = lista.filter((v) => v.semGps).length;

  // Quantas visitas cada um fez: só interessa quando a lista mistura carteiras
  const porVendedor = useMemo(() => {
    if (!ehGestor || userId) return [];
    const mapa = new Map();
    for (const v of lista) {
      if (!v.user) continue;
      const atual = mapa.get(v.user.id) ?? { ...v.user, total: 0 };
      atual.total += 1;
      mapa.set(v.user.id, atual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [lista, ehGestor, userId]);

  // Mesma regra do servidor: vendedor só apaga revisita do próprio dia
  const podeExcluir = (v) => ehGestor || (v.tipo !== 'lead' && dateKey(v.at) === hojeChave);

  return (
    <div className="card-pad coluna">
      <div className="opcoes">
        {PERIODOS.map((p) => (
          <button
            key={p.chave}
            className={`opcao${periodo === p.chave ? ' ativa' : ''}`}
            onClick={() => setPeriodo(p.chave)}
          >
            {p.label}
          </button>
        ))}
        {periodo === 'dia' && (
          <input
            type="date"
            className="input"
            style={{ width: 'auto' }}
            value={dia}
            onChange={(e) => e.target.value && setDia(e.target.value)}
          />
        )}
      </div>

      <div className="opcoes">
        <button className={`opcao${resultado === '' ? ' ativa' : ''}`} onClick={() => setResultado('')}>
          Todos os resultados
        </button>
        {Object.entries(meta?.resultadosVisita ?? {}).map(([chave, info]) => (
          <button
            key={chave}
            className={`opcao${resultado === chave ? ' ativa' : ''}`}
            style={resultado === chave ? { background: info.cor, borderColor: info.cor } : undefined}
            onClick={() => setResultado(chave)}
          >
            {info.emoji} {info.label}
          </button>
        ))}
      </div>

      {carregando ? (
        <Carregando linhas={5} />
      ) : (
        <>
          <div className="grid grid-4">
            <Stat
              rotulo="Visitas"
              valor={lista.length}
              destaque
              extra={`${lista.filter((v) => v.tipo === 'lead').length} de cadastro de lead`}
            />
            <Stat
              rotulo="Produtivas"
              valor={lista.filter((v) => PRODUTIVOS.includes(v.resultado)).length}
              cor="var(--green)"
              extra="fechado ou quente"
            />
            <Stat rotulo="Vendas" valor={lista.filter((v) => v.resultado === 'fechado').length} cor="var(--brand-strong)" />
            <Stat
              rotulo="Sem GPS"
              valor={semGps}
              cor={semGps > 0 ? 'var(--red)' : 'var(--green)'}
              extra="sem a posição do aparelho"
            />
          </div>

          {porVendedor.length > 0 && (
            <div className="opcoes">
              {porVendedor.map((u) => (
                <span key={u.id} className="chip" style={{ gap: 6 }}>
                  <Avatar nome={u.name} cor={u.color} pequeno />
                  {u.name.split(' ')[0]} · {u.total}
                </span>
              ))}
            </div>
          )}

          <div className="card">
            {lista.length === 0 ? (
              <Vazio emoji="→" titulo="Nenhuma visita neste período" texto="Mude o período ou o filtro de resultado." />
            ) : (
              lista.map((v) => (
                <div key={v.id} className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="entre" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div className="linha" style={{ gap: 8, minWidth: 0 }}>
                      {ehGestor && v.user && <Avatar nome={v.user.name} cor={v.user.color} pequeno />}
                      <div style={{ minWidth: 0 }}>
                        <b
                          className="truncar"
                          style={{ display: 'block', cursor: v.client ? 'pointer' : 'default' }}
                          onClick={() => v.client && navigate(`/carteira/${v.client.id}`)}
                        >
                          {v.client?.company ?? 'Cliente removido'}
                        </b>
                        <span className="mini">
                          {diaMes(v.at)} às {hora(v.at)}
                          {ehGestor && v.user ? ` · ${v.user.name}` : ''}
                          {v.client?.city ? ` · ${v.client.city}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <span className="chip" style={{ color: v.resultadoMeta?.cor ?? 'var(--text-2)' }}>
                        {v.resultadoMeta?.emoji} {v.resultadoMeta?.label ?? v.resultado}
                      </span>
                      {v.tipo === 'lead' && <span className="chip chip-marca">lead novo</span>}
                      {v.semGps ? (
                        <span className="chip chip-alerta">sem GPS</span>
                      ) : (
                        <a
                          className="chip"
                          href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ⌖ GPS ↗
                        </a>
                      )}
                      {v.fotos?.length > 0 && <span className="chip">▣ {v.fotos.length}</span>}
                      {v.audio && <span className="chip">● áudio</span>}
                      {podeExcluir(v) && (
                        <button className="btn-remover" title="Excluir esta visita" onClick={() => setExcluir(v)}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  {v.notes && <p className="menor" style={{ marginTop: 6 }}>{v.notes}</p>}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {excluir && (
        <ConfirmarExclusao
          titulo="Excluir visita"
          alvo={`${excluir.client?.company ?? 'Cliente'} · ${diaMes(excluir.at)} às ${hora(excluir.at)}`}
          descricao={
            excluir.tipo === 'lead'
              ? 'Atenção: esta visita é a prova do cadastro do lead. Sem ela o lead fica sem prova.'
              : 'A visita sai do histórico do cliente e dos KPIs do dia.'
          }
          itens={excluir.fotos?.length || excluir.audio ? ['Fotos e áudio anexados'] : []}
          textoBotao="Excluir visita"
          onFechar={() => setExcluir(null)}
          onConfirmar={async () => {
            await endpoints.excluirVisita(excluir.id);
            toast('Visita excluída.');
            recarregar();
          }}
        />
      )}
    </div>
  );
}
