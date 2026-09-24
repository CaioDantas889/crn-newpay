// Peças reaproveitadas em várias telas.

import { useEffect } from 'react';

export function Modal({ titulo, subtitulo, onFechar, children, rodape }) {
  useEffect(() => {
    const fechaComEsc = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', fechaComEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', fechaComEsc);
      document.body.style.overflow = '';
    };
  }, [onFechar]);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-header">
          <div className="crescer">
            <h2>{titulo}</h2>
            {subtitulo && <p className="mini">{subtitulo}</p>}
          </div>
          <button className="btn btn-ghost btn-icone" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export const Vazio = ({ emoji = '◌', titulo, texto, acao }) => (
  <div className="vazio">
    <span className="emoji">{emoji}</span>
    <p className="forte">{titulo}</p>
    {texto && <p className="mini" style={{ marginTop: 4 }}>{texto}</p>}
    {acao && <div style={{ marginTop: 14 }}>{acao}</div>}
  </div>
);

export const Carregando = ({ linhas = 3 }) => (
  <div className="card-pad coluna">
    {Array.from({ length: linhas }, (_, i) => (
      <div key={i} className="skeleton" style={{ width: `${100 - i * 12}%` }} />
    ))}
  </div>
);

export const Stat = ({ valor, rotulo, extra, destaque, cor }) => (
  <div className={`stat${destaque ? ' destaque' : ''}`}>
    <div className="rotulo">{rotulo}</div>
    <div className="valor" style={cor ? { color: cor } : undefined}>{valor}</div>
    {extra && <div className="extra">{extra}</div>}
  </div>
);

export const Avatar = ({ nome = '?', cor = '#334155', pequeno }) => (
  <div className={`avatar${pequeno ? ' avatar-sm' : ''}`} style={{ background: cor }}>
    {nome
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase()}
  </div>
);

export const ChipTemperatura = ({ valor }) => (
  <span className={`chip chip-${valor}`}>
    {valor === 'quente' ? '▲' : valor === 'morno' ? '●' : '○'} {valor}
  </span>
);

export const Progresso = ({ atual, total, cor }) => (
  <div className="progresso">
    <span style={{ width: `${total ? Math.min(100, (atual / total) * 100) : 0}%`, background: cor }} />
  </div>
);
