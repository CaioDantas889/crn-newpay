// Biblioteca Comercial: vídeos, áudios, PDFs e links oficiais da NewPay.
// A gestão publica, edita e tira material do ar. O vendedor consome e manda
// para o cliente pelo WhatsApp, que é como o material chega na mão do lojista.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Carregando, Modal, Vazio } from '../components/ui.jsx';
import ConfirmarExclusao from '../components/ConfirmarExclusao.jsx';

const TIPOS = [
  { chave: '', label: 'Tudo' },
  { chave: 'video', label: '▶︎ Vídeos' },
  { chave: 'audio', label: '♪ Áudios' },
  { chave: 'pdf', label: '▭ PDFs' },
  { chave: 'link', label: '↗︎ Links' },
];

const EMOJI = { video: '▶︎', audio: '♪', pdf: '▭', link: '↗︎' };
const ACAO = { video: 'Assistir', audio: 'Ouvir', pdf: 'Abrir', link: 'Abrir' };

/** Tipo do material a partir do arquivo escolhido */
const tipoDoArquivo = (mime = '') => {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return 'link';
};

/** Link absoluto, que é o que faz sentido mandar para um cliente */
const linkCompleto = (url = '') =>
  url.startsWith('/') ? `${window.location.origin}${url}` : url;

const MATERIAL_VAZIO = {
  tipo: 'link',
  categoria: '',
  titulo: '',
  descricao: '',
  duracao: '',
  url: '',
};

const TAMANHO_MAXIMO = 64 * 1024 * 1024; // vídeo de treinamento cabe aqui

