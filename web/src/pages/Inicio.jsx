// Tela "Hoje" do vendedor, na ordem da cobrança:
//   1. follow-ups atrasados (em vermelho)
//   2. follow-ups do dia
//   3. placar da meta de leads novos
// Abaixo disso continuam a meta do mês, o funil e os leads mais perto de comprar.

import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { duracao, hora, relativo } from '../lib/date.js';
import { Carregando, Falha, Progresso, Vazio } from '../components/ui.jsx';
import { FollowupCard } from '../components/Followup.jsx';
import AtivarMaquina from '../components/AtivarMaquina.jsx';
import { NegocioLinha } from '../components/Negocio.jsx';

const SEM_PENDENCIAS = { prazoDias: 7, semAtivar: [], declaradas: [], totais: {} };

const ATIVIDADES = [
  { chave: 'visitasAgendadas', label: 'Visitas agendadas', emoji: '▤', rota: '/dia' },
  { chave: 'followupsPendentes', label: 'Follow-ups de hoje', emoji: '⚑︎', rota: '/' },
  { chave: 'clientesParaRetornar', label: 'Clientes para retornar', emoji: '↻', rota: '/carteira?ordem=contato' },
  { chave: 'propostasEnviadas', label: 'Propostas enviadas hoje', emoji: '▭', rota: '/carteira?stage=proposta' },
];

