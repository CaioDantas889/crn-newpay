// Menu "Mais" — atalho para tudo que não cabe na barra inferior do celular.

import { Link } from 'react-router-dom';
import { useApp } from '../state/app.jsx';
import { dateKey } from '../lib/date.js';
import { Avatar } from '../components/ui.jsx';

export default function Mais() {
  const { user, sair, ehGestor, notificacoes } = useApp();

  const itens = [
    { to: '/pipeline', emoji: '🗂️', label: 'Pipeline' },
    { to: '/calendario', emoji: '📅', label: 'Calendário' },
    { to: `/dia/${dateKey()}`, emoji: '📆', label: 'Agenda de hoje' },
    { to: '/rota', emoji: '🎯', label: 'Agenda inteligente' },
    { to: '/tarefas', emoji: '📝', label: 'Tarefas' },
    { to: '/fechar-dia', emoji: '✅', label: 'Fechar o dia' },
    { to: '/biblioteca', emoji: '📚', label: 'Biblioteca' },
    { to: '/objecoes', emoji: '💬', label: 'Objeções' },
    { to: '/avisos', emoji: '📢', label: 'Mural de avisos' },
    ...(ehGestor ? [{ to: '/gestor', emoji: '📊', label: 'Painel do gestor' }] : []),
  ];

  return (
    <div className="page">
      <div className="card card-pad linha">
        <Avatar nome={user.name} cor={user.color} />
        <div className="crescer">
          <b>{user.name}</b>
          <p className="mini">{user.jobTitle} · {user.city}</p>
        </div>
        <span className="chip">{notificacoes.naoLidas} avisos</span>
      </div>

      <div className="menu-mais">
        {itens.map((i) => (
          <Link key={i.to} to={i.to}>
            <span className="emoji">{i.emoji}</span>
            {i.label}
          </Link>
        ))}
      </div>

      <button className="btn btn-danger btn-block" onClick={sair}>Sair da conta</button>
    </div>
  );
}
