// Troca da própria senha. Aparece como modal no menu "Mais" e como tela
// obrigatória no primeiro acesso (senha provisória entregue pelo gestor).

import { useState } from 'react';
import { endpoints, setToken } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { Modal } from './ui.jsx';

function Formulario({ obrigatorio, onPronto }) {
  const { toast, definirUsuario, sair } = useApp();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    if (nova !== repetida) return setErro('A confirmação não bate com a nova senha.');

    setSalvando(true);
    setErro(null);
    try {
      // A troca invalida os tokens antigos, então o servidor devolve um novo:
      // sem guardar esse token, quem acabou de trocar cairia na tela de login.
      const { user, token } = await endpoints.trocarSenha(atual, nova);
      if (token) setToken(token);
      definirUsuario(user);
      toast('Senha alterada.');
      onPronto?.();
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="coluna" style={{ gap: 12 }}>
      {obrigatorio && (
        <p className="mini">Você entrou com uma senha provisória. Defina a sua para continuar.</p>
      )}

      <div className="campo">
        <label htmlFor="senha-atual">{obrigatorio ? 'Senha provisória' : 'Senha atual'}</label>
        <input
          id="senha-atual"
          className="input"
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          required
        />
      </div>

      <div className="campo">
        <label htmlFor="senha-nova">Nova senha</label>
        <input
          id="senha-nova"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          required
        />
        <span className="mini">Mínimo de 8 caracteres.</span>
      </div>

      <div className="campo">
        <label htmlFor="senha-repetida">Repita a nova senha</label>
        <input
          id="senha-repetida"
          className="input"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          required
        />
      </div>

      {erro && <p className="chip chip-erro">{erro}</p>}

      <button className="btn btn-brand btn-block" disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar nova senha'}
      </button>

      {obrigatorio && (
        <button type="button" className="btn btn-ghost btn-block" onClick={sair}>
          Sair da conta
        </button>
      )}
    </form>
  );
}

/** Modal para quem quer trocar a senha por vontade própria */
export default function TrocarSenha({ onFechar }) {
  return (
    <Modal titulo="Trocar senha" subtitulo="Vale para o acesso ao CRM" onFechar={onFechar}>
      <Formulario onPronto={onFechar} />
    </Modal>
  );
}

/** Tela cheia: sem trocar a senha provisória, o CRM não abre */
export function TrocaObrigatoria() {
  const { user } = useApp();

  return (
    <div className="login">
      <div className="login-painel">
        <div className="login-card">
          <h1>Defina sua senha</h1>
          <p className="mini" style={{ marginBottom: 18 }}>{user.name} · {user.email}</p>
          <Formulario obrigatorio />
        </div>
      </div>
    </div>
  );
}
