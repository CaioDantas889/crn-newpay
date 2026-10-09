// Camada única de acesso à API. Guarda o token e normaliza os erros.
//
// Feita para o 4G do interior: toda chamada tem prazo, a falta de sinal vira
// uma mensagem em português que diz o que fazer, e o token se renova sozinho
// quando o servidor manda um novo (cabeçalho X-Token-Novo).

const TOKEN_KEY = 'newpay.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

/** Falhou por rede (sem sinal ou sem resposta), e não por regra do servidor */
export const ehErroDeRede = (e) => Boolean(e?.rede);

const PRAZO_LEITURA_MS = 15_000;
const PRAZO_ENVIO_MS = 45_000; // foto e áudio sobem devagar no 4G

function guardarTokenNovo(res) {
  const novo = res.headers.get('X-Token-Novo');
  if (novo) setToken(novo);
}

/**
 * `idempotente`: repetir o envio é seguro (o servidor reconhece a chave do
 * cadastro e devolve o mesmo registro) — a mensagem de falta de resposta pode
 * mandar tocar em Salvar de novo.
 */
async function request(path, { method = 'GET', body, auth = true, timeout, idempotente = false } = {}) {
  const leitura = method === 'GET';
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), timeout ?? (leitura ? PRAZO_LEITURA_MS : PRAZO_ENVIO_MS));

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal: controle.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (erro) {
    const estourou = erro?.name === 'AbortError';
    const mensagem = !estourou
      ? 'Sem sinal agora. Seus dados continuam aqui; tente de novo.'
      : leitura
        ? 'A internet está lenta demais. Tente de novo.'
        : idempotente
          ? 'Sem resposta do servidor. Seus dados continuam aqui: toque em Salvar de novo.'
          : 'A conexão caiu antes da resposta. Confira se salvou antes de repetir.';
    throw new ApiError(mensagem, 0, { rede: true, tempo: estourou });
  } finally {
    clearTimeout(prazo);
  }

  guardarTokenNovo(res);

  let dados = null;
  let texto = '';
  try {
    texto = await res.text();
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    // Portal da operadora, proxy ou 502 devolvem HTML: não é resposta do CRM
    throw new ApiError('O servidor não respondeu direito. Tente de novo em instantes.', res.ok ? 502 : res.status, {
      rede: true,
    });
  }

  if (res.status === 401 && auth) {
    const code = dados?.code ?? 'sessao_vencida';
    // Sessão vencida: o token velho sai, mas a tela continua montada e só pede
    // a senha de novo. Senha trocada ou usuário sem acesso: sai de vez.
    setToken(null);
    window.dispatchEvent(new CustomEvent('newpay:sessao-expirada', { detail: { code } }));
  }

  if (!res.ok) throw new ApiError(dados?.error ?? 'Não foi possível completar a operação.', res.status, { code: dados?.code });
  return dados;
}

export const api = {
  get: (path, opts) => request(path, opts),
  post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body, opts) => request(path, { method: 'PUT', body, ...opts }),
  patch: (path, body, opts) => request(path, { method: 'PATCH', body, ...opts }),
  del: (path, opts) => request(path, { method: 'DELETE', ...opts }),
};

const qs = (params = {}) => {
  const busca = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return busca ? `?${busca}` : '';
};

