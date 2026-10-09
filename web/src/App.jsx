import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './state/app.jsx';
import AppShell from './components/AppShell.jsx';
import Login from './pages/Login.jsx';
import Inicio from './pages/Inicio.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Calendario from './pages/Calendario.jsx';
import AgendaDia from './pages/AgendaDia.jsx';
import Tarefas from './pages/Tarefas.jsx';
import Carteira from './pages/Carteira.jsx';
import ClienteDetalhe from './pages/ClienteDetalhe.jsx';
import Ranking from './pages/Ranking.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Objecoes from './pages/Objecoes.jsx';
import Avisos from './pages/Avisos.jsx';
import FecharDia from './pages/FecharDia.jsx';
import Expediente from './pages/Expediente.jsx';
import Mais from './pages/Mais.jsx';
import Equipe from './pages/Equipe.jsx';
import PerfilVendedor from './pages/PerfilVendedor.jsx';
import PainelGestor from './pages/PainelGestor.jsx';
import Auditoria from './pages/Auditoria.jsx';
import AceiteTermo from './components/AceiteTermo.jsx';
import { TrocaObrigatoria } from './components/TrocarSenha.jsx';

export default function App() {
  const { user, carregando, ehGestor, ehOnboarding, toasts, fecharToast, semConexao, abrirSessao, reentrada } = useApp();

  // Toque no aviso fecha: o de erro fica 8 s, e às vezes cobre o botão
  const avisosFlutuantes = (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast${t.tipo === 'erro' ? ' erro' : ''}`}
          role={t.tipo === 'erro' ? 'alert' : 'status'}
          onClick={() => fecharToast(t.id)}
        >
          <span>{t.tipo === 'erro' ? '⚠︎' : '✓'}</span>
          <span>{t.mensagem}</span>
        </div>
      ))}
    </div>
  );

  // Abriu sem sinal: a sessão continua guardada, só falta a internet
  if (semConexao && !user) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--preto)', color: '#fff', padding: 24 }}>
        <div className="centro coluna" style={{ alignItems: 'center', gap: 12 }}>
          <div className="logo-npb sobre-preto" role="img" aria-label="NewPay Bank" style={{ width: 132, height: 93 }} />
          <p style={{ color: '#e6e9ec', fontWeight: 650 }}>Sem internet agora.</p>
          <p className="mini" style={{ color: '#aeb8c2', maxWidth: 280 }}>
            O CRM abre sozinho quando o sinal voltar. Você continua conectado.
          </p>
          <button className="btn btn-brand" onClick={abrirSessao}>Tentar agora</button>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--preto)', color: '#fff' }}>
        <div className="centro">
          <div
            className="logo-npb sobre-preto"
            role="img"
            aria-label="NewPay Bank"
            style={{ margin: '0 auto 14px', width: 132, height: 93 }}
          />
          <p className="mini" style={{ color: '#aeb8c2' }}>Carregando seu CRM...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        {avisosFlutuantes}
      </>
    );
  }

  // Senha provisória (primeiro acesso ou reset do gestor): o CRM só abre depois
  // que a pessoa define a própria senha.
  if (user.mustChangePassword) {
    return (
      <>
        <TrocaObrigatoria />
        {avisosFlutuantes}
      </>
    );
  }

  // Primeiro acesso (ou termo novo): o vendedor aceita o Termo de Conduta
  // antes de qualquer cadastro. O aceite fica gravado com data, hora e login.
  if (user.termoPendente) {
    return (
      <>
        <AceiteTermo />
        {avisosFlutuantes}
      </>
    );
  }

  const inicio = ehGestor
    ? <Navigate to="/gestor" replace />
    : ehOnboarding
      ? <Navigate to="/auditoria" replace />
      : <Inicio />;

  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          {/* O gestor entra direto no painel da equipe; o onboarding, na fila da auditoria */}
          <Route path="/" element={inicio} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/dia" element={<AgendaDia />} />
          <Route path="/dia/:data" element={<AgendaDia />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/expediente" element={<Expediente />} />
          <Route path="/carteira" element={<Carteira />} />
          <Route path="/carteira/:id" element={<ClienteDetalhe />} />
          <Route path="/clientes" element={<Navigate to="/carteira" replace />} />
          <Route path="/clientes/:id" element={<RedirecionaCliente />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/biblioteca" element={<Biblioteca />} />
          <Route path="/objecoes" element={<Objecoes />} />
          <Route path="/avisos" element={<Avisos />} />
          <Route path="/fechar-dia" element={<FecharDia />} />
          <Route path="/mais" element={<Mais />} />
          <Route
            path="/gestor"
            element={ehGestor ? <PainelGestor /> : <Navigate to="/" replace />}
          />
          <Route
            path="/auditoria"
            element={ehGestor || ehOnboarding ? <Auditoria /> : <Navigate to="/" replace />}
          />
          <Route
            path="/equipe"
            element={ehGestor ? <Equipe /> : <Navigate to="/" replace />}
          />
          <Route
            path="/equipe/:id"
            element={ehGestor ? <PerfilVendedor /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {reentrada && <Reentrada />}
      {avisosFlutuantes}
    </>
  );
}

/** Compatibilidade com links antigos (/clientes/:id → /carteira/:id) */
function RedirecionaCliente() {
  const id = window.location.pathname.split('/').pop();
  return <Navigate to={`/carteira/${id}`} replace />;
}

/**
 * A sessão venceu com o vendedor no meio do trabalho. Em vez de voltar ao
 * login (e jogar fora o lead ou a visita aberta), pede só a senha por cima de
 * tudo. Não fecha tocando fora: sem senha, nada salva.
 */
function Reentrada() {
  const { user, reentrar, toast } = useApp();
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    if (!senha) return;
    setEntrando(true);
    try {
      await reentrar(senha);
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="modal-fundo reentrada" role="dialog" aria-modal="true" aria-label="Entrar de novo">
      <form className="modal card-pad coluna" onSubmit={enviar}>
        <h2>Sua sessão expirou</h2>
        <p className="mini">
          Entre de novo para continuar. O que está aberto na tela não foi perdido.
        </p>
        <div className="campo">
          <label htmlFor="re-email">E-mail</label>
          <input id="re-email" className="input" value={user?.email ?? ''} readOnly />
        </div>
        <div className="campo">
          <label htmlFor="re-senha">Senha</label>
          <input
            id="re-senha" className="input" type="password" autoComplete="current-password" autoFocus
            value={senha} onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <button className="btn btn-brand btn-block" type="submit" disabled={entrando || !senha}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