export default function Biblioteca() {
  const { ehGestor } = useApp();
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const { dados, carregando, recarregar } = useRecurso(
    () => endpoints.biblioteca({ tipo, categoria }),
    [tipo, categoria]
  );
  const [editando, setEditando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

  if (carregando || !dados) return <div className="page"><Carregando linhas={5} /></div>;

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h1>Biblioteca comercial</h1>
          <p className="mini">Material oficial para usar na frente do cliente.</p>
        </div>
        {ehGestor && (
          <button className="btn btn-primary" onClick={() => setEditando({ ...MATERIAL_VAZIO })}>
            + Novo material
          </button>
        )}
      </div>

      <div className="card card-pad coluna">
        <div className="opcoes">
          {TIPOS.map((t) => (
            <button key={t.chave || 'tudo'} className={`opcao${tipo === t.chave ? ' ativa' : ''}`} onClick={() => setTipo(t.chave)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="opcoes">
          <button className={`opcao${categoria === '' ? ' ativa' : ''}`} onClick={() => setCategoria('')}>
            Todas as categorias
          </button>
          {dados.categorias.map((c) => (
            <button key={c} className={`opcao${categoria === c ? ' ativa' : ''}`} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {dados.itens.length === 0 ? (
          <Vazio
            emoji="▣"
            titulo="Nenhum material nesta seleção"
            texto={ehGestor ? 'Publique o primeiro material para a equipe.' : undefined}
            acao={
              ehGestor ? (
                <button className="btn btn-brand" onClick={() => setEditando({ ...MATERIAL_VAZIO })}>
                  + Novo material
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="lista-materiais">
            {dados.itens.map((m) => (
              <div key={m.id} className="material-caixa">
                <a
                  className={`material ${m.tipo}`}
                  href={m.url}
                  target={m.url && m.url !== '#' ? '_blank' : undefined}
                  rel="noreferrer"
                >
                  <span className="icone">{EMOJI[m.tipo] ?? '▭'}</span>
                  <div className="crescer">
                    <b>{m.titulo}</b>
                    <p className="mini">{m.descricao}</p>
                    <p className="mini" style={{ marginTop: 3 }}>
                      {m.categoria}
                      {m.duracao ? ` · ${m.duracao}` : ''}
                    </p>
                  </div>
                  <span className="btn btn-sm">{ACAO[m.tipo] ?? 'Abrir'}</span>
                </a>

                {m.tipo === 'audio' && (
                  <audio className="material-player" controls preload="none" src={m.url} />
                )}

                <div className="material-acoes">
                  <a
                    className="btn btn-sm"
                    href={`https://wa.me/?text=${encodeURIComponent(`${m.titulo} — ${linkCompleto(m.url)}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ⇩︎ Enviar
                  </a>
                  {ehGestor && (
                    <>
                      <button className="btn btn-sm" onClick={() => setEditando(m)}>Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setExcluindo(m)}>Excluir</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <FormularioMaterial
          inicial={editando}
          categorias={dados.categorias}
          onFechar={() => setEditando(null)}
          onSalvo={recarregar}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao
          titulo="Tirar material do ar"
          alvo={excluindo.titulo}
          descricao="A equipe deixa de ver este material na biblioteca."
          itens={excluindo.url?.startsWith('/uploads/') ? ['O arquivo enviado sai do servidor'] : []}
          textoBotao="Excluir material"
          onFechar={() => setExcluindo(null)}
          onConfirmar={async () => {
            await endpoints.excluirMaterial(excluindo.id);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ publicar/editar -- */

function FormularioMaterial({ inicial, categorias, onFechar, onSalvo }) {
  const { toast } = useApp();
  const novo = !inicial.id;
  const [form, setForm] = useState({ ...MATERIAL_VAZIO, ...inicial });
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const campo = (chave) => ({
    value: form[chave] ?? '',
    onChange: (e) => setForm({ ...form, [chave]: e.target.value }),
  });

  const escolherArquivo = async (e) => {
    const escolhido = e.target.files?.[0];
    e.target.value = '';
    if (!escolhido) return;

    if (escolhido.size > TAMANHO_MAXIMO) {
      const mb = Math.round(escolhido.size / 1048576);
      return toast(`Arquivo de ${mb} MB é grande demais (limite de 64 MB). Suba em outro lugar e use o link.`, 'erro');
    }

    // Sobe na hora: material grande demora, e é melhor saber antes de salvar
    setEnviando(true);
    try {
      const enviado = await endpoints.enviarArquivoMaterial(escolhido);
      setArquivo({ nome: escolhido.name, tamanho: escolhido.size });
      setForm((f) => ({ ...f, url: enviado.url, tipo: tipoDoArquivo(escolhido.type) }));
      toast('Arquivo enviado.');
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const dados = { ...form };
      if (novo) {
        await endpoints.criarMaterial(dados);
        toast('Material publicado para a equipe.');
      } else {
        await endpoints.atualizarMaterial(inicial.id, dados);
        toast('Material atualizado.');
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
      titulo={novo ? 'Novo material' : 'Editar material'}
      subtitulo="Aparece na biblioteca de todo mundo"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || enviando}>
            {enviando ? 'Enviando arquivo...' : salvando ? 'Salvando...' : novo ? 'Publicar' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="campo">
        <label htmlFor="mat-titulo">Título</label>
        <input id="mat-titulo" className="input" {...campo('titulo')} placeholder="Ex.: Tabela de taxas de setembro" />
      </div>

      <div className="campo">
        <label>Tipo</label>
        <div className="opcoes">
          {TIPOS.filter((t) => t.chave).map((t) => (
            <button
              key={t.chave}
              className={`opcao${form.tipo === t.chave ? ' ativa' : ''}`}
              onClick={() => setForm({ ...form, tipo: t.chave })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="mat-descricao">Descrição</label>
        <textarea
          id="mat-descricao"
          className="textarea"
          style={{ minHeight: 70 }}
          {...campo('descricao')}
          placeholder="Uma linha dizendo quando usar este material."
        />
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="mat-categoria">Categoria</label>
          <input id="mat-categoria" className="input" list="categorias-biblioteca" {...campo('categoria')} placeholder="taxas, abordagem..." />
          <datalist id="categorias-biblioteca">
            {categorias.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="campo">
          <label htmlFor="mat-duracao">Duração ou tamanho</label>
          <input id="mat-duracao" className="input" {...campo('duracao')} placeholder="4 min · 2 páginas" />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="mat-url">Link</label>
        <input id="mat-url" className="input" {...campo('url')} placeholder="https://..." />
        <span className="mini">Vídeo no YouTube, planilha, apresentação — qualquer endereço.</span>
      </div>

      <div className="campo">
        <label>Ou envie o arquivo (vídeo, áudio, PDF ou imagem, até 64 MB)</label>
        <div className="linha">
          <label className={`btn btn-sm${enviando ? ' desabilitado' : ''}`}>
            {enviando ? '⋯ Enviando...' : '⊕ Escolher arquivo'}
            <input
              type="file"
              accept="video/*,audio/*,application/pdf,image/*"
              onChange={escolherArquivo}
              disabled={enviando}
              style={{ display: 'none' }}
            />
          </label>
          <span className="mini crescer">
            {arquivo
              ? `${arquivo.nome} · ${Math.max(1, Math.round(arquivo.tamanho / 1048576))} MB no servidor`
              : inicial.url?.startsWith('/uploads/')
                ? 'Já tem um arquivo enviado — escolher outro substitui.'
                : 'Nenhum arquivo escolhido.'}
          </span>
        </div>
        <span className="mini">Fica guardado junto com os anexos de visita, no disco do servidor.</span>
      </div>
    </Modal>
  );
}
