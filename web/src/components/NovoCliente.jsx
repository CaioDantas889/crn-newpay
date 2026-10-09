// Cadastro rápido em campo: só o essencial, com GPS do ponto de venda.
// O diagnóstico é o passo seguinte. A gestão escolhe em qual carteira o
// cliente entra — sem isso ele ficava preso na carteira do gestor, onde
// vendedor nenhum enxerga.

import { useEffect, useRef, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { mascaraDocumento, mascaraTelefone, validarDocumento, validarTelefone } from '../lib/mascaras.js';
import { CancelarModal, Modal } from './ui.jsx';

export default function NovoCliente({ onFechar, onCriado, ownerIdPadrao = '' }) {
  const { meta, user, toast, ehGestor } = useApp();
  const [form, setForm] = useState({
    company: '', name: '', segment: 'mercadinho', phone: '', whatsapp: '',
    cnpj: '', city: user.city, address: '', ownerId: ownerIdPadrao,
  });
  const [equipe, setEquipe] = useState([]);
  const [local, setLocal] = useState(null);
  const [salvando, setSalvando] = useState(false);
  // Reenvio depois de a resposta se perder: o servidor devolve o mesmo cliente
  const chave = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!ehGestor) return;
    endpoints
      .equipe()
      .then((lista) => {
        const vendedores = lista.filter((u) => u.role === 'vendedor');
        setEquipe(vendedores);
        // Veio da carteira de um vendedor: a cidade já começa sendo a dele
        const dono = vendedores.find((v) => v.id === ownerIdPadrao);
        if (dono?.city) setForm((f) => (f.city === user.city ? { ...f, city: dono.city } : f));
      })
      .catch(() => setEquipe([]));
  }, [ehGestor, ownerIdPadrao, user.city]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Escolher o vendedor já puxa a cidade dele, se a cidade ainda era a do gestor
  const escolherVendedor = (e) => {
    const ownerId = e.target.value;
    const dono = equipe.find((v) => v.id === ownerId);
    setForm((f) => ({
      ...f,
      ownerId,
      city: dono?.city && (!f.city || f.city === user.city) ? dono.city : f.city,
    }));
  };

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
      const cliente = await endpoints.criarCliente({
        ...form, chave: chave.current, ownerId: form.ownerId || undefined, ...(local ?? {}),
      });
      const dono = equipe.find((v) => v.id === form.ownerId);
      toast(
        dono
          ? `Cliente cadastrado na carteira de ${dono.name.split(' ')[0]}. Agora preencha o diagnóstico.`
          : 'Cliente cadastrado. Agora preencha o diagnóstico.'
      );
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
      ocupado={salvando}
      rodape={
        <>
          <CancelarModal />
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </>
      }
    >
      {ehGestor && (
        <div className="campo">
          <label htmlFor="nc-dono">Vendedor responsável</label>
          <select id="nc-dono" className="select" value={form.ownerId} onChange={escolherVendedor}>
            <option value="">Minha carteira (gestão)</option>
            {equipe.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.city ? ` — ${v.city}` : ''}</option>
            ))}
          </select>
          <span className="mini">
            O cliente aparece na carteira, no mapa e nas sugestões de visita de quem você escolher.
          </span>
        </div>
      )}

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
  

