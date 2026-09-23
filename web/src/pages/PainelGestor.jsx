// Painel do Gestor: execução da rotina hoje, ponto da equipe, resultado
// comercial do mês e disciplina de registro diário.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, duracao, hora, moeda, pad } from '../lib/date.js';
import { Avatar, Carregando, Modal, Progresso, Stat, Vazio } from '../components/ui.jsx';

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
        <button className={`aba${aba === 'ponto' ? ' ativa' : ''}`} onClick={() => setAba('ponto')}>Ponto</button>
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

      {/* ==================================================== PONTO ===== */}
      {aba === 'ponto' && <PontoEquipe data={data} setData={setData} />}

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
                    <span className="avatar" style={{ background: 'var(--slate)' }}>{c.maquinas}</span>
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

/* ================================================================ ponto == */

const horaCurta = (iso) => (iso ? hora(iso) : '--:--');

/** ISO → valor de <input type="datetime-local"> em horário local */
const paraInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Onde a batida aconteceu, com link do mapa quando o aparelho informou */
function LocalBatida({ registro }) {
  const { inicioLocal: local, inicioEndereco: endereco } = registro;
  if (!local?.mapa) return <> · sem localização</>;
  return (
    <>
      {' · '}
      <a href={local.mapa} target="_blank" rel="noreferrer">{endereco || 'ver no mapa'}</a>
    </>
  );
}

/**
 * Ponto da equipe no dia: quem bateu, a que horas, de onde — e a correção do
 * gestor. Toda alteração feita aqui fica gravada com o motivo e o nome de quem
 * mexeu: ponto corrigido sem rastro não serve de prova para ninguém.
 */
function PontoEquipe({ data, setData }) {
  const { dados, carregando, recarregar } = useRecurso(() => endpoints.jornadaEquipe(data), [data]);
  const [ajuste, setAjuste] = useState(null);

  if (carregando || !dados) return <Carregando linhas={5} />;

  const minutosDoDia = dados.linhas.reduce((s, l) => s + l.minutos, 0);
  const aRevisar = dados.linhas.filter((l) => l.revisar).length;

  return (
    <>
      <div className="linha" style={{ flexWrap: 'wrap' }}>
        <input type="date" className="input" style={{ width: 'auto' }} value={data} onChange={(e) => setData(e.target.value)} />
        <button className="btn btn-sm" onClick={() => setData(dateKey())}>Hoje</button>
      </div>

      <div className="grid grid-4">
        <Stat rotulo="Em campo agora" valor={dados.emCampo} destaque extra="Expediente aberto" />
        <Stat
          rotulo="Não bateram o ponto"
          valor={dados.naoComecaram}
          cor={dados.naoComecaram > 0 ? 'var(--red)' : 'var(--green)'}
          extra={`de ${dados.linhas.length} vendedores`}
        />
        <Stat rotulo="Horas no dia" valor={duracao(minutosDoDia)} cor="var(--blue)" extra="Somando a equipe" />
        <Stat
          rotulo="A revisar"
          valor={aRevisar}
          cor={aRevisar > 0 ? 'var(--orange)' : 'var(--green)'}
          extra={aRevisar > 0 ? 'Jornada longa demais' : 'Nada fora da curva'}
        />
      </div>

      {dados.linhas.length === 0 ? (
        <div className="card">
          <Vazio emoji="⏱️" titulo="Nenhum vendedor ativo" texto="Cadastre a equipe para acompanhar o ponto." />
        </div>
      ) : (
        <div className="grid-auto-larga">
          {dados.linhas.map((l) => (
            <div key={l.vendedor.id} className="card card-pad coluna">
              <div className="linha">
                <Avatar nome={l.vendedor.name} cor={l.vendedor.color} />
                <div className="crescer">
                  <b className="truncar" style={{ display: 'block' }}>{l.vendedor.name}</b>
                  <span className="mini">{l.vendedor.city || 'sem cidade'}</span>
                </div>
                <span className={`chip${l.emAndamento ? ' chip-ok' : l.comecou ? '' : ' chip-alerta'}`}>
                  {l.emAndamento ? 'em campo' : l.comecou ? duracao(l.minutos) : 'sem ponto'}
                </span>
              </div>

              {l.registros.length === 0 ? (
                <p className="mini">Nada registrado neste dia.</p>
              ) : (
                l.registros.map((r) => (
                  <div key={r.id} className="entre">
                    <span className="mini">
                      <b>{horaCurta(r.inicioAt)} → {r.fimAt ? horaCurta(r.fimAt) : 'em aberto'}</b>
                      {r.fimAt ? ` · ${duracao(r.duracaoMin)}` : ''}
                      {r.lancadoPor ? ' · lançado pela gestão' : ''}
                      {r.revisar ? ' · ⚠️ revisar' : ''}
                      {r.justificativa ? ` · ${r.justificativa}` : ''}
                      <LocalBatida registro={r} />
                    </span>
                    <button className="btn btn-sm" onClick={() => setAjuste({ vendedor: l.vendedor, registro: r })}>
                      Corrigir
                    </button>
                  </div>
                ))
              )}

              <div className="detalhe-acoes">
                <button className="btn btn-sm" onClick={() => setAjuste({ vendedor: l.vendedor, registro: null })}>
                  + Lançar expediente
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ajuste && (
        <AjustarPonto
          vendedor={ajuste.vendedor}
          registro={ajuste.registro}
          data={data}
          onFechar={() => setAjuste(null)}
          onSalvo={recarregar}
        />
      )}
    </>
  );
}

/** Correção de uma batida, ou lançamento do expediente que ninguém bateu */
function AjustarPonto({ vendedor, registro, data, onFechar, onSalvo }) {
  const { toast } = useApp();
  const novo = !registro;
  const [inicio, setInicio] = useState(registro ? paraInput(registro.inicioAt) : `${data}T08:00`);
  const [fim, setFim] = useState(registro ? paraInput(registro.fimAt) : `${data}T17:00`);
  const [justificativa, setJustificativa] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      const corpo = {
        justificativa,
        inicioAt: inicio ? new Date(inicio).toISOString() : undefined,
        fimAt: fim ? new Date(fim).toISOString() : undefined,
      };
      if (novo) {
        await endpoints.lancarExpediente({ ...corpo, userId: vendedor.id });
        toast(`Expediente lançado para ${vendedor.name.split(' ')[0]}.`);
      } else {
        await endpoints.corrigirExpediente(registro.id, corpo);
        toast('Ponto corrigido.');
      }
      onSalvo();
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={novo ? 'Lançar expediente' : 'Corrigir ponto'}
      subtitulo={vendedor.name}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : novo ? 'Lançar' : 'Salvar correção'}
          </button>
        </>
      }
    >
      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="pt-inicio">Entrada</label>
          <input id="pt-inicio" className="input" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="pt-fim">Saída</label>
          <input id="pt-fim" className="input" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="pt-motivo">Motivo</label>
        <input
          id="pt-motivo"
          className="input"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder={novo ? 'Ex.: celular sem bateria, trabalhou o dia todo' : 'Ex.: esqueceu de encerrar'}
        />
        <span className="mini">
          Fica gravado no registro junto com o seu nome.{' '}
          {novo
            ? 'Sem a saída, o expediente nasce aberto.'
            : 'Deixe a saída em branco para manter o expediente aberto.'}
        </span>
      </div>
    </Modal>
  );
}
