// Venda e proposta fora da visita: quando o cliente é movido para "Fechado"
// no funil, quando a proposta aberta fecha pela ficha, e para corrigir
// quantidade, tabela ou modelo de uma venda já registrada.
//
// modo: 'venda'    → cliente fechou (converte a proposta aberta, se houver)
//       'proposta' → enviar proposta
//       'editar'   → máquinas, tabela e modelo de um negócio existente

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { CancelarModal, Modal } from './ui.jsx';
import { VENDA_VAZIA, VendaCampos, faltaNaVenda } from './lead.jsx';

const TITULOS = {
  venda: 'Registrar venda',
  proposta: 'Registrar proposta',
  editar: 'Dados da máquina',
};

const deNegocio = (n) => ({
  maquinas: n.maquinas || 1,
  taxaOfertada: n.taxaOfertada ?? '',
  modelo: n.modelo ?? '',
});

/**
 * `aviso`: por que o formulário abriu (ex.: o cartão foi levado para "Fechado"
 * no Pipeline) — aparece no topo para o vendedor entender o que está sendo pedido.
 */
export default function RegistrarVenda({ cliente, negocio = null, modo = 'venda', aviso, onFechar, onSalvo }) {
  const { toast, recarregarNotificacoes, recarregarPlacar } = useApp();
  const [venda, setVenda] = useState(negocio ? deNegocio(negocio) : VENDA_VAZIA);
  const [notes, setNotes] = useState(negocio?.notes ?? '');
  const [salvando, setSalvando] = useState(false);
  // Escolha feita pelo vendedor (os dados que vêm prontos da proposta não contam)
  const [tocou, setTocou] = useState(false);
  const mudarVenda = (valor) => {
    if (typeof valor !== 'function') setTocou(true);
    setVenda(valor);
  };

  const salvar = async () => {
    if (modo !== 'proposta') {
      const falta = faltaNaVenda(venda);
      if (falta) return toast(falta, 'erro');
    }
    setSalvando(true);
    try {
      const corpo = { ...venda, notes };
      let salvo;
      if (modo === 'proposta') {
        salvo = await endpoints.criarNegocio({ clientId: cliente.id, status: 'proposta', ...corpo });
        toast('Proposta registrada. Quando o cliente fechar, é ela que vira a venda.');
      } else if (modo === 'editar') {
        salvo = await endpoints.atualizarNegocio(negocio.id, corpo);
        toast('Dados da máquina salvos.');
      } else if (negocio) {
        salvo = await endpoints.atualizarNegocio(negocio.id, { ...corpo, status: 'fechado' });
        toast(`Venda registrada! ${salvo.maquinas} máquina(s). Agora é ativar.`);
      } else {
        salvo = await endpoints.criarNegocio({ clientId: cliente.id, status: 'fechado', ...corpo });
        toast(`Venda registrada! ${salvo.maquinas} máquina(s). Agora é ativar.`);
      }
      recarregarNotificacoes();
      recarregarPlacar();
      onSalvo?.(salvo);
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={TITULOS[modo] ?? TITULOS.venda}
      subtitulo={`${cliente.company}${cliente.city ? ` — ${cliente.city}` : ''}`}
      onFechar={onFechar}
      ocupado={salvando}
      sujo={tocou}
      rodape={
        <>
          <CancelarModal />
          <button className="btn btn-brand" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : modo === 'proposta' ? 'Registrar proposta' : modo === 'editar' ? 'Salvar' : '★ Registrar venda'}
          </button>
        </>
      }
    >
      {aviso && <p className="card card-pad aviso-venda">{aviso}</p>}
      {modo === 'venda' && !negocio && (
        <p className="mini">
          Se este cliente tem proposta aberta, é ela que vira a venda — não nasce outro registro.
        </p>
      )}
      <VendaCampos
        venda={venda}
        onChange={mudarVenda}
        clienteId={modo === 'venda' && !negocio ? cliente.id : undefined}
        titulo={modo === 'proposta' ? 'Dados da proposta' : 'Dados da venda'}
        proposta={modo === 'proposta'}
      />
      <div className="campo">
        <label htmlFor="rv-notes">Observação</label>
        <textarea
          id="rv-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={modo === 'proposta' ? 'Ex.: quer comparar com a Stone antes de decidir.' : 'Ex.: máquina entregue na hora, contrato assinado.'}
        />
      </div>
    </Modal>
  );
}
