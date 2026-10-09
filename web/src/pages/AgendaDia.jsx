import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { addDays, dateKey, diaExtenso, hora, isToday, parseKey } from '../lib/date.js';
import { Carregando, Progresso, Stat, Vazio } from '../components/ui.jsx';
import SugestoesDoDia from '../components/SugestoesDoDia.jsx';
import EventoCard from '../components/EventoCard.jsx';
import EventoModal from '../components/EventoModal.jsx';

export default function AgendaDia() {
  const { data } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { toast, recarregarNotificacoes, ehGestor } = useApp();

  const chave = data ?? dateKey();
  const dia = parseKey(chave);
  const [modal, setModal] = useState(null);
  const [novaTarefa, setNovaTarefa] = useState('');

  // Gestão: agenda de um vendedor (userId na URL) ou a própria (vazio)
  const vendedor = ehGestor ? params.get('userId') ?? '' : '';
  const userId = vendedor || undefined;
  const { dados: equipe } = useRecurso(
    () => (ehGestor ? endpoints.equipe() : Promise.resolve([])),
    [ehGestor]
  );
  const vendedores = (equipe ?? []).filter((u) => u.role === 'vendedor');
  const escolhido = vendedores.find((v) => v.id === vendedor);

  // Trocar de dia mantém a agenda de quem está sendo vista
  const irPara = (novaChave) => navigate({ pathname: `/dia/${novaChave}`, search: vendedor ? `?userId=${vendedor}` : '' });
  const trocarVendedor = (id) => {
    const p = new URLSearchParams(params);
    if (id) p.set('userId', id);
    else p.delete('userId');
    setParams(p, { replace: true });
  };

  const { dados, carregando, recarregar } = useRecurso(() => endpoints.eventosDoDia(chave, userId), [chave, userId]);
  // Compromisso criado pelo botão + do topo: a agenda aberta se atualiza
  useEffect(() => {
    const aoMudar = () => recarregar();
    window.addEventListener('newpay:agenda-mudou', aoMudar);
    return () => window.removeEventListener('newpay:agenda-mudou', aoMudar);
  }, [recarregar]);
  const eventos = dados?.eventos ?? [];
  const tarefas = dados?.tarefas ?? [];
  const followups = dados?.followups ?? [];
  const resumo = dados?.resumo;

  const agora = new Date();
  const indiceAgora = isToday(dia)
    ? eventos.findIndex((e) => new Date(e.start) > agora)
    : -1;

  const alternarTarefa = async (t) => {
    await endpoints.atualizarTarefa(t.id, { done: !t.done });
    recarregar();
    recarregarNotificacoes();
  };

  /**
   * Primeira hora cheia livre do dia, entre 8h e 18h. E o que faz o "Agendar"
   * das sugestoes ser um toque so: ninguem precisa escolher horario para
   * marcar uma visita que vai acontecer "de manha".
   */
  const proximoHorarioLivre = () => {
    const ocupado = eventos
      .filter((e) => e.status !== 'cancelado')
      .map((e) => [new Date(e.start).getTime(), new Date(e.end).getTime()]);

    for (let h = 8; h <= 17; h++) {
      const inicio = new Date(`${chave}T${String(h).padStart(2, '0')}:00:00`);
      const fim = new Date(inicio.getTime() + 60 * 60000);
      if (isToday(dia) && inicio < agora) continue;
      const livre = !ocupado.some(([de, ate]) => inicio.getTime() < ate && fim.getTime() > de);
      if (livre) return inicio;
    }
    return new Date(`${chave}T18:00:00`);
  };

  const agendarVisita = async (cliente) => {
    const inicio = proximoHorarioLivre();
    await endpoints.criarEvento({
      title: `Visita ${cliente.company}`,
      type: 'visita',
      start: inicio.toISOString(),
      end: new Date(inicio.getTime() + 60 * 60000).toISOString(),
      clientId: cliente.id,
      location: [cliente.address, cliente.city].filter(Boolean).join(' — '),
      ownerId: userId,
    });
    toast(`${cliente.company} na agenda às ${hora(inicio)}.`);
    recarregar();
  };

  const criarTarefa = async (e) => {
    e.preventDefault();
    if (!novaTarefa.trim()) return;
    await endpoints.criarTarefa({
      title: novaTarefa,
      kind: 'tarefa',
      dueAt: new Date(`${chave}T18:00:00`).toISOString(),
      ownerId: userId,
    });
    setNovaTarefa('');
    toast('Tarefa adicionada.');
    recarregar();
  };

  return (
    <div className="page">
      <div className="dia-navegacao">
        <button className="btn btn-icone" onClick={() => irPara(dateKey(addDays(dia, -1)))} aria-label="Dia anterior">‹</button>
        <div className="crescer">
          <h2 className="dia-titulo">{diaExtenso(dia)}</h2>
          <p className="mini">
            {isToday(dia) ? 'Hoje' : dateKey(dia) === dateKey(addDays(new Date(), 1)) ? 'Amanhã' : 'Agenda do dia'}
            {escolhido ? ` · agenda de ${escolhido.name}` : ''}
          </p>
        </div>
        <button className="btn btn-icone" onClick={() => irPara(dateKey(addDays(dia, 1)))} aria-label="Próximo dia">›</button>
        <input
          type="date"
          className="input"
          style={{ width: 'auto' }}
          value={chave}
          onChange={(e) => e.target.value && irPara(e.target.value)}
        />
        {ehGestor && (
          <select
            className="select select-inline"
            value={vendedor}
            onChange={(e) => trocarVendedor(e.target.value)}
            aria-label="De quem é a agenda"
          >
            <option value="">Minha agenda</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setModal({})}>+ Compromisso</button>
      </div>

      {resumo && (
        <div className="grid grid-4">
          <Stat rotulo="Compromissos" valor={resumo.total} extra={`${resumo.pendentes} pendente(s)`} destaque />
          <Stat rotulo="Realizados" valor={resumo.realizados} cor="var(--green)" />
          <div className="stat">
            <div className="rotulo">Meta de visitas</div>
            <div className="valor">
              {resumo.visitasRealizadas}
              <span style={{ fontSize: '0.9rem', color: 'var(--text-3)', fontWeight: 600 }}> / {resumo.metaDiaria}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progresso
                atual={resumo.visitasRealizadas}
                total={resumo.metaDiaria}
                cor={resumo.visitasRealizadas >= resumo.metaDiaria ? 'var(--brand)' : 'var(--yellow)'}
              />
            </div>
          </div>
          <Stat
            rotulo="Tarefas"
            valor={`${resumo.tarefasConcluidas}/${resumo.tarefasTotal}`}
            cor="var(--purple)"
            extra="Concluídas hoje"
          />
        </div>
      )}

      <div className="layout-dia">
        <div className="card">
          <div className="card-header">
            <h2>Agenda de hoje</h2>
            <span className="card-sub">{eventos.length} compromisso(s)</span>
          </div>

          {carregando ? (
            <Carregando linhas={5} />
          ) : eventos.length === 0 ? (
            <Vazio
              emoji="☀︎"
              titulo="Dia livre"
              texto="Nenhum compromisso agendado."
              acao={
                <button className="btn btn-brand" onClick={() => navigate('/carteira')}>
                  ◇ Abrir carteira
                </button>
              }
            />
          ) : (
            <div className="timeline" style={{ padding: '8px 0 14px' }}>
              {eventos.map((ev, i) => (
                <div key={ev.id}>
                  {i === indiceAgora && (
                    <div className="agora-marcador">
                      <span>AGORA {hora(agora)}</span>
                      <span className="traco" />
                    </div>
                  )}
                  <div className={`tl-item${i === indiceAgora ? ' tl-agora' : ''}`}>
                    <div className="tl-hora">
                      {hora(ev.start)}
                      <small>{hora(ev.end)}</small>
                    </div>
                    <div className="tl-trilho">
                      <span className="tl-bolinha" style={{ background: ev.typeMeta.color }} />
                      <EventoCard evento={ev} onMudou={recarregar} onEditar={setModal} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="coluna">
          <SugestoesDoDia
            data={chave}
            hoje={isToday(dia)}
            passado={chave < dateKey()}
            userId={userId}
            onAgendar={agendarVisita}
          />

          {followups.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2>Follow-ups do dia</h2>
                <span className="card-sub">{followups.length}</span>
              </div>
              {followups.map((f) => (
                <div key={f.id} className="cliente-linha" onClick={() => navigate('/')}>
                  <span className="followup-selo">{f.passo.dia ? `D+${f.passo.dia}` : 'Retorno'}</span>
                  <div className="info">
                    <b className="truncar" style={{ display: 'block' }}>{f.client?.company}</b>
                    <span className="mini">{f.passo.label} · {hora(f.dueAt)}</span>
                  </div>
                </div>
              ))}
              <p className="card-pad mini">O resultado de cada um se registra na tela Hoje.</p>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2>Tarefas do dia</h2>
              <span className="card-sub">{tarefas.filter((t) => t.done).length}/{tarefas.length}</span>
            </div>

            {tarefas.length === 0 ? (
              <Vazio emoji="✎" titulo="Sem tarefas" texto="Adicione um lembrete abaixo." />
            ) : (
              tarefas.map((t) => (
                <div
                  key={t.id}
                  className={`tarefa${t.done ? ' feita' : ''}${!t.done && new Date(t.dueAt) < agora ? ' atrasada' : ''}`}
                >
                  <button className="marcar" onClick={() => alternarTarefa(t)} aria-label="Concluir">✓</button>
                  <div className="crescer">
                    <div className="texto">{t.title}</div>
                    <div className="mini prazo">
                      {t.kind === 'meta' ? '⊙ Meta' : t.kind === 'lembrete' ? '◷ Lembrete' : '✓ Tarefa'}
                      {t.dueAt ? ` · ${hora(t.dueAt)}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}

            <form onSubmit={criarTarefa} className="linha" style={{ padding: 12, gap: 8 }}>
              <input
                className="input"
                placeholder="Nova tarefa ou lembrete..."
                value={novaTarefa}
                onChange={(e) => setNovaTarefa(e.target.value)}
              />
              <button className="btn btn-primary">+</button>
            </form>
          </div>

          <div className="card card-pad coluna">
            <h3>Atalhos</h3>
            <button className="btn btn-block" onClick={() => navigate('/carteira')}>◇ Abrir carteira</button>
            <button className="btn btn-block" onClick={() => navigate('/avisos')}>⚑︎ Mural de avisos</button>
          </div>
        </div>
      </div>

      {modal && (
        <EventoModal
          evento={modal.id ? modal : null}
          dataPadrao={chave}
          ownerId={userId}
          onFechar={() => setModal(null)}
          onSalvo={recarregar}
        />
      )}
    </div>
  );
}
