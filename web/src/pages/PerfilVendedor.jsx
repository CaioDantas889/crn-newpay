// Perfil do vendedor (gestão): tudo que ele fez e em que pé está, numa tela
// só. O mês e a meta, o dia de hoje, a carteira, a disciplina (ponto,
// fechamento, termo, ocorrências) e o histórico cronológico. Entra pela
// Equipe, pelo painel do gestor, pelo semáforo e pelo ranking.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, diaExtenso, diaMes, duracao, hora, relativo } from '../lib/date.js';
import { linkTelefone, linkWhatsApp } from '../lib/contato.js';
import { Avatar, Carregando, Falha, Progresso, Stat, Vazio } from '../components/ui.jsx';
import { NegocioLinha } from '../components/Negocio.jsx';

const FILTROS = [
  { chave: 'todos', label: 'Tudo', tipos: null },
  { chave: 'campo', label: 'Visitas e leads', tipos: ['visita', 'lead'] },
  { chave: 'vendas', label: 'Propostas e vendas', tipos: ['proposta', 'venda', 'ativacao'] },
  { chave: 'followups', label: 'Follow-ups', tipos: ['followup'] },
  { chave: 'rotina', label: 'Ponto e fechamento', tipos: ['expediente', 'fechamento'] },
  { chave: 'conduta', label: 'Conduta', tipos: ['conduta'] },
];

const JANELAS = [30, 60, 90];

const COR_SEMAFORO = { vermelho: 'var(--red)', amarelo: 'var(--orange)', verde: 'var(--green)', folga: 'var(--slate)' };

// "quarta-feira, 7 de outubro" → "Quarta-feira, 7 de outubro" (só a primeira letra)
const primeiraMaiuscula = (texto = '') => texto.charAt(0).toUpperCase() + texto.slice(1);

// Admissão, termo e ocorrências atravessam anos: data completa
const dataCompleta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const ROTULO_SEMAFORO = { vermelho: 'Vermelho', amarelo: 'Amarelo', verde: 'Verde', folga: 'Folga' };

