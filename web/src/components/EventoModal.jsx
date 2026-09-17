import { useEffect, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { dateKey, pad } from '../lib/date.js';
import { Modal } from './ui.jsx';

const horaLocal = (iso) => `${pad(new Date(iso).getHours())}:${pad(new Date(iso).getMinutes())}`;
const duracaoMin = (ini, fim) => Math.max(15, Math.round((new Date(fim) - new Date(ini)) / 60000));

/**
 * Criação e edição de compromisso. O gestor ganha os campos de agenda
 * corporativa (público-alvo e confirmação de presença obrigatória).
 */
export default function EventoModal({ evento, dataPadrao, onFechar, onSalvo }) {
  const { meta, ehGestor, toast } = useApp();
  const editando = Boolean(evento?.id);

  const [form, setForm] = useState(() => ({
    title: evento?.title ?? '',
    type: evento?.type ?? 'visita',
    data: evento?.start ? dateKey(evento.start) : dataPadrao ?? dateKey(),
    hora: evento?.start ? horaLocal(evento.start) : '09:00',
    duracao: evento?.start && evento?.end ? duracaoMin(evento.start, evento.end) : 60,
    location: evento?.location ?? '',
    notes: evento?.notes ?? '',
    clientId: evento?.clientId ?? '',
    scope: evento?.scope ?? 'pessoal',
    audience: evento?.audience ?? 'todos',
    audienceIds: evento?.audienceIds ?? [],
    requiresConfirmation: evento?.requiresConfirmation ?? true,
  }));
  const [clientes, setClientes] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    endpoints.clientes().then(setClientes).catch(() => setClientes([]));
    if (ehGestor) endpoints.equipe().then((t) => setEquipe(t.filter((u) => u.role === 'vendedor'))).catch(() => {});
  }, [ehGestor]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast('Informe o título do compromisso.', 'erro');

    const inicio = new Date(`${form.data}T${form.hora}:00`);
    const payload = {
      title: form.title,
      type: form.type,
      start: inicio.toISOString(),
      end: new Date(inicio.getTime() + Number(form.duracao) * 60000).toISOString(),
      location: form.location,
      notes: form.notes,
      clientId: form.clientId || null,
    };

    if (ehGestor && form.scope === 'corporativo') {
      Object.assign(payload, {
        scope: 'corporativo',
        audience: form.audience,
        audienceIds: form.audienceIds,
        requiresConfirmation: form.requiresConfirmation,
      });
    }

    setSalvando(true);
    try {
      const salvo = editando
        ? await endpoints.atualizarEvento(evento.id, payload)
        : await endpoints.criarEvento(payload);
      toast(editando ? 'Compromisso atualizado.' : 'Compromisso criado na agenda.');
      onSalvo?.(salvo);
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!window.confirm('Excluir este compromisso da agenda?')) return;
    try {
      await endpoints.excluirEvento(evento.id);
      toast('Compromisso excluído.');
      onSalvo?.(null);
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    }
  };

  const tipos = Object.entries(meta?.eventTypes ?? {});

  return (
    <Modal
      titulo={editando ? 'Editar compromisso' : 'Novo compromisso'}
      subtitulo={form.scope === 'corporativo' ? 'Agenda corporativa — vale para a equipe' : 'Agenda pessoal'}
      onFechar={onFechar}
      rodape={
        <>
          {editando && (
            <button type="button" className="btn btn-danger" onClick={excluir} style={{ flex: '0 0 auto' }}>
              Excluir
            </button>
          )}
          <button type="button" className="btn" onClick={onFechar}>Cancelar</button>
          <button type="submit" form="form-evento" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-evento" onSubmit={salvar} className="coluna" style={{ gap: 14 }}>
        <div className="campo">
          <label htmlFor="ev-titulo">Título</label>
          <input
            id="ev-titulo"
            className="input"
            value={form.title}
            onChange={set('title')}
            placeholder="Ex.: Visita Mercado Central"
            autoFocus
          />
        </div>

        <div className="campo">
          <label>Tipo de compromisso</label>
          <div className="opcoes">
            {tipos.map(([chave, info]) => (
              <button
                type="button"
                key={chave}
                className={`opcao${form.type === chave ? ' ativa' : ''}`}
                style={
                  form.type === chave
                    ? { background: info.color, borderColor: info.color, color: '#fff' }
                    : { borderLeft: `4px solid ${info.color}` }
                }
                onClick={() => setForm((f) => ({ ...f, type: chave }))}
              >
                {info.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-linha duas">
          <div className="campo">
            <label htmlFor="ev-data">Data</label>
            <input id="ev-data" type="date" className="input" value={form.data} onChange={set('data')} />
          </div>
          <div className="form-linha duas">
            <div className="campo">
              <label htmlFor="ev-hora">Hora</label>
              <input id="ev-hora" type="time" className="input" value={form.hora} onChange={set('hora')} />
            </div>
            <div className="campo">
              <label htmlFor="ev-dur">Duração</label>
              <select id="ev-dur" className="select" value={form.duracao} onChange={set('duracao')}>
                <option value={30}>30 min</option>
                <option value={60}>1 hora</option>
                <option value={90}>1h30</option>
                <option value={120}>2 horas</option>
                <option value={240}>4 horas</option>
                <option value={480}>Dia inteiro</option>
              </select>
            </div>
          </div>
        </div>

        {form.scope !== 'corporativo' && (
          <div className="campo">
            <label htmlFor="ev-cliente">Cliente (opcional)</label>
            <select id="ev-cliente" className="select" value={form.clientId} onChange={set('clientId')}>
              <option value="">Sem cliente vinculado</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.company}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="campo">
          <label htmlFor="ev-local">Local</label>
          <input
            id="ev-local"
            className="input"
            value={form.location}
            onChange={set('location')}
            placeholder="Ex.: Mercado Central — Iguatu"
          />
        </div>

        <div className="campo">
          <label htmlFor="ev-obs">Observações</label>
          <textarea id="ev-obs" className="textarea" value={form.notes} onChange={set('notes')} />
        </div>

        {ehGestor && !editando && (
          <div className="card card-pad coluna" style={{ background: 'var(--surface-2)' }}>
            <div className="entre">
              <div>
                <p className="forte">Agenda corporativa</p>
                <p className="mini">Cria o compromisso para a equipe inteira.</p>
              </div>
              <input
                type="checkbox"
                checked={form.scope === 'corporativo'}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.checked ? 'corporativo' : 'pessoal' }))}
                style={{ width: 20, height: 20 }}
              />
            </div>

            {form.scope === 'corporativo' && (
              <>
                <div className="opcoes">
                  <button
                    type="button"
                    className={`opcao${form.audience === 'todos' ? ' ativa' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, audience: 'todos' }))}
                  >
                    Todos os vendedores
                  </button>
                  <button
                    type="button"
                    className={`opcao${form.audience === 'selecionados' ? ' ativa' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, audience: 'selecionados' }))}
                  >
                    Selecionar quem participa
                  </button>
                </div>

                {form.audience === 'selecionados' && (
                  <div className="opcoes">
                    {equipe.map((v) => (
                      <button
                        type="button"
                        key={v.id}
                        className={`opcao${form.audienceIds.includes(v.id) ? ' ativa' : ''}`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            audienceIds: f.audienceIds.includes(v.id)
                              ? f.audienceIds.filter((x) => x !== v.id)
                              : [...f.audienceIds, v.id],
                          }))
                        }
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}

                <label className="linha" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.requiresConfirmation}
                    onChange={(e) => setForm((f) => ({ ...f, requiresConfirmation: e.target.checked }))}
                    style={{ width: 18, height: 18 }}
                  />
                  <span className="menor">Exigir confirmação de presença</span>
                </label>
              </>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