export default function Inicio() {
  const { user, placar: placarDoTopo } = useApp();
  const navigate = useNavigate();
  const { abrirRegistroVisita, abrirNovoLead } = useOutletContext();
  const { dados, carregando, erro, recarregar: recarregarPainel } = useRecurso(() => endpoints.dashboard(), []);
  const [ativar, setAtivar] = useState(null);

  // Lead novo ou follow-up concluído em qualquer tela muda o placar do topo:
  // a lista daqui acompanha.
  const { dados: dia, erro: erroDoDia, recarregar } = useRecurso(
    () => endpoints.hoje(),
    [placarDoTopo?.total, placarDoTopo?.pendentes, placarDoTopo?.atrasados]
  );

  // Sem isto, uma falha (servidor fora do ar, ou ainda na versão anterior logo
  // depois de uma atualização) deixaria a tela carregando para sempre.
  const falha = (!dados && erro) || (!dia && erroDoDia);
  if (falha) {
    return <div className="page"><Falha erro={falha} titulo="Não consegui carregar a tela de hoje" /></div>;
  }

  if (carregando || !dados || !dia) return <div className="page"><Carregando linhas={6} /></div>;

  const { resumo, ranking, atividades, funil, kpiHoje, clientesQuentes, proximosCompromissos } = dados;
  const pendentes = dados.ativacoes ?? SEM_PENDENCIAS;
  const { placar, followups, contagens, semContar, sequencia } = dia;
  const faltam = Math.max(0, resumo.meta.metaMaquinas - resumo.maquinasAtivadas);
  const hoje = new Date();
  const saudacao = hoje.getHours() < 12 ? 'Bom dia' : hoje.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h1>{saudacao}, {user.name.split(' ')[0]}.</h1>
          <p className="mini">
            {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="linha">
          <button className="btn" onClick={abrirRegistroVisita}>✓ Registrar visita</button>
          <button className="btn btn-brand" onClick={abrirNovoLead}>+ Novo lead</button>
        </div>
      </div>

      {/* ----------------------------------------- 1. follow-ups atrasados */}
      <div className={`card${followups.atrasados.length ? ' card-atrasados' : ''}`}>
        <div className="card-header">
          <h2>Follow-ups atrasados</h2>
          <span className={`chip ${followups.atrasados.length ? 'chip-erro' : 'chip-ok'}`}>
            {followups.atrasados.length ? `${followups.atrasados.length} em atraso` : 'em dia ✓'}
          </span>
        </div>
        {followups.atrasados.length === 0 ? (
          <p className="card-pad mini">Nenhum follow-up atrasado. É isso que mantém o semáforo verde.</p>
        ) : (
          <div className="followups">
            {followups.atrasados.map((f) => <FollowupCard key={f.id} followup={f} onMudou={recarregar} />)}
          </div>
        )}
      </div>

      {/* -------------------------------------------- 2. follow-ups do dia */}
      <div className="card">
        <div className="card-header">
          <h2>Follow-ups do dia</h2>
          <span className="card-sub">
            {followups.hoje.length} para fazer · {followups.feitosHoje} feito(s) hoje
          </span>
        </div>
        {followups.hoje.length === 0 ? (
          <p className="card-pad mini">
            {followups.feitosHoje > 0
              ? 'Todos os follow-ups de hoje já têm resultado.'
              : 'Nenhum follow-up vence hoje. Todo lead que não fecha gera o próximo sozinho.'}
          </p>
        ) : (
          <div className="followups">
            {followups.hoje.map((f) => <FollowupCard key={f.id} followup={f} onMudou={recarregar} />)}
          </div>
        )}
      </div>

      {/* --------------------------------------- 3. placar da meta de leads */}
      <div className="card-meta">
        <div className="entre">
          <span className="selo" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>Meta de leads novos</span>
          {sequencia > 0 && <span className="chip-nivel" style={{ background: 'var(--laranja)' }}>▲ {sequencia} dia(s) de meta completa</span>}
        </div>

        <div className="meta-numero">
          <b>Hoje: {placar.total}/{placar.meta}</b>
          <span>({placar.presenciais} presenciais · {placar.remotos} remotos)</span>
        </div>

        <Progresso
          atual={placar.total}
          total={placar.meta}
          cor={placar.metaBatida ? '#34d399' : 'var(--laranja-forte)'}
        />

        <div className="meta-linha">
          <span>
            {placar.metaBatida
              ? 'meta batida ★'
              : placar.faltam > 0
                ? `faltam ${placar.faltam} leads`
                : `faltam ${placar.faltamPresenciais} presenciais para o mínimo de ${placar.minPresenciais}`}
          </span>
          <span>
            {!placar.diaDeTrabalho
              ? 'domingo: sem meta'
              : placar.minutosRestantes > 0
                ? `${duracao(placar.minutosRestantes)} até as ${placar.fimDoDia}h`
                : 'dia encerrado'}
          </span>
        </div>

        <div className="meta-grid">
          <div>
            <span className="rotulo">Presenciais</span>
            <b>{placar.presenciais}</b>
            <small>mínimo de {placar.minPresenciais}</small>
          </div>
          <div>
            <span className="rotulo">Remotos</span>
            <b>{placar.remotos}</b>
            <small>
              máximo de {placar.maxRemotos}
              {placar.excedentes > 0 ? ` · ${placar.excedentes} acima do teto` : ''}
            </small>
          </div>
          <div>
            <span className="rotulo">Revisitas hoje</span>
            <b>{contagens.revisitas}</b>
            <small>não contam como lead novo</small>
          </div>
          <div>
            <span className="rotulo">Follow-ups feitos</span>
            <b>{contagens.followupsFeitos}</b>
            <small>{contagens.followupsPendentes} por fazer</small>
          </div>
        </div>
      </div>

      {semContar.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Remotos que ainda não contam</h2>
            <span className="card-sub">{semContar.length} fora da meta</span>
          </div>
          {semContar.map((c) => (
            <div key={c.id} className="cliente-linha lead-cinza" onClick={() => navigate(`/carteira/${c.id}`)}>
              <span className={`chip chip-status ${c.status}`}>{c.status}</span>
              <div className="info">
                <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                <span className="mini">{c.motivo}</span>
              </div>
              <span className="btn btn-sm">Resolver</span>
            </div>
          ))}
        </div>
      )}

      {/* --------------------------------- 4. máquinas vendidas sem ativar */}
      {(pendentes.semAtivar.length > 0 || pendentes.declaradas.length > 0) && (
        <div className={`card${pendentes.totais.atrasadas > 0 ? ' card-atrasados' : ''}`}>
          <div className="card-header">
            <div className="crescer">
              <h2>Máquinas para ativar</h2>
              <p className="mini">
                Venda só vira resultado quando a máquina ativa. Parada há mais de {pendentes.prazoDias} dias fica vermelha.
              </p>
            </div>
            <span className={`chip ${pendentes.totais.atrasadas > 0 ? 'chip-erro' : 'chip-alerta'}`}>
              {pendentes.totais.maquinasSemAtivar ?? 0} sem ativar
              {pendentes.totais.atrasadas > 0 ? ` · ${pendentes.totais.atrasadas} atrasada(s)` : ''}
            </span>
          </div>
          {pendentes.semAtivar.map((n) => (
            <NegocioLinha
              key={n.id}
              negocio={n}
              mostrarCliente
              onClick={() => navigate(`/carteira/${n.clientId}`)}
              acoes={<button className="btn btn-brand btn-sm" onClick={() => setAtivar(n)}>Ativar</button>}
            />
          ))}
          {pendentes.declaradas.length > 0 && (
            <>
              <div className="card-header" style={{ borderTop: '1px solid var(--line)' }}>
                <h3>Aguardando confirmação da gestão</h3>
                <span className="card-sub">{pendentes.totais.maquinasDeclaradas} máquina(s)</span>
              </div>
              {pendentes.declaradas.map((n) => (
                <NegocioLinha key={n.id} negocio={n} mostrarCliente onClick={() => navigate(`/carteira/${n.clientId}`)} />
              ))}
            </>
          )}
        </div>
      )}

      {!kpiHoje.fechado && hoje.getHours() >= 16 && (
        <button className="card card-pad linha alerta-kpi" onClick={() => navigate('/fechar-dia')}>
          <span style={{ fontSize: '1.4rem' }}>▤</span>
          <div className="crescer" style={{ textAlign: 'left' }}>
            <b>Você ainda não fechou o dia</b>
            <p className="mini">
              {kpiHoje.calculado.visitas} visitas · {kpiHoje.calculado.propostas} propostas ·{' '}
              {kpiHoje.calculado.maquinas} máquinas registradas até agora.
            </p>
          </div>
          <span className="btn btn-sm">Fechar agora</span>
        </button>
      )}

      {/* --------------------------------------------------- meta do mês */}
      <div className="card">
        <div className="card-header">
          <h2>Meta do mês</h2>
          <span className="chip-nivel" style={{ background: resumo.nivel.cor }}>
            {resumo.nivel.emoji} {resumo.nivel.label}
          </span>
        </div>
        <div className="card-pad coluna">
          <div className="entre">
            <span>
              <b style={{ fontSize: '1.3rem' }}>{resumo.maquinasAtivadas}</b>
              <span className="mini"> / {resumo.meta.metaMaquinas} máquinas ativadas</span>
            </span>
            <span className="mini">
              {resumo.meta.metaMaquinas === 0
                ? 'sem meta definida para o mês'
                : faltam > 0
                  ? `faltam ${faltam} máquinas`
                  : 'meta batida ★'}
            </span>
          </div>
          <Progresso
            atual={resumo.maquinasAtivadas}
            total={resumo.meta.metaMaquinas}
            cor={resumo.percentualMeta >= 100 ? 'var(--green)' : 'var(--brand)'}
          />
          <div className="entre mini">
            <span>{resumo.maquinasVendidas} vendidas · {resumo.vendas} negócios fechados</span>
            <span>
              {ranking.posicao}º de {ranking.total} no ranking
              {ranking.lider ? ` · líder: ${ranking.lider.name.split(' ')[0]} (${ranking.lider.maquinas})` : ''}
            </span>
          </div>
          {resumo.maquinasDeclaradas > 0 && (
            <p className="mini situacao-alerta">
              +{resumo.maquinasDeclaradas} máquina(s) ativada(s) aguardando confirmação da gestão.
            </p>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ atividades do dia */}
      <div className="card">
        <div className="card-header">
          <h2>Atividades do dia</h2>
          <span className="card-sub">{atividades.visitasRealizadas} visita(s) registrada(s) hoje</span>
        </div>
        <div className="atividades">
          {ATIVIDADES.map((a) => (
            <button key={a.chave} className="atividade" onClick={() => navigate(a.rota)}>
              <span className="emoji">{a.emoji}</span>
              <b>{atividades[a.chave]}</b>
              <span className="mini">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-auto">
        {/* ------------------------------------------------------- funil */}
        <div className="card">
          <div className="card-header">
            <h2>Funil atual</h2>
            <span className="card-sub">{funil.reduce((s, f) => s + f.total, 0)} clientes</span>
          </div>
          <div className="card-pad coluna">
            {funil.map((etapa) => {
              const maior = Math.max(...funil.map((f) => f.total), 1);
              return (
                <button
                  key={etapa.chave}
                  className="funil-linha"
                  onClick={() => navigate(`/carteira?stage=${etapa.chave}`)}
                >
                  <span className="funil-rotulo">{etapa.label}</span>
                  <span className="funil-barra">
                    <span style={{ width: `${(etapa.total / maior) * 100}%`, background: etapa.cor }} />
                  </span>
                  <span className="funil-valor">{etapa.total}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------------------------------------------- clientes quentes */}
        <div className="card">
          <div className="card-header">
            <h2>Mais perto de comprar</h2>
            <span className="card-sub">{clientesQuentes.length} leads quentes</span>
          </div>
          {clientesQuentes.length === 0 ? (
            <Vazio
              emoji="⌕"
              titulo="Nenhum lead quente"
              texto="O resultado da visita e o diagnóstico é que apontam quem está perto de fechar."
              acao={<button className="btn btn-brand" onClick={() => navigate('/carteira')}>Abrir carteira</button>}
            />
          ) : (
            clientesQuentes.map((c) => (
              <div key={c.id} className="cliente-linha" onClick={() => navigate(`/carteira/${c.id}`)}>
                <span className="score-bola">{c.score}</span>
                <div className="info">
                  <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                  <span className="mini">
                    {c.city} · contato {relativo(c.lastContactAt)}
                  </span>
                </div>
                <span className="btn btn-sm">Abrir</span>
              </div>
            ))
          )}
        </div>

        {/* --------------------------------------- próximos compromissos */}
        <div className="card">
          <div className="card-header">
            <h2>Próximos compromissos de hoje</h2>
            <button className="btn btn-sm" onClick={() => navigate('/dia')}>Ver agenda</button>
          </div>
          {proximosCompromissos.length === 0 ? (
            <Vazio
              emoji="✓"
              titulo="Nada mais marcado para hoje"
              texto="Reunião, treinamento e visita marcada aparecem aqui."
              acao={<button className="btn btn-brand" onClick={() => navigate('/carteira')}>◇ Abrir carteira</button>}
            />
          ) : (
            proximosCompromissos.map((ev) => (
              <div key={ev.id} className="cliente-linha" onClick={() => navigate('/dia')}>
                <span
                  style={{
                    width: 46, height: 40, borderRadius: 10, flex: 'none', display: 'grid',
                    placeItems: 'center', background: `${ev.typeMeta.color}18`,
                    color: ev.typeMeta.color, fontWeight: 700, fontSize: '0.78rem',
                  }}
                >
                  {hora(ev.start)}
                </span>
                <div className="info">
                  <b className="truncar" style={{ display: 'block' }}>{ev.title}</b>
                  <span className="mini">{ev.typeMeta.label}{ev.location ? ` · ${ev.location}` : ''}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {ativar && <AtivarMaquina negocio={ativar} onFechar={() => setAtivar(null)} onAtivado={recarregarPainel} />}
    </div>
  );
}
