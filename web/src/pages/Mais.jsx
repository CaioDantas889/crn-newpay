// Menu "Mais" — atalho para tudo que não cabe na barra inferior do celular.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/app.jsx';
import { dateKey } from '../lib/date.js';
import { Avatar } from '../components/ui.jsx';
import TrocarSenha from '../components/TrocarSenha.jsx';
import InstalarApp from '../components/InstalarApp.jsx';

export default function Mais() {
  const { user, sair, ehGestor, ehOnboarding, ehVendedor, notificacoes, toast } = useApp();
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [avisos, setAvisos] = useState(() => ('Notification' in window ? Notification.permission : 'indisponivel'));

  // Lembretes de ritmo (8h, 11h, 15h, 18h) como notificação do aparelho
  const ativarAvisos = async () => {
    const permissao = await Notification.requestPermission();
    setAvisos(permissao);
    toast(
      permissao === 'granted'
        ? 'Avisos ativados neste aparelho.'
        : 'O navegador bloqueou os avisos. Libere no cadeado da barra de endereço.',
      permissao === 'granted' ? 'ok' : 'erro'
    );
  };

  const itensOnboarding = [
    { to: '/auditoria', emoji: '◈', label: 'Auditoria' },
    { to: '/avisos', emoji: '⚑︎', label: 'Mural de avisos' },
  ];

  const itensGerais = [
    { to: '/pipeline', emoji: '▦', label: 'Pipeline' },
    { to: '/calendario', emoji: '▤', label: 'Calendário' },
    { to: `/dia/${dateKey()}`, emoji: '▤', label: 'Agenda de hoje' },
    { to: '/tarefas', emoji: '✎', label: 'Tarefas' },
    { to: '/expediente', emoji: '◷', label: 'Expediente' },
    { to: '/fechar-dia', emoji: '✓', label: 'Fechar o dia' },
    { to: '/biblioteca', emoji: '▣', label: 'Biblioteca' },
    { to: '/objecoes', emoji: '⁇', label: 'Objeções' },
    { to: '/avisos', emoji: '⚑︎', label: 'Mural de avisos' },
    ...(ehGestor
      ? [
          { to: '/gestor', emoji: '▥', label: 'Painel do gestor' },
          { to: '/auditoria', emoji: '◈', label: 'Auditoria' },
          { to: '/equipe', emoji: '▩', label: 'Equipe' },
        ]
      : []),
  ];

  const itens = ehOnboarding ? itensOnboarding : itensGerais;

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

      <InstalarApp />

      <div className="menu-mais">
        {itens.map((i) => (
          <Link key={i.to} to={i.to}>
            <span className="emoji">{i.emoji}</span>
            {i.label}
          </Link>
        ))}
      </div>

      <div className="coluna">
        {ehVendedor && avisos === 'default' && (
          <button className="btn btn-block" onClick={ativarAvisos}>⚐︎ Ativar avisos de ritmo neste aparelho</button>
        )}
        {ehVendedor && avisos === 'granted' && (
          <p className="mini centro">⚐︎ Avisos de ritmo ativados neste aparelho (8h, 11h, 15h e 18h, com o app aberto).</p>
        )}
        <button className="btn btn-block" onClick={() => setTrocandoSenha(true)}>✱ Trocar minha senha</button>
        <button className="btn btn-danger btn-block" onClick={sair}>Sair da conta</button>
      </div>

      <div className="assinatura">
        <div className="logo-npb" role="img" aria-label="NewPay Bank" />
        <span className="mini">CRM de vendas externas</span>
      </div>

      {trocandoSenha && <TrocarSenha onFechar={() => setTrocandoSenha(false)} />}
    </div>
  );
}
