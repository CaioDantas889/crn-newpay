import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { addDays, dateKey, moeda } from '../lib/date.js';
import { Carregando, ChipTemperatura, Vazio } from '../components/ui.jsx';

export default function AgendaInteligente() {
  const { toast, recarregarNotificacoes } = useApp();
  const navigate = useNavigate();

  const { dados, carregando, recarregar } = useRecurso(() => endpoints.sugestoes(), []);
  const [selecionados, setSelecionados] = useState([]);
  const [rota, setRota] = useState(null);
  const [dataRota, setDataRota] = useState(dateKey());
  const [horaInicio, setHoraInicio] = useState(8);
  const [ocupado, setOcupado] = useState(false);

  const alternar = (id) =>
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const montarRota = async (ids = selecionados) => {
    if (!ids.length) return toast('Selecione pelo menos um cliente.', 'erro');
    setOcupado(true);
    try {
      setSelecionados(ids);
      setRota(await endpoints.montarRota(ids));
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setOcupado(false);
    }
  };

  const agendarRota = async () => {
    setOcupado(true);
    try {
      const r = await endpoints.agendarRota({ clientIds: selecionados, data: dataRota, horaInicio });
      toast(`${r.criados} visitas criadas na agenda.`);
      recarregarNotificacoes();
      setRota(null);
      setSelecionados([]);
      recarregar();
      navigate(`/dia/${r.data}`);
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setOcupado(false);
    }
  };

  if (carregando) return <div className="page"><Carregando linhas={6} /></div>;

  const destaque = dados?.destaque;
  const sugeridos = dados?.sugeridos ?? [];

  return (
    <div className="page">
      {destaque && (
        <div className="destaque-rota">
          <div>
            <h3>{destaque.texto}</h3>
            <p>
              O CRM ordena sua carteira por temperatura do lead, tempo sem contato, potencial de venda e
              distância da sua base.
            </p>
          </div>
          <div className="linha" style={{ flexWrap: 'wrap' }}>
            <button
              className="btn btn-brand"
              onClick={() => montarRota(destaque.clientIds)}
              disabled={ocupado}
            >
              📍 Montar rota em {destaque.cidade}
            </button>
            <button
              className="btn"
              onClick={() => montarRota(sugeridos.slice(0, 5).map((s) => s.id))}
              disabled={ocupado}
            >
              ⚡ Top 5 do dia
            </button>
          </div>
        </div>
      )}

      {rota && (
        <div className="card">
          <div className="card-header">
            <div className="crescer">
              <h2>Rota sugerida</h2>
              <p className="mini">
                {rota.paradas.length} paradas · {rota.totalKm} km · aprox.{' '}
                {Math.floor(rota.minutosTotais / 60)}h{String(rota.minutosTotais % 60).padStart(2, '0')} no total
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setRota(null)}>✕</button>
          </div>

          <div className="rota-parada" style={{ background: 'var(--surface-2)' }}>
            <span className="ordem" style={{ background: 'var(--brand)' }}>🏠</span>
            <div className="crescer">
              <b>{rota.origem.label}</b>
              <div className="mini">Ponto de partida</div>
            </div>
          </div>

          {rota.paradas.map((p) => (
            <div key={p.id} className="rota-parada">
              <span className="ordem">{p.ordem}</span>
              <div className="crescer">
                <b>{p.company}</b>
                <div className="mini">{p.name} · {p.city} · {p.legKm} km da parada anterior</div>
              </div>
              <ChipTemperatura valor={p.temperature} />
            </div>
          ))}

          <div className="card-pad coluna" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="form-linha duas">
              <div className="campo">
                <label htmlFor="rota-data">Agendar para</label>
                <input
                  id="rota-data"
                  type="date"
                  className="input"
                  value={dataRota}
                  min={dateKey()}
                  onChange={(e) => setDataRota(e.target.value)}
                />
              </div>
              <div className="campo">
                <label htmlFor="rota-hora">Início</label>
                <select
                  id="rota-hora"
                  className="select"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(Number(e.target.value))}
                >
                  {[7, 8, 9, 10, 13, 14].map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="linha" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary crescer" onClick={agendarRota} disabled={ocupado}>
                📅 Criar {rota.paradas.length} visitas na agenda
              </button>
              <a className="btn" href={rota.mapsUrl} target="_blank" rel="noreferrer">
                🗺️ Abrir no Google Maps
              </a>
            </div>
            <p className="mini">
              As visitas são criadas em sequência, já considerando o tempo de deslocamento entre as paradas.
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Clientes para visitar hoje</h2>
            <p className="mini">
              {dados?.agendadosHoje ?? 0} já estão na sua agenda de hoje · {sugeridos.length} sugestões
            </p>
          </div>
          {selecionados.length > 0 && (
            <button className="btn btn-brand btn-sm" onClick={() => montarRota()} disabled={ocupado}>
              📍 Montar rota ({selecionados.length})
            </button>
          )}
        </div>

        {sugeridos.length === 0 ? (
          <Vazio emoji="✅" titulo="Carteira em dia" texto="Todos os clientes quentes já estão agendados." />
        ) : (
          sugeridos.map((c) => (
            <div
              key={c.id}
              className={`sugestao${selecionados.includes(c.id) ? ' marcada' : ''}`}
              onClick={() => alternar(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && alternar(c.id)}
            >
              <div className="score">{c.score}</div>
              <div className="crescer">
                <div className="entre">
                  <b>{c.company}</b>
                  <ChipTemperatura valor={c.temperature} />
                </div>
                <div className="mini">
                  {c.name} · {c.city} · {c.distanciaKm} km · {moeda(c.potential)} de potencial
                </div>
                <div className="motivos">
                  {c.motivos.map((m) => (
                    <span key={m} className="motivo">{m}</span>
                  ))}
                </div>
              </div>
              <input
                type="checkbox"
                checked={selecionados.includes(c.id)}
                onChange={() => alternar(c.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 20, height: 20, marginTop: 10 }}
              />
            </div>
          ))
        )}
      </div>

      {(dados?.grupos ?? []).length > 1 && (
        <div className="card">
          <div className="card-header"><h2>Concentração por região</h2></div>
          {dados.grupos.map((g) => (
            <div key={g.cidade} className="cliente-linha" onClick={() => montarRota(g.clientes.slice(0, 6))}>
              <span className="avatar" style={{ background: 'var(--navy-700)' }}>{g.total}</span>
              <div className="info">
                <b>{g.cidade}</b>
                <div className="mini">{g.regiao} · {g.quentes} lead(s) quente(s)</div>
              </div>
              <span className="btn btn-sm">📍 Rota</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
