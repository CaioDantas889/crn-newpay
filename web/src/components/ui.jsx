// Peças reaproveitadas em várias telas.

import { useCallback, useEffect } from 'react';

/**
 * `sujo`: o formulário tem algo preenchido. Aí um toque fora, o Esc ou o ✕
 * perguntam antes de fechar — no celular, um toque sem querer acima do
 * formulário apagava o lead inteiro, foto da fachada incluída. O botão
 * "Cancelar" do rodapé continua fechando direto: ali a intenção é clara.
 */
export function Modal({ titulo, subtitulo, onFechar, children, rodape, sujo = false }) {
  const tentarFechar = useCallback(() => {
    if (sujo && !window.confirm('Descartar o que você preencheu?')) return;
    onFechar();
  }, [sujo, onFechar]);

  useEffect(() => {
    const fechaComEsc = (e) => e.key === 'Escape' && tentarFechar();
    window.addEventListener('keydown', fechaComEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', fechaComEsc);
      document.body.style.overflow = '';
    };
  }, [tentarFechar]);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && tentarFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-header">
          <div className="crescer">
            <h2>{titulo}</h2>
            {subtitulo && <p className="mini">{subtitulo}</p>}
          </div>
          <button className="btn btn-ghost btn-icone" onClick={tentarFechar} aria-label="Fechar">✕</button>
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

/**
 * A consulta falhou e não há nada para mostrar: diz o motivo em vez de deixar
 * a tela carregando para sempre. O caso clássico é o servidor ainda na versão
 * anterior logo depois de uma atualização.
 */
export const Falha = ({ erro, titulo = 'Não consegui carregar esta tela' }) => (
  <div className="card">
    <Vazio
      emoji="⚠︎"
      titulo={titulo}
      texto={`${erro} Se o CRM acabou de ser atualizado, o servidor precisa ser reiniciado.`}
      acao={<button className="btn btn-primary" onClick={() => window.location.reload()}>Tentar de novo</button>}
    />
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

/** "Carlos Souza" → "CS" */
export const iniciais = (nome = '?') =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export const Avatar = ({ nome = '?', cor = '#334155', pequeno }) => (
  <div className={`avatar${pequeno ? ' avatar-sm' : ''}`} style={{ background: cor }}>
    {iniciais(nome)}
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
