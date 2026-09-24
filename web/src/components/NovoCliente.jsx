// Cadastro rápido em campo: só o essencial, com GPS do ponto de venda.
// O diagnóstico é o passo seguinte.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { mascaraDocumento, mascaraTelefone, validarDocumento, validarTelefone } from '../lib/mascaras.js';
import { Modal } from './ui.jsx';

export default function NovoCliente({ onFechar, onCriado }) {
  const { meta, user, toast } = useApp();
  const [form, setForm] = useState({
    company: '', name: '', segment: 'mercadinho', phone: '', whatsapp: '',
    cnpj: '', city: user.city, address: '',
  });
  const [local, setLocal] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Campos com formato fixo: o texto já sai formatado enquanto digita
  const setMascarado = (campo, mascara) => (e) =>
    setForm((f) => ({ ...f, [campo]: mascara(e.target.value) }));

  const erroDocumento = validarDocumento(form.cnpj);
  const erroTelefone = validarTelefone(form.phone);

  const capturarLocal = () => {
    if (!navigator.geolocation) return toast('Este aparelho não informa a localização.', 'erro');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast('Localização do ponto de venda capturada.');
      },
      () => toast('Não foi possível obter a localização.', 'erro'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const salvar = async () => {
    if (!form.company.trim() && !form.name.trim()) {
      return toast('Informe ao menos o nome do estabelecimento.', 'erro');
    }
    setSalvando(true);
    try {
      const cliente = await endpoints.criarCliente({ ...form, ...(local ?? {}) });
      toast('Cliente cadastrado. Agora preencha o diagnóstico.');
      onCriado?.(cliente);
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Novo cliente"
      subtitulo="Cadastro rápido — o diagnóstico vem em seguida"
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </>
      }
    >
      <div className="campo">
        <label htmlFor="nc-empresa">Estabelecimento</label>
        <input
          id="nc-empresa" className="input" autoFocus value={form.company}
          onChange={set('company')} placeholder="Ex.: Mercadinho São João"
        />
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="nc-nome">Responsável</label>
          <input id="nc-nome" className="input" value={form.name} onChange={set('name')} placeholder="Ex.: João Batista" />
        </div>
        <div className="campo">
          <label htmlFor="nc-seg">Segmento</label>
          <select id="nc-seg" className="select" value={form.segment} onChange={set('segment')}>
            {Object.entries(meta?.segmentos ?? {}).map(([chave, label]) => (
              <option key={chave} value={chave}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="nc-tel">Telefone</label>
          <input id="nc-tel" className="input" inputMode="tel" value={form.phone} onChange={setMascarado('phone', mascaraTelefone)} placeholder="(88) 99999-0000" />
          {erroTelefone && <span className="mini erro-campo">{erroTelefone}</span>}
        </div>
        <div className="campo">
          <label htmlFor="nc-wpp">WhatsApp</label>
          <input id="nc-wpp" className="input" inputMode="tel" value={form.whatsapp} onChange={setMascarado('whatsapp', mascaraTelefone)} placeholder="(88) 99999-0000" />
        </div>
      </div>

      <div className="form-linha duas">
        <div className="campo">
        
        
          <label htmlFor="nc-cnpj">CNPJ ou CPF (opcional)</label>
          <input
            id="nc-cnpj"
            className="input"
            inputMode="numeric"
            value={form.cnpj}
            onChange={setMascarado('cnpj', mascaraDocumento)}
            placeholder="CNPJ ou CPF"
          />
          {erroDocumento && <span className="mini erro-campo">{erroDocumento}</span>}
        </div>
        <div className="campo">
          <label htmlFor="nc-cidade">Cidade</label>
          <input id="nc-cidade" className="input" value={form.city} onChange={set('city')} />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="nc-end">Endereço</label>
        <input id="nc-end" className="input" value={form.address} onChange={set('address')} placeholder="Rua, número — bairro" />
      </div>

      <button className="btn btn-block" onClick={capturarLocal}>
        {local ? '⌖ Localização capturada' : '⌖ Usar minha localização atual'}
      </button>
      <p className="mini">
        Com a localização o cliente aparece no mapa e entra no cálculo das rotas.
      </p>
    </Modal>
  );
}
  

