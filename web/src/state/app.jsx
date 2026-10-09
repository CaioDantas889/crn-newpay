// Estado global: sessão, vocabulário do módulo, notificações e avisos rápidos.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { endpoints, setToken, getToken } from '../api/client.js';

const AppContext = createContext(null);
const INTERVALO_NOTIFICACOES = 60_000;

/**
 * Lembretes de ritmo (8h, 11h, 15h, 18h) e o resumo das 19h do gestor: além de
 * ficarem na central, aparecem na tela na primeira vez que chegam — e viram
 * notificação do aparelho quando o vendedor liberou os avisos em "Mais".
 */
const CHAVE_AVISADOS = 'newpay.avisados';
function avisarRitmo(itens, toast) {
  let avisados = [];
  try {
    avisados = JSON.parse(localStorage.getItem(CHAVE_AVISADOS) ?? '[]');
  } catch {
    /* lista ilegível: começa de novo */
  }

  const novos = itens.filter(
    (n) => (n.kind.startsWith('ritmo_') || n.kind === 'resumo_gestor') && !n.read && !avisados.includes(n.id)
  );
  if (!novos.length) return;

  for (const n of novos) {
    toast(`${n.title} — ${n.message}`, n.severity === 'info' ? 'ok' : 'erro');
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready
        .then((registro) => registro.showNotification(n.title, { body: n.message, tag: n.id, icon: '/icone-192.png' }))
        .catch(() => {});
    }
  }
  localStorage.setItem(CHAVE_AVISADOS, JSON.stringify([...avisados, ...novos.map((n) => n.id)].slice(-40)));
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [notificacoes, setNotificacoes] = useState({ itens: [], naoLidas: 0, criticas: 0 });
  const [toasts, setToasts] = useState([]);
  // Placar da meta do dia: fica no topo de todas as telas do vendedor
  const [placar, setPlacar] = useState(null);
  // Abriu o app sem sinal: o token fica guardado e o CRM tenta de novo sozinho
  const [semConexao, setSemConexao] = useState(false);
  // Sessão venceu no meio do trabalho: pede só a senha, sem fechar a tela aberta
  const [reentrada, setReentrada] = useState(false);
  const timer = useRef(null);
  const reentradaRef = useRef(false);
  reentradaRef.current = reentrada;
  // Sem ninguém logado na tela não há o que reentrar (ex.: 401 na abertura)
  const userRef = useRef(null);
  userRef.current = user;

  const fecharToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // Erro fica mais tempo na tela: é o que o vendedor precisa ler para agir
  const toast = useCallback((mensagem, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, mensagem, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'erro' ? 8000 : 4000);
  }, []);

  const carregarNotificacoes = useCallback(async () => {
    try {
      const central = await endpoints.notificacoes();
      setNotificacoes(central);
      avisarRitmo(central.itens, toast);
    } catch {
      /* silencioso: a central volta na próxima rodada */
    }
  }, [toast]);

  const carregarPlacar = useCallback(async () => {
    try {
      setPlacar(await endpoints.placar());
    } catch {
      /* o placar volta na próxima rodada */
    }
  }, []);

  const entrar = useCallback(async (email, senha) => {
    const { token, user: logado } = await endpoints.login(email, senha);
    setToken(token);
    setReentrada(false);
    try {
      localStorage.setItem('newpay.email', email);
    } catch {
      /* sem storage: o login só não vem preenchido */
    }
    setUser(logado);
    setMeta(await endpoints.meta());
    carregarNotificacoes();
    return logado;
  }, [carregarNotificacoes]);

  const sair = useCallback(() => {
    setToken(null);
    setReentrada(false);
    setUser(null);
    setPlacar(null);
    setNotificacoes({ itens: [], naoLidas: 0, criticas: 0 });
  }, []);

  /**
   * Sessão recuperada do localStorage ao abrir o app. Só sai do login quando
   * o servidor recusa o token (401); sem sinal, o token fica e a tela diz que
   * o CRM abre sozinho quando a internet voltar.
   */
  const abrirSessao = useCallback(async () => {
    if (!getToken()) {
      setSemConexao(false);
      return setCarregando(false);
    }
    try {
      const [{ user: atual }, vocabulario] = await Promise.all([
        endpoints.me({ timeout: 8000 }),
        endpoints.meta({ timeout: 8000 }),
      ]);
      setUser(atual);
      setMeta(vocabulario);
      setSemConexao(false);
    } catch (erro) {
      if (erro?.status === 401) setSemConexao(false);
      else setSemConexao(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    abrirSessao();
  }, [abrirSessao]);

  // Sem sinal na abertura: tenta de novo quando a rede volta e a cada 10 s
  useEffect(() => {
    if (!semConexao) return undefined;
    const tentar = () => abrirSessao();
    window.addEventListener('online', tentar);
    const intervalo = setInterval(tentar, 10_000);
    return () => {
      window.removeEventListener('online', tentar);
      clearInterval(intervalo);
    };
  }, [semConexao, abrirSessao]);

  // Polling da central de notificações enquanto houver sessão
  useEffect(() => {
    clearInterval(timer.current);
    if (!user) return undefined;
    const vendedor = user.role === 'vendedor';
    const rodada = () => {
      if (reentradaRef.current) return; // sem sessão, a consulta só daria 401
      carregarNotificacoes();
      if (vendedor) carregarPlacar();
    };
    rodada();
    timer.current = setInterval(rodada, INTERVALO_NOTIFICACOES);
    return () => clearInterval(timer.current);
  }, [user, carregarNotificacoes, carregarPlacar]);

  useEffect(() => {
    const aoExpirar = (e) => {
      const code = e?.detail?.code ?? 'sessao_vencida';
      // Só a sessão venceu: a tela fica montada (com o lead ou a visita que
      // estava sendo preenchido) e um painel pede a senha de novo.
      if (code === 'sessao_vencida') {
        if (userRef.current) setReentrada(true);
        return;
      }
      // Senha trocada ou usuário sem acesso: é assim que o celular perdido
      // perde o acesso — sai de vez.
      setReentrada(false);
      setUser(null);
      toast(code === 'senha_mudou' ? 'Sua senha mudou. Entre novamente.' : 'Seu acesso foi encerrado.', 'erro');
    };
    window.addEventListener('newpay:sessao-expirada', aoExpirar);
    return () => window.removeEventListener('newpay:sessao-expirada', aoExpirar);
  }, [toast]);

  /** Painel de reentrada: mesma pessoa, senha de novo, e a tela continua onde estava */
  const reentrar = useCallback(async (senha) => {
    const { token, user: logado } = await endpoints.login(user.email, senha);
    setToken(token);
    setReentrada(false);
    if (logado.id !== user.id) setUser(logado);
    toast('Pronto. Se estava salvando algo, toque em Salvar de novo.');
    carregarNotificacoes();
  }, [user, toast, carregarNotificacoes]);

  const valor = useMemo(
    () => ({
      user,
      meta,
      carregando,
      notificacoes,
      placar,
      toasts,
      toast,
      fecharToast,
      entrar,
      sair,
      semConexao,
      abrirSessao,
      reentrada,
      reentrar,
      definirUsuario: setUser,
      recarregarNotificacoes: carregarNotificacoes,
      recarregarPlacar: carregarPlacar,
      ehGestor: user?.role === 'gestor' || user?.role === 'diretoria',
      ehVendedor: user?.role === 'vendedor',
      ehOnboarding: user?.role === 'onboarding',
    }),
    [
      user, meta, carregando, notificacoes, placar, toasts, toast, fecharToast, entrar, sair,
      semConexao, abrirSessao, reentrada, reentrar, carregarNotificacoes, carregarPlacar,
    ]
  );

  return <AppContext.Provider value={valor}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}

/**
 * Busca dados com estado de carregamento/erro em uma linha.
 *
 * - `carregando`: ainda não há o que mostrar (primeira carga, ou troca de
 *   filtro/registro — a tela mostra o esqueleto).
 * - `recarregando`: há dados na tela e uma busca nova a caminho. Recarregar
 *   depois de uma ação (concluir follow-up, ativar, registrar proposta) não
 *   pisca o esqueleto nem joga a ficha de volta para o topo.
 * - Só a resposta mais recente vale: no 4G a resposta de uma busca antiga pode
 *   chegar depois da nova, e antes ela ficava na tela.
 *
 * `manterAoTrocar`: na troca das dependências, mantém os dados antigos à
 * vista (lista que filtra enquanto digita) em vez de voltar ao esqueleto.
 */
export function useRecurso(fn, deps = [], { manterAoTrocar = false } = {}) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const ultima = useRef(0);
  const temDados = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const buscar = useCallback(async (trocouDeps) => {
    const minha = ++ultima.current;
    const semEsqueleto = temDados.current && (!trocouDeps || manterAoTrocar);
    if (semEsqueleto) setRecarregando(true);
    else setCarregando(true);
    setErro(null);
    try {
      const resposta = await fnRef.current();
      if (minha !== ultima.current) return;
      temDados.current = true;
      setDados(resposta);
    } catch (e) {
      if (minha !== ultima.current) return;
      setErro(e.message);
    } finally {
      if (minha === ultima.current) {
        setCarregando(false);
        setRecarregando(false);
      }
    }
  }, [manterAoTrocar]);

  useEffect(() => {
    buscar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Sem argumento de propósito: há chamadas como .then(recarregar)
  const recarregar = useCallback(() => buscar(false), [buscar]);

  return { dados, carregando, recarregando, erro, recarregar, setDados };
}
