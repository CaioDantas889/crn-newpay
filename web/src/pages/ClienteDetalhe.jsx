// Ficha do cliente: diagnóstico, oportunidade, histórico e ações de campo.

import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, diaMes, hora, moeda, relativo } from '../lib/date.js';
import { CORES_TEMPERATURA } from '../lib/score.js';
import { Avatar, Carregando, Progresso, Vazio } from '../components/ui.jsx';
import AgendarRetorno from '../components/AgendarRetorno.jsx';
import DiagnosticoModal from '../components/DiagnosticoModal.jsx';
import RegistrarVisita from '../components/RegistrarVisita.jsx';
import ConfirmarExclusao from '../components/ConfirmarExclusao.jsx';
import TransferirCliente from '../components/TransferirCliente.jsx';
import RegistrarVenda from '../components/RegistrarVenda.jsx';
import AtivarMaquina from '../components/AtivarMaquina.jsx';
import { NegocioLinha } from '../components/Negocio.jsx';
import { ConcluirFollowup } from '../components/Followup.jsx';
import { PrintConversa } from '../components/lead.jsx';
import { linkWhatsApp } from '../lib/contato.js';

const SELO_ETAPA = { d1: 'D+1', d3: 'D+3', d7: 'D+7', d15: 'D+15', d30: 'D+30', avulso: 'Retorno' };

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { meta, toast, recarregarNotificacoes, recarregarPlacar, ehGestor } = useApp();

  const { dados: cliente, carregando, erro, recarregar } = useRecurso(() => endpoints.cliente(id), [id]);
  // ?visita=1 chega do aviso de duplicado do "+ Lead": abre direto a revisita
  const [modal, setModal] = useState(
    params.get('visita') ? 'visita' : params.get('diagnostico') ? 'diagnostico' : null
  );
  const [negocioModal, setNegocioModal] = useState(null); // { modo: 'venda' | 'proposta' | 'editar', negocio? }
  const [ativar, setAtivar] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [print, setPrint] = useState(null);
  const [enviandoPrint, setEnviandoPrint] = useState(false);
  const [concluir, setConcluir] = useState(null);

  if (carregando) return <div className="page"><Carregando linhas={6} /></div>;

  // Sem isto, um erro (cliente de outra carteira, por exemplo) deixaria a tela
  // carregando para sempre
  if (erro || !cliente) {
    return (
      <div className="page">
        <Vazio
          emoji="✕"
          titulo="Não foi possível abrir este cliente"
          texto={erro ?? 'Cliente não encontrado.'}
          acao={<button className="btn btn-primary" onClick={() => navigate('/carteira')}>Voltar para a carteira</button>}
        />
      </div>
    );
  }

  const diagnosticoPreenchido = Boolean(cliente.diagnostico?.preenchidoAt);
  const somenteNumeros = (v = '') => v.replace(/\D/g, '');

  // "Fechado" é venda: sem venda registrada, a etapa abre o formulário da venda
  const moverFunil = async (stage) => {
    if (stage === 'fechado' && !cliente.pendencias?.temVenda) {
      return setNegocioModal({ modo: 'venda', aviso: 'Para mover para Fechado, diga qual maquininha o cliente comprou.' });
    }
    try {
      await endpoints.atualizarCliente(cliente.id, { stage });
      toast(`Cliente movido para ${meta.funil[stage].label.toLowerCase()}.`);
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  // Print com a resposta do lojista: é o que tira o remoto do "pendente"
  const enviarPrint = async () => {
    if (print?.comResposta == null) return toast('Diga se o print tem a resposta do lojista.', 'erro');
    if (!print.comResposta) {
      return toast('Sem a resposta do lojista, o print não valida o lead. Envie quando ele responder.', 'erro');
    }
    setEnviandoPrint(true);
    try {
      const atual = await endpoints.enviarPrint(cliente.id, print);
      toast(atual.leadStatus === 'validado' ? 'Print aceito: o lead foi validado e entrou na meta.' : `Print salvo. ${atual.leadMotivo ?? ''}`);
      setPrint(null);
      recarregarPlacar();
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setEnviandoPrint(false);
    }
  };

  const recusarPrint = async () => {
    const motivo = window.prompt('Por que este print não prova o contato?');
    if (!motivo) return;
    try {
      await endpoints.recusarPrint(cliente.id, motivo);
      toast('Print recusado: o lead voltou para pendente.');
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  // Gestão: reconhece (ou não) a ativação declarada pelo vendedor
  const confirmarAtivacao = async (negocio) => {
    try {
      await endpoints.confirmarAtivacao(negocio.id);
      toast('Ativação confirmada: entra na meta e no ranking.');
      recarregarNotificacoes();
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  const recusarAtivacao = async (negocio) => {
    const motivo = window.prompt('Por que a ativação não foi reconhecida?');
    if (!motivo) return;
    try {
      await endpoints.recusarAtivacao(negocio.id, motivo);
      toast('Ativação recusada: a máquina voltou para "vendida".');
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  // Cada etapa do negócio tem um próximo passo só
  const acoesDoNegocio = (n) => {
    if (['proposta', 'negociacao'].includes(n.status)) {
      return (
        <button className="btn btn-brand btn-sm" onClick={() => setNegocioModal({ modo: 'venda', negocio: n })}>
          ★ Fechou
        </button>
      );
    }
    if (n.status === 'fechado') {
      return (
        <>
          <button className="btn btn-brand btn-sm" onClick={() => setAtivar(n)}>Ativar</button>
          <button className="btn btn-sm" onClick={() => setNegocioModal({ modo: 'editar', negocio: n })}>
            Editar
          </button>
        </>
      );
    }
    if (n.aguardandoConfirmacao && ehGestor) {
      return (
        <>
          <button className="btn btn-brand btn-sm" onClick={() => confirmarAtivacao(n)}>Confirmar</button>
          <button className="btn btn-sm" onClick={() => recusarAtivacao(n)}>Recusar</button>
        </>
      );
    }
    if (n.aguardandoConfirmacao) return <span className="chip chip-alerta">aguardando gestão</span>;
    if (n.status === 'ativado') return <span className="chip chip-ok">Ativada</span>;
    return null;
  };

  return (
    <div className="page">
      <div className="linha">
        <button className="btn btn-icone" onClick={() => navigate('/carteira')} aria-label="Voltar">‹</button>
        <div className="crescer">
          <h1 className="truncar">{cliente.company}</h1>
          <p className="mini">
            {cliente.name} · {cliente.segmentoLabel} · {cliente.city}
            {cliente.cnpj ? ` · ${cliente.cnpj}` : ''}
          </p>
        </div>
        {cliente.leadStatus && (
          <span className={`chip chip-status ${cliente.leadStatus}`} title={cliente.leadMotivo ?? undefined}>
            {cliente.origemLabel} · {cliente.leadStatus}
          </span>
        )}
      </div>

      {cliente.leadMotivo && (
        <div className={`card card-pad lead-aviso ${cliente.leadStatus}`}>
          <b>
            {cliente.leadStatus === 'pendente' && 'Este lead ainda não conta na meta'}
            {cliente.leadStatus === 'suspeito' && 'Lead suspeito: saiu da contagem'}
            {cliente.leadStatus === 'fantasma' && 'Lead fantasma'}
          </b>
          <p className="mini">{cliente.leadMotivo}</p>
        </div>
      )}

      {/* ------------------------------------------------- oportunidade */}
      <div className="card card-pad linha" style={{ gap: 16 }}>
        <div
          className="numero score-preview-numero"
          style={{
            width: 76, height: 76, borderRadius: 18, display: 'grid', placeItems: 'center',
            background: CORES_TEMPERATURA[cliente.temperature], color: '#fff',
            fontSize: '1.8rem', fontWeight: 750, flex: 'none',
          }}
        >
          {cliente.score}
        </div>
        <div className="crescer">
          <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
            <b style={{ textTransform: 'capitalize', fontSize: '1.05rem' }}>Lead {cliente.temperature}</b>
            <span className="chip" style={{ color: cliente.stageMeta.cor, borderColor: cliente.stageMeta.cor }}>
              {cliente.stageMeta.label}
            </span>
          </div>
          <Progresso atual={cliente.score} total={100} cor={CORES_TEMPERATURA[cliente.temperature]} />
          <p className="mini" style={{ marginTop: 6 }}>
            {cliente.diasSemContato === 0 ? 'Contato hoje' : `${cliente.diasSemContato} dias sem contato`}
            {cliente.machines > 0 ? ` · ${cliente.machines} máquina(s) NewPay` : ''}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------- ações de campo */}
      <div className="card card-pad coluna">
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-brand" onClick={() => setModal('visita')}>✓ Registrar visita</button>
          <button className="btn btn-primary" onClick={() => setModal('retorno')}>▤ Agendar retorno</button>
          <a className="btn" href={`tel:${somenteNumeros(cliente.phone)}`}>✆︎ Ligar</a>
          {/* Abre na hora do toque e registra, em paralelo, que a conversa começou pelo CRM */}
          <a
            className="btn"
            href={linkWhatsApp(cliente.whatsapp || cliente.phone)}
            target="_blank"
            rel="noreferrer"
            onClick={() => endpoints.registrarWhatsApp(cliente.id).then(recarregar).catch(() => {})}
          >
            ✉︎ Abrir WhatsApp
          </a>
          <a
            className="btn"
            href={`https://www.google.com/maps/dir/?api=1&destination=${cliente.lat},${cliente.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            ▨ Rota
          </a>
          <button className="btn" onClick={() => navigate(`/objecoes?clientId=${cliente.id}`)}>⁇ Argumentos</button>
        </div>
        <div className="opcoes">
          <span className="selo" style={{ alignSelf: 'center' }}>Mover no funil:</span>
          {Object.entries(meta?.funil ?? {}).map(([chave, info]) => (
            <button
              key={chave}
              className={`opcao${cliente.stage === chave ? ' ativa' : ''}`}
              style={cliente.stage === chave ? { background: info.cor, borderColor: info.cor } : undefined}
              onClick={() => moverFunil(chave)}
            >
              {info.label}
            </button>
          ))}
        </div>

        {/* A gestão vê de quem é o cliente e pode passá-lo para outra carteira */}
        {ehGestor && (
          <div className="entre" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <span className="linha mini" style={{ gap: 8 }}>
              <Avatar nome={cliente.owner?.name ?? '?'} cor={cliente.owner?.color} pequeno />
              <span>
                Responsável: <b>{cliente.owner?.name ?? 'sem carteira'}</b>
                {cliente.owner?.city ? ` · ${cliente.owner.city}` : ''}
              </span>
            </span>
            <button className="btn btn-sm" onClick={() => setModal('transferir')}>⇄ Transferir</button>
          </div>
        )}

        <span className="mini" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          Cliente cadastrado em {diaMes(cliente.createdAt)} · {cliente.visitas.length} visita(s) registrada(s)
        </span>
      </div>

      {/* -------------------------------------------- prova do lead */}
      {cliente.origem && (
        <div className="card">
          <div className="card-header">
            <div className="crescer">
              <h2>Prova do lead</h2>
              <p className="mini">
                {cliente.origem === 'presencial'
                  ? 'Visita na loja: GPS, horário e foto da fachada'
                  : `Remoto${cliente.canalLabel ? ` · ${cliente.canalLabel}` : ''}: CNPJ na Receita e print da conversa`}
              </p>
            </div>
          </div>

          <div className="card-pad grid grid-2">
            <div className="coluna" style={{ gap: 8 }}>
              <div className="entre">
                <span className="mini">Cadastrado em</span>
                <b className="menor">{diaMes(cliente.createdAt)} às {hora(cliente.createdAt)}</b>
              </div>
              {cliente.prova && (
                <div className="entre">
                  <span className="mini">GPS do cadastro</span>
                  <a
                    className="menor" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps?q=${cliente.prova.lat},${cliente.prova.lng}`}
                  >
                    {cliente.prova.lat.toFixed(5)}, {cliente.prova.lng.toFixed(5)}
                    {cliente.prova.precisao ? ` · ±${cliente.prova.precisao} m` : ''} ↗
                  </a>
                </div>
              )}
              {cliente.cnpjInfo && (
                <div className="entre">
                  <span className="mini">Receita</span>
                  <b className="menor">
                    {cliente.cnpjInfo.ok
                      ? `${cliente.cnpjInfo.situacao}${cliente.razaoSocial ? ` · ${cliente.razaoSocial}` : ''}`
                      : 'consulta pendente'}
                  </b>
                </div>
              )}
              {cliente.indicadoPorCard && (
                <div className="entre">
                  <span className="mini">Indicado por</span>
                  <b className="menor">{cliente.indicadoPorCard.company}</b>
                </div>
              )}
              {cliente.declaracao && (
                <div className="entre">
                  <span className="mini">Declaração</span>
                  <b className="menor">{diaMes(cliente.declaracao.at)} às {hora(cliente.declaracao.at)} · {cliente.declaracao.login}</b>
                </div>
              )}
              {cliente.origem === 'remoto' && (
                <div className="entre">
                  <span className="mini">Conversa iniciada pelo CRM</span>
                  <b className="menor">
                    {cliente.whatsappAberturas.length
                      ? `${diaMes(cliente.whatsappAberturas[0].at)} às ${hora(cliente.whatsappAberturas[0].at)}`
                      : 'ainda não'}
                  </b>
                </div>
              )}
            </div>

            <div className="coluna" style={{ gap: 8 }}>
              {cliente.prova?.foto && (
                <div className="anexos">
                  <a className="anexo-miniatura grande" href={cliente.prova.foto.url} target="_blank" rel="noreferrer">
                    <img src={cliente.prova.foto.url} alt="Foto da fachada" />
                  </a>
                </div>
              )}
              {cliente.print && (
                <div className="linha">
                  <a className="anexo-miniatura grande" href={cliente.print.url} target="_blank" rel="noreferrer">
                    <img src={cliente.print.url} alt="Print da conversa" />
                  </a>
                  <div className="coluna" style={{ gap: 4 }}>
                    <span className="mini">
                      Print enviado em {diaMes(cliente.print.at)}
                      {cliente.print.recusado ? ' · recusado pela gestão' : ''}
                    </span>
                    {ehGestor && !cliente.print.recusado && (
                      <button className="btn btn-sm" onClick={recusarPrint}>Recusar print</button>
                    )}
                  </div>
                </div>
              )}
              {cliente.origem === 'remoto' && cliente.leadStatus === 'pendente' && (
                <>
                  <PrintConversa print={print} onChange={setPrint} obrigatorio />
                  {print && (
                    <button className="btn btn-brand" onClick={enviarPrint} disabled={enviandoPrint}>
                      {enviandoPrint ? 'Enviando...' : 'Enviar print e validar o lead'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------- cadência de follow-up */}
      {cliente.followups.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>Cadência de follow-up</h2>
            <span className="card-sub">
              {cliente.cadenciaEncerrada ? 'encerrada' : 'D+1 · D+3 · D+7 · D+15 · D+30'}
            </span>
          </div>
          {cliente.followups.map((f) => (
            <div key={f.id} className="cliente-linha">
              <span className="followup-selo">{SELO_ETAPA[f.etapa] ?? 'Follow-up'}</span>
              <div className="info">
                <b className="menor">{f.passo.label}</b>
                <div className="mini">
                  {f.status === 'feito'
                    ? `${f.resultadoMeta?.label ?? f.resultado} · feito em ${diaMes(f.doneAt)}${f.notes ? ` · “${f.notes}”` : ''}`
                    : `vence em ${diaMes(f.dueAt)} às ${hora(f.dueAt)}${f.atrasado ? ` · ${f.diasAtraso} dia(s) de atraso` : ''}`}
                </div>
              </div>
              {f.print?.url && (
                <a className="chip" href={f.print.url} target="_blank" rel="noreferrer">print ↗</a>
              )}
              {f.status === 'pendente' ? (
                <button className={`btn btn-sm ${f.atrasado ? 'btn-danger' : 'btn-brand'}`} onClick={() => setConcluir(f)}>
                  Registrar resultado
                </button>
              ) : (
                <span className="chip chip-ok">feito</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------- diagnóstico */}
      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Diagnóstico comercial</h2>
            <p className="mini">
              {diagnosticoPreenchido
                ? `Preenchido ${relativo(cliente.diagnostico.preenchidoAt)}`
                : 'Ainda não preenchido'}
            </p>
          </div>
          <button className="btn btn-sm" onClick={() => setModal('diagnostico')}>
            {diagnosticoPreenchido ? 'Editar' : 'Preencher'}
          </button>
        </div>

        {!diagnosticoPreenchido ? (
          <Vazio
            emoji="▤"
            titulo="Sem diagnóstico, sem prioridade"
            texto="São 5 perguntas. O CRM usa as respostas para pontuar a oportunidade e ordenar sua rota."
            acao={<button className="btn btn-brand" onClick={() => setModal('diagnostico')}>Preencher agora</button>}
          />
        ) : (
          <div className="card-pad grid grid-2">
            <div className="coluna" style={{ gap: 8 }}>
              <div className="entre">
                <span className="mini">Máquina atual</span>
                <b className="menor">{meta.maquinas[cliente.diagnostico.maquinaAtual] ?? '—'}</b>
              </div>
              <div className="entre">
                <span className="mini">Taxa que paga hoje</span>
                <b className="menor">{cliente.diagnostico.taxaAtual ? `${cliente.diagnostico.taxaAtual}%` : '—'}</b>
              </div>
              <div className="entre">
                <span className="mini">Faturamento mensal</span>
                <b className="menor">{meta.faturamentos[cliente.diagnostico.faturamento]?.label ?? '—'}</b>
              </div>
              <div className="entre">
                <span className="mini">Volume no cartão</span>
                <b className="menor">{meta.volumesCartao[cliente.diagnostico.volumeCartao]?.label ?? '—'}</b>
              </div>
              <div className="entre">
                <span className="mini">Interesse</span>
                <b className="menor">{meta.interesses[cliente.diagnostico.interesse]?.label ?? '—'}</b>
              </div>
              {cliente.diagnostico.dores?.length > 0 && (
                <div className="opcoes" style={{ marginTop: 4 }}>
                  {cliente.diagnostico.dores.map((d) => (
                    <span key={d} className="chip chip-alerta">{meta.dores[d] ?? d}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="coluna" style={{ gap: 6 }}>
              <span className="selo">De onde vêm os {cliente.score} pontos</span>
              {cliente.scoreDetalhes.map((d) => (
                <div key={d.label} className="entre menor">
                  <span className="truncar">{d.label}</span>
                  <b>+{d.pontos}</b>
                </div>
              ))}
              {cliente.diagnostico.observacoes && (
                <p className="mini" style={{ marginTop: 6 }}>“{cliente.diagnostico.observacoes}”</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------- máquinas e propostas */}
      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Máquinas e propostas</h2>
            <p className="mini">
              {cliente.pendencias?.semAtivar > 0
                ? `${cliente.pendencias.semAtivar} venda(s) sem ativar`
                : cliente.pendencias?.aguardandoConfirmacao > 0
                  ? 'ativação aguardando a gestão'
                  : `${cliente.negocios.length} registro(s)`}
            </p>
          </div>
          <div className="linha">
            {!cliente.pendencias?.propostaAberta && (
              <button className="btn btn-sm" onClick={() => setNegocioModal({ modo: 'proposta' })}>▭ Proposta</button>
            )}
            <button className="btn btn-brand btn-sm" onClick={() => setNegocioModal({ modo: 'venda' })}>★ Venda</button>
          </div>
        </div>

        {cliente.negocios.length === 0 ? (
          <Vazio
            emoji="◰"
            titulo="Nenhuma proposta ou venda"
            texto="Registre a proposta quando apresentar a tabela. Quando o cliente fechar, é ela que vira a venda."
          />
        ) : (
          cliente.negocios.map((n) => (
            <NegocioLinha
              key={n.id}
              negocio={n}
              acoes={
                <>
                  {acoesDoNegocio(n)}
                  <button
                    className="btn-remover"
                    title="Excluir este negócio"
                    onClick={() => setExcluir({ tipo: 'negocio', dado: n })}
                  >
                    ✕
                  </button>
                </>
              }
            />
          ))
        )}
      </div>

      <div className="grid-auto-larga">
        {/* ------------------------------------------ histórico de visitas */}
        <div className="card">
          <div className="card-header">
            <h2>Visitas registradas</h2>
            <span className="card-sub">{cliente.visitas.length}</span>
          </div>
          {cliente.visitas.length === 0 ? (
            <Vazio emoji="→" titulo="Nenhuma visita registrada" />
          ) : (
            cliente.visitas.slice(0, 8).map((v) => (
              <div key={v.id} className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
                <div className="entre">
                  <span className="chip" style={{ color: v.resultadoMeta?.cor ?? 'var(--text-2)' }}>
                    {v.resultadoMeta?.emoji} {v.resultadoMeta?.label ?? v.resultado}
                  </span>
                  <span className="linha" style={{ gap: 4 }}>
                    <span className="mini">{diaMes(v.at)} às {hora(v.at)}</span>
                    <button
                      className="btn-remover"
                      title="Excluir esta visita"
                      onClick={() => setExcluir({ tipo: 'visita', dado: v })}
                    >
                      ✕
                    </button>
                  </span>
                </div>
                {v.notes && <p className="menor" style={{ marginTop: 6 }}>{v.notes}</p>}
                {v.fotos?.length > 0 && (
                  <div className="anexos" style={{ marginTop: 8 }}>
                    {v.fotos.map((f) => (
                      <a key={f.url} className="anexo-miniatura" href={f.url} target="_blank" rel="noreferrer">
                        <img src={f.url} alt="Foto da visita" />
                      </a>
                    ))}
                  </div>
                )}
                {v.audio && <audio controls src={v.audio.url} style={{ width: '100%', marginTop: 8, height: 34 }} />}
              </div>
            ))
          )}
        </div>

        {/* ----------------------------------------------- agenda do cliente */}
        <div className="card">
          <div className="card-header">
            <h2>Agenda</h2>
            <span className="card-sub">{cliente.proximos.length} agendado(s)</span>
          </div>
          {cliente.proximos.length === 0 ? (
            <Vazio
              emoji="▤"
              titulo="Sem retorno agendado"
              texto="Cliente sem próximo passo é cliente que esfria."
              acao={<button className="btn btn-brand" onClick={() => setModal('retorno')}>Agendar retorno</button>}
            />
          ) : (
            cliente.proximos.map((e) => (
              <div key={e.id} className="cliente-linha" onClick={() => navigate(`/dia/${dateKey(e.start)}`)}>
                <span style={{ width: 8, height: 34, borderRadius: 4, background: e.typeMeta.color, flex: 'none' }} />
                <div className="info">
                  <b>{e.title}</b>
                  <div className="mini">{diaMes(e.start)} às {hora(e.start)} · {relativo(e.start)}</div>
                </div>
              </div>
            ))
          )}

          {cliente.historico.length > 0 && (
            <>
              <div className="card-header" style={{ borderTop: '1px solid var(--line)' }}>
                <h3>Histórico da agenda</h3>
              </div>
              {cliente.historico.slice(0, 6).map((e) => (
                <div key={e.id} className="cliente-linha">
                  <span style={{ width: 8, height: 30, borderRadius: 4, background: e.typeMeta.color, flex: 'none' }} />
                  <div className="info">
                    <b className="menor">{e.title}</b>
                    <div className="mini">{diaMes(e.start)} · {e.status}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Excluir fica no fim da ficha, longe de Ligar e Registrar visita:
          no celular, um toque errado ali não pode apagar o cliente */}
      <div className="entre zona-perigo">
        <span className="mini">Apagar este cliente leva junto visitas, propostas e compromissos.</span>
        <button className="btn btn-danger btn-sm" onClick={() => setExcluir({ tipo: 'cliente' })}>
          ✕ Excluir cliente
        </button>
      </div>

      {modal === 'diagnostico' && (
        <DiagnosticoModal cliente={cliente} onFechar={() => setModal(null)} onSalvo={recarregar} />
      )}
      {modal === 'retorno' && (
        <AgendarRetorno cliente={cliente} onFechar={() => setModal(null)} onAgendado={recarregar} />
      )}
      {modal === 'visita' && (
        <RegistrarVisita cliente={cliente} onFechar={() => setModal(null)} onRegistrado={recarregar} />
      )}
      {modal === 'transferir' && (
        <TransferirCliente cliente={cliente} onFechar={() => setModal(null)} onTransferido={recarregar} />
      )}
      {negocioModal && (
        <RegistrarVenda
          cliente={cliente}
          negocio={negocioModal.negocio ?? null}
          modo={negocioModal.modo}
          aviso={negocioModal.aviso}
          onFechar={() => setNegocioModal(null)}
          onSalvo={recarregar}
        />
      )}
      {ativar && <AtivarMaquina negocio={ativar} onFechar={() => setAtivar(null)} onAtivado={recarregar} />}
      {concluir && (
        <ConcluirFollowup followup={concluir} onFechar={() => setConcluir(null)} onConcluido={recarregar} />
      )}

      {excluir?.tipo === 'cliente' && (
        <ConfirmarExclusao
          titulo="Excluir cliente"
          alvo={`${cliente.company} — ${cliente.city}`}
          descricao="O cliente sai da sua carteira e do funil, com todo o histórico."
          itens={[
            'Diagnóstico comercial e pontuação de oportunidade',
            `${cliente.visitas.length} visita(s) registrada(s), com fotos e áudios`,
            `${cliente.negocios.length} proposta(s) e venda(s)`,
            `${cliente.historico.length + cliente.proximos.length} compromisso(s) da agenda`,
          ]}
          textoBotao="Excluir cliente"
          onFechar={() => setExcluir(null)}
          onConfirmar={async () => {
            const r = await endpoints.excluirCliente(cliente.id);
            toast(`${r.removidos.cliente} removido da carteira.`);
            navigate('/carteira');
          }}
        />
      )}

      {excluir?.tipo === 'visita' && (
        <ConfirmarExclusao
          titulo="Excluir visita"
          alvo={`${excluir.dado.resultadoMeta?.label ?? excluir.dado.resultado} · ${diaMes(excluir.dado.at)}`}
          descricao="A visita sai do histórico do cliente e dos seus KPIs do dia."
          itens={excluir.dado.fotos?.length || excluir.dado.audio ? ['Fotos e áudio anexados'] : []}
          textoBotao="Excluir visita"
          onFechar={() => setExcluir(null)}
          onConfirmar={async () => {
            await endpoints.excluirVisita(excluir.dado.id);
            toast('Visita excluída.');
            recarregar();
          }}
        />
      )}

      {excluir?.tipo === 'negocio' && (
        <ConfirmarExclusao
          titulo="Excluir negócio"
          alvo={`${excluir.dado.maquinas} máquina(s)${excluir.dado.taxaOfertada ? ` · tabela ${excluir.dado.taxaOfertada}` : ''}`}
          descricao={
            excluir.dado.status === 'ativado'
              ? 'Atenção: esta venda está ativada e conta na sua meta do mês.'
              : 'A proposta sai do funil e dos indicadores.'
          }
          textoBotao="Excluir negócio"
          onFechar={() => setExcluir(null)}
          onConfirmar={async () => {
            await endpoints.excluirNegocio(excluir.dado.id);
            toast('Negócio excluído.');
            recarregar();
          }}
        />
      )}
    </div>
  );
}
