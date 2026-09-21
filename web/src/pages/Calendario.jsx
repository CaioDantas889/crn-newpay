import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import {
  DIAS_SEMANA, addMonths, dateKey, gradeDoMes, hora, isToday, mesExtenso, startOfDay,
} from '../lib/date.js';
import { Carregando, Stat, Vazio } from '../components/ui.jsx';
import EventoModal from '../components/EventoModal.jsx';

export default function Calendario() {
  const { meta, ehGestor } = useApp();
  const navigate = useNavigate();

  const [referencia, setReferencia] = useState(() => startOfDay(new Date()));
  const [filtro, setFiltro] = useState(null);
  const [vendedor, setVendedor] = useState('');
  const [modal, setModal] = useState(null);

  const dias = useMemo(() => gradeDoMes(referencia), [referencia]);
  const inicio = dias[0];
  const fim = dias[dias.length - 1];

  const { dados: equipe } = useRecurso(
    () => (ehGestor ? endpoints.equipe() : Promise.resolve([])),
    [ehGestor]
  );
  const { dados: eventos, carregando, recarregar } = useRecurso(
    () => endpoints.eventosPeriodo(inicio, fim, vendedor || undefined),
    [inicio.getTime(), fim.getTime(), vendedor]
  );

  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const ev of eventos ?? []) {
      if (filtro && ev.type !== filtro) continue;
      const chave = dateKey(ev.start);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(ev);
    }
    return mapa;
  }, [eventos, filtro]);

  const doMes = (eventos ?? []).filter((e) => new Date(e.start).getMonth() === referencia.getMonth());
  const resumo = {
    total: doMes.length,
    visitas: doMes.filter((e) => e.type === 'visita').length,
    realizados: doMes.filter((e) => e.status === 'realizado').length,
    corporativos: doMes.filter((e) => e.scope === 'corporativo').length,
  };

  const proximos = (eventos ?? [])
    .filter((e) => new Date(e.start) >= new Date() && e.status === 'agendado')
    .slice(0, 5);

  return (
    <div className="page">
      <div className="cal-topo">
        <button className="btn btn-icone" onClick={() => setReferencia(addMonths(referencia, -1))} aria-label="Mês anterior">‹</button>
        <span className="cal-mes">{mesExtenso(referencia)}</span>
        <button className="btn btn-icone" onClick={() => setReferencia(addMonths(referencia, 1))} aria-label="Próximo mês">›</button>
        <button className="btn btn-sm" onClick={() => setReferencia(startOfDay(new Date()))}>Hoje</button>

        {ehGestor && (
          <select className="select" style={{ width: 'auto' }} value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Minha agenda</option>
            <option value="todos">Equipe inteira</option>
            {(equipe ?? []).filter((u) => u.role === 'vendedor').map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}

        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({})}>
          + Novo compromisso
        </button>
      </div>

      <div className="grid grid-4">
        <Stat rotulo="Compromissos no mês" valor={resumo.total} extra={`${resumo.realizados} já realizados`} destaque />
        <Stat rotulo="Visitas planejadas" valor={resumo.visitas} cor="var(--blue)" />
        <Stat rotulo="Agenda corporativa" valor={resumo.corporativos} cor="var(--red)" extra="Reuniões e treinamentos" />
        <Stat
          rotulo="Execução"
          valor={`${resumo.total ? Math.round((resumo.realizados / resumo.total) * 100) : 0}%`}
          cor="var(--green)"
          extra="Compromissos concluídos"
        />
      </div>

      <div className="card">
        {carregando ? (
          <Carregando linhas={6} />
        ) : (
          <>
            <div className="cal-cabecalho">
              {DIAS_SEMANA.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="cal-grade">
              {dias.map((dia) => {
                const chave = dateKey(dia);
                const doDia = porDia.get(chave) ?? [];
                const foraDoMes = dia.getMonth() !== referencia.getMonth();
                return (
                  <button
                    key={chave}
                    className={`cal-dia${foraDoMes ? ' fora' : ''}${isToday(dia) ? ' hoje' : ''}`}
                    onClick={() => navigate(`/dia/${chave}`)}
                  >
                    <span className="cal-num">
                      {dia.getDate()}
                      {doDia.some((e) => e.scope === 'corporativo' && e.requiresConfirmation && !e.myConfirmation) && (
                        <span className="marca" title="Confirmação pendente" />
                      )}
                    </span>

                    {doDia.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className="cal-pill"
                        style={{
                          background: ev.typeMeta.soft,
                          color: ev.typeMeta.ink,
                          borderLeftColor: ev.typeMeta.color,
                        }}
                      >
                        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{hora(ev.start)}</b> {ev.title}
                      </span>
                    ))}
                    {doDia.length > 3 && <span className="cal-mais">+{doDia.length - 3} mais</span>}

                    <span className="cal-pontos">
                      {doDia.slice(0, 8).map((ev) => (
                        <i key={ev.id} style={{ background: ev.typeMeta.color }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Legenda por cor: cada tipo mostra quantos eventos tem no mês e
            funciona como filtro da grade */}
        <div className="cal-legenda">
          {Object.entries(meta?.eventTypes ?? {}).map(([chave, info]) => {
            const quantidade = doMes.filter((e) => e.type === chave).length;
            const ativo = filtro === chave;
            return (
              <button
                key={chave}
                className={`legenda-item${ativo ? ' ativa' : ''}`}
                style={
                  ativo
                    ? { background: info.soft, borderColor: info.color, color: info.ink }
                    : { opacity: filtro ? 0.45 : 1 }
                }
                onClick={() => setFiltro(ativo ? null : chave)}
                title={`Mostrar apenas ${info.label.toLowerCase()}`}
              >
                <i style={{ background: info.color }} />
                {info.label}
                <b>{quantidade}</b>
              </button>
            );
          })}
          {filtro && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFiltro(null)}>limpar filtro</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Próximos compromissos</h2>
        </div>
        {proximos.length === 0 ? (
          <Vazio emoji="🗓️" titulo="Nada agendado à frente" texto="Agende retornos pela carteira para encher o seu dia." />
        ) : (
          proximos.map((ev) => (
            <div
              key={ev.id}
              className="cliente-linha"
              onClick={() => navigate(`/dia/${dateKey(ev.start)}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/dia/${dateKey(ev.start)}`)}
            >
              <span
                style={{
                  width: 42, height: 42, borderRadius: 11, flex: 'none', display: 'grid',
                  placeItems: 'center', background: ev.typeMeta.soft, color: ev.typeMeta.ink,
                  fontWeight: 700, fontSize: '0.72rem', lineHeight: 1.1, textAlign: 'center',
                  border: `1px solid ${ev.typeMeta.color}33`,
                }}
              >
                {new Date(ev.start).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </span>
              <div className="info">
                <b className="truncar" style={{ display: 'block' }}>{ev.title}</b>
                <span className="mini">
                  <span style={{ color: ev.typeMeta.ink, fontWeight: 650 }}>{ev.typeMeta.label}</span>
                  {' · '}{hora(ev.start)}
                  {ev.location ? ` · ${ev.location}` : ''}
                </span>
              </div>
              {ev.scope === 'corporativo' && <span className="chip">🏢</span>}
            </div>
          ))
        )}
      </div>

      {modal && (
        <EventoModal
          evento={modal.id ? modal : null}
          onFechar={() => setModal(null)}
          onSalvo={recarregar}
        />
      )}
    </div>
  );
}
