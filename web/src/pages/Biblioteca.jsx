// Biblioteca Comercial: vídeos e PDFs oficiais da NewPay.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useRecurso } from '../state/app.jsx';
import { Carregando, Vazio } from '../components/ui.jsx';

const TIPOS = [
  { chave: '', label: 'Tudo' },
  { chave: 'video', label: '🎬 Vídeos' },
  { chave: 'pdf', label: '📄 PDFs' },
];

export default function Biblioteca() {
  const [tipo, setTipo] = useState('');
  const [categoria, setCategoria] = useState('');
  const { dados, carregando } = useRecurso(() => endpoints.biblioteca({ tipo, categoria }), [tipo, categoria]);

  if (carregando || !dados) return <div className="page"><Carregando linhas={5} /></div>;

  return (
    <div className="page">
      <div>
        <h1>Biblioteca comercial</h1>
        <p className="mini">Material oficial para usar na frente do cliente.</p>
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
          <Vazio emoji="📚" titulo="Nenhum material nesta seleção" />
        ) : (
          <div className="lista-materiais">
          {dados.itens.map((m) => (
            <a
              key={m.id}
              className={`material ${m.tipo}`}
              href={m.url}
              target={m.url && m.url !== '#' ? '_blank' : undefined}
              rel="noreferrer"
            >
              <span className="icone">{m.tipo === 'video' ? '🎬' : '📄'}</span>
              <div className="crescer">
                <b>{m.titulo}</b>
                <p className="mini">{m.descricao}</p>
                <p className="mini" style={{ marginTop: 3 }}>
                  {m.categoria} · {m.tipo === 'video' ? m.duracao : `${m.paginas} página(s)`}
                </p>
              </div>
              <span className="btn btn-sm">{m.tipo === 'video' ? 'Assistir' : 'Abrir'}</span>
            </a>
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
