// Ficha do cliente: diagnóstico, oportunidade, histórico e ações de campo.

import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, diaMes, hora, moeda, relativo } from '../lib/date.js';
import { CORES_TEMPERATURA } from '../lib/score.js';
import { Carregando, Progresso, Vazio } from '../components/ui.jsx';
import AgendarRetorno from '../components/AgendarRetorno.jsx';
import DiagnosticoModal from '../components/DiagnosticoModal.jsx';
import RegistrarVisita from '../components/RegistrarVisita.jsx';
import ConfirmarExclusao from '../components/ConfirmarExclusao.jsx';

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { meta, toast, recarregarNotificacoes } = useApp();

  const { dados: cliente, carregando, erro, recarregar } = useRecurso(() => endpoints.cliente(id), [id]);
  const [modal, setModal] = useState(params.get('diagnostico') ? 'diagnostico' : null);
  const [proposta, setProposta] = useState({ maquinas: 1, taxaOfertada: '' });
  const [excluir, setExcluir] = useState(null);

  if (carregando) return <div className="page"><Carregando linhas={6} /></div>;

  // Sem isto, um erro (cliente de outra carteira, por exemplo) deixaria a tela
  // carregando para sempre
  if (erro || !cliente) {
    return (
      <div className="page">
        <Vazio
          emoji="🚫"
          titulo="Não foi possível abrir este cliente"
          texto={erro ?? 'Cliente não encontrado.'}
          acao={<button className="btn btn-primary" onClick={() => navigate('/carteira')}>Voltar para a carteira</button>}
        />
      </div>
    );
  }

  const diagnosticoPreenchido = Boolean(cliente.diagnostico?.preenchidoAt);
  const somenteNumeros = (v = '') => v.replace(/\D/g, '');

  const moverFunil = async (stage) => {
    await endpoints.atualizarCliente(cliente.id, { stage });
    toast(`Cliente movido para ${meta.funil[stage].label.toLowerCase()}.`);
    recarregar();
  };

  const enviarProposta = async () => {
    await endpoints.criarNegocio({ clientId: cliente.id, ...proposta });
    toast('Proposta registrada. Cliente movido para "proposta".');
    recarregarNotificacoes();
    recarregar();
  };

  const avancarNegocio = async (negocio, status) => {
    await endpoints.atualizarNegocio(negocio.id, { status });
    toast(status === 'ativado' ? 'Máquina ativada! Entra na sua meta do mês.' : 'Negócio atualizado.');
    recarregar();
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
      </div>

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
          <button className="btn btn-brand" onClick={() => setModal('visita')}>⚡ Registrar visita</button>
          <button className="btn btn-primary" onClick={() => setModal('retorno')}>📅 Agendar retorno</button>
          <a className="btn" href={`tel:${somenteNumeros(cliente.phone)}`}>📞 Ligar</a>
          <a className="btn" href={`https://wa.me/55${somenteNumeros(cliente.whatsapp || cliente.phone)}`} target="_blank" rel="noreferrer">
            💬 WhatsApp
          </a>
          <a
            className="btn"
            href={`https://www.google.com/maps/dir/?api=1&destination=${cliente.lat},${cliente.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            🗺️ Rota
          </a>
          <button className="btn" onClick={() => navigate(`/objecoes?clientId=${cliente.id}`)}>💬 Argumentos</button>
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

        <div className="entre" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <span className="mini">
            Cliente cadastrado em {diaMes(cliente.createdAt)} · {cliente.visitas.length} visita(s) registrada(s)
          </span>
          <button className="btn btn-danger btn-sm" onClick={() => setExcluir({ tipo: 'cliente' })}>
            🗑️ Excluir cliente
          </button>
        </div>
      </div>

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
            emoji="📋"
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

      {/* -------------------------------------------- negócios e proposta */}
      <div className="card">
        <div className="card-header">
          <h2>Propostas e vendas</h2>
          <span className="card-sub">{cliente.negocios.length} registro(s)</span>
        </div>

        {cliente.negocios.map((n) => (
          <div key={n.id} className="cliente-linha">
            <span className="avatar" style={{ background: n.status === 'ativado' ? '#0d9488' : n.status === 'fechado' ? '#16a34a' : '#8b5cf6' }}>
              {n.maquinas}x
            </span>
            <div className="info">
              <b>{n.maquinas} máquina(s){n.taxaOfertada ? ` · tabela ${n.taxaOfertada}` : ''}</b>
              <div className="mini">
                {n.taxaOfertada ? `Tabela ${n.taxaOfertada} · ` : ''}
                proposta em {diaMes(n.propostaAt)}
                {n.ativacaoAt ? ` · ativada em ${diaMes(n.ativacaoAt)}` : ''}
              </div>
            </div>
            {n.status === 'ativado' ? (
              <span className="chip chip-ok">Ativada</span>
            ) : n.status === 'fechado' ? (
              <button className="btn btn-brand btn-sm" onClick={() => avancarNegocio(n, 'ativado')}>Ativar</button>
            ) : (
              <button className="btn btn-sm" onClick={() => avancarNegocio(n, 'fechado')}>Fechar</button>
            )}
            <button
              className="btn-remover"
              title="Excluir este negócio"
              onClick={() => setExcluir({ tipo: 'negocio', dado: n })}
            >
              🗑️
            </button>
          </div>
        ))}

        <div className="card-pad coluna" style={{ borderTop: cliente.negocios.length ? '1px solid var(--line)' : 'none' }}>
          <b className="menor">Enviar nova proposta</b>
          <div className="form-linha duas">
            <div className="campo">
              <label htmlFor="pr-maq">Máquinas</label>
              <input
                id="pr-maq" type="number" min="1" className="input" value={proposta.maquinas}
                onChange={(e) => setProposta({ ...proposta, maquinas: Number(e.target.value) })}
              />
            </div>
            <div className="campo">
              <label htmlFor="pr-taxa">Tabela de taxa</label>
              <select
                id="pr-taxa"
                className="select"
                value={proposta.taxaOfertada}
                onChange={(e) => setProposta({ ...proposta, taxaOfertada: e.target.value })}
              >
                <option value="">Escolha a tabela</option>
                {(meta?.tabelasTaxa ?? []).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={enviarProposta}>
            📄 Registrar proposta ({proposta.maquinas} máquina(s))
          </button>
        </div>
      </div>

      <div className="grid-auto-larga">
        {/* ------------------------------------------ histórico de visitas */}
        <div className="card">
          <div className="card-header">
            <h2>Visitas registradas</h2>
            <span className="card-sub">{cliente.visitas.length}</span>
          </div>
          {cliente.visitas.length === 0 ? (
            <Vazio emoji="🚶" titulo="Nenhuma visita registrada" />
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
                      🗑️
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
              emoji="📅"
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

      {modal === 'diagnostico' && (
        <DiagnosticoModal cliente={cliente} onFechar={() => setModal(null)} onSalvo={recarregar} />
      )}
      {modal === 'retorno' && (
        <AgendarRetorno cliente={cliente} onFechar={() => setModal(null)} onAgendado={recarregar} />
      )}
      {modal === 'visita' && (
        <RegistrarVisita cliente={cliente} onFechar={() => setModal(null)} onRegistrado={recarregar} />
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