export const endpoints = {
  // sessão e vocabulário
  login: (email, password) => api.post('/auth/login', { email, password }, { auth: false }),
  me: (opts) => api.get('/auth/me', opts),
  equipe: () => api.get('/auth/equipe'),
  meta: (opts) => api.get('/meta', opts),
  trocarSenha: (atual, nova) => api.post('/auth/senha', { atual, nova }),

  // cadastro da equipe (gestor)
  usuarios: () => api.get('/users'),
  criarUsuario: (dados) => api.post('/users', dados),
  atualizarUsuario: (id, patch) => api.patch(`/users/${id}`, patch),
  resetarSenha: (id, senha) => api.post(`/users/${id}/senha`, { senha }),
  previaRemocaoUsuario: (id) => api.get(`/users/${id}/remocao`),
  removerUsuario: (id, { transferirPara, forcar } = {}) =>
    api.del(`/users/${id}${qs({ transferirPara, forcar: forcar ? 1 : undefined })}`),

  // dashboard
  dashboard: (mes) => api.get(`/dashboard${qs({ mes })}`),
  evolucao: (mes) => api.get(`/dashboard/evolucao${qs({ mes })}`),

  // calendário
  eventosPeriodo: (de, ate, userId) =>
    api.get(`/events${qs({ from: de.toISOString(), to: ate.toISOString(), userId })}`),
  eventosDoDia: (dataKey, userId) => api.get(`/events/dia/${dataKey}${qs({ userId })}`),
  criarEvento: (dados) => api.post('/events', dados),
  atualizarEvento: (id, patch) => api.patch(`/events/${id}`, patch),
  excluirEvento: (id) => api.del(`/events/${id}`),
  confirmarPresenca: (id, status, note) => api.post(`/events/${id}/confirmar`, { status, note }),

  // tarefas
  tarefas: (params) => api.get(`/tasks${qs(params)}`),
  criarTarefa: (dados) => api.post('/tasks', dados),
  atualizarTarefa: (id, patch) => api.patch(`/tasks/${id}`, patch),
  excluirTarefa: (id) => api.del(`/tasks/${id}`),

  // carteira
  clientes: (params) => api.get(`/clients${qs(params)}`),
  sugestoesDoDia: (data, userId) => api.get(`/clients/sugestoes${qs({ data, userId })}`),
  cliente: (id) => api.get(`/clients/${id}`),
  criarCliente: (dados) => api.post('/clients', dados, { idempotente: true }),
  atualizarCliente: (id, patch) => api.patch(`/clients/${id}`, patch),
  salvarDiagnostico: (id, dados) => api.put(`/clients/${id}/diagnostico`, dados),
  funil: (userId) => api.get(`/clients/funil${qs({ userId })}`),
  mapa: (params) => api.get(`/clients/mapa${qs(params)}`),
  agendarRetorno: (id, dados) => api.post(`/clients/${id}/agendar-retorno`, dados),
  registrarContato: (id, dados) => api.post(`/clients/${id}/contato`, dados),
  excluirCliente: (id, forcar) => api.del(`/clients/${id}${forcar ? '?forcar=1' : ''}`),
  transferirCliente: (id, ownerId) => api.post(`/clients/${id}/transferir`, { ownerId }),

  // lead com prova: duplicado, CNPJ na Receita, print e abertura do WhatsApp
  checarDuplicado: (params) => api.get(`/clients/checar${qs(params)}`),
  consultarCnpj: (cnpj) => api.get(`/clients/cnpj/${String(cnpj).replace(/\D/g, '')}`),
  enviarPrint: (id, print) => api.post(`/clients/${id}/print`, { print }),
  recusarPrint: (id, motivo) => api.post(`/clients/${id}/recusar-print`, { motivo }),
  registrarWhatsApp: (id, followupId) => api.post(`/clients/${id}/whatsapp`, { followupId }),

  // tela Hoje e motor de follow-up
  hoje: () => api.get('/followups/hoje'),
  placar: () => api.get('/followups/placar'),
  concluirFollowup: (id, dados) => api.post(`/followups/${id}/concluir`, dados),
  reagendarFollowup: (id, quando) => api.post(`/followups/${id}/reagendar`, { quando }),

  // visitas e vendas
  visitas: (params) => api.get(`/visits${qs(params)}`),
  registrarVisita: (dados) => api.post('/visits', dados, { idempotente: true }),
  excluirVisita: (id) => api.del(`/visits/${id}`),
  negocios: (params) => api.get(`/deals${qs(params)}`),
  criarNegocio: (dados) => api.post('/deals', dados),
  atualizarNegocio: (id, patch) => api.patch(`/deals/${id}`, patch),
  excluirNegocio: (id) => api.del(`/deals/${id}`),
  // Máquinas vendidas sem ativar e ativações declaradas aguardando a gestão
  pendenciasAtivacao: (userId) => api.get(`/deals/pendencias${qs({ userId })}`),
  confirmarAtivacao: (id) => api.post(`/deals/${id}/confirmar-ativacao`),
  recusarAtivacao: (id, motivo) => api.post(`/deals/${id}/recusar-ativacao`, { motivo }),

  // KPI diário
  kpi: (data) => api.get(`/kpi${qs({ data })}`),
  kpiHistorico: (dias) => api.get(`/kpi/historico${qs({ dias })}`),
  fecharDia: (dados) => api.post('/kpi', dados),

  // ranking e conteúdo
  ranking: (mes) => api.get(`/ranking${qs({ mes })}`),
  rankingLeads: (periodo) => api.get(`/ranking/leads${qs({ periodo })}`),
  biblioteca: (params) => api.get(`/content/library${qs(params)}`),
  criarMaterial: (dados) => api.post('/content/library', dados),
  // Vídeo e áudio sobem em binário puro: base64 inflaria 33% e estouraria o
  // limite do corpo JSON.
  enviarArquivoMaterial: async (arquivo) => {
    const res = await fetch('/api/content/library/arquivo', {
      method: 'POST',
      headers: {
        'Content-Type': arquivo.type || 'application/octet-stream',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: arquivo,
    });
    const novo = res.headers.get('X-Token-Novo');
    if (novo) setToken(novo);
    const dados = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(dados?.error ?? 'Não consegui enviar o arquivo.', res.status);
    return dados;
  },
  atualizarMaterial: (id, dados) => api.patch(`/content/library/${id}`, dados),
  excluirMaterial: (id) => api.del(`/content/library/${id}`),
  objecoes: (clientId) => api.get(`/content/objections${qs({ clientId })}`),

  // expediente (ponto de entrada e saída)
  jornada: (params) => api.get(`/jornada${qs(params)}`),
  iniciarExpediente: (local) => api.post('/jornada/entrada', local ?? {}),
  encerrarExpediente: (local) => api.post('/jornada/saida', local ?? {}),
  jornadaEquipe: (data) => api.get(`/jornada/equipe${qs({ data })}`),
  corrigirExpediente: (id, dados) => api.patch(`/jornada/${id}`, dados),
  lancarExpediente: (dados) => api.post('/jornada/manual', dados),

  // notificações e mural
  notificacoes: () => api.get('/notifications'),
  marcarNotificacaoLida: (id) => api.post(`/notifications/${id}/lida`),
  dispensarNotificacao: (id) => api.post(`/notifications/${id}/dispensar`),
  lerTodasNotificacoes: () => api.post('/notifications/ler-todas'),
  avisos: () => api.get('/announcements'),
  marcarAvisoLido: (id) => api.post(`/announcements/${id}/lido`),
  criarAviso: (dados) => api.post('/announcements', dados),
  excluirAviso: (id) => api.del(`/announcements/${id}`),

  // gestor
  visaoGeral: (data) => api.get(`/gestor/visao-geral${qs({ data })}`),
  indicadores: (mes) => api.get(`/gestor/indicadores${qs({ mes })}`),
  kpisEquipe: (dias) => api.get(`/gestor/kpis${qs({ dias })}`),
  semaforo: (data) => api.get(`/gestor/semaforo${qs({ data })}`),
  trajeto: (userId, data) => api.get(`/gestor/vendedor/${userId}/trajeto${qs({ data })}`),
  perfilVendedor: (userId, params) => api.get(`/gestor/vendedor/${userId}/perfil${qs(params)}`),

  // auditoria semanal, ocorrências e termo de conduta
  auditoria: () => api.get('/auditoria'),
  sortearAuditoria: () => api.post('/auditoria/sortear'),
  resultadoAuditoria: (id, resultado, notes) => api.post(`/auditoria/${id}/resultado`, { resultado, notes }),
  ocorrencias: (vendedorId) => api.get(`/auditoria/ocorrencias${qs({ vendedorId })}`),
  anularOcorrencia: (id, motivo) => api.post(`/auditoria/ocorrencias/${id}/anular`, { motivo }),
  termo: () => api.get('/auditoria/termo'),
  publicarTermo: (texto) => api.put('/auditoria/termo', { texto }),
  aceitarTermo: (termoId) => api.post('/auditoria/termo/aceite', { termoId }),
};
