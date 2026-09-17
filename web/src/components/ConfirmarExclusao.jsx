// Diálogo único de confirmação para tudo que apaga dado no CRM.
// Mostra o que será removido junto, porque exclusão aqui não tem desfazer.

import { useState } from 'react';
import { useApp } from '../state/app.jsx';
import { Modal } from './ui.jsx';

export default function ConfirmarExclusao({
  titulo = 'Confirmar exclusão',
  alvo,
  descricao,
  itens = [],
  textoBotao = 'Excluir',
  onConfirmar,
  onFechar,
}) {
  const { toast } = useApp();
  const [excluindo, setExcluindo] = useState(false);

  const confirmar = async () => {
    setExcluindo(true);
    try {
      await onConfirmar();
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
      setExcluindo(false);
    }
  };

  return (
    <Modal
      titulo={titulo}
      subtitulo={alvo}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar} disabled={excluindo}>Cancelar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={excluindo}>
            {excluindo ? 'Excluindo...' : textoBotao}
          </button>
        </>
      }
    >
      <div className="aviso-exclusao">
        <span className="emoji">⚠️</span>
        <div>
          <b>Esta ação não pode ser desfeita.</b>
          {descricao && <p className="menor" style={{ marginTop: 4 }}>{descricao}</p>}
        </div>
      </div>

      {itens.length > 0 && (
        <div className="campo">
          <span className="selo">Também será removido</span>
          <ul className="lista-remocao">
            {itens.map((i) => (
              <li key={i}>• {i}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
