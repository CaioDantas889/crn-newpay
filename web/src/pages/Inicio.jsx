// Tela inicial: meta do mês, o que fazer hoje e o funil.
// Responde em 5 segundos: quanto falta para a meta, quem visitar, quem
// retornar e quanto já ganhei.

import { useNavigate, useOutletContext } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { hora, moeda, relativo } from '../lib/date.js';
import { Carregando, Progresso, Vazio } from '../components/ui.jsx';

const ATIVIDADES = [
  { chave: 'visitasAgendadas', label: 'Visitas agendadas', emoji: '📍', rota: '/dia' },
  { chave: 'followupsPendentes', label: 'Follow-ups pendentes', emoji: '🟡', rota: '/dia' },
  { chave: 'clientesParaRetornar', label: 'Clientes para retornar', emoji: '🔁', rota: '/carteira?ordem=contato' },
  { chave: 'propostasEnviadas', label: 'Propostas enviadas hoje', emoji: '📄', rota: '/carteira?stage=proposta' },
];

export default function Inicio() {
  const { user } = useApp();
  const navigate = useNavigate();
  const { abrirRegistroVisita } = useOutletContext();
  const { dados, carregando } = useRecurso(() => endpoints.dashboard(), []);

  if (carregando || !dados) return <div className="page"><Carregando linhas={6} /></div>;

  const { resumo, ranking, atividades, funil, kpiHoje, clientesQuentes, proximosCompromissos } = dados;
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
        <button className="btn btn-brand" onClick={abrirRegistroVisita}>⚡ Registrar visita</button>
      </div>

      {!kpiHoje.fechado && hoje.getHours() >= 16 && (
        <button className="card card-pad linha alerta-kpi" onClick={() => navigate('/fechar-dia')}>
          <span style={{ fontSize: '1.4rem' }}>📋</span>
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
      <div className="card-meta">
        <div className="entre">
          <span className="selo" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>Meta do mês</span>
          <span className="chip-nivel" style={{ background: resumo.nivel.cor }}>
            {resumo.nivel.emoji} {resumo.nivel.label}
          </span>
        </div>

        <div className="meta-numero">
          <b>{resumo.maquinasAtivadas}</b>
          <span>/ {resumo.meta.metaMaquinas} máquinas ativadas</span>
        </div>

        <Progresso
          atual={resumo.maquinasAtivadas}
          total={resumo.meta.metaMaquinas}
          cor={resumo.percentualMeta >= 100 ? '#34d399' : 'var(--laranja-forte)'}
        />

        <div className="meta-linha">
          <span>{resumo.percentualMeta}% da meta</span>
          <span>
            {resumo.meta.metaMaquinas === 0
              ? 'sem meta definida para o mês'
              : faltam > 0
                ? `faltam ${faltam} máquinas`
                : 'meta batida 🎉'}
          </span>
        </div>

        <div className="meta-grid">
          <div>
            <span className="rotulo">Máquinas ativadas</span>
            <b>{resumo.maquinasAtivadas}</b>
            <small>{resumo.maquinasVendidas} vendidas no mês</small>
          </div>
          <div>
            <span className="rotulo">Visitas do mês</span>
            <b>{resumo.visitas}</b>
            <small>{resumo.visitasProdutivas} produtivas</small>
          </div>
          <div>
            <span className="rotulo">Ranking</span>
            <b>{ranking.posicao}º de {ranking.total}</b>
            <small>
              {ranking.lider ? `Líder: ${ranking.lider.name.split(' ')[0]} (${ranking.lider.maquinas})` : '—'}
            </small>
          </div>
          <div>
            <span className="rotulo">Vendas no mês</span>
            <b>{resumo.maquinasVendidas} máquinas</b>
            <small>{resumo.vendas} negócios fechados</small>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ atividades do dia */}
      <div className="card">
        <div className="card-header">
          <h2>Atividades do dia</h2>
          <span className="card-sub">
            {atividades.visitasRealizadas} de {resumo.meta.metaVisitasDia} visitas registradas
          </span>
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
        {atividades.followupsVencidos > 0 && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <div className="chip chip-erro">⏰ {atividades.followupsVencidos} follow-up(s) vencido(s)</div>
          </div>
        )}
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
              emoji="🔍"
              titulo="Nenhum lead quente"
              texto="Preencha o diagnóstico dos clientes para o CRM pontuar a oportunidade."
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
            emoji="✅"
            titulo="Nada mais marcado para hoje"
            texto="Agende o retorno dos clientes pela carteira."
            acao={<button className="btn btn-brand" onClick={() => navigate('/carteira')}>🤝 Abrir carteira</button>}
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
    </div>
  );
}
