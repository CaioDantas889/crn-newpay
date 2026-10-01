// Auditoria semanal: a fila de ligações do onboarding, as ocorrências (só a
// gestão vê) e o Termo de Conduta.
//
// Toda segunda o sistema sorteia 3 leads remotos e 1 presencial de cada
// vendedor. Quem liga pergunta ao lojista se alguém da NewPay falou com ele.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { diaMes, hora } from '../lib/date.js';
import { linkTelefone } from '../lib/contato.js';
import { Avatar, Carregando, Falha, Stat, Vazio } from '../components/ui.jsx';

const dataHora = (iso) => (iso ? `${diaMes(iso)} às ${hora(iso)}` : '—');

export default function Auditoria() {
  const { ehGestor } = useApp();
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') ?? 'fila';
  const irPara = (chave) => setParams(chave === 'fila' ? {} : { aba: chave }, { replace: true });

  const abas = [
    { chave: 'fila', rotulo: 'Fila da semana' },
    { chave: 'concluidas', rotulo: 'Já auditados' },
    ...(ehGestor
      ? [
          { chave: 'ocorrencias', rotulo: 'Ocorrências' },
          { chave: 'termo', rotulo: 'Termo de Conduta' },
        ]
      : []),
  ];

  return (
    <div className="page">
      <div>
        <h1>Auditoria</h1>
        <p className="mini">
          Toda segunda: 3 leads remotos e 1 presencial de cada vendedor. O vendedor não vê quais foram sorteados.
        </p>
      </div>

      <div className="abas">
        {abas.map((a) => (
          <button key={a.chave} className={`aba${aba === a.chave ? ' ativa' : ''}`} onClick={() => irPara(a.chave)}>
            {a.rotulo}
          </button>
        ))}
      </div>

      {(aba === 'fila' || aba === 'concluidas') && <Fila concluidas={aba === 'concluidas'} />}
      {aba === 'ocorrencias' && ehGestor && <Ocorrencias />}
      {aba === 'termo' && ehGestor && <Termo />}
    </div>
  );
}

/* ------------------------------------------------------------ a fila ---- */

