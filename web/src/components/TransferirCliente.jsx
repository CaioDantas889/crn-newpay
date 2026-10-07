// Passa um cliente para outra carteira (só a gestão). Vai junto o que ainda
// está por fazer; o histórico e quem cadastrou o lead ficam como estão.

import { useEffect, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { Modal } from './ui.jsx';

export default function TransferirCliente({ cliente, onFechar, onTransferido }) {
  const { user, toast } = useApp();
  const [equipe, setEquipe] = useState([]);
  const [destino, setDestino] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    endpoints
      .equipe()
      .then((lista) => setEquipe(lista.filter((u) => u.role !== 'onboarding' && u.id !== cliente.ownerId)))
      .catch(() => setEquipe([]));
  }, [cliente.ownerId]);

  const salvar = async () => {
    if (!destino) return toast('Escolha para quem vai o cliente.', 'erro');
    setSalvando(true);
    try {
      const resposta = await endpoints.transferirCliente(cliente.id, destino);
      const nome = equipe.find((u) => u.id === destino)?.name ?? 'outra carteira';
      const t = resposta.transferidos ?? {};
      const foramJunto = [
        t.followups > 0 && `${t.followups} follow-up(s)`,
        t.compromissos > 0 && `${t.compromissos} compromisso(s)`,
        t.tarefas > 0 && `${t.tarefas} tarefa(s)`,
      ].filter(Boolean);
      toast(
        `${cliente.company} agora é de ${nome}.${foramJunto.length ? ` Foram junto: ${foramJunto.join(', ')}.` : ''}`
      );
      onTransferido?.(resposta);
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Transferir cliente"
      subtitulo={`${cliente.company} · hoje com ${cliente.owner?.name ?? 'ninguém'}`}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || !destino}>
            {salvando ? 'Transferindo...' : 'Transferir'}
          </button>
        </>
      }
    >
      <div className="campo">
        <label htmlFor="tc-destino">Nova carteira</label>
        <select id="tc-destino" className="select" value={destino} onChange={(e) => setDestino(e.target.value)} autoFocus>
          <option value="">Escolha o vendedor</option>
          {equipe.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}{u.id === user.id ? ' (eu)' : ''}{u.city ? ` — ${u.city}` : ''}
            </option>
          ))}
        </select>
      </div>
      <p className="mini">
        Vão junto os follow-ups pendentes, as visitas agendadas e as tarefas abertas deste cliente.
        O histórico de visitas e quem cadastrou o lead não mudam.
      </p>
    </Modal>
  );
}
