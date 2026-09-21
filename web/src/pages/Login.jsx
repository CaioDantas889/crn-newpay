import { useEffect, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';

const CONTAS = [
  { email: 'carlos@newpay.com.br', nome: 'Carlos Mendes', papel: 'Vendedor externo — Iguatu', cor: '#2563eb' },
  { email: 'fernanda@newpay.com.br', nome: 'Fernanda Lima', papel: 'Vendedora externa — Icó', cor: '#db2777' },
  { email: 'gestor@newpay.com.br', nome: 'Neto Almeida', papel: 'Gerente comercial', cor: '#0f172a' },
];

export default function Login() {
  const { entrar, toast } = useApp();
  const [demo, setDemo] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  // As contas de teste só existem no banco de demonstração; em produção a tela
  // não anuncia senha nenhuma.
  useEffect(() => {
    endpoints
      .meta()
      .then((m) => {
        if (!m.demo) return;
        setDemo(true);
        setEmail('carlos@newpay.com.br');
        setSenha('newpay123');
      })
      .catch(() => setDemo(false));
  }, []);

  const enviar = async (e) => {
    e.preventDefault();
    setEntrando(true);
    try {
      const usuario = await entrar(email, senha);
      toast(`Bem-vindo, ${usuario.name.split(' ')[0]}!`);
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="login">
      <div className="login-vitrine">
        <div className="logo" style={{ padding: 0 }}>
          <span className="logo-mark">N</span>
          <span style={{ color: '#fff', fontWeight: 700 }}>
            NewPay CRM
            <small style={{ display: 'block', color: '#7f8db0', fontWeight: 500, fontSize: '0.7rem' }}>
              Módulo Calendário
            </small>
          </span>
        </div>

        <h2>A central de comando diária do vendedor externo.</h2>

        <ul>
          <li><span>📅</span><span><b>Visão mensal e diária</b> com cores por tipo de compromisso.</span></li>
          <li><span>🔔</span><span><b>Notificações automáticas</b> de reunião, visita, follow-up vencido e meta.</span></li>
          <li><span>📚</span><span><b>Biblioteca comercial</b> com vídeos, áudios e PDFs para mandar ao cliente.</span></li>
          <li><span>🏢</span><span><b>Agenda corporativa</b> com confirmação de presença obrigatória.</span></li>
          <li><span>📢</span><span><b>Mural de avisos</b> com controle de quem leu cada comunicado.</span></li>
          <li><span>📊</span><span><b>Painel do gestor</b> com a execução da equipe em tempo real.</span></li>
        </ul>
      </div>

      <div className="login-painel">
        <form className="login-card" onSubmit={enviar}>
          <h1>Entrar</h1>
          <p className="mini" style={{ marginBottom: 18 }}>Acesse sua agenda NewPay.</p>

          <div className="coluna" style={{ gap: 12 }}>
            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                type="password"
                className="input"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary btn-block" disabled={entrando}>
              {entrando ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          {demo && (
          <div className="login-contas">
            <span className="selo">Contas de demonstração</span>
            {CONTAS.map((c) => (
              <button
                type="button"
                key={c.email}
                className="conta-demo"
                onClick={() => {
                  setEmail(c.email);
                  setSenha('newpay123');
                }}
              >
                <span className="avatar avatar-sm" style={{ background: c.cor }}>
                  {c.nome.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </span>
                <span className="crescer">
                  <span className="forte" style={{ fontSize: '0.85rem', display: 'block' }}>{c.nome}</span>
                  <span className="mini">{c.papel}</span>
                </span>
              </button>
            ))}
            <p className="mini">Senha de todas as contas: <b>newpay123</b></p>
          </div>
          )}
        </form>
      </div>
    </div>
  );
}
