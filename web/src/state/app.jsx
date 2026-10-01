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
  const timer = useRef(null);

  const toast = useCallback((mensagem, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, mensagem, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
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
    setUser(logado);
    setMeta(await endpoints.meta());
    carregarNotificacoes();
    return logado;
  }, [carregarNotificacoes]);

  const sair = useCallback(() => {
    setToken(null);
    setUser(null);
    setPlacar(null);
    setNotificacoes({ itens: [], naoLidas: 0, criticas: 0 });
  }, []);

  // Sessão recuperada do localStorage ao abrir o app
  useEffect(() => {
    (async () => {
      if (!getToken()) return setCarregando(false);
      try {
        const [{ user: atual }, vocabulario] = await Promise.all([endpoints.me(), endpoints.meta()]);
        setUser(atual);
        setMeta(vocabulario);
      } catch {
        setToken(null);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  // Polling da central de notificações enquanto houver sessão
  useEffect(() => {
    clearInterval(timer.current);
    if (!user) return undefined;
    const vendedor = user.role === 'vendedor';
    const rodada = () => {
      carregarNotificacoes();
      if (vendedor) carregarPlacar();
    };
    rodada();
    timer.current = setInterval(rodada, INTERVALO_NOTIFICACOES);
    return () => clearInterval(timer.current);
  }, [user, carregarNotificacoes, carregarPlacar]);

  useEffect(() => {
    const aoExpirar = () => {
      setUser(null);
      toast('Sua sessão expirou. Entre novamente.', 'erro');
    };
    window.addEventListener('newpay:sessao-expirada', aoExpirar);
    return () => window.removeEventListener('newpay:sessao-expirada', aoExpirar);
  }, [toast]);

  const valor = useMemo(
    () => ({
      user,
      meta,
      carregando,
      notificacoes,
      placar,
      toasts,
      toast,
      entrar,
      sair,
      definirUsuario: setUser,
      recarregarNotificacoes: carregarNotificacoes,
      recarregarPlacar: carregarPlacar,
      ehGestor: user?.role === 'gestor' || user?.role === 'diretoria',
      ehVendedor: user?.role === 'vendedor',
      ehOnboarding: user?.role === 'onboarding',
    }),
    [user, meta, carregando, notificacoes, placar, toasts, toast, entrar, sair, carregarNotificacoes, carregarPlacar]
  );

  return <AppContext.Provider value={valor}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}

/** Busca dados com estado de carregamento/erro em uma linha */
export function useRecurso(fn, deps = []) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await fn());
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { dados, carregando, erro, recarregar, setDados };
}
