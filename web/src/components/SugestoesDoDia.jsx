// "Quem visitar" na agenda do dia: a carteira ordenada por quem está mais
// pedindo visita, com o motivo do lado e um toque para cair na agenda.
//
// Nasceu para resolver a folha em branco — o vendedor abria o dia vazio e
// tinha que lembrar de cabeça quem procurar. Quem já está marcado no dia não
// aparece aqui, senão a sugestão vira eco da própria agenda.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Carregando, Vazio } from './ui.jsx';

export default function SugestoesDoDia({ data, hoje, passado, onAgendar }) {
  const { toast } = useApp();
  const { dados, carregando, recarregar } = useRecurso(
    () => (passado ? Promise.resolve(null) : endpoints.sugestoesDoDia(data)),
    [data, passado]
  );
  const [agendando, setAgendando] = useState(null);

  // Dia que já passou não se preenche: a tela vira histórico.
  if (passado) return null;

  const sugestoes = dados?.sugestoes ?? [];

  const agendar = async (cliente) => {
    setAgendando(cliente.id);
    try {
      await onAgendar(cliente);
      recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setAgendando(null);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="crescer">
          <h2>Quem visitar {hoje ? 'hoje' : 'neste dia'}</h2>
          <p className="mini">
            {dados?.naAgenda
              ? `${dados.naAgenda} cliente(s) já na agenda deste dia`
              : 'Ordenado por quem está mais pedindo visita'}
          </p>
        </div>
      </div>

      {carregando ? (
        <Carregando linhas={3} />
      ) : sugestoes.length === 0 ? (
        <Vazio
          emoji="✅"
          titulo="Carteira em dia"
          texto="Ninguém esperando visita além do que já está marcado."
        />
      ) : (
        sugestoes.map((c) => (
          <div key={c.id} className="sugestao">
            <span className={`score-bola ${c.temperature}`}>{c.score}</span>

            <div className="crescer">
              <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
              <span className="mini">
                {c.segmentoLabel} · {c.city}
              </span>
              <div className="motivos">
                {c.motivos.slice(0, 3).map((m) => (
                  <span key={m} className="motivo">{m}</span>
                ))}
              </div>
            </div>

            <button
              className="btn btn-sm btn-brand"
              disabled={agendando === c.id}
              onClick={() => agendar(c)}
            >
              {agendando === c.id ? '...' : '📅 Agendar'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
