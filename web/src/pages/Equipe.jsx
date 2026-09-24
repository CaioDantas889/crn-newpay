// Cadastro da equipe (gestor): admite, edita, inativa e reseta senha.
// É por aqui que a operação entra no ar — sem depender do seed.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { mascaraTelefone } from '../lib/mascaras.js';
import { Avatar, Carregando, Modal, Vazio } from '../components/ui.jsx';
import TrocarSenha from '../components/TrocarSenha.jsx';

const PAPEIS = {
  vendedor: { rotulo: 'Vendedor', cargoPadrao: 'Consultor Externo' },
  gestor: { rotulo: 'Gestor', cargoPadrao: 'Gerente Comercial' },
  diretoria: { rotulo: 'Diretoria', cargoPadrao: 'Diretor Comercial' },
};

const VAZIO = {
  name: '',
  email: '',
  role: 'vendedor',
  jobTitle: '',
  city: '',
  phone: '',
  dailyGoal: 8,
};

export default function Equipe() {
  const { user, toast } = useApp();
  const { dados: equipe, carregando, recarregar } = useRecurso(() => endpoints.usuarios(), []);
  const [editando, setEditando] = useState(null);
  const [senhaGerada, setSenhaGerada] = useState(null);
  const [trocandoPropria, setTrocandoPropria] = useState(false);
  const [removendo, setRemovendo] = useState(null);

  const alternarAtivo = async (pessoa) => {
    try {
      await endpoints.atualizarUsuario(pessoa.id, { active: pessoa.active === false });
      toast(pessoa.active === false ? 'Acesso liberado.' : 'Acesso bloqueado.');
      recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    }
  };

  const resetarSenha = async (pessoa) => {
    try {
      const { senhaProvisoria } = await endpoints.resetarSenha(pessoa.id);
      setSenhaGerada({ pessoa, senha: senhaProvisoria });
      recarregar();
    } catch (erro) {
      toast(erro.message, 'erro');
    }
  };

  const lista = equipe ?? [];
  const ativos = lista.filter((u) => u.active !== false);

  return (
    <div className="page">
      <div className="entre">
        <div>
          <h2>Equipe</h2>
          <p className="mini">
            {ativos.length} com acesso · {ativos.filter((u) => u.role === 'vendedor').length} em campo
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditando({ ...VAZIO })}>
          + Novo integrante
        </button>
      </div>

      {carregando ? (
        <Carregando linhas={4} />
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio emoji="▩" titulo="Ninguém cadastrado" texto="Comece admitindo o primeiro vendedor." />
        </div>
      ) : (
        <div className="grid-auto-larga">
          {lista.map((pessoa) => {
            const inativo = pessoa.active === false;
            return (
              <div key={pessoa.id} className={`card card-pad coluna${inativo ? ' esmaecido' : ''}`}>
                <div className="linha">
                  <Avatar nome={pessoa.name} cor={pessoa.color} />
                  <div className="crescer">
                    <b className="truncar" style={{ display: 'block' }}>{pessoa.name}</b>
                    <span className="mini">{pessoa.jobTitle} · {pessoa.city || 'sem cidade'}</span>
                  </div>
                  <span className={`chip${inativo ? '' : ' chip-ok'}`}>
                    {inativo ? 'sem acesso' : PAPEIS[pessoa.role]?.rotulo ?? pessoa.role}
                  </span>
                </div>

                <div className="mini">
                  {pessoa.email}
                  {pessoa.role === 'vendedor' && ` · meta de ${pessoa.dailyGoal} visitas/dia`}
                  {pessoa.mustChangePassword && ' · senha provisória pendente'}
                </div>

                <div className="detalhe-acoes">
                  <button className="btn btn-sm" onClick={() => setEditando(pessoa)}>Editar</button>
                  {pessoa.id === user.id ? (
                    // Resetar a própria senha derrubaria a sessão no meio do caminho:
                    // para si mesmo, o caminho é trocar sabendo a senha atual.
                    <button className="btn btn-sm" onClick={() => setTrocandoPropria(true)}>
                      Trocar minha senha
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-sm" onClick={() => resetarSenha(pessoa)}>Resetar senha</button>
                      <button className="btn btn-sm" onClick={() => alternarAtivo(pessoa)}>
                        {inativo ? 'Reativar' : 'Inativar'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => setRemovendo(pessoa)}>
                        Remover
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <FormularioUsuario
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvo={(senha, pessoa) => {
            recarregar();
            if (senha) setSenhaGerada({ pessoa, senha });
          }}
        />
      )}

      {trocandoPropria && <TrocarSenha onFechar={() => setTrocandoPropria(false)} />}

      {removendo && (
        <RemoverUsuario
          pessoa={removendo}
          onFechar={() => setRemovendo(null)}
          onRemovido={recarregar}
        />
      )}

      {senhaGerada && (
        <SenhaProvisoria
          pessoa={senhaGerada.pessoa}
          senha={senhaGerada.senha}
          onFechar={() => setSenhaGerada(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------ cadastro / edição */

function FormularioUsuario({ inicial, onFechar, onSalvo }) {
  const { toast } = useApp();
  const novo = !inicial.id;
  const [form, setForm] = useState({ ...VAZIO, ...inicial });
  const [salvando, setSalvando] = useState(false);

  const campo = (chave) => ({
    value: form[chave] ?? '',
    onChange: (e) => setForm({ ...form, [chave]: e.target.value }),
  });

  const salvar = async () => {
    setSalvando(true);
    try {
      const dados = {
        name: form.name,
        email: form.email,
        role: form.role,
        jobTitle: form.jobTitle || PAPEIS[form.role].cargoPadrao,
        city: form.city,
        phone: form.phone,
        dailyGoal: Number(form.dailyGoal) || 0,
      };

      if (novo) {
        const { user: criado, senhaProvisoria } = await endpoints.criarUsuario(dados);
        toast(`${criado.name.split(' ')[0]} entrou para a equipe.`);
        onSalvo(senhaProvisoria, criado);
      } else {
        const atualizado = await endpoints.atualizarUsuario(inicial.id, dados);
        toast('Cadastro atualizado.');
        onSalvo(null, atualizado);
      }
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={novo ? 'Novo integrante' : 'Editar cadastro'}
      subtitulo={novo ? 'A senha provisória aparece ao salvar' : inicial.email}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : novo ? 'Cadastrar' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="campo">
        <label htmlFor="eq-nome">Nome completo</label>
        <input id="eq-nome" className="input" {...campo('name')} placeholder="Ex.: Carlos Mendes" />
      </div>

      <div className="campo">
        <label htmlFor="eq-email">E-mail de acesso</label>
        <input id="eq-email" className="input" type="email" {...campo('email')} placeholder="nome@empresa.com.br" />
      </div>

      <div className="campo">
        <label>Papel</label>
        <div className="opcoes">
          {Object.entries(PAPEIS).map(([chave, p]) => (
            <button
              key={chave}
              className={`opcao${form.role === chave ? ' ativa' : ''}`}
              onClick={() => setForm({ ...form, role: chave, dailyGoal: chave === 'vendedor' ? form.dailyGoal || 8 : 0 })}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="eq-cargo">Cargo</label>
          <input id="eq-cargo" className="input" {...campo('jobTitle')} placeholder={PAPEIS[form.role].cargoPadrao} />
        </div>
        <div className="campo">
          <label htmlFor="eq-cidade">Cidade</label>
          <input id="eq-cidade" className="input" {...campo('city')} placeholder="Iguatu" />
        </div>
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="eq-telefone">Telefone</label>
          <input
            id="eq-telefone"
            className="input"
            inputMode="tel"
            value={form.phone ?? ''}
            onChange={(e) => setForm({ ...form, phone: mascaraTelefone(e.target.value) })}
            placeholder="(88) 99999-0000"
          />
        </div>
        {form.role === 'vendedor' && (
          <div className="campo">
            <label htmlFor="eq-meta">Meta de visitas por dia</label>
            <input id="eq-meta" className="input" type="number" min="0" max="30" {...campo('dailyGoal')} />
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- senha provisória */

function SenhaProvisoria({ pessoa, senha, onFechar }) {
  const { toast } = useApp();

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(senha);
      toast('Senha copiada.');
    } catch {
      toast('Copie manualmente: o navegador bloqueou a cópia.', 'erro');
    }
  };

  return (
    <Modal
      titulo="Senha provisória"
      subtitulo={`Entregue para ${pessoa.name}`}
      onFechar={onFechar}
      rodape={<button className="btn btn-primary" onClick={onFechar}>Pronto</button>}
    >
      <p className="mini">
        Ela aparece uma única vez. No primeiro acesso o CRM exige a troca por uma senha pessoal.
      </p>
      <div className="linha" style={{ marginTop: 12 }}>
        <code className="senha-provisoria crescer">{senha}</code>
        <button className="btn btn-sm" onClick={copiar}>Copiar</button>
      </div>
      <p className="mini" style={{ marginTop: 12 }}>Acesso: {pessoa.email}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------- remoção -- */

function RemoverUsuario({ pessoa, onFechar, onRemovido }) {
  const { toast } = useApp();
  const { dados: previa, carregando } = useRecurso(
    () => endpoints.previaRemocaoUsuario(pessoa.id),
    [pessoa.id]
  );
  const [destino, setDestino] = useState('');
  const [removendo, setRemovendo] = useState(false);

  const total = previa?.total ?? 0;
  const transferiveis = (previa?.itens ?? []).filter((i) => i.transfere);
  const soHistorico = (previa?.itens ?? []).filter((i) => !i.transfere);

  const remover = async (forcar) => {
    setRemovendo(true);
    try {
      const r = await endpoints.removerUsuario(pessoa.id, {
        transferirPara: forcar ? undefined : destino || undefined,
        forcar,
      });
      toast(
        r.transferidoPara
          ? `${r.removido} removido; carteira com ${r.transferidoPara.name}.`
          : `${r.removido} removido do CRM.`
      );
      onRemovido();
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
      setRemovendo(false);
    }
  };

  return (
    <Modal
      titulo="Remover do CRM"
      subtitulo={`${pessoa.name} · ${pessoa.email}`}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar} disabled={removendo}>Cancelar</button>
          {total > 0 && destino ? (
            <button className="btn btn-danger" onClick={() => remover(false)} disabled={removendo}>
              {removendo ? 'Removendo...' : 'Transferir e remover'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => remover(total > 0)} disabled={removendo || carregando}>
              {removendo ? 'Removendo...' : total > 0 ? 'Remover tudo mesmo assim' : 'Remover'}
            </button>
          )}
        </>
      }
    >
      <div className="aviso-exclusao">
        <span className="emoji">⚠︎</span>
        <div>
          <b>Esta ação não pode ser desfeita.</b>
          <p className="menor" style={{ marginTop: 4 }}>
            Se a pessoa saiu da empresa, o certo é <b>Inativar</b>: o acesso cai na hora e o
            histórico dela continua nos relatórios. Remover é para cadastro errado ou duplicado.
          </p>
        </div>
      </div>

      {carregando ? (
        <p className="mini">Conferindo o que está no nome dela...</p>
      ) : total === 0 ? (
        <p className="mini">Não há nada registrado no nome desta pessoa.</p>
      ) : (
        <>
          <div className="campo">
            <span className="selo">No nome dela hoje</span>
            <ul className="lista-remocao">
              {(previa.itens ?? []).map((i) => (
                <li key={i.tabela}>• {i.quantidade} {i.rotulo}</li>
              ))}
            </ul>
          </div>

          {transferiveis.length > 0 && (
            <div className="campo">
              <label htmlFor="rm-destino">Transferir carteira e agenda para</label>
              <select
                id="rm-destino"
                className="select"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              >
                <option value="">Ninguém — apagar tudo junto</option>
                {(previa.destinos ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.city ? ` · ${d.city}` : ''}
                  </option>
                ))}
              </select>
              <span className="mini">
                Clientes, visitas, propostas, compromissos e tarefas passam para quem você escolher.
                {soHistorico.length > 0 && ' Metas e fechamentos de dia são apagados de qualquer forma.'}
              </span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
