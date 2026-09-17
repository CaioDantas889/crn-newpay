import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { dateKey, diaMes, hora, isToday } from '../lib/date.js';
import { Carregando, Vazio } from '../components/ui.jsx';

const KINDS = [
  { chave: 'tarefa', rotulo: '☑️ Tarefa' },
  { chave: 'lembrete', rotulo: '⏰ Lembrete' },
  { chave: 'meta', rotulo: '🎯 Meta diária' },
  { chave: 'compromisso', rotulo: '📌 Compromisso' },
];

export default function Tarefas() {
  const { toast, recarregarNotificacoes } = useApp();
  const { dados: tarefas, carregando, recarregar } = useRecurso(() => endpoints.tarefas(), []);

  const [titulo, setTitulo] = useState('');
  const [kind, setKind] = useState('tarefa');
  const [data, setData] = useState(dateKey());
  const [horario, setHorario] = useState('09:00');

  const criar = async (e) => {
    e.preventDefault();
    if (!titulo.trim()) return toast('Descreva a tarefa.', 'erro');
    await endpoints.criarTarefa({
      title: titulo,
      kind,
      dueAt: new Date(`${data}T${horario}:00`).toISOString(),
    });
    setTitulo('');
    toast('Tarefa criada.');
    recarregar();
  };

  const alternar = async (t) => {
    await endpoints.atualizarTarefa(t.id, { done: !t.done });
    recarregar();
    recarregarNotificacoes();
  };

  const excluir = async (t) => {
    await endpoints.excluirTarefa(t.id);
    toast('Tarefa removida.');
    recarregar();
  };

  const agora = new Date();
  const lista = tarefas ?? [];
  const grupos = [
    { titulo: 'Atrasadas', itens: lista.filter((t) => !t.done && t.dueAt && new Date(t.dueAt) < agora && !isToday(t.dueAt)), cor: 'var(--red)' },
    { titulo: 'Hoje', itens: lista.filter((t) => !t.done && t.dueAt && isToday(t.dueAt)), cor: 'var(--brand-strong)' },
    { titulo: 'Próximos dias', itens: lista.filter((t) => !t.done && t.dueAt && new Date(t.dueAt) > agora && !isToday(t.dueAt)), cor: 'var(--blue)' },
    { titulo: 'Concluídas', itens: lista.filter((t) => t.done), cor: 'var(--text-3)' },
  ];

  return (
    <div className="page">
      <div className="card card-pad">
        <form onSubmit={criar} className="coluna">
          <div className="campo">
            <label htmlFor="t-titulo">Nova tarefa ou lembrete</label>
            <input
              id="t-titulo"
              className="input"
              placeholder="Ex.: Retornar José às 15h"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="opcoes">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k.chave}
                className={`opcao${kind === k.chave ? ' ativa' : ''}`}
                onClick={() => setKind(k.chave)}
              >
                {k.rotulo}
              </button>
            ))}
          </div>
          <div className="form-linha duas">
            <div className="campo">
              <label htmlFor="t-data">Data</label>
              <input id="t-data" type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="t-hora">Horário</label>
              <input id="t-hora" type="time" className="input" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-block">Adicionar</button>
        </form>
      </div>

      {carregando ? (
        <Carregando linhas={5} />
      ) : lista.length === 0 ? (
        <div className="card"><Vazio emoji="📝" titulo="Nenhuma tarefa" texto="Crie o primeiro lembrete acima." /></div>
      ) : (
        <div className="grid-auto">
        {grupos
          .filter((g) => g.itens.length > 0)
          .map((g) => (
            <div key={g.titulo} className="card">
              <div className="card-header">
                <h2 style={{ color: g.cor }}>{g.titulo}</h2>
                <span className="card-sub">{g.itens.length}</span>
              </div>
              {g.itens.map((t) => (
                <div
                  key={t.id}
                  className={`tarefa${t.done ? ' feita' : ''}${!t.done && t.dueAt && new Date(t.dueAt) < agora ? ' atrasada' : ''}`}
                >
                  <button className="marcar" onClick={() => alternar(t)} aria-label="Concluir">✓</button>
                  <div className="crescer">
                    <div className="texto">{t.title}</div>
                    <div className="mini prazo">
                      {KINDS.find((k) => k.chave === t.kind)?.rotulo ?? t.kind}
                      {t.dueAt && ` · ${diaMes(t.dueAt)} às ${hora(t.dueAt)}`}
                      {t.client && ` · ${t.client.company}`}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => excluir(t)} aria-label="Excluir">🗑️</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
