// Aceite digital do Termo de Conduta. Tela cheia: enquanto o vendedor não
// aceita a versão vigente, o CRM não abre. O servidor grava data, hora e login.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Carregando } from './ui.jsx';

export default function AceiteTermo() {
  const { user, sair, toast, definirUsuario } = useApp();
  const { dados, carregando, erro } = useRecurso(() => endpoints.termo(), []);
  const [li, setLi] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const aceitar = async () => {
    setSalvando(true);
    try {
      await endpoints.aceitarTermo(dados.termo.id);
      toast('Termo de Conduta aceito.');
      definirUsuario({ ...user, termoPendente: false });
    } catch (e) {
      toast(e.message, 'erro');
      setSalvando(false);
    }
  };

  return (
    <div className="login">
      <div className="login-painel">
        <div className="login-card termo-card">
          <h1>Termo de Conduta</h1>
          <p className="mini" style={{ marginBottom: 12 }}>
            {user.name} · {user.email}
            {dados?.termo ? ` · versão ${dados.termo.versao}` : ''}
          </p>

          {carregando ? (
            <Carregando linhas={5} />
          ) : erro || !dados?.termo ? (
            <p className="chip chip-erro">{erro ?? 'Não consegui carregar o termo. Tente de novo.'}</p>
          ) : (
            <>
              <div className="termo-texto">{dados.termo.texto}</div>

              <div className="aviso-fantasma" style={{ marginTop: 12 }}>
                ⚠︎ Lead fantasma = falta grave. Todo lead pode ser auditado.
              </div>

              <label className="marcacao declaracao" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={li} onChange={(e) => setLi(e.target.checked)} />
                <span>Li e aceito o Termo de Conduta. Sei que o aceite fica gravado com data, hora e o meu login.</span>
              </label>

              <button className="btn btn-brand btn-block" style={{ marginTop: 12 }} disabled={!li || salvando} onClick={aceitar}>
                {salvando ? 'Gravando...' : 'Aceitar e entrar'}
              </button>
            </>
          )}

          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={sair}>
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
