import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { addDays, dateKey, diaExtenso } from '../lib/date.js';
import { Modal } from './ui.jsx';

const PRESETS = [
  { chave: 'amanha', rotulo: 'Amanhã', dias: 1 },
  { chave: '3dias', rotulo: 'Em 3 dias', dias: 3 },
  { chave: '7dias', rotulo: 'Em 7 dias', dias: 7 },
  { chave: 'custom', rotulo: 'Data personalizada', dias: null },
];

/** Botão "📅 Agendar Retorno" da oportunidade: cria o compromisso na agenda. */
export default function AgendarRetorno({ cliente, onFechar, onAgendado }) {
  const { toast, recarregarNotificacoes } = useApp();
  const [preset, setPreset] = useState('3dias');
  const [dataCustom, setDataCustom] = useState(dateKey(addDays(new Date(), 2)));
  const [hora, setHora] = useState('09:00');
  const [tipo, setTipo] = useState('followup');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);

  const escolhido = PRESETS.find((p) => p.chave === preset);
  const previsto =
    preset === 'custom' ? new Date(`${dataCustom}T${hora}`) : addDays(new Date(), escolhido.dias);

  const agendar = async () => {
    setSalvando(true);
    try {
      const corpo =
        preset === 'custom'
          ? { date: new Date(`${dataCustom}T${hora}:00`).toISOString(), type: tipo, notes }
          : { preset, hour: Number(hora.split(':')[0]), minute: Number(hora.split(':')[1]), type: tipo, notes };

      const evento = await endpoints.agendarRetorno(cliente.id, corpo);
      toast(`Retorno agendado para ${diaExtenso(evento.start)}.`);
      recarregarNotificacoes();
      onAgendado?.(evento);
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="📅 Agendar retorno"
      subtitulo={`${cliente.name} — ${cliente.company}`}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={agendar} disabled={salvando}>
            {salvando ? 'Agendando...' : 'Agendar na agenda'}
          </button>
        </>
      }
    >
      <div className="campo">
        <label>Quando retornar</label>
        <div className="opcoes">
          {PRESETS.map((p) => (
            <button
              key={p.chave}
              className={`opcao${preset === p.chave ? ' ativa' : ''}`}
              onClick={() => setPreset(p.chave)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="form-linha duas">
        {preset === 'custom' && (
          <div className="campo">
            <label htmlFor="ar-data">Data</label>
            <input
              id="ar-data"
              type="date"
              className="input"
              value={dataCustom}
              min={dateKey()}
              onChange={(e) => setDataCustom(e.target.value)}
            />
          </div>
        )}
        <div className="campo">
          <label htmlFor="ar-hora">Horário</label>
          <input id="ar-hora" type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
      </div>

      <div className="campo">
        <label>Tipo de retorno</label>
        <div className="opcoes">
          <button className={`opcao${tipo === 'followup' ? ' ativa' : ''}`} onClick={() => setTipo('followup')}>
            🟡 Follow-up por telefone
          </button>
          <button className={`opcao${tipo === 'visita' ? ' ativa' : ''}`} onClick={() => setTipo('visita')}>
            🔵 Visita presencial
          </button>
        </div>
      </div>

      <div className="campo">
        <label htmlFor="ar-obs">O que combinar no retorno</label>
        <textarea
          id="ar-obs"
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: levar simulação de taxa para 3 maquininhas"
        />
      </div>

      <p className="mini">
        Será criado um compromisso em <b style={{ textTransform: 'capitalize' }}>{diaExtenso(previsto)}</b>, às {hora}.
      </p>
    </Modal>
  );
}
