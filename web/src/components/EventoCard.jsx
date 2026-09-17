import { Link } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { hora } from '../lib/date.js';

/** Cartão de compromisso usado na agenda do dia. */
export default function EventoCard({ evento, onMudou, onEditar }) {
  const { toast, recarregarNotificacoes, user } = useApp();
  const cor = evento.typeMeta?.color ?? '#334155';

  const mudarStatus = async (status) => {
    try {
      await endpoints.atualizarEvento(evento.id, { status });
      toast(
        status === 'realizado' ? 'Compromisso concluído.' :
        status === 'cancelado' ? 'Compromisso cancelado.' : 'Ausência registrada.'
      );
      onMudou?.();
      recarregarNotificacoes();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const confirmar = async (status) => {
    try {
      await endpoints.confirmarPresenca(evento.id, status);
      toast(status === 'confirmado' ? 'Presença confirmada.' : 'Ausência informada ao gestor.');
      onMudou?.();
      recarregarNotificacoes();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const confirmacao = evento.myConfirmation?.status;
  const precisaConfirmar = evento.requiresConfirmation && evento.scope === 'corporativo';
  const podeConcluir = evento.status === 'agendado' && evento.ownerId === user.id;

  return (
    <div
      className={`evento ${evento.status === 'realizado' ? 'concluido' : ''} ${evento.status === 'cancelado' ? 'cancelado' : ''}`}
      style={{ borderLeftColor: cor }}
    >
      <div className="entre" style={{ alignItems: 'flex-start' }}>
        <div className="crescer">
          <div className="evento-titulo">{evento.title}</div>
          <div className="evento-meta">
            <span
              className="chip-tipo"
              style={{ background: evento.typeMeta?.soft, color: evento.typeMeta?.ink }}
            >
              <i style={{ background: cor }} />
              {evento.typeMeta?.label}
            </span>
            <span>
              {hora(evento.start)} – {hora(evento.end)}
            </span>
            {evento.location && <span>📍 {evento.location}</span>}
            {evento.scope === 'corporativo' && <span className="chip">🏢 Corporativo</span>}
            {evento.status === 'realizado' && <span className="chip chip-ok">Realizado</span>}
            {evento.status === 'cancelado' && <span className="chip chip-erro">Cancelado</span>}
            {evento.status === 'nao_compareceu' && <span className="chip chip-alerta">Não compareceu</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onEditar?.(evento)} aria-label="Editar">
          ✏️
        </button>
      </div>

      {evento.notes && <p className="menor">{evento.notes}</p>}

      {evento.client && (
        <div className="linha mini">
          <Link to={`/carteira/${evento.client.id}`} className="chip">
            🤝 {evento.client.company}
          </Link>
          <a className="chip" href={`tel:${evento.client.phone.replace(/\D/g, '')}`}>
            📞 {evento.client.phone}
          </a>
        </div>
      )}

      {precisaConfirmar && (
        <div className="evento-acoes">
          {confirmacao ? (
            <span className={`chip ${confirmacao === 'confirmado' ? 'chip-ok' : 'chip-erro'}`}>
              {confirmacao === 'confirmado' ? '✅ Presença confirmada' : '✖ Ausência informada'}
            </span>
          ) : (
            <>
              <button className="btn btn-brand btn-sm" onClick={() => confirmar('confirmado')}>
                ✅ Confirmar presença
              </button>
              <button className="btn btn-sm" onClick={() => confirmar('recusado')}>
                Não poderei
              </button>
            </>
          )}
          {evento.confirmations?.length > 0 && (
            <span className="mini">
              {evento.confirmations.filter((c) => c.status === 'confirmado').length} confirmado(s)
            </span>
          )}
        </div>
      )}

      {podeConcluir && (
        <div className="evento-acoes">
          <button className="btn btn-brand btn-sm" onClick={() => mudarStatus('realizado')}>
            ✔ Marcar como realizado
          </button>
          <button className="btn btn-sm" onClick={() => mudarStatus('nao_compareceu')}>
            Cliente ausente
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => mudarStatus('cancelado')}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
