import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { relativo } from '../lib/date.js';
import { Vazio } from './ui.jsx';

const ICONES = {
  reuniao_proxima: '■︎',
  visita_proxima: '→',
  followup_vencido: '↻',
  cliente_sem_retorno: '◷',
  meta_diaria: '⊙',
  nova_campanha: '⚑︎',
  aviso_nao_lido: '⚑︎',
  confirmacao_pendente: '✓',
  equipe_sem_agenda: '⚠︎',
  aviso_sem_leitura: '◉',
};

export default function NotificacoesPainel({ onFechar }) {
  const { notificacoes, recarregarNotificacoes } = useApp();
  const navigate = useNavigate();

  const abrir = async (n) => {
    await endpoints.marcarNotificacaoLida(n.id);
    recarregarNotificacoes();
    onFechar();
    if (n.link) navigate(n.link);
  };

  const dispensar = async (e, n) => {
    e.stopPropagation();
    await endpoints.dispensarNotificacao(n.id);
    recarregarNotificacoes();
  };

  const lerTodas = async () => {
    await endpoints.lerTodasNotificacoes();
    recarregarNotificacoes();
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 65 }}
        onClick={onFechar}
        aria-hidden="true"
      />
      <div className="notif-painel">
        <div className="card-header">
          <div className="crescer">
            <h3>Central de notificações</h3>
            <p className="mini">
              {notificacoes.naoLidas} não lida(s) · {notificacoes.criticas} urgente(s)
            </p>
          </div>
          {notificacoes.itens.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={lerTodas}>
              Marcar todas
            </button>
          )}
        </div>

        <div className="notif-lista">
          {notificacoes.itens.length === 0 ? (
            <Vazio emoji="✓" titulo="Nada pendente" texto="Sua rotina está em dia." />
          ) : (
            notificacoes.itens.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.severity}${n.read ? '' : ' nova'}`}
                onClick={() => abrir(n)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && abrir(n)}
              >
                <div className="icone">{ICONES[n.kind] ?? '⚐︎'}</div>
                <div className="crescer">
                  <h4>{n.title}</h4>
                  <p>{n.message}</p>
                  {n.at && <p className="mini" style={{ marginTop: 3 }}>{relativo(n.at)}</p>}
                </div>
                <button className="fechar" onClick={(e) => dispensar(e, n)} aria-label="Dispensar">
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
