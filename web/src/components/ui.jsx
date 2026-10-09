// Peças reaproveitadas em várias telas.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ModalContexto = createContext(null);

const novoId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Janela por cima da tela. Três jeitos de fechar sem querer — tocar fora, o
 * ✕/Esc e o botão voltar do Android — e o "Cancelar" do rodapé perguntam
 * antes de descartar quando há algo preenchido. Na rua, um toque errado
 * apagava o lead inteiro, foto da fachada incluída.
 *
 * `sujo`: o formulário diz que tem algo preenchido (útil para escolhas por
 *   botão, que não disparam "input"). Além dele, qualquer digitação dentro do
 *   modal já conta.
 *
 * O voltar do Android: ao abrir, o modal põe uma entrada no histórico; o
 * voltar consome essa entrada em vez de sair da tela (ou fechar o app
 * instalado). Fechando por botão, a entrada é retirada.
 *
 * `ocupado`: salvando ou excluindo. Aí nada fecha o modal (nem voltar, nem ✕,
 * nem Cancelar): fechar no meio não cancelava a gravação, que seguia por trás
 * e podia virar visita em dobro.
 */
export function Modal({ titulo, subtitulo, onFechar, children, rodape, sujo = false, ocupado = false }) {
  const [mexeu, setMexeu] = useState(false);
  const idRef = useRef(null);
  if (!idRef.current) idRef.current = novoId();

  // O fechamento sempre com os valores atuais, sem refazer os efeitos
  const atual = useRef({ onFechar, precisa: false, ocupado: false });
  atual.current = { onFechar, precisa: Boolean(sujo || mexeu), ocupado: Boolean(ocupado) };

  const tentarFechar = useCallback(() => {
    if (atual.current.ocupado) return;
    if (atual.current.precisa && !window.confirm('Descartar o que você preencheu?')) return;
    atual.current.onFechar();
  }, []);

  useEffect(() => {
    const fechaComEsc = (e) => e.key === 'Escape' && tentarFechar();
    window.addEventListener('keydown', fechaComEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', fechaComEsc);
      document.body.style.overflow = '';
    };
  }, [tentarFechar]);

  // Voltar do Android
  const montado = useRef(false);
  const consumido = useRef(false);
  useEffect(() => {
    const id = idRef.current;
    montado.current = true;
    if (window.history.state?.modalId !== id) {
      window.history.pushState({ ...(window.history.state ?? {}), modalId: id }, '');
    }

    const aoVoltar = (e) => {
      if (e.state?.modalId === id) return;
      if (atual.current.ocupado || (atual.current.precisa && !window.confirm('Descartar o que você preencheu?'))) {
        window.history.pushState({ ...(window.history.state ?? {}), modalId: id }, '');
        return;
      }
      consumido.current = true;
      atual.current.onFechar();
    };
    window.addEventListener('popstate', aoVoltar);

    return () => {
      window.removeEventListener('popstate', aoVoltar);
      montado.current = false;
      // Espera um instante: no modo de desenvolvimento o React desmonta e
      // monta de novo na hora, e aí a entrada continua sendo deste modal.
      // Depois de salvar e navegar para outra tela, a entrada de cima já não
      // é a dele — e não se volta, senão a navegação seria desfeita.
      setTimeout(() => {
        if (montado.current || consumido.current) return;
        if (window.history.state?.modalId === id) window.history.back();
      }, 0);
    };
  }, []);

  return (
    <ModalContexto.Provider value={{ tentarFechar, ocupado: Boolean(ocupado) }}>
      <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && tentarFechar()}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
          <div className="modal-header">
            <div className="crescer">
              <h2>{titulo}</h2>
              {subtitulo && <p className="mini">{subtitulo}</p>}
            </div>
            <button className="btn btn-ghost btn-icone" onClick={tentarFechar} disabled={ocupado} aria-label="Fechar">✕</button>
          </div>
          <div className="modal-corpo" onInput={() => !mexeu && setMexeu(true)}>{children}</div>
          {rodape && <div className="modal-rodape">{rodape}</div>}
        </div>
      </div>
    </ModalContexto.Provider>
  );
}

/** "Cancelar" do rodapé: pergunta antes de descartar o que foi preenchido */
export function CancelarModal({ children = 'Cancelar' }) {
  const contexto = useContext(ModalContexto);
  return (
    <button type="button" className="btn" disabled={contexto?.ocupado} onClick={() => contexto?.tentarFechar()}>
      {children}
    </button>
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
