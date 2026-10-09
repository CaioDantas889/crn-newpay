// Semáforo da equipe: em uma tabela, quem não está fazendo o básico.
// Os vermelhos ficam no topo. Clicar em um vendedor abre o dia dele no mapa
// (GPS e horário de cada visita) e os prints dos leads remotos.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, diaMes, hora } from '../lib/date.js';
import { distancia } from '../lib/mapa.js';
import { Avatar, Carregando, Falha, Modal, Stat, Vazio } from './ui.jsx';
import MapaPonto from './MapaPonto.jsx';

const CORES = { vermelho: 'var(--red)', amarelo: 'var(--yellow)', verde: 'var(--green)', folga: 'var(--text-3)' };
const ROTULOS = { vermelho: 'Vermelho', amarelo: 'Amarelo', verde: 'Verde', folga: 'Folga' };
const horaCurta = (iso) => (iso ? hora(iso) : '—');

export default function SemaforoEquipe({ data, setData }) {
  const { meta } = useApp();
  const { dados, carregando, erro } = useRecurso(() => endpoints.semaforo(data), [data]);
  const [aberto, setAberto] = useState(null);

  if (erro && !dados) return <Falha erro={erro} titulo="Não consegui carregar o semáforo" />;
  if (carregando || !dados) return <Carregando linhas={6} />;

  const r = dados.resumo;
  const regra = meta?.regrasSemaforo;
  const alertas = dados.linhas
    .flatMap((l) => l.alertas.map((a) => ({ ...a, vendedor: l.vendedor })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <>
      <div className="linha" style={{ flexWrap: 'wrap' }}>
        <input type="date" className="input" style={{ width: 'auto' }} value={data} onChange={(e) => setData(e.target.value)} />
        <button className="btn btn-sm" onClick={() => setData(dateKey())}>Hoje</button>
        {dados.parcial && dados.diaDeTrabalho && (
          <span className="mini">Dia em andamento: a cor fecha com o resumo das 19h.</span>
        )}
        {!dados.diaDeTrabalho && <span className="mini">Domingo: sem meta nem semáforo.</span>}
      </div>

      <div className="grid grid-4">
        <Stat
          rotulo="No vermelho"
          valor={r.vermelhos}
          destaque
          extra={`${r.amarelos} amarelo(s) · ${r.verdes} verde(s)`}
        />
        <Stat rotulo="Leads do dia" valor={r.leads} cor="var(--blue)" extra={`meta de ${(meta?.metaLeads?.total ?? 30) * r.vendedores}`} />
        <Stat
          rotulo="Follow-ups atrasados"
          valor={r.atrasados}
          cor={r.atrasados > 0 ? 'var(--red)' : 'var(--green)'}
          extra="Somando a equipe"
        />
        <Stat
          rotulo="Alertas de suspeita"
          valor={r.alertas}
          cor={r.alertas > 0 ? 'var(--orange)' : 'var(--green)'}
          extra="No dia selecionado"
        />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Quem não está fazendo o básico</h2>
            <p className="mini">Toque em um vendedor para ver o dia dele no mapa.</p>
          </div>
        </div>

        {dados.linhas.length === 0 ? (
          <Vazio emoji="▩" titulo="Nenhum vendedor ativo" texto="Cadastre a equipe para acompanhar a meta." />
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-semaforo">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="num">Hoje</th>
                  <th className="num">Semana</th>
                  <th className="num">Mês</th>
                  <th className="num">Atrasados</th>
                  <th className="num">1ª · última visita</th>
                  <th className="num">Conversão P · R</th>
                  <th className="num">Remotos suspeitos</th>
                  <th className="num">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.vendedor.id} className={`linha-semaforo ${l.semaforo.cor}`} onClick={() => setAberto(l)}>
                    <td>
                      <div className="linha">
                        <span className="farol" style={{ background: CORES[l.semaforo.cor] }} title={ROTULOS[l.semaforo.cor]} />
                        <Avatar nome={l.vendedor.name} cor={l.vendedor.color} pequeno />
                        <div style={{ minWidth: 0 }}>
                          <b className="truncar" style={{ display: 'block' }}>{l.vendedor.name}</b>
                          <span className="mini" style={{ color: CORES[l.semaforo.cor] }}>{l.semaforo.motivos.join(' · ')}</span>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <b>{l.hoje.total}/{meta?.metaLeads?.total ?? 30}</b>
                      <div className="mini">
                        {l.hoje.presenciais} pres. · {l.hoje.remotos} rem.
                        {l.hoje.pendentes > 0 ? ` · ${l.hoje.pendentes} pend.` : ''}
                      </div>
                    </td>
                    <td className="num">
                      <b>{l.semana.percentual}%</b>
                      <div className="mini">{l.semana.presenciais} pres. · {l.semana.remotos} rem.</div>
                    </td>
                    <td className="num">
                      <b>{l.mes.percentual}%</b>
                      <div className="mini">{l.mes.presenciais} pres. · {l.mes.remotos} rem.</div>
                    </td>
                    <td className="num" style={{ color: l.atrasados > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      {l.atrasados}
                    </td>
                    <td className="num">
                      {l.primeiraVisita ? `${horaCurta(l.primeiraVisita)} · ${horaCurta(l.ultimaVisita)}` : 'sem visita'}
                    </td>
                    <td className="num">
                      {l.conversao.presencial.percentual}% · {l.conversao.remoto.percentual}%
                      <div className="mini">{l.conversao.presencial.vendas} e {l.conversao.remoto.vendas} venda(s)</div>
                    </td>
                    <td
                      className="num"
                      style={l.remotosSuspeitos.percentual > (regra?.maxPctSuspeitos ?? 30) ? { color: 'var(--red)', fontWeight: 700 } : undefined}
                    >
                      {l.remotosSuspeitos.percentual}%
                      <div className="mini">{l.remotosSuspeitos.suspeitos} de {l.remotosSuspeitos.acompanhados}</div>
                    </td>
                    <td className="num">
                      {l.alertas.length > 0 ? <span className="chip chip-alerta">{l.alertas.length}</span> : '—'}
                      {l.fantasmas > 0 && <div className="mini" style={{ color: 'var(--red)' }}>{l.fantasmas} fantasma(s)</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="card-pad mini">
          <b style={{ color: CORES.verde }}>Verde</b>: {meta?.metaLeads?.total ?? 30}+ leads validados (mínimo{' '}
          {meta?.metaLeads?.minPresenciais ?? 20} presenciais) e zero follow-up atrasado ·{' '}
          <b style={{ color: CORES.amarelo }}>Amarelo</b>: 20 a 29 leads ou até {regra?.maxAtrasadosAmarelo ?? 5} atrasados ·{' '}
          <b style={{ color: CORES.vermelho }}>Vermelho</b>: menos de 20 leads, mais de {regra?.maxAtrasadosAmarelo ?? 5} atrasados,
          mais de {regra?.maxPctSuspeitos ?? 30}% dos remotos suspeitos ou lead fantasma confirmado.
          Conversão é de lead para venda nos últimos 30 dias.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Alertas de suspeita</h2>
            <p className="mini">Últimos 7 dias até a data escolhida. Alerta não acusa: aponta o que conferir.</p>
          </div>
          <span className="card-sub">{alertas.length}</span>
        </div>
        {alertas.length === 0 ? (
          <Vazio emoji="✓" titulo="Nenhum alerta" texto="GPS, intervalo entre visitas e prints dentro do esperado." />
        ) : (
          alertas.map((a) => <LinhaAlerta key={a.id} alerta={a} />)
        )}
      </div>

      {aberto && <Trajeto linha={aberto} data={data} onFechar={() => setAberto(null)} />}
    </>
  );
}

function LinhaAlerta({ alerta: a }) {
  return (
    <div className="alerta-suspeita">
      <Avatar nome={a.vendedor.name} cor={a.vendedor.color} pequeno />
      <div className="crescer" style={{ minWidth: 0 }}>
        <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="chip chip-alerta">{a.label}</span>
          <span className="mini">{a.vendedor.name.split(' ')[0]} · {diaMes(a.at)} às {hora(a.at)}</span>
        </div>
        <p className="menor" style={{ marginTop: 4 }}>{a.texto}</p>
        {(a.clientIds.length > 0 || a.urls.length > 0) && (
          <div className="linha mini" style={{ flexWrap: 'wrap', marginTop: 4 }}>
            {a.clientIds.slice(0, 5).map((id, i) => (
              <Link key={id} className="chip" to={`/carteira/${id}`}>abrir lead {a.clientIds.length > 1 ? i + 1 : ''}</Link>
            ))}
            {[...new Set(a.urls)].map((url, i) => (
              <a key={url} className="chip" href={url} target="_blank" rel="noreferrer">ver print {i + 1} ↗</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** O dia do vendedor no mapa: um pino numerado por visita, na ordem do relógio */
function Trajeto({ linha, data, onFechar }) {
  const { toast } = useApp();
  const { dados, carregando, erro, recarregar } = useRecurso(() => endpoints.trajeto(linha.vendedor.id, data), [linha.vendedor.id, data]);
  const [foco, setFoco] = useState(null);
  const [recusando, setRecusando] = useState(null);
  const [motivo, setMotivo] = useState('');

  const recusar = async (lead) => {
    try {
      await endpoints.recusarPrint(lead.id, motivo);
      toast('Print recusado: o lead voltou para pendente.');
      setRecusando(null);
      setMotivo('');
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  const comGps = (dados?.visitas ?? []).filter((v) => !v.semGps);
  const pinos = comGps.map((v) => ({
    chave: v.id,
    lat: v.lat,
    lng: v.lng,
    precisao: v.precisao,
    impreciso: Number(v.precisao) > 500,
    saida: v.tipo !== 'lead', // revisita aparece vazada; lead novo, cheio
    cor: linha.vendedor.color,
    sigla: String(v.ordem),
    titulo: `${v.ordem}. ${v.cliente?.company ?? 'Visita'} · ${hora(v.at)}`,
  }));

  return (
    <Modal
      titulo={linha.vendedor.name}
      subtitulo={`${diaMes(`${data}T12:00:00`)} · ${linha.hoje.total} leads · ${linha.atrasados} follow-up(s) atrasado(s)`}
      onFechar={onFechar}
    >
      <div className="linha">
        <Link className="btn btn-primary btn-sm" to={`/equipe/${linha.vendedor.id}`}>◉ Perfil completo</Link>
        <span className="mini">Tudo que o vendedor fez, mês a mês.</span>
      </div>
      {erro && !dados ? (
        <Falha erro={erro} titulo="Não consegui carregar o dia do vendedor" />
      ) : carregando || !dados ? (
        <Carregando linhas={4} />
      ) : (
        <>
          {pinos.length > 0 ? (
            <>
              <MapaPonto pinos={pinos} selecionado={foco} onSelecionar={setFoco} />
              <div className="mapa-legenda">
                <span><i className="pino-entrada" /> Lead novo</span>
                <span><i className="pino-saida" /> Revisita</span>
                <span><i className="pino-raio" /> Margem de erro do GPS</span>
              </div>
            </>
          ) : (
            <Vazio emoji="⌖" titulo="Nenhuma visita com GPS neste dia" />
          )}

          <div className="card">
            <div className="card-header">
              <h3>Visitas do dia</h3>
              <span className="card-sub">{dados.visitas.length}</span>
            </div>
            {dados.visitas.map((v) => (
              <div
                key={v.id}
                className={`cliente-linha${foco === v.id ? ' escolhido' : ''}`}
                onClick={() => setFoco(foco === v.id ? null : v.id)}
              >
                <span className="avatar avatar-sm" style={{ background: linha.vendedor.color }}>{v.ordem}</span>
                <div className="info">
                  <b className="truncar" style={{ display: 'block' }}>
                    {hora(v.at)} · {v.cliente?.company ?? 'cliente removido'}
                  </b>
                  <span className="mini">
                    {v.tipo === 'lead' ? 'lead novo' : 'revisita'}
                    {v.resultadoMeta ? ` · ${v.resultadoMeta.label}` : ''}
                    {v.semGps ? ' · sem GPS' : v.precisao ? ` · ±${distancia(v.precisao)}` : ''}
                  </span>
                </div>
                {v.foto && (
                  <a className="chip" href={v.foto} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    fachada ↗
                  </a>
                )}
              </div>
            ))}
            {dados.visitas.length === 0 && <p className="card-pad mini">Nenhuma visita registrada neste dia.</p>}
          </div>

          {dados.remotos.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Leads remotos do dia</h3>
                <span className="card-sub">{dados.remotos.length}</span>
              </div>
              {dados.remotos.map((lead) => (
                <div key={lead.id} className="card-pad coluna" style={{ borderBottom: '1px solid var(--line)', gap: 6 }}>
                  <div className="linha">
                    <div className="crescer" style={{ minWidth: 0 }}>
                      <b className="truncar" style={{ display: 'block' }}>{hora(lead.createdAt)} · {lead.company}</b>
                      <span className="mini">
                        {lead.cnpj}
                        {lead.whatsappIniciadoAt ? ` · WhatsApp aberto pelo CRM às ${hora(lead.whatsappIniciadoAt)}` : ' · não abriu o WhatsApp pelo CRM'}
                      </span>
                    </div>
                    <span className={`chip chip-status ${lead.status}`}>{lead.status}</span>
                  </div>
                  <div className="detalhe-acoes">
                    <Link className="btn btn-sm" to={`/carteira/${lead.id}`}>Abrir lead</Link>
                    {lead.print ? (
                      <>
                        <a className="btn btn-sm" href={lead.print.url} target="_blank" rel="noreferrer">Ver print ↗</a>
                        {!lead.print.recusado && (
                          <button className="btn btn-sm" onClick={() => { setRecusando(lead.id); setMotivo(''); }}>Recusar print</button>
                        )}
                      </>
                    ) : (
                      <span className="mini">sem print</span>
                    )}
                  </div>
                  {recusando === lead.id && (
                    <div className="linha">
                      <input
                        className="input" value={motivo} autoFocus onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Motivo: ex. só aparece a mensagem do vendedor"
                      />
                      <button className="btn btn-primary btn-sm" disabled={motivo.trim().length < 5} onClick={() => recusar(lead)}>
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
