import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { diaMes, relativo } from '../lib/date.js';
import { Avatar, Carregando, Modal, Progresso, Vazio } from '../components/ui.jsx';
import ConfirmarExclusao from '../components/ConfirmarExclusao.jsx';

const CATEGORIAS = {
  campanha: { rotulo: '⚑︎ Campanha', cor: 'var(--brand-strong)' },
  taxas: { rotulo: '◰ Taxas', cor: 'var(--blue)' },
  treinamento: { rotulo: '◈ Treinamento', cor: 'var(--purple)' },
  meta: { rotulo: '⊙ Meta', cor: 'var(--orange)' },
  geral: { rotulo: '▪ Geral', cor: 'var(--slate)' },
};

export default function Avisos() {
  const { ehGestor, toast, recarregarNotificacoes } = useApp();
  const { dados: avisos, carregando, recarregar } = useRecurso(() => endpoints.avisos(), []);
  const [novo, setNovo] = useState(null);
  const [excluir, setExcluir] = useState(null);

  const marcarLido = async (aviso) => {
    await endpoints.marcarAvisoLido(aviso.id);
    toast('Leitura registrada.');
    recarregarNotificacoes();
    recarregar();
  };

  const lista = avisos ?? [];
  const naoLidos = lista.filter((a) => !a.read).length;

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h2>Comunicados NewPay</h2>
          <p className="mini">
            {ehGestor
              ? 'Acompanhe quem leu cada comunicado.'
              : `${naoLidos} comunicado(s) aguardando sua leitura.`}
          </p>
        </div>
        {ehGestor && (
          <button className="btn btn-primary" onClick={() => setNovo({ category: 'campanha', priority: 'alta' })}>
            + Novo comunicado
          </button>
        )}
      </div>

      {carregando ? (
        <Carregando linhas={5} />
      ) : lista.length === 0 ? (
        <div className="card"><Vazio emoji="◌" titulo="Nenhum comunicado" /></div>
      ) : (
        <div className="grid-auto-larga">
        {lista.map((a) => {
          const cat = CATEGORIAS[a.category] ?? CATEGORIAS.geral;
          return (
            <div key={a.id} className={`card aviso ${a.priority}${a.read ? ' lido' : ''}`}>
              <div className="card-header">
                <div className="crescer">
                  <div className="linha" style={{ gap: 8, marginBottom: 4 }}>
                    <span className="chip" style={{ color: cat.cor, borderColor: cat.cor }}>{cat.rotulo}</span>
                    {a.priority === 'alta' && <span className="chip chip-erro">Prioritário</span>}
                    {a.read && <span className="chip chip-ok">✓ Lido</span>}
                  </div>
                  <h2>{a.title}</h2>
                  <p className="mini">
                    {a.author?.name} · {diaMes(a.createdAt)} ({relativo(a.createdAt)})
                  </p>
                </div>
                {ehGestor && (
                  <button
                    className="btn-remover"
                    title="Excluir comunicado"
                    onClick={() => setExcluir(a)}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="card-pad coluna">
                <p className="aviso-corpo">{a.body}</p>

                {!ehGestor && !a.read && (
                  <button className="btn btn-brand btn-block" onClick={() => marcarLido(a)}>
                    ✓ Li o comunicado
                  </button>
                )}

                {ehGestor && (
                  <div className="coluna" style={{ gap: 8 }}>
                    <div className="entre">
                      <span className="selo">Controle de leitura</span>
                      <span className="mini forte">
                        {a.readCount}/{a.audienceCount} leram
                      </span>
                    </div>
                    <Progresso
                      atual={a.readCount}
                      total={a.audienceCount}
                      cor={a.readCount === a.audienceCount ? 'var(--brand)' : 'var(--yellow)'}
                    />
                    <div className="leitores">
                      {(a.readBy ?? []).map((r) => (
                        <span key={r.id} className="leitor">
                          <Avatar nome={r.user?.name ?? '?'} cor={r.user?.color} pequeno />
                          {r.user?.name?.split(' ')[0]} ✓
                        </span>
                      ))}
                      {(a.pendingReaders ?? []).map((p) => (
                        <span key={p.id} className="leitor pendente">
                          <Avatar nome={p.name} cor={p.color} pequeno />
                          {p.name.split(' ')[0]} · pendente
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {excluir && (
        <ConfirmarExclusao
          titulo="Excluir comunicado"
          alvo={excluir.title}
          descricao="O comunicado sai do mural de todos os vendedores."
          itens={[`Registro de leitura de ${excluir.readCount} vendedor(es)`]}
          textoBotao="Excluir comunicado"
          onFechar={() => setExcluir(null)}
          onConfirmar={async () => {
            await endpoints.excluirAviso(excluir.id);
            toast('Comunicado removido do mural.');
            recarregar();
            recarregarNotificacoes();
          }}
        />
      )}

      {novo && (
        <NovoComunicado
          onFechar={() => setNovo(null)}
          onCriado={() => {
            recarregar();
            recarregarNotificacoes();
          }}
        />
      )}
    </div>
  );
}

function NovoComunicado({ onFechar, onCriado }) {
  const { toast } = useApp();
  const [form, setForm] = useState({ title: '', body: '', category: 'campanha', priority: 'alta' });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast('Preencha título e conteúdo.', 'erro');
    setSalvando(true);
    try {
      await endpoints.criarAviso(form);
      toast('Comunicado publicado no mural.');
      onCriado();
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Novo comunicado"
      subtitulo="Aparece no mural de todos os vendedores"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Publicando...' : 'Publicar'}
          </button>
        </>
      }
    >
      <div className="campo">
        <label htmlFor="av-titulo">Título</label>
        <input
          id="av-titulo"
          className="input"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Ex.: Nova campanha da Semana do Cliente"
        />
      </div>
      <div className="campo">
        <label htmlFor="av-corpo">Conteúdo</label>
        <textarea
          id="av-corpo"
          className="textarea"
          style={{ minHeight: 140 }}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
      </div>
      <div className="campo">
        <label>Categoria</label>
        <div className="opcoes">
          {Object.entries(CATEGORIAS).map(([chave, c]) => (
            <button
              key={chave}
              className={`opcao${form.category === chave ? ' ativa' : ''}`}
              onClick={() => setForm({ ...form, category: chave })}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="campo">
        <label>Prioridade</label>
        <div className="opcoes">
          <button
            className={`opcao${form.priority === 'alta' ? ' ativa' : ''}`}
            onClick={() => setForm({ ...form, priority: 'alta' })}
          >
            Prioritário
          </button>
          <button
            className={`opcao${form.priority === 'normal' ? ' ativa' : ''}`}
            onClick={() => setForm({ ...form, priority: 'normal' })}
          >
            Normal
          </button>
        </div>
      </div>
    </Modal>
  );
}