export default function PerfilVendedor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mes, setMes] = useState(dateKey().slice(0, 7));
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState('todos');

  const { toast } = useApp();
  const { dados, carregando, recarregando, erro } = useRecurso(
    () => endpoints.perfilVendedor(id, { mes, dias }),
    [id, mes, dias],
    { manterAoTrocar: true }
  );

  // Falha ao trocar mês ou janela: os números da tela são da escolha anterior
  useEffect(() => {
    if (erro && dados) toast(`Não consegui atualizar o perfil: ${erro} Os números na tela são da consulta anterior.`, 'erro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erro]);

  // Histórico agrupado por dia, já filtrado
  const porDia = useMemo(() => {
    const tipos = FILTROS.find((f) => f.chave === filtro)?.tipos ?? null;
    const grupos = [];
    for (const item of dados?.historico?.itens ?? []) {
      if (tipos && !tipos.includes(item.tipo)) continue;
      const chave = dateKey(item.at);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo?.chave === chave) ultimo.itens.push(item);
      else grupos.push({ chave, itens: [item] });
    }
    return grupos;
  }, [dados, filtro]);

  if (!dados && erro) {
    return <div className="page"><Falha erro={erro} titulo="Não consegui abrir o perfil do vendedor" /></div>;
  }
  if (!dados) return <div className="page"><Carregando linhas={6} /></div>;

  const { vendedor: v, mes: m, semana, hoje, carteira, ativacoes, expediente, fechamento, conduta, historico } = dados;
  const mesAtual = m.chave === dateKey().slice(0, 7);
  const semaforo = hoje.semaforo;
  const tipos = historico.tipos ?? {};
  const pontoHoje = hoje.expediente?.[0] ?? null;
  const ultimaBatidaHoje = hoje.expediente?.[hoje.expediente.length - 1] ?? null;

  return (
    <div className={`page${carregando || recarregando ? ' esmaecido' : ''}`}>
      {/* ------------------------------------------------------ cabeça */}
      <div className="card card-pad coluna perfil-cabeca">
        <div className="linha" style={{ alignItems: 'flex-start' }}>
          <button className="btn btn-icone" onClick={() => navigate(-1)} aria-label="Voltar">‹</button>
          <Avatar nome={v.name} cor={v.color} />
          <div className="crescer">
            <h1 className="truncar" style={{ marginBottom: 2 }}>{v.name}</h1>
            <p className="mini">
              {v.jobTitle ?? 'Vendedor externo'}{v.city ? ` · ${v.city}` : ''}
              {v.dailyGoal ? ` · meta de ${v.dailyGoal} visitas/dia` : ''}
              {v.createdAt ? ` · na equipe desde ${dataCompleta(v.createdAt)}` : ''}
            </p>
            <p className="mini">{v.email}{v.phone ? ` · ${v.phone}` : ''}</p>
          </div>
          <div className="coluna" style={{ alignItems: 'flex-end', gap: 4 }}>
            <span className={`chip ${v.active ? 'chip-ok' : 'chip-erro'}`}>{v.active ? 'com acesso' : 'sem acesso'}</span>
            {semaforo && (
              <span className="chip" style={{ color: COR_SEMAFORO[semaforo.cor], borderColor: COR_SEMAFORO[semaforo.cor] }}>
                ● {ROTULO_SEMAFORO[semaforo.cor] ?? semaforo.cor} hoje
              </span>
            )}
          </div>
        </div>

        <div className="detalhe-acoes">
          {/* Carteira e agenda só listam quem tem acesso: para o inativo, o
              caminho é transferir a carteira na Equipe */}
          {v.active && (
            <>
              <button className="btn btn-sm" onClick={() => navigate(`/carteira?userId=${v.id}`)}>◇ Carteira</button>
              <button className="btn btn-sm" onClick={() => navigate(`/carteira?aba=visitas&userId=${v.id}`)}>✓ Visitas</button>
              <button className="btn btn-sm" onClick={() => navigate(`/dia/${dateKey()}?userId=${v.id}`)}>▤ Agenda</button>
            </>
          )}
          {v.phone && <a className="btn btn-sm" href={linkTelefone(v.phone)}>✆︎ Ligar</a>}
          {v.phone && (
            <a className="btn btn-sm" href={linkWhatsApp(v.phone)} target="_blank" rel="noreferrer">✉︎ WhatsApp</a>
          )}
          <button className="btn btn-sm" onClick={() => navigate('/equipe')}>✎ Cadastro</button>
        </div>
        {!v.active && (
          <p className="mini">
            Vendedor sem acesso: o histórico continua aqui. Para os clientes não ficarem parados, transfira a carteira
            em Equipe › Remover.
          </p>
        )}
      </div>

      {/* --------------------------------------------------------- mês */}
      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Resultado do mês</h2>
            <p className="mini">
              {m.posicao ? `${m.posicao}º de ${m.totalRanking} no ranking` : 'fora do ranking'}
              {m.nivel ? ` · nível ${m.nivel.label}` : ''}
              {mesAtual ? ' · mês em andamento' : ''}
            </p>
          </div>
          <input
            type="month"
            className="input"
            style={{ width: 'auto' }}
            aria-label="Mês do resultado"
            value={mes}
            max={dateKey().slice(0, 7)}
            onChange={(e) => e.target.value && setMes(e.target.value)}
          />
        </div>

        <div className="card-pad coluna">
          <div className="grid grid-4">
            <Stat rotulo="Visitas" valor={m.visitas} destaque extra={`${m.visitasProdutivas} produtivas · ${m.visitasPerdidas} perdidas`} />
            <Stat
              rotulo="Leads que contam"
              valor={m.leads.total}
              cor={m.leads.percentual >= 100 ? 'var(--green)' : 'var(--blue)'}
              extra={`${m.leads.percentual}% da meta de ${m.leads.meta} · ${m.leads.presenciais} presenciais`}
            />
            <Stat rotulo="Propostas" valor={m.propostas} cor="var(--purple)" extra={`${m.conversaoPropostaVenda}% viraram venda`} />
            <Stat rotulo="Vendas" valor={m.vendas} cor="var(--green)" extra={`${m.maquinasVendidas} máquina(s) · ${m.conversaoVisitaVenda}% das visitas`} />
          </div>

          <div className="entre" style={{ marginTop: 4 }}>
            <span>
              <b style={{ fontSize: '1.3rem' }}>{m.maquinasAtivadas}</b>
              <span className="mini"> / {m.meta.metaMaquinas || '—'} máquinas ativadas</span>
            </span>
            <span className="mini">
              {m.meta.metaMaquinas === 0
                ? 'sem meta definida'
                : m.metaBatida
                  ? 'meta batida ★'
                  : `faltam ${Math.max(0, m.meta.metaMaquinas - m.maquinasAtivadas)}`}
              {m.maquinasDeclaradas > 0 ? ` · ${m.maquinasDeclaradas} aguardando confirmação` : ''}
            </span>
          </div>
          <Progresso
            atual={m.maquinasAtivadas}
            total={m.meta.metaMaquinas}
            cor={m.percentualMeta >= 100 ? 'var(--green)' : 'var(--brand)'}
          />
          {/* A semana é sempre a corrente: só faz sentido junto do mês corrente */}
          {mesAtual && (
            <p className="mini">
              Semana (desde {diaMes(`${semana.segunda}T12:00:00`)}): {semana.leads.total} leads que contam
              {semana.leads.pendentes + semana.leads.suspeitos > 0 ? ` · ${semana.leads.pendentes + semana.leads.suspeitos} fora da contagem` : ''}
              {semana.leads.fantasmas > 0 ? ` · ${semana.leads.fantasmas} fantasma(s)` : ''}
            </p>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- hoje */}
      <div className={`card${semaforo?.cor === 'vermelho' ? ' card-atrasados' : ''}`}>
        <div className="card-header">
          <div className="crescer">
            <h2>Hoje</h2>
            <p className="mini">
              {hoje.diaDeTrabalho
                ? semaforo?.motivos?.length ? semaforo.motivos.join(' · ') : 'sem pendências'
                : 'domingo: sem meta'}
              {semaforo?.sequencia > 0 ? ` · ${semaforo.sequencia} dia(s) de meta completa seguidos` : ''}
            </p>
          </div>
          {semaforo?.alertasNoDia > 0 && <span className="chip chip-alerta">{semaforo.alertasNoDia} alerta(s)</span>}
        </div>
        <div className="card-pad grid grid-4">
          <Stat
            rotulo="Leads de hoje"
            valor={`${hoje.placar.total}/${hoje.placar.meta}`}
            cor={hoje.placar.metaBatida ? 'var(--green)' : 'var(--text)'}
            extra={`${hoje.placar.presenciais} presenciais · ${hoje.placar.remotos} remotos`}
            destaque
          />
          <Stat rotulo="Visitas registradas" valor={hoje.visitas} cor="var(--blue)" extra="no dia de hoje" />
          <Stat
            rotulo="Follow-ups"
            valor={hoje.followups.atrasados}
            cor={hoje.followups.atrasados > 0 ? 'var(--red)' : 'var(--green)'}
            extra={`atrasados · ${hoje.followups.hoje} para hoje · ${hoje.followups.feitosHoje} feitos`}
          />
          <Stat
            rotulo="Ponto"
            valor={pontoHoje ? hora(pontoHoje.inicioAt) : '—'}
            cor={pontoHoje ? 'var(--text)' : 'var(--red)'}
            extra={
              !pontoHoje
                ? 'não iniciou o expediente'
                : ultimaBatidaHoje?.fimAt
                  ? `encerrou às ${hora(ultimaBatidaHoje.fimAt)} · ${hoje.kpiFechado ? 'dia fechado' : 'dia não fechado'}`
                  : 'em campo agora'
            }
          />
        </div>
      </div>

      <div className="grid-auto-larga">
        {/* --------------------------------------------------- carteira */}
        <div className="card">
          <div className="card-header">
            <div className="crescer">
              <h2>Carteira</h2>
              <p className="mini">
                {carteira.total} clientes · {carteira.leadsComProva} leads com prova
                {carteira.leadsForaDaMeta > 0 ? ` · ${carteira.leadsForaDaMeta} fora da contagem` : ''}
              </p>
            </div>
            {v.active && (
              <button className="btn btn-sm" onClick={() => navigate(`/carteira?userId=${v.id}`)}>Abrir</button>
            )}
          </div>
          <div className="card-pad coluna">
            <div className="grid grid-3">
              <Stat rotulo="Quentes" valor={carteira.quentes} cor="var(--red)" extra="perto de fechar" />
              <Stat rotulo="Sem contato" valor={carteira.semContato} cor={carteira.semContato > 0 ? 'var(--orange)' : 'var(--green)'} extra="há mais de 7 dias" />
              <Stat rotulo="Máquinas na rua" valor={carteira.maquinasNaRua} cor="var(--brand-strong)" extra="na carteira" />
            </div>
            {carteira.porEtapa.map((etapa) => {
              const maior = Math.max(...carteira.porEtapa.map((f) => f.total), 1);
              return (
                <button
                  key={etapa.chave}
                  className="funil-linha"
                  disabled={!v.active}
                  onClick={() => navigate(`/carteira?userId=${v.id}&stage=${etapa.chave}`)}
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

          {(ativacoes.totais.semAtivar > 0 || ativacoes.totais.declaradas > 0) && (
            <>
              <div className="card-header" style={{ borderTop: '1px solid var(--line)' }}>
                <h3>Máquinas paradas</h3>
                <span className={`chip ${ativacoes.totais.atrasadas > 0 ? 'chip-erro' : 'chip-alerta'}`}>
                  {ativacoes.totais.maquinasSemAtivar} sem ativar
                  {ativacoes.totais.maquinasDeclaradas > 0 ? ` · ${ativacoes.totais.maquinasDeclaradas} a confirmar` : ''}
                </span>
              </div>
              {[...ativacoes.declaradas, ...ativacoes.semAtivar].slice(0, 6).map((n) => (
                <NegocioLinha key={n.id} negocio={n} mostrarCliente onClick={() => navigate(`/carteira/${n.clientId}`)} />
              ))}
              {ativacoes.totais.semAtivar + ativacoes.totais.declaradas > 6 && (
                <p className="card-pad mini">
                  Lista completa na aba Ativações do painel do gestor.
                </p>
              )}
            </>
          )}
        </div>

        {/* ------------------------------------------- disciplina ----- */}
        <div className="card">
          <div className="card-header">
            <div className="crescer">
              <h2>Disciplina e conduta</h2>
              <p className="mini">Últimos {expediente.janelaDias} dias</p>
            </div>
          </div>
          <div className="card-pad coluna">
            <div className="grid grid-3">
              <Stat
                rotulo="Dias em campo"
                valor={expediente.diasEmCampo}
                extra={expediente.diasEmCampo ? `média de ${duracao(expediente.mediaMinutos)} por dia` : 'nenhum ponto batido'}
              />
              <Stat
                rotulo="Dias fechados"
                valor={`${fechamento.fechados}/${fechamento.diasUteis}`}
                cor={fechamento.percentual >= 80 ? 'var(--green)' : 'var(--red)'}
                extra={`${fechamento.percentual}% dos dias úteis`}
              />
              <Stat
                rotulo="Ocorrências"
                valor={conduta.ocorrenciasAtivas}
                cor={conduta.ocorrenciasAtivas > 0 ? 'var(--red)' : 'var(--green)'}
                extra={`${conduta.auditorias.total} auditoria(s) · ${conduta.auditorias.confirmadas} confirmada(s)`}
              />
            </div>

            <div className="coluna" style={{ gap: 6 }}>
              <div className="entre">
                <span className="mini">Termo de conduta</span>
                <b className="menor">
                  {!conduta.termo
                    ? 'nenhum publicado'
                    : conduta.termo.aceitoEm
                      ? `aceito em ${dataCompleta(conduta.termo.aceitoEm)} (v${conduta.termo.versao})`
                      : 'ainda não aceito'}
                </b>
              </div>
              <div className="entre">
                <span className="mini">Última batida de ponto</span>
                <b className="menor">
                  {expediente.ultimo
                    ? `${diaMes(expediente.ultimo.inicioAt)} às ${hora(expediente.ultimo.inicioAt)}${expediente.ultimo.fimAt ? ` → ${hora(expediente.ultimo.fimAt)}` : ' · em campo'}`
                    : 'nenhuma'}
                </b>
              </div>
              {expediente.semLocalizacao > 0 && (
                <div className="entre">
                  <span className="mini">Batidas sem localização</span>
                  <b className="menor">{expediente.semLocalizacao}</b>
                </div>
              )}
              {expediente.lancadosPelaGestao > 0 && (
                <div className="entre">
                  <span className="mini">Expedientes lançados pela gestão</span>
                  <b className="menor">{expediente.lancadosPelaGestao}</b>
                </div>
              )}
            </div>

            {conduta.alertasSemana.length > 0 && (
              <div className="coluna" style={{ gap: 4 }}>
                <span className="selo">Alertas de suspeita na semana</span>
                {conduta.alertasSemana.slice(0, 5).map((a) => (
                  <div key={a.id} className="mini">⚠︎ {a.label}: {a.texto}</div>
                ))}
              </div>
            )}

            {conduta.ocorrencias.length > 0 && (
              <div className="coluna" style={{ gap: 4 }}>
                <span className="selo">Ocorrências</span>
                {conduta.ocorrencias.map((o) => (
                  <div key={o.id} className="mini">
                    {o.status === 'ativa' ? '● ' : '○ '}
                    {dataCompleta(o.at)} · {o.lead?.company ?? 'lead removido'}
                    {o.status === 'ativa' ? ' · lead fantasma' : ` · anulada: ${o.motivoAnulacao ?? ''}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- histórico */}
      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Histórico</h2>
            <p className="mini">
              {historico.truncado
                ? `Os ${historico.itens.length} registros mais recentes de ${historico.total} (desde ${diaMes(historico.maisAntigo)})`
                : `${historico.itens.length} registro(s) de ${diaMes(`${historico.de}T12:00:00`)} até hoje`}
            </p>
          </div>
          <div className="opcoes">
            {JANELAS.map((n) => (
              <button key={n} className={`opcao${dias === n ? ' ativa' : ''}`} onClick={() => setDias(n)}>
                {n} dias
              </button>
            ))}
          </div>
        </div>
        <div className="card-pad opcoes" style={{ paddingBottom: 0 }}>
          {FILTROS.map((f) => (
            <button key={f.chave} className={`opcao${filtro === f.chave ? ' ativa' : ''}`} onClick={() => setFiltro(f.chave)}>
              {f.label}
            </button>
          ))}
        </div>

        {porDia.length === 0 ? (
          <Vazio emoji="◷" titulo="Nada registrado neste período" texto="Visitas, leads, vendas, follow-ups e batidas de ponto aparecem aqui." />
        ) : (
          <div className="timeline" style={{ padding: '8px 0 14px' }}>
            {porDia.map((grupo) => (
              <div key={grupo.chave}>
                <div className="tl-dia">
                  <b>{primeiraMaiuscula(diaExtenso(`${grupo.chave}T12:00:00`))}</b>
                  <span className="mini"> · {grupo.itens.length} registro(s)</span>
                </div>
                {grupo.itens.map((item, i) => (
                  <div key={`${item.at}-${item.tipo}-${i}`} className="tl-item">
                    <div className="tl-hora">{hora(item.at)}</div>
                    <div className="tl-trilho">
                      <span className="tl-bolinha" style={{ background: item.cor ?? tipos[item.tipo]?.cor ?? 'var(--slate)' }} />
                      <div
                        className={`tl-conteudo${item.cliente?.id ? ' clicavel' : ''}`}
                        onClick={item.cliente?.id ? () => navigate(`/carteira/${item.cliente.id}`) : undefined}
                      >
                        <b>{item.titulo}</b>
                        {item.cliente && (
                          <span className="mini"> · {item.cliente.company}{item.cliente.city ? ` (${item.cliente.city})` : ''}</span>
                        )}
                        {item.semGps && <span className="chip chip-alerta" style={{ marginLeft: 6 }}>sem GPS</span>}
                        {item.detalhe && <div className="mini">{item.detalhe}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mini centro">Perfil gerado {relativo(new Date().toISOString())} com os registros do CRM.</p>
    </div>
  );
}
