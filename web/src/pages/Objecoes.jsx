// Central de Objeções: resposta pronta, com os números do cliente já na frase.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Carregando } from '../components/ui.jsx';

export default function Objecoes() {
  const [params, setParams] = useSearchParams();
  const { toast } = useApp();
  const clientId = params.get('clientId') ?? '';

  const [aberta, setAberta] = useState(null);
  const { dados, carregando } = useRecurso(() => endpoints.objecoes(clientId || undefined), [clientId]);
  const { dados: clientes } = useRecurso(() => endpoints.clientes({ ordem: 'score' }), []);

  if (carregando || !dados) return <div className="page"><Carregando linhas={5} /></div>;

  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast('Resposta copiada. Cole no WhatsApp do cliente.');
    } catch {
      toast('Não foi possível copiar automaticamente.', 'erro');
    }
  };

  return (
    <div className="page">
      <div>
        <h1>Central de objeções</h1>
        <p className="mini">Escolha o cliente para o CRM colocar os números dele na resposta.</p>
      </div>

      <div className="card card-pad coluna">
        <div className="campo">
          <label htmlFor="ob-cliente">Cliente</label>
          <select
            id="ob-cliente"
            className="select"
            value={clientId}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              if (e.target.value) p.set('clientId', e.target.value);
              else p.delete('clientId');
              setParams(p, { replace: true });
            }}
          >
            <option value="">Resposta genérica (sem cliente)</option>
            {(clientes ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.company} — {c.city}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Em telas largas as objeções se distribuem em colunas */}
      <div className="grid-auto-larga">
      {dados.itens.map((o) => (
        <div key={o.id} className={`card objecao${aberta === o.id ? ' aberta' : ''}`}>
          <button
            className="card-header"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => setAberta(aberta === o.id ? null : o.id)}
          >
            <div className="crescer">
              <h2>“{o.objecao}”</h2>
              <p className="mini">{o.quando}</p>
            </div>
            <span className="btn btn-ghost btn-sm">{aberta === o.id ? '−' : '+'}</span>
          </button>

          {aberta === o.id && (
            <div className="card-pad coluna">
              <div className="objecao-resposta">{o.resposta}</div>
              <div className="linha" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => copiar(o.resposta)}>▤ Copiar resposta</button>
                {dados.cliente && (
                  <a
                    className="btn btn-sm"
                    href={`https://wa.me/?text=${encodeURIComponent(o.resposta)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ✉︎ Enviar no WhatsApp
                  </a>
                )}
              </div>
              <div>
                <span className="selo">Como conduzir</span>
                <ul className="objecao-dicas" style={{ marginTop: 6 }}>
                  {o.dicas.map((d) => (
                    <li key={d}><span>•</span> {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
