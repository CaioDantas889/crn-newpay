// Venda e proposta fora da visita: quando o cliente é movido para "Fechado"
// no funil, quando a proposta aberta fecha pela ficha, e para completar
// modelo e número de série de uma venda já registrada.
//
// modo: 'venda'    → cliente fechou (converte a proposta aberta, se houver)
//       'proposta' → enviar proposta
//       'editar'   → máquinas, tabela, modelo e séries de um negócio existente

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { Modal } from './ui.jsx';
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
  series: n.series ?? [],
});

export default function RegistrarVenda({ cliente, negocio = null, modo = 'venda', onFechar, onSalvo }) {
  const { toast, recarregarNotificacoes, recarregarPlacar } = useApp();
  const [venda, setVenda] = useState(negocio ? deNegocio(negocio) : VENDA_VAZIA);
  const [notes, setNotes] = useState(negocio?.notes ?? '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (modo !== 'proposta') {
      const falta = faltaNaVenda(venda);
      if (falta) return toast(falta, 'erro');
    }
    setSalvando(true);
    try {
      const corpo = { ...venda, series: (venda.series ?? []).filter((s) => String(s).trim()), notes };
      let salvo;
      if (modo === 'proposta') {
        salvo = await endpoints.criarNegocio({ clientId: cliente.id, status: 'proposta', ...corpo });
        toast('Proposta registrada. Quando o cliente fechar, é ela que vira a venda.');
      } else if (modo === 'editar') {
        salvo = await endpoints.atualizarNegocio(negocio.id, corpo);
        toast(salvo.faltamSeries > 0 ? `Salvo. Ainda falta ${salvo.faltamSeries} número(s) de série.` : 'Dados da máquina salvos.');
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
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-brand" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : modo === 'proposta' ? 'Registrar proposta' : modo === 'editar' ? 'Salvar' : '★ Registrar venda'}
          </button>
        </>
      }
    >
      {modo === 'venda' && !negocio && (
        <p className="mini">
          Se este cliente tem proposta aberta, é ela que vira a venda — não nasce outro registro.
        </p>
      )}
      <VendaCampos
        venda={venda}
        onChange={setVenda}
        clienteId={modo === 'venda' && !negocio ? cliente.id : undefined}
        titulo={modo === 'proposta' ? 'Dados da proposta' : 'Dados da venda'}
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