function Fila({ concluidas }) {
  const { ehGestor, toast, recarregarNotificacoes } = useApp();
  const { dados, carregando, erro, recarregar } = useRecurso(() => endpoints.auditoria(), []);
  const [sorteando, setSorteando] = useState(false);

  if (erro && !dados) return <Falha erro={erro} titulo="Não consegui carregar a fila da auditoria" />;
  if (carregando || !dados) return <Carregando linhas={5} />;

  const sortear = async () => {
    setSorteando(true);
    try {
      const s = await endpoints.sortearAuditoria();
      toast(s.total ? `${s.total} lead(s) sorteado(s) dos últimos 7 dias.` : 'Nenhum lead novo para sortear nos últimos 7 dias.');
      recarregar();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSorteando(false);
    }
  };

  const lista = concluidas ? dados.concluidas : dados.fila;

  return (
    <>
      <div className="grid grid-4">
        <Stat rotulo="Para ligar" valor={dados.resumo.pendentes} destaque extra={`Semana de ${diaMes(`${dados.semana}T12:00:00`)}`} />
        <Stat rotulo="Confirmados" valor={dados.resumo.confirmados} cor="var(--green)" extra="Nesta semana" />
        <Stat
          rotulo="Não reconhecem"
          valor={dados.resumo.naoReconhecem}
          cor={dados.resumo.naoReconhecem ? 'var(--red)' : 'var(--green)'}
          extra="Viram lead fantasma"
        />
        {ehGestor && (
          <div className="stat">
            <div className="rotulo">Sorteio extra</div>
            <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={sortear} disabled={sorteando}>
              {sorteando ? 'Sorteando...' : 'Sortear agora'}
            </button>
            <div className="extra">Leads dos últimos 7 dias</div>
          </div>
        )}
      </div>

      {!concluidas && (
        <div className="card card-pad mini">
          <b>Roteiro da ligação:</b> “Aqui é da NewPay. Algum representante nosso conversou com você
          sobre maquininha de cartão nos últimos dias?” Registre exatamente o que o lojista responder.
        </div>
      )}

      {lista.length === 0 ? (
        <div className="card">
          <Vazio
            emoji="◈"
            titulo={concluidas ? 'Nada auditado ainda' : 'Fila vazia'}
            texto={concluidas ? 'Os resultados das ligações aparecem aqui.' : 'O próximo sorteio acontece na segunda-feira.'}
          />
        </div>
      ) : (
        <div className="grid-auto-larga">
          {lista.map((a) => (
            <CartaoAuditoria
              key={a.id}
              auditoria={a}
              onRegistrado={() => {
                recarregar();
                recarregarNotificacoes();
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CartaoAuditoria({ auditoria: a, onRegistrado }) {
  const { toast } = useApp();
  const [negando, setNegando] = useState(false);
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const lead = a.lead;

  const registrar = async (resultado) => {
    setSalvando(true);
    try {
      await endpoints.resultadoAuditoria(a.id, resultado, notes);
      toast(resultado === 'confirmado' ? 'Contato confirmado.' : 'Registrado: o lojista não reconhece o contato. A gestão foi avisada.');
      onRegistrado();
    } catch (e) {
      toast(e.message, 'erro');
      setSalvando(false);
    }
  };

  return (
    <div className="card card-pad coluna">
      <div className="linha">
        <div className="crescer" style={{ minWidth: 0 }}>
          <b className="truncar" style={{ display: 'block' }}>{lead?.company ?? 'Lead excluído'}</b>
          <span className="mini">
            {lead?.name}{lead?.city ? ` · ${lead.city}` : ''}
          </span>
        </div>
        <span className="chip">{a.origem === 'remoto' ? `Remoto${lead?.canal ? ` · ${lead.canal}` : ''}` : 'Presencial'}</span>
      </div>

      {lead && (
        <div className="mini coluna" style={{ gap: 3 }}>
          <span>Cadastrado em {dataHora(lead.cadastradoAt)} por <b>{a.vendedor?.name ?? 'vendedor removido'}</b></span>
          {lead.cnpj && <span>CNPJ {lead.cnpj}</span>}
          {lead.address && <span>{lead.address}</span>}
        </div>
      )}

      {a.status === 'pendente' ? (
        <>
          {lead && (
            <a className="btn btn-block" href={linkTelefone(lead.phone || lead.whatsapp)}>
              ✆︎ Ligar para {lead.phone || lead.whatsapp}
            </a>
          )}

          {negando ? (
            <div className="campo">
              <label htmlFor={`aud-${a.id}`}>Com quem falou e o que a pessoa disse</label>
              <textarea
                id={`aud-${a.id}`} className="textarea" value={notes} autoFocus
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: falei com a dona, Maria. Disse que ninguém da NewPay esteve na loja."
              />
              <div className="linha">
                <button className="btn btn-danger crescer" disabled={salvando || notes.trim().length < 5} onClick={() => registrar('nao_reconhece')}>
                  Confirmar: não reconhece o contato
                </button>
                <button className="btn" onClick={() => setNegando(false)}>Voltar</button>
              </div>
              <span className="mini">Isso marca o lead como fantasma e abre ocorrência no perfil do vendedor.</span>
            </div>
          ) : (
            <div className="linha">
              <button className="btn btn-brand crescer" disabled={salvando} onClick={() => registrar('confirmado')}>
                ✓ Confirmado
              </button>
              <button className="btn btn-danger crescer" disabled={salvando} onClick={() => setNegando(true)}>
                ✕ Não reconhece o contato
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <span className={`chip ${a.status === 'confirmado' ? 'chip-ok' : 'chip-erro'}`} style={{ alignSelf: 'flex-start' }}>
            {a.status === 'confirmado' ? '✓ Confirmado' : '✕ Não reconhece o contato'}
          </span>
          <span className="mini">
            {dataHora(a.resultadoAt)}{a.auditor ? ` · ${a.auditor.name}` : ''}
            {a.notes ? ` · “${a.notes}”` : ''}
          </span>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------- ocorrências --- */

function Ocorrencias() {
  const { toast, recarregarNotificacoes } = useApp();
  const { dados, carregando, erro, recarregar } = useRecurso(() => endpoints.ocorrencias(), []);
  const [anulando, setAnulando] = useState(null);
  const [motivo, setMotivo] = useState('');

  if (erro && !dados) return <Falha erro={erro} titulo="Não consegui carregar as ocorrências" />;
  if (carregando || !dados) return <Carregando linhas={4} />;

  const anular = async (o) => {
    try {
      await endpoints.anularOcorrencia(o.id, motivo);
      toast('Ocorrência anulada. O lead voltou a contar.');
      setAnulando(null);
      setMotivo('');
      recarregar();
      recarregarNotificacoes();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  return (
    <>
      <p className="mini">
        Cada lead fantasma confirmado gera uma ocorrência no perfil do vendedor, visível só para a gestão.
        É a base para advertência, perda de bonificação ou rescisão, conforme o contrato.
      </p>

      {dados.porVendedor.length > 0 && (
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          {dados.porVendedor.map((l) => (
            <span key={l.vendedor.id} className="chip chip-erro">{l.vendedor.name}: {l.total} ocorrência(s)</span>
          ))}
        </div>
      )}

      {dados.ocorrencias.length === 0 ? (
        <div className="card">
          <Vazio emoji="✓" titulo="Nenhuma ocorrência" texto="Nenhum lead fantasma foi confirmado pela auditoria." />
        </div>
      ) : (
        <div className="grid-auto-larga">
          {dados.ocorrencias.map((o) => (
            <div key={o.id} className={`card card-pad coluna${o.status === 'anulada' ? ' esmaecido' : ''}`}>
              <div className="linha">
                {o.vendedor && <Avatar nome={o.vendedor.name} cor={o.vendedor.color} />}
                <div className="crescer" style={{ minWidth: 0 }}>
                  <b className="truncar" style={{ display: 'block' }}>{o.vendedor?.name ?? 'Vendedor removido'}</b>
                  <span className="mini">Lead fantasma · {dataHora(o.at)}</span>
                </div>
                <span className={`chip ${o.status === 'ativa' ? 'chip-erro' : ''}`}>{o.status}</span>
              </div>

              <div className="mini coluna" style={{ gap: 3 }}>
                <span>
                  <b>{o.lead.company}</b> — {o.lead.name} · {o.lead.whatsapp || o.lead.phone}
                  {o.lead.city ? ` · ${o.lead.city}` : ''}
                </span>
                <span>
                  {o.lead.origem === 'remoto' ? 'Remoto' : 'Presencial'}
                  {o.lead.cnpj ? ` · CNPJ ${o.lead.cnpj}` : ''} · cadastrado em {dataHora(o.lead.cadastradoAt)}
                </span>
                {o.lead.validadoAt && <span>Validado (contou na meta) em {dataHora(o.lead.validadoAt)}</span>}
                {o.lead.declaracao && <span>Declaração marcada em {dataHora(o.lead.declaracao.at)} · login {o.lead.declaracao.login}</span>}
                {o.visitas.map((v) => (
                  <span key={v.at}>
                    Visita registrada em {dataHora(v.at)}
                    {Number.isFinite(v.lat) ? ` · GPS ${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}` : ' · sem GPS'}
                  </span>
                ))}
                <span>Auditoria: {o.auditor?.name ?? '—'} · “{o.notes}”</span>
              </div>

              {(o.prints.length > 0 || o.fotos.length > 0) && (
                <div className="anexos">
                  {[...o.prints, ...o.fotos].map((url, i) => (
                    <a key={`${url}-${i}`} className="anexo-miniatura" href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="Prova anexada ao lead" />
                    </a>
                  ))}
                </div>
              )}

              {o.status === 'anulada' ? (
                <span className="mini">
                  Anulada por {o.anuladaPorNome ?? 'gestão'} em {dataHora(o.anuladaAt)} · “{o.motivoAnulacao}”
                </span>
              ) : anulando === o.id ? (
                <div className="campo">
                  <label htmlFor={`oco-${o.id}`}>Motivo da anulação</label>
                  <input
                    id={`oco-${o.id}`} className="input" value={motivo} autoFocus
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: lojista confirmou o contato em nova ligação"
                  />
                  <div className="linha">
                    <button className="btn btn-primary" disabled={motivo.trim().length < 5} onClick={() => anular(o)}>Anular</button>
                    <button className="btn" onClick={() => setAnulando(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="detalhe-acoes">
                  {o.leadExiste && <Link className="btn btn-sm" to={`/carteira/${o.clientId}`}>Abrir o lead</Link>}
                  <button className="btn btn-sm" onClick={() => { setAnulando(o.id); setMotivo(''); }}>Anular ocorrência</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------- termo de conduta ---- */

function Termo() {
  const { toast, recarregarNotificacoes } = useApp();
  const { dados, carregando, erro, recarregar } = useRecurso(() => endpoints.termo(), []);
  const [texto, setTexto] = useState(null);
  const [salvando, setSalvando] = useState(false);

  if (erro && !dados) return <Falha erro={erro} titulo="Não consegui carregar o termo" />;
  if (carregando || !dados) return <Carregando linhas={5} />;

  const atual = texto ?? dados.termo?.texto ?? dados.modelo;
  const mudou = atual.trim() !== (dados.termo?.texto ?? '').trim();
  const aceitaram = dados.aceites.filter((a) => a.aceitoAt).length;

  const publicar = async () => {
    setSalvando(true);
    try {
      const termo = await endpoints.publicarTermo(atual);
      toast(`Versão ${termo.versao} publicada. Cada vendedor aceita no próximo acesso.`);
      setTexto(null);
      recarregar();
      recarregarNotificacoes();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid-auto-larga">
      <div className="card card-pad coluna">
        <div className="entre">
          <b>{dados.termo ? `Versão ${dados.termo.versao} em vigor` : 'Nenhum termo publicado'}</b>
          {dados.termo && <span className="mini">publicada em {dataHora(dados.termo.publicadoAt)}</span>}
        </div>
        <textarea
          className="textarea termo-editor" value={atual} onChange={(e) => setTexto(e.target.value)}
          aria-label="Texto do Termo de Conduta"
        />
        <p className="mini">
          Cole aqui o texto fornecido pela NewPay. Publicar uma versão nova faz todo vendedor aceitar de
          novo antes de usar o CRM; sem termo publicado, ninguém é barrado.
        </p>
        <button className="btn btn-primary" disabled={!mudou || salvando} onClick={publicar}>
          {salvando ? 'Publicando...' : dados.termo ? 'Publicar nova versão' : 'Publicar termo'}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Aceite da equipe</h2>
          <span className="card-sub">{aceitaram} de {dados.aceites.length}</span>
        </div>
        {dados.aceites.length === 0 ? (
          <Vazio emoji="▩" titulo="Nenhum vendedor ativo" />
        ) : (
          dados.aceites.map((a) => (
            <div key={a.vendedor.id} className="cliente-linha">
              <Avatar nome={a.vendedor.name} cor={a.vendedor.color} pequeno />
              <div className="info">
                <b>{a.vendedor.name}</b>
                <div className="mini">
                  {a.aceitoAt ? `aceitou em ${dataHora(a.aceitoAt)} · login ${a.login}` : 'ainda não aceitou'}
                </div>
              </div>
              <span className={`chip ${a.aceitoAt ? 'chip-ok' : 'chip-alerta'}`}>{a.aceitoAt ? 'aceito' : 'pendente'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
