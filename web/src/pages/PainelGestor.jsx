// Painel do Gestor: execução da rotina hoje, resultado comercial do mês e
// disciplina de registro diário.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useRecurso } from '../state/app.jsx';
import { dateKey, hora, moeda } from '../lib/date.js';
import { Avatar, Carregando, Progresso, Stat } from '../components/ui.jsx';

const SITUACOES = {
  em_reuniao: '🔴 Em reunião',
  em_visita: '🔵 Em visita',
  em_rota: '🟢 Em rota',
  sem_agenda: '⚫ Sem agenda',
  atrasado: '🟠 Atrasado',
  dia_concluido: '🟣 Dia concluído',
  livre: '⚪ Livre',
};

export default function PainelGestor() {
  const navigate = useNavigate();
  const [aba, setAba] = useState('hoje');
  const [data, setData] = useState(dateKey());

  const { dados: visao, carregando } = useRecurso(() => endpoints.visaoGeral(data), [data]);
  const { dados: ind } = useRecurso(() => endpoints.indicadores(), []);
  const { dados: kpis } = useRecurso(() => endpoints.kpisEquipe(7), [aba === 'kpis']);

  if (carregando || !visao) return <div className="page"><Carregando linhas={6} /></div>;

  const r = visao.resumo;
  const t = ind?.totais;

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h1>Painel do gestor</h1>
          <p className="mini">Execução da equipe e resultado comercial.</p>
        </div>
        <button className="btn" onClick={() => navigate('/avisos')}>📢 Publicar comunicado</button>
      </div>

      <div className="abas">
        <button className={`aba${aba === 'hoje' ? ' ativa' : ''}`} onClick={() => setAba('hoje')}>Execução do dia</button>
        <button className={`aba${aba === 'resultado' ? ' ativa' : ''}`} onClick={() => setAba('resultado')}>Resultado do mês</button>
        <button className={`aba${aba === 'kpis' ? ' ativa' : ''}`} onClick={() => setAba('kpis')}>Registro diário</button>
      </div>

      {/* ============================================ EXECUÇÃO DO DIA ==== */}
      {aba === 'hoje' && (
        <>
          <div className="linha" style={{ flexWrap: 'wrap' }}>
            <input type="date" className="input" style={{ width: 'auto' }} value={data} onChange={(e) => setData(e.target.value)} />
            <button className="btn btn-sm" onClick={() => setData(dateKey())}>Hoje</button>
          </div>

          <div className="grid grid-4">
            <Stat rotulo="Vendedores" valor={r.totalVendedores} destaque extra={`${r.emVisita} em visita · ${r.emReuniao} em reunião`} />
            <Stat
              rotulo="Sem agenda"
              valor={r.semAgenda}
              cor={r.semAgenda > 0 ? 'var(--red)' : 'var(--green)'}
              extra={r.atrasados > 0 ? `${r.atrasados} com atraso` : 'Nenhum atraso'}
            />
            <Stat rotulo="Visitas registradas" valor={r.visitasRegistradas} cor="var(--blue)" extra="No dia selecionado" />
            <Stat
              rotulo="KPIs pendentes"
              valor={r.kpisPendentes}
              cor={r.kpisPendentes > 0 ? 'var(--orange)' : 'var(--green)'}
              extra={`${r.maquinasVendidas} máquinas vendidas`}
            />
          </div>

          <div className="grid-auto">
            {visao.equipe.map((item) => (
              <div key={item.vendedor.id} className="card vendedor-card">
                <div className="cabeca">
                  <Avatar nome={item.vendedor.name} cor={item.vendedor.color} />
                  <div className="crescer">
                    <b>{item.vendedor.name}</b>
                    <div className="mini">{item.vendedor.city}</div>
                  </div>
                  <span className={`situacao ${item.situacao}`}>{SITUACOES[item.situacao]}</span>
                </div>

                {item.agora && (
                  <div className="chip chip-alerta" style={{ alignSelf: 'flex-start' }}>
                    Agora: {item.agora.title} · até {hora(item.agora.end)}
                  </div>
                )}
                {!item.agora && item.proximo && (
                  <div className="mini">Próximo: {item.proximo.title} às {hora(item.proximo.start)}</div>
                )}

                <div className="entre mini">
                  <span>
                    {item.totais.realizados}/{item.totais.compromissos} compromissos ·{' '}
                    {item.totais.visitasRegistradas} visitas ·{' '}
                    {item.totais.visitasProdutivas} produtivas
                  </span>
                  {item.totais.atrasados > 0 && (
                    <span style={{ color: 'var(--red)', fontWeight: 700 }}>{item.totais.atrasados} atrasado(s)</span>
                  )}
                </div>

                <div>
                  <div className="entre mini" style={{ marginBottom: 4 }}>
                    <span>Meta de visitas do dia</span>
                    <span className="forte">{item.totais.visitasRegistradas}/{item.vendedor.dailyGoal}</span>
                  </div>
                  <Progresso
                    atual={item.totais.visitasRegistradas}
                    total={item.vendedor.dailyGoal}
                    cor={item.totais.visitasRegistradas >= item.vendedor.dailyGoal ? 'var(--brand)' : 'var(--yellow)'}
                  />
                </div>

                <div className="entre">
                  <span className="mini">
                    {item.totais.maquinasVendidas > 0 ? `💳 ${item.totais.maquinasVendidas} máquina(s) vendida(s)` : 'Nenhuma venda no dia'}
                  </span>
                  <span className={`chip ${item.kpiFechado ? 'chip-ok' : 'chip-alerta'}`}>
                    {item.kpiFechado ? 'KPI fechado' : 'KPI pendente'}
                  </span>
                </div>

                {item.agenda.length > 0 ? (
                  <div className="mini-agenda">
                    {item.agenda.slice(0, 4).map((e) => (
                      <div key={e.id} className={`item${e.status === 'realizado' ? ' feito' : ''}`}>
                        <i style={{ background: e.status === 'realizado' ? 'var(--brand)' : 'var(--line-strong)' }} />
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hora(e.start)}</span>
                        <span className="truncar">{e.title}</span>
                      </div>
                    ))}
                    {item.agenda.length > 4 && <div className="mini">+{item.agenda.length - 4} compromissos</div>}
                  </div>
                ) : (
                  <p className="mini" style={{ color: 'var(--red)' }}>Nenhum compromisso agendado neste dia.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ============================================ RESULTADO DO MÊS === */}
      {aba === 'resultado' && (
        !ind ? (
          <Carregando linhas={6} />
        ) : (
          <>
            <p className="mini">Período: {ind.periodo.de} a {ind.periodo.ate}</p>

            <div className="grid grid-4">
              <Stat rotulo="Leads gerados" valor={t.leadsGerados} extra={`${t.leadsTrabalhados} trabalhados`} destaque />
              <Stat rotulo="Visitas" valor={t.visitas} cor="var(--blue)" extra={`${t.visitasProdutivas} produtivas · ${t.visitasPerdidas} perdidas`} />
              <Stat rotulo="Propostas" valor={t.propostas} cor="var(--purple)" extra={`${t.conversaoPropostaVenda}% viram venda`} />
              <Stat rotulo="Vendas" valor={t.vendas} cor="var(--green)" extra={`${t.maquinasVendidas} máquinas`} />
            </div>

            <div className="grid grid-4">
              <Stat rotulo="Ativações" valor={t.maquinasAtivadas} cor="var(--brand-strong)" extra="Máquinas rodando" />
              <Stat rotulo="Taxa de conversão" valor={`${t.taxaConversao}%`} cor="var(--orange)" extra="Visita → venda" />
              <Stat rotulo="Ticket médio" valor={t.ticketMedioMaquinas} extra="Máquinas por venda" />
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Por vendedor</h2>
                <span className="card-sub">quem trabalha muito e vende pouco aparece aqui</span>
              </div>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th className="num">Visitas</th>
                      <th className="num">Propostas</th>
                      <th className="num">Vendas</th>
                      <th className="num">Ativações</th>
                      <th className="num">Conversão</th>
                      <th className="num">Ticket</th>
                      <th className="num">Meta</th>
                      <th className="num">KPI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ind.porVendedor.map((v) => (
                      <tr key={v.vendedor.id}>
                        <td>
                          <div className="linha">
                            <Avatar nome={v.vendedor.name} cor={v.vendedor.color} pequeno />
                            <span className="truncar">{v.vendedor.name}</span>
                          </div>
                        </td>
                        <td className="num">{v.visitas}</td>
                        <td className="num">{v.propostas}</td>
                        <td className="num">{v.vendas}</td>
                        <td className="num">{v.maquinasAtivadas}</td>
                        <td className="num" style={{ color: v.conversaoVisitaVenda >= 10 ? 'var(--green)' : 'var(--red)' }}>
                          {v.conversaoVisitaVenda}%
                        </td>
                        <td className="num">{v.ticketMedioMaquinas}</td>
                        <td className="num" style={{ color: v.percentualMeta >= 100 ? 'var(--green)' : 'var(--text)' }}>
                          {v.percentualMeta}%
                        </td>
                        <td className="num" style={{ color: v.disciplinaKpi >= 80 ? 'var(--green)' : 'var(--red)' }}>
                          {v.disciplinaKpi}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="card">
                <div className="card-header"><h2>Vendas por cidade</h2></div>
                {ind.porCidade.slice(0, 8).map((c) => (
                  <div key={c.chave} className="cliente-linha">
                    <span className="avatar" style={{ background: 'var(--navy-700)' }}>{c.maquinas}</span>
                    <div className="info">
                      <b>{c.chave}</b>
                      <div className="mini">{c.vendas} venda(s) · {c.maquinas} máquina(s)</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div className="card-header"><h2>Vendas por segmento</h2></div>
                {ind.porSegmento.slice(0, 8).map((c) => (
                  <div key={c.chave} className="cliente-linha">
                    <span className="avatar" style={{ background: 'var(--purple)' }}>{c.maquinas}</span>
                    <div className="info">
                      <b>{c.chave}</b>
                      <div className="mini">{c.vendas} venda(s) · {c.maquinas} máquina(s)</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      )}

      {/* ============================================ REGISTRO DIÁRIO ==== */}
      {aba === 'kpis' && (
        !kpis ? (
          <Carregando linhas={5} />
        ) : (
          <div className="card">
            <div className="card-header">
              <div className="crescer">
                <h2>Registro diário obrigatório</h2>
                <p className="mini">Verde = dia fechado pelo vendedor. Vermelho = sem registro.</p>
              </div>
            </div>
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    {kpis.datas.map((d) => (
                      <th key={d} className="num">{d.slice(8)}/{d.slice(5, 7)}</th>
                    ))}
                    <th className="num">Visitas</th>
                    <th className="num">Máquinas</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.equipe.map((linha) => (
                    <tr key={linha.vendedor.id}>
                      <td>
                        <div className="linha">
                          <Avatar nome={linha.vendedor.name} cor={linha.vendedor.color} pequeno />
                          <span className="truncar">{linha.vendedor.name}</span>
                        </div>
                      </td>
                      {linha.dias.map((d) => (
                        <td key={d.data} className="num">
                          <span
                            className={`kpi-dia ${d.fechado ? 'ok' : 'falta'}`}
                            title={`${d.data}: ${d.visitas} visitas · ${d.maquinas} máquinas`}
                          >
                            {d.fechado ? d.visitas : '—'}
                          </span>
                        </td>
                      ))}
                      <td className="num">{linha.dias.reduce((s, d) => s + d.visitas, 0)}</td>
                      <td className="num">{linha.dias.reduce((s, d) => s + d.maquinas, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
