// Estado global: sessão, vocabulário do módulo, notificações e avisos rápidos.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { endpoints, setToken, getToken } from '../api/client.js';

const AppContext = createContext(null);
const INTERVALO_NOTIFICACOES = 60_000;

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [notificacoes, setNotificacoes] = useState({ itens: [], naoLidas: 0, criticas: 0 });
  const [toasts, setToasts] = useState([]);
  const timer = useRef(null);

  const toast = useCallback((mensagem, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, mensagem, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const carregarNotificacoes = useCallback(async () => {
    try {
      setNotificacoes(await endpoints.notificacoes());
    } catch {
      /* silencioso: a central volta na próxima rodada */
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
    carregarNotificacoes();
    timer.current = setInterval(carregarNotificacoes, INTERVALO_NOTIFICACOES);
    return () => clearInterval(timer.current);
  }, [user, carregarNotificacoes]);

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
      toasts,
      toast,
      entrar,
      sair,
      definirUsuario: setUser,
      recarregarNotificacoes: carregarNotificacoes,
      ehGestor: user?.role === 'gestor' || user?.role === 'diretoria',
    }),
    [user, meta, carregando, notificacoes, toasts, toast, entrar, sair, carregarNotificacoes]
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
