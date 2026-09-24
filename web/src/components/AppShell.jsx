// Estrutura do CRM: rail de ícones à esquerda, topbar com busca global e
// ação "+ Novo", e o conteúdo da rota no meio.

import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { dateKey, moeda } from '../lib/date.js';
import { aplicarTema, outroTema, temaPreferido } from '../lib/tema.js';
import { Avatar, Vazio } from './ui.jsx';
import NotificacoesPainel from './NotificacoesPainel.jsx';
import RegistrarVisita from './RegistrarVisita.jsx';
import NovoCliente from './NovoCliente.jsx';
import EventoModal from './EventoModal.jsx';

const railClasse = ({ isActive }) => `rail-item${isActive ? ' ativo' : ''}`;
const bottomClasse = ({ isActive }) => (isActive ? 'ativo' : undefined);

export default function AppShell() {
  const { user, sair, notificacoes, ehGestor } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [parametros, setParametros] = useSearchParams();

  const [painelAberto, setPainelAberto] = useState(false);
  const [menuNovo, setMenuNovo] = useState(false);
  const [modal, setModal] = useState(null); // 'visita' | 'cliente' | 'compromisso'
  const [busca, setBusca] = useState('');
  const [tema, setTema] = useState(temaPreferido);
  const [resultados, setResultados] = useState(null);
  const caixaBusca = useRef(null);

  const hoje = dateKey();

  // Busca global: sugere clientes enquanto digita
  useEffect(() => {
    if (busca.trim().length < 2) return setResultados(null);
    const t = setTimeout(() => {
      endpoints
        .clientes({ busca: busca.trim(), ordem: 'score' })
        .then((lista) => setResultados(lista.slice(0, 8)))
        .catch(() => setResultados([]));
    }, 220);
    return () => clearTimeout(t);
  }, [busca]);

  // Atalhos do app instalado (manifest): abrir direto no registro de visita
  useEffect(() => {
    const acao = parametros.get('acao');
    if (!acao) return;
    if (['visita', 'cliente', 'compromisso'].includes(acao)) setModal(acao);
    parametros.delete('acao'); // some da URL para não reabrir ao voltar
    setParametros(parametros, { replace: true });
  }, [parametros, setParametros]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const aoClicar = (e) => {
      if (caixaBusca.current && !caixaBusca.current.contains(e.target)) setResultados(null);
    };
    window.addEventListener('mousedown', aoClicar);
    return () => window.removeEventListener('mousedown', aoClicar);
  }, []);

  const abrirCliente = (id) => {
    setResultados(null);
    setBusca('');
    navigate(`/carteira/${id}`);
  };

  const acoesNovo = [
    { chave: 'visita', emoji: '✓', label: 'Registrar visita' },
    { chave: 'cliente', emoji: '◇', label: 'Novo cliente' },
    { chave: 'compromisso', emoji: '▤', label: 'Novo compromisso' },
  ];

  return (
    <div className="app">
      <aside className="rail">
        <div className="marca logo-npb" role="img" aria-label="NewPay Bank" title="NewPay CRM" />

        <NavLink to="/" end className={railClasse}>
          <span className="ico">⌂</span> Início
        </NavLink>
        <NavLink to="/pipeline" className={railClasse}>
          <span className="ico">▦</span> Pipeline
        </NavLink>
        <NavLink to={`/dia/${hoje}`} className={railClasse}>
          <span className="ico">▤</span> Agenda
        </NavLink>
        <NavLink to="/expediente" className={railClasse}>
          <span className="ico">◷</span> Expediente
        </NavLink>
        <NavLink to="/carteira" className={railClasse}>
          <span className="ico">◇</span> Carteira
        </NavLink>
        <NavLink to="/ranking" className={railClasse}>
          <span className="ico">★</span> Ranking
        </NavLink>

        <div className="rail-sep" />

        {ehGestor && (
          <>
            <NavLink to="/gestor" className={railClasse}>
              <span className="ico">▥</span> Gestor
            </NavLink>
            <NavLink to="/equipe" className={railClasse}>
              <span className="ico">▩</span> Equipe
            </NavLink>
          </>
        )}
        <NavLink to="/avisos" className={railClasse}>
          <span className="ico">⚑︎</span> Avisos
        </NavLink>
        <NavLink to="/mais" className={railClasse}>
          <span className="ico">⋯</span> Mais
        </NavLink>

        <div className="rail-rodape">
          <Avatar nome={user.name} cor={user.color} />
          <button className="rail-item" onClick={sair} title="Sair">
            <span className="ico">↩︎</span> Sair
          </button>
        </div>
      </aside>

      <div className={`main${ehGestor ? '' : ' com-fab'}`}>
        <header className="topbar-crm">
          <div className="busca-global" ref={caixaBusca}>
            <span className="lupa">⌕</span>
            <input
              className="input"
              placeholder="Busca global: cliente, empresa, cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onFocus={() => busca.trim().length >= 2 && resultados === null && setBusca(busca)}
            />
            {resultados && (
              <div className="busca-resultados">
                {resultados.length === 0 ? (
                  <Vazio emoji="⌕" titulo="Nada encontrado" texto="Tente outro nome ou cidade." />
                ) : (
                  resultados.map((c) => (
                    <div key={c.id} className="cliente-linha" onClick={() => abrirCliente(c.id)}>
                      <span className={`score-bola ${c.temperature}`}>{c.score}</span>
                      <div className="info">
                        <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                        <span className="mini">
                          {c.city} · {c.stageMeta?.label}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="filtros novo-wrap">
            <button className="btn btn-brand btn-novo" onClick={() => setMenuNovo((v) => !v)}>
              + Novo
            </button>
            {menuNovo && (
              <>
                <div className="novo-fundo" onClick={() => setMenuNovo(false)} aria-hidden="true" />
                <div className="card novo-menu">
                  {acoesNovo.map((a) => (
                    <button
                      key={a.chave}
                      className="cliente-linha"
                      onClick={() => {
                        setMenuNovo(false);
                        setModal(a.chave);
                      }}
                    >
                      <span className="emoji">{a.emoji}</span>
                      <span className="info forte">{a.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="direita">
            <button
              className="btn btn-ghost btn-icone"
              onClick={() => setTema((atual) => aplicarTema(outroTema(atual)))}
              title={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
              aria-label={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            >
              {tema === 'escuro' ? '☀︎' : '☾'}
            </button>
            <button
              className="btn btn-ghost btn-icone sino"
              onClick={() => setPainelAberto((v) => !v)}
              aria-label="Notificações"
            >
              ⚐︎
              {notificacoes.naoLidas > 0 && <span className="bolha">{notificacoes.naoLidas}</span>}
            </button>
            <Avatar nome={user.name} cor={user.color} />
          </div>
        </header>

        {painelAberto && <NotificacoesPainel onFechar={() => setPainelAberto(false)} />}

        <Outlet
          context={{
            abrirRegistroVisita: () => setModal('visita'),
            abrirNovoCliente: () => setModal('cliente'),
            busca,
          }}
        />
      </div>

      {!ehGestor && (
        <button className="fab" onClick={() => setModal('visita')}>✓ Visitei</button>
      )}

      <nav className="bottom-nav">
        <NavLink to="/" end className={bottomClasse}><span className="ico">⌂</span> Início</NavLink>
        <NavLink to="/pipeline" className={bottomClasse}><span className="ico">▦</span> Pipeline</NavLink>
        <NavLink to={`/dia/${hoje}`} className={bottomClasse}><span className="ico">▤</span> Agenda</NavLink>
        <NavLink to="/carteira" className={bottomClasse}><span className="ico">◇</span> Carteira</NavLink>
        <NavLink to="/mais" className={bottomClasse}>
          <span className="ico">⋯</span> Mais
          {notificacoes.itens.some((n) => n.kind === 'nova_campanha' || n.kind === 'aviso_nao_lido') && (
            <span className="ponto" />
          )}
        </NavLink>
      </nav>

      {modal === 'visita' && <RegistrarVisita onFechar={() => setModal(null)} />}
      {modal === 'cliente' && (
        <NovoCliente
          onFechar={() => setModal(null)}
          onCriado={(cliente) => navigate(`/carteira/${cliente.id}?diagnostico=1`)}
        />
      )}
      {modal === 'compromisso' && (
        <EventoModal
          dataPadrao={hoje}
          onFechar={() => setModal(null)}
          onSalvo={() => pathname.startsWith('/dia') && navigate(0)}
        />
      )}
    </div>
  );
}
