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
import PainelGestor from './pages/PainelGestor.jsx';
import { TrocaObrigatoria } from './components/TrocarSenha.jsx';

export default function App() {
  const { user, carregando, ehGestor, toasts } = useApp();

  const avisosFlutuantes = (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tipo === 'erro' ? ' erro' : ''}`}>
          <span>{t.tipo === 'erro' ? '⚠️' : '✅'}</span>
          <span>{t.mensagem}</span>
        </div>
      ))}
    </div>
  );

  if (carregando) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: 'var(--navy-900)', color: '#fff' }}>
        <div className="centro">
          <div className="logo-mark" style={{ margin: '0 auto 12px', width: 46, height: 46, fontSize: '1.3rem' }}>N</div>
          <p className="mini" style={{ color: '#93a4c8' }}>Carregando seu CRM...</p>
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

  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          {/* O gestor entra direto no painel da equipe */}
          <Route path="/" element={ehGestor ? <Navigate to="/gestor" replace /> : <Inicio />} />
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
            path="/equipe"
            element={ehGestor ? <Equipe /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {avisosFlutuantes}
    </>
  );
}

/** Compatibilidade com links antigos (/clientes/:id → /carteira/:id) */
function RedirecionaCliente() {
  const id = window.location.pathname.split('/').pop();
  return <Navigate to={`/carteira/${id}`} replace />;
}
