// Verificação ponta a ponta da API do CRM NewPay.
// Suba o servidor e rode: npm run smoke
const BASE = process.env.API_URL || 'http://127.0.0.1:4000';

let falhas = 0;
const ok = (cond, label, extra = '') => {
  console.log(`${cond ? '  OK  ' : ' FALHA'} · ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) falhas++;
};
const secao = (titulo) => console.log(`\n-- ${titulo} ${'-'.repeat(Math.max(0, 58 - titulo.length))}`);

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* resposta não-JSON */ }
  return { status: res.status, json };
}

const hoje = new Date().toISOString().slice(0, 10);
const mes = hoje.slice(0, 7);
console.log(`\n===== Smoke test · CRM NewPay (${BASE}) =====`);

/* ---------------------------------------------------------- autenticação */
secao('Autenticação e vocabulário');

ok((await api('/api/health')).json?.ok, 'GET /api/health');
ok(
  (await api('/api/auth/login', { method: 'POST', body: { email: 'carlos@newpay.com.br', password: 'errada' } })).status === 401,
  'senha errada devolve 401'
);

const login = await api('/api/auth/login', { method: 'POST', body: { email: 'carlos@newpay.com.br', password: 'newpay123' } });
ok(login.status === 200 && login.json?.token, 'login do vendedor', login.json?.user?.name);
const vendedor = login.json.token;

const gestorLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'gestor@newpay.com.br', password: 'newpay123' } });
ok(gestorLogin.status === 200, 'login do gestor', gestorLogin.json?.user?.name);
const gestor = gestorLogin.json.token;

// A equipe mudou de tamanho? O CRM agora admite gente pela tela de Equipe,
// então as contagens abaixo saem do próprio cadastro, não de um número fixo.
const equipeAtiva = (await api('/api/auth/equipe', { token: gestor })).json ?? [];
const totalVendedores = equipeAtiva.filter((u) => u.role === 'vendedor').length;

ok((await api('/api/events')).status === 401, 'rota protegida sem token devolve 401');

const meta = await api('/api/meta', { token: vendedor });
ok(Object.keys(meta.json?.segmentos ?? {}).length === 10, 'vocabulário traz os 10 segmentos');
ok(meta.json?.tabelasTaxa?.includes('2mm'), 'vocabulario traz as tabelas de taxa', meta.json?.tabelasTaxa?.join(' · '));
ok(Object.keys(meta.json?.maquinas ?? {}).length >= 9, 'lista de máquinas concorrentes');
ok(meta.json?.niveis?.length === 5, 'níveis do ranking', meta.json.niveis.map((n) => n.label).join(' < '));
ok(meta.json?.kpisDiarios?.length === 4, 'os 4 KPIs diarios obrigatorios', meta.json.kpisDiarios.map((k) => k.label).join(' · '));
ok(
  Object.keys(meta.json?.resultadosVisita ?? {}).join(',') === 'fechado,quente,morno,frio,sem_cnpj,nao_atendeu',
  'resultado da visita e a lista fixa',
  Object.values(meta.json?.resultadosVisita ?? {}).map((r) => r.label).join(' · ')
);
ok(
  meta.json?.metaLeads?.total === 30 && meta.json.metaLeads.minPresenciais === 20 && meta.json.metaLeads.maxRemotos === 10,
  'meta diaria: 30 leads, minimo 20 presenciais, maximo 10 remotos'
);
ok(meta.json?.cadencia?.map((p) => p.dia).join(',') === '1,3,7,15,30', 'cadencia de follow-up D+1, D+3, D+7, D+15, D+30');

/* -------------------------------------------------------------- dashboard */
secao('Dashboard do vendedor');

const dash = await api('/api/dashboard', { token: vendedor });
ok(dash.status === 200, 'GET /api/dashboard');
ok(dash.json?.resumo?.meta?.metaMaquinas > 0, 'meta do mês definida', `${dash.json?.resumo?.meta?.metaMaquinas} máquinas`);
// Vendedor externo da NewPay e salario fixo: o CRM nao calcula comissao
ok(dash.json?.resumo?.comissao === undefined, 'dashboard nao devolve comissao');
ok(dash.json?.resumo?.tpvRealizado === undefined, 'dashboard nao devolve TPV');
ok(dash.json?.resumo?.percentualMeta >= 0, 'percentual da meta', `${dash.json?.resumo?.percentualMeta}%`);
ok(dash.json?.ranking?.posicao >= 1, 'posição no ranking', `${dash.json?.ranking?.posicao}º de ${dash.json?.ranking?.total}`);
ok(dash.json?.resumo?.nivel?.label, 'nível do vendedor', `${dash.json?.resumo?.nivel?.emoji} ${dash.json?.resumo?.nivel?.label}`);
ok(
  dash.json?.funil?.length === 6 && dash.json.funil.some((f) => f.total > 0),
  'funil com as 6 etapas',
  dash.json.funil.filter((f) => f.total).map((f) => `${f.label}:${f.total}`).join(' · ')
);
const ativ = dash.json?.atividades;
ok(
  ativ && typeof ativ.visitasAgendadas === 'number' && typeof ativ.clientesParaRetornar === 'number',
  'atividades do dia',
  `${ativ?.visitasAgendadas} visitas · ${ativ?.followupsPendentes} follow-ups · ${ativ?.clientesParaRetornar} p/ retornar`
);
ok(Array.isArray(dash.json?.clientesQuentes), 'clientes quentes na home', `${dash.json?.clientesQuentes?.length} leads`);
ok((await api('/api/dashboard/evolucao', { token: vendedor })).json?.dias?.length > 0, 'série diária do mês');

/* ------------------------------------------------- cadastro e diagnóstico */
secao('Cadastro, diagnóstico e pontuação');

const clientes = await api('/api/clients', { token: vendedor });
ok(clientes.json?.length > 0, 'carteira do vendedor', `${clientes.json?.length} clientes`);
ok(
  clientes.json.every((c) => typeof c.score === 'number' && c.stageMeta?.label),
  'cliente traz score e etapa do funil'
);

// Foto de 1x1 px só para validar os anexos
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Telefones e CNPJ fixos do teste: se uma rodada anterior caiu no meio, o que
// sobrou dela barraria esta como duplicado.
const FONE_TESTE = '(88) 96111-0001';
const FONE_REMOTO = '(88) 96111-0002';
const CNPJ_TESTE = '00.000.000/0001-91';
const soDigitos = (v = '') => String(v).replace(/\D/g, '');
for (const c of (await api('/api/clients?userId=todos', { token: gestor })).json ?? []) {
  const sobra = [FONE_TESTE, FONE_REMOTO].some((f) => soDigitos(c.whatsapp) === soDigitos(f)) || soDigitos(c.cnpj) === soDigitos(CNPJ_TESTE);
  if (sobra) await api(`/api/clients/${c.id}?forcar=1`, { token: gestor, method: 'DELETE' });
}

/** Lead presencial completo: GPS do aparelho, foto da fachada e resultado */
const leadPresencial = (extra = {}) => ({
  origem: 'presencial', name: 'Cliente Teste', company: 'Mercadinho Teste', whatsapp: FONE_TESTE,
  segment: 'mercadinho', maquinaAtual: 'ton', faturamentoCartao: '5k_10k', resultado: 'frio',
  foto: { dataUrl: pixel }, lat: -6.3601, lng: -39.2992, precisao: 14, ...extra,
});

const placarAntes = (await api('/api/followups/placar', { token: vendedor })).json;

ok(
  (await api('/api/clients', { token: vendedor, method: 'POST', body: { company: 'Sem prova', name: 'X' } })).status === 400,
  'vendedor nao cadastra lead sem dizer se e presencial ou remoto'
);
const semFoto = await api('/api/clients', { token: vendedor, method: 'POST', body: leadPresencial({ foto: null }) });
ok(semFoto.status === 400 && semFoto.json?.error?.includes('foto da fachada'), 'presencial sem foto da fachada e recusado', semFoto.json?.error);
const leadSemGps = await api('/api/clients', { token: vendedor, method: 'POST', body: leadPresencial({ lat: null, lng: null }) });
ok(leadSemGps.status === 400, 'presencial sem GPS e recusado', leadSemGps.json?.error);

const novo = await api('/api/clients', { token: vendedor, method: 'POST', body: leadPresencial() });
ok(novo.status === 201, 'cadastrar lead presencial em campo');
ok(novo.json?.leadStatus === 'validado' && novo.json?.prova?.foto?.url, 'presencial nasce validado, com GPS, horario e foto', `±${novo.json?.prova?.precisao} m`);
ok(novo.json?.stage === 'contatado' && novo.json?.temperature === 'frio', 'resultado "Frio" define etapa e temperatura');
ok(
  novo.json?.placar?.presenciais === placarAntes.presenciais + 1 && novo.json.placar.total === placarAntes.total + 1,
  'lead presencial entra no placar do dia',
  `Hoje: ${novo.json?.placar?.total}/${novo.json?.placar?.meta}`
);
ok(novo.json?.followup?.passo?.etapa === 'd1', 'lead que nao fechou ja nasce com o follow-up D+1', novo.json?.followup?.dueAt?.slice(0, 10));

const repetido = await api('/api/clients', { token: vendedor, method: 'POST', body: leadPresencial({ company: 'Outro nome' }) });
ok(repetido.status === 409 && repetido.json?.duplicado, 'telefone ja cadastrado e bloqueado como duplicado', repetido.json?.error);
ok(
  (await api(`/api/clients/checar?whatsapp=${encodeURIComponent(FONE_TESTE)}`, { token: vendedor })).json?.duplicado === true,
  'formulario descobre o duplicado antes de salvar'
);

// Diagnóstico da especificação: máquina antiga + taxas + faturamento + troca imediata = 100
const diag = await api(`/api/clients/${novo.json.id}/diagnostico`, {
  token: vendedor, method: 'PUT',
  body: {
    maquinaAtual: 'ton', faturamento: '10k_30k', volumeCartao: 'alto',
    dores: ['taxas_altas', 'demora_receber'], interesse: 'imediato', taxaAtual: 3.99,
  },
});
ok(diag.status === 200, 'preencher diagnóstico comercial');
ok(diag.json?.score === 100 && diag.json?.temperature === 'quente', 'pontuação automática → lead quente', `score ${diag.json?.score}`);
ok(diag.json?.tpvEstimado === undefined, 'diagnostico nao estima mais TPV');
ok(
  diag.json?.scoreDetalhes?.some((d) => d.chave === 'interesse' && d.pontos === 50),
  'detalhamento mostra de onde vieram os pontos'
);

const frio = await api(`/api/clients/${novo.json.id}/diagnostico`, {
  token: vendedor, method: 'PUT',
  body: { maquinaAtual: 'nao_possui', faturamento: 'ate_5k', volumeCartao: 'baixo', dores: [], interesse: 'nao_quer' },
});
ok(frio.json?.score <= 30 && frio.json?.temperature === 'frio', 'diagnóstico fraco → lead frio', `score ${frio.json?.score}`);

// Mover de etapa é o que o quadro Pipeline faz ao arrastar o cartão
const movido = await api(`/api/clients/${novo.json.id}`, {
  token: vendedor, method: 'PATCH', body: { stage: 'negociacao' },
});
ok(
  movido.json?.stage === 'negociacao' && movido.json?.stageMeta?.label === 'Negociação',
  'mover cliente de etapa (arrastar no Pipeline)'
);
ok(
  (await api(`/api/clients/${novo.json.id}`, {
    token: vendedor, method: 'PATCH', body: { stage: 'inexistente' },
  })).status === 400,
  'etapa inválida é recusada'
);

const funil = await api('/api/clients/funil', { token: vendedor });
ok(funil.json?.length === 6, 'funil da carteira', funil.json.map((f) => `${f.label}:${f.total}`).join(' · '));

const mapa = await api('/api/clients/mapa?raio=3', { token: vendedor });
ok(mapa.json?.destaque?.includes('km'), 'mapa de clientes', mapa.json?.destaque);
ok(mapa.json?.pontos?.every((p) => typeof p.distanciaKm === 'number'), 'pontos trazem distância');

// Sugestao de quem visitar: o que preenche a agenda do dia
const sugestoes = await api(`/api/clients/sugestoes?data=${hoje}`, { token: vendedor });
ok(Array.isArray(sugestoes.json?.sugestoes), 'sugestoes de visita do dia', `${sugestoes.json?.sugestoes?.length} cliente(s)`);
ok(
  sugestoes.json.sugestoes.every((s) => Array.isArray(s.motivos) && typeof s.pontos === 'number'),
  'cada sugestao vem com pontos e motivo'
);
ok(
  sugestoes.json.sugestoes.every((s, i, lista) => i === 0 || lista[i - 1].pontos >= s.pontos),
  'sugestoes vem da mais forte para a mais fraca'
);
ok(
  sugestoes.json.sugestoes.every((s) => s.stage !== 'perdido'),
  'cliente perdido nao entra na sugestao'
);
ok((await api('/api/clients/sugestoes?data=ontem', { token: vendedor })).status === 400, 'data invalida recusada');

// Quem ja esta marcado no dia sai da lista: sugestao nao repete a agenda
const alvoSugerido = sugestoes.json.sugestoes[0];
if (alvoSugerido) {
  const marcado = await api('/api/events', {
    token: vendedor,
    method: 'POST',
    body: {
      title: `Visita ${alvoSugerido.company}`,
      type: 'visita',
      start: `${hoje}T16:00:00`,
      clientId: alvoSugerido.id,
    },
  });
  const depois = await api(`/api/clients/sugestoes?data=${hoje}`, { token: vendedor });
  ok(
    !depois.json.sugestoes.some((s) => s.id === alvoSugerido.id),
    'cliente ja agendado no dia sai da sugestao',
    alvoSugerido.company
  );
  ok(depois.json.naAgenda > sugestoes.json.naAgenda, 'a contagem de agendados acompanha');
  await api(`/api/events/${marcado.json.id}`, { token: vendedor, method: 'DELETE' });
}

/* -------------------------------------------------------- registro de visita */
secao('Registro de visita');

// depois de várias execuções a carteira pode estar toda fechada; então cai no primeiro
// Cliente da carteira antiga (sem prova): lead novo tem regras próprias, testadas mais abaixo
// Cliente sem venda registrada: as verificações de fechamento partem do zero
const alvo =
  clientes.json.find((c) => !c.origem && !['fechado', 'perdido'].includes(c.stage) && !(c.machines > 0)) ?? clientes.json[0];

const emTresDias = new Date(Date.now() + 3 * 86400000).toISOString();
const visitaRetorno = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'nao_atendeu', notes: 'Dono não estava.', proximoEm: emTresDias },
});
ok(visitaRetorno.status === 201, 'registrar revisita "não atendeu"');
ok(
  visitaRetorno.json?.retorno?.type === 'followup' && visitaRetorno.json.retorno.start === emTresDias,
  'data marcada pelo lojista vira o proximo follow-up',
  visitaRetorno.json?.retorno?.start?.slice(0, 10)
);
ok(visitaRetorno.json?.cliente?.stage === alvo.stage, '"não atendeu" nao mexe no funil');
ok(visitaRetorno.json?.visita?.semGps === true, 'revisita sem posicao do aparelho fica marcada como sem GPS');

const visitaFoto = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'quente', notes: 'Gostou da taxa.', fotos: [{ dataUrl: pixel }], lat: -6.36, lng: -39.3 },
});
ok(visitaFoto.json?.cliente?.temperature === 'quente', 'resultado "Quente" esquenta o lead');
ok(visitaFoto.json?.visita?.fotos?.length === 1, 'anexar foto da fachada', visitaFoto.json?.visita?.fotos?.[0]?.url);
ok((await fetch(`${BASE}${visitaFoto.json.visita.fotos[0].url}`)).ok, 'foto fica acessível na URL publicada');

const visitaFechada = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: novo.json.id, resultado: 'fechado', notes: 'Fechou na hora.', venda: { maquinas: 2, taxaOfertada: '2mm', modelo: 'pro' } },
});
ok(visitaFechada.json?.negocio?.status === 'fechado', 'visita "fechado" já abre o negócio', `${visitaFechada.json?.negocio?.maquinas} máquinas`);
ok(visitaFechada.json?.cliente?.stage === 'fechado', 'cliente vai para "fechado" no funil');

const visitasDoCliente = await api(`/api/visits?clientId=${alvo.id}`, { token: vendedor });
ok(visitasDoCliente.json?.length >= 2, 'histórico de visitas do cliente', `${visitasDoCliente.json?.length} registros`);

/* ----------------------------------------------------- propostas e vendas */
secao('Propostas, vendas e ativações');

ok(meta.json?.modelosMaquina?.smart && meta.json?.ativacao?.prazoDias > 0, 'vocabulário traz modelos de máquina e prazo de ativação', `${Object.keys(meta.json?.modelosMaquina ?? {}).join(' · ')} · ${meta.json?.ativacao?.prazoDias} dias`);

// Os testes de recusa usam um cliente sem proposta aberta: proposta aberta
// empresta tabela e modelo para a venda, e aí a venda passaria (de propósito)
const daCarteira = clientes.json.filter(
  (c) => c.id !== alvo.id && ['novo', 'contatado'].includes(c.stage) && !(c.machines > 0) && c.leadStatus !== 'fantasma'
);
const semProposta = daCarteira[0];
const outroSemVenda = daCarteira[1];
ok(Boolean(semProposta && outroSemVenda), 'há clientes sem proposta para os testes de venda', `${daCarteira.length} disponíveis`);

// Venda sem tabela de taxa não entra — nem pela visita, nem direto
const semTabela = await api('/api/visits', {
  token: vendedor, method: 'POST', body: { clientId: semProposta.id, resultado: 'fechado', venda: { maquinas: 1, modelo: 'smart' } },
});
ok(semTabela.status === 400, 'visita "Fechou" sem tabela de taxa é recusada', semTabela.json?.error);
ok(
  (await api('/api/deals', { token: vendedor, method: 'POST', body: { clientId: semProposta.id, status: 'fechado', maquinas: 1, modelo: 'smart' } })).status === 400,
  'venda direta sem tabela de taxa é recusada'
);

// A maquininha vendida é obrigatória em toda venda
const semModelo = await api('/api/deals', {
  token: vendedor, method: 'POST', body: { clientId: semProposta.id, status: 'fechado', maquinas: 1, taxaOfertada: '2mm' },
});
ok(semModelo.status === 400 && /maquininha/i.test(semModelo.json?.error ?? ''), 'venda sem o modelo da maquininha é recusada', semModelo.json?.error);
const visitaSemModelo = await api('/api/visits', {
  token: vendedor, method: 'POST', body: { clientId: semProposta.id, resultado: 'fechado', venda: { maquinas: 1, taxaOfertada: '2mm' } },
});
ok(visitaSemModelo.status === 400, 'visita "Fechou" sem o modelo é recusada', visitaSemModelo.json?.error);
const pipelineSemModelo = await api(`/api/clients/${semProposta.id}`, {
  token: vendedor, method: 'PATCH', body: { stage: 'fechado', venda: { maquinas: 1, taxaOfertada: '2mm' } },
});
ok(pipelineSemModelo.status === 400, 'mover para "fechado" no Pipeline sem o modelo é recusado', pipelineSemModelo.json?.error);

// Mover para "Fechado" no funil sem venda registrada não anda
const soEtapa = await api(`/api/clients/${semProposta.id}`, { token: vendedor, method: 'PATCH', body: { stage: 'fechado' } });
ok(soEtapa.status === 400 && soEtapa.json?.vendaNecessaria === true, 'funil não vai para "fechado" sem venda registrada', soEtapa.json?.error);

// Com a maquininha informada, o Pipeline registra a venda e o cartão anda
const pipelineComModelo = await api(`/api/clients/${outroSemVenda.id}`, {
  token: vendedor, method: 'PATCH', body: { stage: 'fechado', venda: { maquinas: 1, taxaOfertada: '2mm', modelo: 'mini' } },
});
const vendaDoPipeline = (await api(`/api/deals?clientId=${outroSemVenda.id}`, { token: vendedor })).json?.find((d) => d.status === 'fechado');
ok(
  pipelineComModelo.status === 200 && pipelineComModelo.json?.stage === 'fechado' && vendaDoPipeline?.modelo === 'mini',
  'mover para "fechado" com a maquininha registra a venda com o modelo',
  `${vendaDoPipeline?.modeloLabel} · tabela ${vendaDoPipeline?.taxaOfertada}`
);

const proposta = await api('/api/deals', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, maquinas: 2, taxaOfertada: 'geral d0', modelo: 'smart' },
});
ok(proposta.status === 201 && proposta.json?.status === 'proposta', 'enviar proposta', `${proposta.json?.modeloLabel} · ${proposta.json?.maquinas} máquinas`);
const negociosAntes = (await api(`/api/deals?clientId=${alvo.id}`, { token: vendedor })).json.length;

// A visita "Fechou" converte a proposta aberta — não nasce um segundo negócio
const fechouProposta = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'fechado', venda: { maquinas: 2, taxaOfertada: 'geral d0' } },
});
ok(fechouProposta.json?.negocio?.id === proposta.json.id, 'visita "Fechou" converte a proposta aberta em venda');
ok(
  fechouProposta.json?.negocio?.status === 'fechado' && fechouProposta.json?.negocio?.propostaAt === proposta.json.propostaAt,
  'a venda guarda a data da proposta (conversão proposta → venda)'
);
ok(
  (await api(`/api/deals?clientId=${alvo.id}`, { token: vendedor })).json.length === negociosAntes,
  'não nasce um segundo negócio ao fechar'
);
ok(fechouProposta.json?.negocio?.modeloLabel === 'Smart', 'a venda guarda o modelo da proposta');
ok(fechouProposta.json?.negocio?.series === undefined, 'número de série não existe no sistema');
ok(fechouProposta.json?.cliente?.stage === 'fechado', 'cliente vai para "fechado" ao converter a proposta');

// Pendências: vendida sem ativar aparece para o vendedor
const pend = await api('/api/deals/pendencias', { token: vendedor });
ok(pend.json?.semAtivar?.some((d) => d.id === proposta.json.id), 'venda sem ativar aparece nas pendências', `${pend.json?.totais?.semAtivar} sem ativar`);

// Ativação com data: futura não vale, antes da venda não vale
ok(
  (await api(`/api/deals/${proposta.json.id}`, { token: vendedor, method: 'PATCH', body: { status: 'ativado', data: '2999-01-01' } })).status === 400,
  'ativação com data futura é recusada'
);
ok(
  (await api(`/api/deals/${proposta.json.id}`, { token: vendedor, method: 'PATCH', body: { status: 'ativado', data: '2020-01-01' } })).status === 400,
  'ativação antes da venda é recusada'
);

const ativado = await api(`/api/deals/${proposta.json.id}`, {
  token: vendedor, method: 'PATCH', body: { status: 'ativado', data: hoje },
});
ok(ativado.json?.status === 'ativado' && ativado.json?.ativacaoAt, 'vendedor declara a ativação', ativado.json?.ativacaoAt?.slice(0, 10));
ok(ativado.json?.aguardandoConfirmacao === true && ativado.json?.ativacaoConfirmada === false, 'ativação do vendedor fica aguardando a gestão');
ok(ativado.json?.tpvRealizado === undefined, 'negocio ativado nao carrega TPV');

const dashDeclarada = await api('/api/dashboard', { token: vendedor });
ok(dashDeclarada.json?.resumo?.maquinasDeclaradas >= 2, 'declarada aparece à parte no dashboard', `${dashDeclarada.json?.resumo?.maquinasDeclaradas} declarada(s)`);
ok(dashDeclarada.json?.ativacoes?.declaradas?.some((d) => d.id === proposta.json.id), 'tela Hoje lista a ativação aguardando a gestão');
const ativadasAntes = dashDeclarada.json?.resumo?.maquinasAtivadas ?? 0;

// Gestão confirma: só então conta
ok(
  (await api(`/api/deals/${proposta.json.id}/confirmar-ativacao`, { token: vendedor, method: 'POST' })).status === 403,
  'vendedor não confirma a própria ativação'
);
const pendGestor = await api('/api/deals/pendencias?userId=todos', { token: gestor });
ok(pendGestor.json?.declaradas?.some((d) => d.id === proposta.json.id), 'ativação declarada aparece para o gestor confirmar', `${pendGestor.json?.totais?.declaradas} na fila`);
const confirmada = await api(`/api/deals/${proposta.json.id}/confirmar-ativacao`, { token: gestor, method: 'POST' });
ok(confirmada.json?.ativacaoConfirmada === true, 'gestor confirma a ativação');
ok(
  ((await api('/api/dashboard', { token: vendedor })).json?.resumo?.maquinasAtivadas ?? 0) === ativadasAntes + 2,
  'ativação confirmada soma na meta do mês',
  `${ativadasAntes} → ${ativadasAntes + 2}`
);

// Recusa devolve a máquina para "vendida"; gestor ativando já confirma
ok(
  (await api(`/api/deals/${proposta.json.id}/recusar-ativacao`, { token: gestor, method: 'POST', body: {} })).status === 400,
  'recusar ativação exige motivo'
);
const recusada = await api(`/api/deals/${proposta.json.id}/recusar-ativacao`, {
  token: gestor, method: 'POST', body: { motivo: 'terminal não consta na adquirente' },
});
ok(recusada.json?.status === 'fechado' && recusada.json?.ativacaoRecusada?.motivo, 'gestor recusa a ativação e a máquina volta para vendida');
const reativada = await api(`/api/deals/${proposta.json.id}`, { token: gestor, method: 'PATCH', body: { status: 'ativado' } });
ok(reativada.json?.ativacaoConfirmada === true, 'ativação feita pelo gestor já nasce confirmada');

// O MediaRecorder do Chrome manda "audio/webm;codecs=opus": ja descartou audio
// de visita em silencio uma vez, entao fica travado aqui.
const visitaComAudio = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: {
    clientId: alvo.id, resultado: 'interessado', notes: 'audio do smoke', // nome antigo: app desatualizado ainda envia
    audio: { dataUrl: `data:audio/webm;codecs=opus;base64,${Buffer.from('audio').toString('base64')}` },
  },
});
ok(Boolean(visitaComAudio.json?.visita?.audio?.url), 'audio gravado pelo celular e guardado', visitaComAudio.json?.visita?.audio?.url);
ok(visitaComAudio.json?.visita?.resultado === 'quente', 'resultado no formato antigo e convertido para a lista fixa');
ok((visitaComAudio.json?.avisos ?? []).length === 0, 'anexo aceito nao gera aviso');
ok((await fetch(`${BASE}${visitaComAudio.json.visita.audio.url}`)).status === 200, 'o audio abre pela URL');

const visitaAudioRuim = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'frio', audio: { dataUrl: 'data:audio/aiff;base64,QQ==' } },
});
ok(
  visitaAudioRuim.json?.visita?.audio === null && visitaAudioRuim.json?.avisos?.length === 1,
  'formato recusado vira aviso em vez de sumir calado'
);
await api(`/api/visits/${visitaComAudio.json.visita.id}`, { token: vendedor, method: 'DELETE' });
await api(`/api/visits/${visitaAudioRuim.json.visita.id}`, { token: vendedor, method: 'DELETE' });


const dashDepois = await api('/api/dashboard', { token: vendedor });
ok(
  dashDepois.json.resumo.maquinasAtivadas > dash.json.resumo.maquinasAtivadas,
  'ativação entra na meta do mês',
  `${dash.json.resumo.maquinasAtivadas} → ${dashDepois.json.resumo.maquinasAtivadas}`
);
ok(
  dashDepois.json.resumo.nivel?.label,
  'nivel do ranking acompanha as ativacoes',
  dashDepois.json.resumo.nivel?.label
);

/* ------------------------------------------------------------ KPI diário */
secao('KPI diário obrigatório');

const kpi = await api('/api/kpi', { token: vendedor });
ok(kpi.json?.campos?.length === 4, 'campos do fechamento diario');
ok(kpi.json?.calculado?.visitas >= 3, 'CRM pré-preenche com o que foi registrado', `${kpi.json?.calculado?.visitas} visitas hoje`);
ok(typeof kpi.json?.fechado === 'boolean', 'traz o estado do fechamento', kpi.json?.fechado ? 'já fechado hoje' : 'ainda aberto');

const fechamento = await api('/api/kpi', { token: vendedor, method: 'POST', body: { novosLeads: 4 } });
ok(fechamento.status === 201 || fechamento.status === 200, 'fechar o dia');
ok(fechamento.json?.registro?.novosLeads === 4, 'valor informado prevalece sobre o automático');
ok(fechamento.json?.registro?.visitas === kpi.json.calculado.visitas, 'campos em branco usam o valor do CRM');
ok((await api('/api/kpi', { token: vendedor })).json?.fechado === true, 'dia aparece como fechado');

const historico = await api('/api/kpi/historico?dias=14', { token: vendedor });
ok(historico.json?.dias?.length === 14, 'histórico de 14 dias');
ok(typeof historico.json?.diasSemFechamento === 'number', 'conta dias sem fechamento', `${historico.json?.diasSemFechamento} dias`);

/* -------------------------------------------------------------- ranking */
secao('Ranking gamificado');

const ranking = await api('/api/ranking', { token: vendedor });
ok(ranking.json?.linhas?.length === totalVendedores, 'ranking da equipe', `${totalVendedores} vendedores`);
ok(ranking.json.linhas[0].posicao === 1 && ranking.json.linhas[0].nivel?.label, 'líder e nível', `${ranking.json.linhas[0].vendedor.name} · ${ranking.json.linhas[0].nivel.emoji} ${ranking.json.linhas[0].nivel.label}`);
ok(
  ranking.json.linhas.every((l, i, arr) => i === 0 || arr[i - 1].maquinasAtivadas >= l.maquinasAtivadas),
  'ordenado por ativações'
);
ok(ranking.json?.minhaPosicao?.posicao >= 1, 'minha posição e quanto falta', `faltam ${ranking.json?.minhaPosicao?.faltamParaProximo} p/ ${ranking.json?.minhaPosicao?.proximoNivel?.label ?? 'topo'}`);

/* ------------------------------------------ biblioteca e central de objeções */
secao('Biblioteca comercial e objeções');

const lib = await api('/api/content/library', { token: vendedor });
ok(lib.json?.itens?.length >= 5, 'materiais na biblioteca', `${lib.json?.itens?.filter((i) => i.tipo === 'video').length} vídeos · ${lib.json?.itens?.filter((i) => i.tipo === 'pdf').length} PDFs`);

const obj = await api(`/api/content/objections?clientId=${alvo.id}`, { token: vendedor });
ok(obj.json?.itens?.length >= 5, 'respostas prontas', obj.json?.itens?.map((o) => o.objecao).slice(0, 3).join(' · '));
ok(!obj.json.itens.some((o) => o.resposta.includes('{')), 'marcadores substituídos pelos números do cliente');
ok(obj.json?.simulacao === undefined, 'simulacao de economia saiu das objecoes');
ok(obj.json?.taxaNewpay > 0, 'taxa da NewPay continua disponivel para o argumento', `${obj.json?.taxaNewpay}%`);

/* ------------------------------------------------------------- calendário */
secao('Calendário e agenda');

const mesAtual = await api(`/api/events?from=${mes}-01T00:00:00.000Z&to=${mes}-28T23:59:59.000Z`, { token: vendedor });
ok(mesAtual.json?.length > 0, 'visão mensal', `${mesAtual.json?.length} eventos`);
ok(mesAtual.json.every((e) => e.typeMeta?.color), 'eventos trazem a cor do tipo');

const dia = await api(`/api/events/dia/${hoje}`, { token: vendedor });
ok(dia.json?.eventos?.length > 0, 'agenda do dia', `${dia.json?.eventos?.length} compromissos`);
// procura no mês inteiro: nem todo dia tem evento corporativo
const corporativo = dia.json.eventos.find((e) => e.scope === 'corporativo')
  ?? mesAtual.json.find((e) => e.scope === 'corporativo');
ok(Boolean(corporativo), 'evento corporativo na agenda do vendedor', corporativo?.title);
ok(
  (await api(`/api/events/${corporativo.id}/confirmar`, { token: vendedor, method: 'POST', body: { status: 'confirmado' } })).json?.myConfirmation?.status === 'confirmado',
  'confirmar presença'
);
ok(
  (await api('/api/events', { token: vendedor, method: 'POST', body: { title: 'Reunião geral', type: 'reuniao', start: `${hoje}T20:00:00`, scope: 'corporativo' } })).status === 403,
  'vendedor não cria evento corporativo'
);

// A agenda inteligente saiu do produto: a rota nao existe mais na API
ok(
  (await api('/api/agenda/sugestoes', { token: vendedor })).status === 404,
  'agenda inteligente nao responde mais'
);

const tarefa = await api('/api/tasks', { token: vendedor, method: 'POST', body: { title: 'Tarefa de teste', kind: 'lembrete', dueAt: `${hoje}T17:00:00` } });
ok(tarefa.status === 201, 'criar tarefa');
ok((await api(`/api/tasks/${tarefa.json.id}`, { token: vendedor, method: 'PATCH', body: { done: true } })).json?.doneAt, 'concluir tarefa');
await api(`/api/tasks/${tarefa.json.id}`, { token: vendedor, method: 'DELETE' });

/* ------------------------------------------------ notificações e avisos */
secao('Notificações e mural');

const notif = await api('/api/notifications', { token: vendedor });
ok(notif.json?.itens?.length > 0, 'central de notificações', `${notif.json?.itens?.length} itens`);
ok(
  notif.json.itens.every((n) => n.kind && n.severity && n.title),
  'cada notificação traz tipo, severidade e título',
  [...new Set(notif.json.itens.map((n) => n.kind))].join(', ') || 'nada pendente'
);

const avisos = await api('/api/announcements', { token: vendedor });
ok(avisos.json?.length > 0, 'mural de avisos', `${avisos.json?.length} comunicados`);
const naoLido = avisos.json.find((a) => !a.read) ?? avisos.json[0];
ok((await api(`/api/announcements/${naoLido.id}/lido`, { token: vendedor, method: 'POST' })).json?.read === true, '"Li o comunicado"');

/* -------------------------------------------------------- painel do gestor */
secao('Painel do gestor');

ok((await api('/api/gestor/indicadores', { token: vendedor })).status === 403, 'vendedor não acessa o painel do gestor');

// Perfil completo de um vendedor: tudo que ele fez, numa ida ao servidor
const perfil = await api(`/api/gestor/vendedor/${login.json.user.id}/perfil`, { token: gestor });
ok(perfil.status === 200 && perfil.json?.vendedor?.id === login.json.user.id, 'perfil do vendedor para a gestão', `${perfil.json?.historico?.itens?.length} registro(s) no histórico`);
ok(
  perfil.json?.mes?.visitas >= 0 && perfil.json?.carteira?.total > 0 && perfil.json?.hoje?.placar?.meta === 30,
  'perfil traz mês, carteira e o dia de hoje',
  `${perfil.json?.mes?.visitas} visitas no mês · ${perfil.json?.carteira?.total} clientes · ${perfil.json?.hoje?.placar?.total} leads hoje`
);
ok(
  perfil.json?.hoje?.semaforo?.cor && perfil.json?.fechamento?.diasUteis > 0 && perfil.json?.conduta?.auditorias,
  'perfil traz semáforo, fechamento do dia e conduta',
  `${perfil.json?.hoje?.semaforo?.cor} · ${perfil.json?.fechamento?.fechados}/${perfil.json?.fechamento?.diasUteis} dias fechados`
);
const itensPerfil = perfil.json?.historico?.itens ?? [];
ok(itensPerfil.every((h, i) => i === 0 || new Date(itensPerfil[i - 1].at) >= new Date(h.at)), 'histórico do mais recente para o mais antigo');
ok(itensPerfil.some((h) => h.tipo === 'visita') && itensPerfil.some((h) => h.tipo === 'venda'), 'histórico junta visitas e vendas');
ok(
  (await api(`/api/gestor/vendedor/${login.json.user.id}/perfil?dias=90`, { token: gestor })).json?.historico?.dias === 90,
  'janela do histórico vai a 90 dias'
);
ok(typeof perfil.json?.historico?.truncado === 'boolean' && perfil.json?.historico?.total >= itensPerfil.length, 'histórico diz se foi cortado', `${itensPerfil.length} de ${perfil.json?.historico?.total}`);
// Follow-up concluído por visita aparece uma vez só (na visita)
const chaves = itensPerfil.map((h) => `${h.at}|${h.cliente?.id ?? ''}`);
const repetidosVisitaFollowup = itensPerfil.filter(
  (h) => h.tipo === 'followup' && itensPerfil.some((o) => o.tipo === 'visita' && o.at === h.at && o.cliente?.id === h.cliente?.id)
).length;
ok(repetidosVisitaFollowup === 0, 'revisita de follow-up não aparece duas vezes no histórico', `${chaves.length} itens`);
ok(
  (await api(`/api/gestor/vendedor/${login.json.user.id}/perfil?mes=abc`, { token: gestor })).status === 400,
  'perfil recusa mês inválido'
);
ok(
  (await api(`/api/gestor/vendedor/${login.json.user.id}/perfil?mes=${mes}`, { token: gestor })).json?.mes?.chave === mes,
  'perfil aceita mês AAAA-MM'
);
ok((await api(`/api/gestor/vendedor/${login.json.user.id}/perfil`, { token: vendedor })).status === 403, 'vendedor não abre perfil pela gestão');
ok((await api('/api/gestor/vendedor/usr_nao_existe/perfil', { token: gestor })).status === 404, 'perfil de vendedor inexistente devolve 404');
ok((await api(`/api/gestor/vendedor/${gestorLogin.json.user.id}/perfil`, { token: gestor })).status === 400, 'perfil completo é só de vendedor externo');

const visao = await api('/api/gestor/visao-geral', { token: gestor });
ok(visao.json?.equipe?.length === totalVendedores, 'agenda geral da equipe');
ok(typeof visao.json?.resumo?.kpisPendentes === 'number', 'quem ainda não fechou o dia', `${visao.json?.resumo?.kpisPendentes} pendente(s)`);

const ind = await api('/api/gestor/indicadores', { token: gestor });
const t = ind.json?.totais;
ok(t?.visitas > 0, 'indicadores do mês', `${t?.leadsGerados} leads · ${t?.visitas} visitas · ${t?.propostas} propostas · ${t?.vendas} vendas`);
ok(t?.taxaConversao >= 0, 'taxa de conversão visita→venda', `${t?.taxaConversao}%`);
ok(t?.custoPorVenda === undefined, 'painel do gestor nao mostra custo por venda (sem comissao)');
ok(t?.ticketMedioMaquinas >= 0, 'ticket medio', `${t?.ticketMedioMaquinas} maquinas por venda`);
ok(ind.json?.porCidade?.length > 0, 'vendas por cidade', ind.json?.porCidade?.slice(0, 3).map((c) => `${c.chave}:${c.maquinas}`).join(' · '));
ok(ind.json?.porSegmento?.length > 0, 'vendas por segmento', ind.json?.porSegmento?.slice(0, 3).map((c) => `${c.chave}:${c.maquinas}`).join(' · '));
ok(
  ind.json?.porVendedor?.every((v) => typeof v.disciplinaKpi === 'number'),
  'disciplina de KPI por vendedor',
  ind.json.porVendedor.map((v) => `${v.vendedor.name.split(' ')[0]}:${v.disciplinaKpi}%`).join(' · ')
);

const kpisEquipe = await api('/api/gestor/kpis?dias=7', { token: gestor });
ok(kpisEquipe.json?.equipe?.length === totalVendedores && kpisEquipe.json?.datas?.length === 7, 'grade de KPIs da equipe (7 dias)');

const muralGestor = await api('/api/announcements', { token: gestor });
ok(Array.isArray(muralGestor.json[0]?.pendingReaders), 'gestor vê quem não leu cada comunicado');

/* ---------------------------------------------- meta, follow-up e prova */
secao('Meta diária e tela Hoje');

const telaHoje = await api('/api/followups/hoje', { token: vendedor });
const placarHoje = telaHoje.json?.placar;
ok(telaHoje.status === 200 && placarHoje?.meta === 30, 'tela Hoje', `Hoje: ${placarHoje?.total}/${placarHoje?.meta} (${placarHoje?.presenciais} presenciais · ${placarHoje?.remotos} remotos)`);
ok(placarHoje?.total === placarHoje?.presenciais + placarHoje?.remotos, 'placar soma presenciais e remotos validados');
ok(placarHoje?.faltam === Math.max(0, 30 - placarHoje.total) && typeof placarHoje?.minutosRestantes === 'number', 'quanto falta e quanto tempo resta no dia', `faltam ${placarHoje?.faltam} · ${placarHoje?.minutosRestantes} min`);
ok(
  Array.isArray(telaHoje.json?.followups?.atrasados) && Array.isArray(telaHoje.json?.followups?.hoje),
  'atrasados primeiro, depois os follow-ups do dia',
  `${telaHoje.json?.followups?.atrasados?.length} atrasado(s) · ${telaHoje.json?.followups?.hoje?.length} de hoje`
);
ok(typeof telaHoje.json?.contagens?.revisitas === 'number', 'revisita e follow-up tem contagem propria', `${telaHoje.json?.contagens?.revisitas} revisitas · ${telaHoje.json?.contagens?.followupsFeitos} follow-ups feitos`);
ok(telaHoje.json?.aviso?.includes('falta grave'), 'aviso fixo de lead fantasma', telaHoje.json?.aviso);

secao('Motor de follow-up');

// Um lead só para a cadência: o de cima já foi fechado numa visita
const leadCadencia = await api('/api/clients', {
  token: vendedor, method: 'POST',
  body: leadPresencial({ company: 'Padaria da Cadência', whatsapp: '(88) 96111-0003', resultado: 'morno' }),
});
const d1 = leadCadencia.json?.followup;
ok(d1?.passo?.acao === 'whatsapp' && d1?.mensagem?.includes('NewPay'), 'D+1 traz a mensagem de comparacao de taxa pronta', d1?.mensagem?.slice(0, 60));

const semResultado = await api(`/api/followups/${d1.id}/concluir`, { token: vendedor, method: 'POST', body: { notes: 'feito' } });
ok(semResultado.status === 400, '"marcar como feito" sem resultado nao vale', semResultado.json?.error);

const naSexta = new Date(Date.now() + 5 * 86400000).toISOString();
const remarcado = await api(`/api/followups/${d1.id}/reagendar`, { token: vendedor, method: 'POST', body: { quando: naSexta } });
ok(remarcado.json?.dueAt === naSexta && remarcado.json?.marcadoPeloLojista, 'lojista marcou dia e hora: a tarefa vai para essa data');

const concluido = await api(`/api/followups/${d1.id}/concluir`, { token: vendedor, method: 'POST', body: { resultado: 'quente', notes: 'Pediu para ligar.' } });
ok(concluido.status === 200 && concluido.json?.followup?.status === 'feito', 'follow-up concluido com resultado');
ok(concluido.json?.proximo?.passo?.etapa === 'd3' && concluido.json.proximo.passo.acao === 'ligacao', 'proximo passo nasce sozinho: D+3 ligacao', concluido.json?.proximo?.dueAt?.slice(0, 10));
ok(new Date(concluido.json?.proximo?.dueAt) > new Date(naSexta), 'a cadencia se ajusta a data que o lojista marcou');
ok(concluido.json?.proximo?.roteiro?.length >= 3, 'ligacao vem com roteiro curto');

const semCnpj = await api(`/api/followups/${concluido.json.proximo.id}/concluir`, { token: vendedor, method: 'POST', body: { resultado: 'sem_cnpj' } });
ok(semCnpj.json?.proximo === null, '"Sem CNPJ" encerra a cadencia');

const atrasadoDoSeed = telaHoje.json.followups.atrasados[0];
if (atrasadoDoSeed) {
  const tentativa = await api(`/api/followups/${atrasadoDoSeed.id}/reagendar`, { token: vendedor, method: 'POST', body: { quando: naSexta } });
  ok(tentativa.status === 409, 'follow-up atrasado nao se remarca: exige resultado', tentativa.json?.error);
}
await api(`/api/clients/${leadCadencia.json.id}`, { token: vendedor, method: 'DELETE' });

secao('Lead remoto e validação anti-fantasma');

const remotoBase = { origem: 'remoto', name: 'Lojista Remoto', whatsapp: FONE_REMOTO, cnpj: CNPJ_TESTE, canal: 'whatsapp', declaracao: true };
ok(
  (await api('/api/clients', { token: vendedor, method: 'POST', body: { ...remotoBase, cnpj: '11.111.111/1111-11' } })).status === 400,
  'remoto com CNPJ invalido e recusado'
);
const semDeclaracao = await api('/api/clients', { token: vendedor, method: 'POST', body: { ...remotoBase, declaracao: false } });
ok(semDeclaracao.status === 400, 'remoto sem a declaracao e recusado', semDeclaracao.json?.error);
ok(
  (await api('/api/clients', { token: vendedor, method: 'POST', body: { ...remotoBase, canal: 'indicacao' } })).status === 400,
  'indicacao exige escolher quem indicou'
);
ok(
  (await api('/api/clients', { token: vendedor, method: 'POST', body: { ...remotoBase, whatsapp: login.json.user.phone } })).status === 409,
  'telefone de alguem da equipe nao vira lead'
);

const antesRemoto = (await api('/api/followups/placar', { token: vendedor })).json;
const remoto = await api('/api/clients', { token: vendedor, method: 'POST', body: remotoBase });
ok(remoto.status === 201, 'cadastrar lead remoto', remoto.json?.razaoSocial || remoto.json?.company);
ok(remoto.json?.leadStatus === 'pendente', 'remoto sem print fica pendente (em cinza)', remoto.json?.leadMotivo);
ok(remoto.json?.placar?.total === antesRemoto.total && remoto.json?.placar?.pendentes === antesRemoto.pendentes + 1, 'pendente nao conta na meta');
ok(remoto.json?.declaracao?.login === login.json.user.email && remoto.json?.declaracao?.at, 'declaracao gravada com data, hora e login');

ok((await api(`/api/clients/${remoto.json.id}/whatsapp`, { token: vendedor, method: 'POST' })).status === 201, '"Abrir WhatsApp" registra a hora em que a conversa comecou');

const soMensagem = await api(`/api/clients/${remoto.json.id}/print`, { token: vendedor, method: 'POST', body: { print: { dataUrl: pixel, comResposta: false } } });
ok(soMensagem.status === 400, 'print sem a resposta do lojista nao valida', soMensagem.json?.error);

const fupRemoto = (await api(`/api/clients/${remoto.json.id}`, { token: vendedor })).json.followups.find((f) => f.status === 'pendente');
const semPrint = await api(`/api/followups/${fupRemoto.id}/concluir`, { token: vendedor, method: 'POST', body: { resultado: 'morno' } });
ok(semPrint.status === 400, 'follow-up de lead remoto so conclui com print', semPrint.json?.error);

if (remoto.json?.cnpjInfo?.ok) {
  const comPrint = await api(`/api/clients/${remoto.json.id}/print`, {
    token: vendedor, method: 'POST', body: { print: { dataUrl: pixel, comResposta: true, assinatura: 'f'.repeat(64) } },
  });
  ok(comPrint.json?.leadStatus === 'validado', 'CNPJ ativo + print com resposta = lead validado', comPrint.json?.cnpjInfo?.situacao);
  ok(comPrint.json?.placar?.remotos === antesRemoto.remotos + (antesRemoto.remotosValidados < 10 ? 1 : 0), 'validado passa a contar (ate o teto de 10 remotos)');

  const recusado = await api(`/api/clients/${remoto.json.id}/recusar-print`, { token: gestor, method: 'POST', body: { motivo: 'So aparece a mensagem do vendedor' } });
  ok(recusado.json?.leadStatus === 'pendente', 'gestao recusa o print e o lead volta para pendente', recusado.json?.leadMotivo);
  ok((await api(`/api/clients/${remoto.json.id}/recusar-print`, { token: vendedor, method: 'POST', body: { motivo: 'tentativa' } })).status === 403, 'vendedor nao recusa print');
} else {
  ok(true, 'consulta a Receita indisponivel agora: lead fica pendente ate confirmar o CNPJ', remoto.json?.avisos?.[0]);
}
await api(`/api/clients/${remoto.json.id}`, { token: vendedor, method: 'DELETE' });

secao('Semáforo, alertas e ranking de leads');

ok((await api('/api/gestor/semaforo', { token: vendedor })).status === 403, 'vendedor nao ve o semaforo');
const semaforo = await api('/api/gestor/semaforo', { token: gestor });
ok(semaforo.json?.linhas?.length === totalVendedores, 'uma linha por vendedor', `${semaforo.json?.resumo?.vermelhos} vermelho(s) · ${semaforo.json?.resumo?.amarelos} amarelo(s) · ${semaforo.json?.resumo?.verdes} verde(s)`);
const ordemCor = { vermelho: 1, amarelo: 2, verde: 3, folga: 9 };
ok(
  semaforo.json.linhas.every((l, i, arr) => i === 0 || ordemCor[arr[i - 1].semaforo.cor] <= ordemCor[l.semaforo.cor]),
  'vermelhos no topo',
  semaforo.json.linhas.map((l) => `${l.vendedor.name.split(' ')[0]}:${l.semaforo.cor}`).join(' · ')
);
ok(
  semaforo.json.linhas.every((l) => l.hoje && l.semana && l.mes && typeof l.atrasados === 'number' && l.conversao?.presencial && l.conversao?.remoto && l.remotosSuspeitos && Array.isArray(l.alertas)),
  'colunas: hoje, semana, mes, atrasados, conversao por origem, suspeitos e alertas'
);
const tiposDeAlerta = [...new Set(semaforo.json.linhas.flatMap((l) => l.alertas.map((a) => a.tipo)))];
ok(tiposDeAlerta.length > 0, 'alertas de suspeita', tiposDeAlerta.join(', '));
const comFantasma = semaforo.json.linhas.find((l) => l.fantasmas > 0);
ok(!comFantasma || comFantasma.semaforo.cor === 'vermelho', 'lead fantasma confirmado pinta de vermelho', comFantasma?.vendedor?.name);

const trajeto = await api(`/api/gestor/vendedor/${login.json.user.id}/trajeto`, { token: gestor });
ok(trajeto.json?.visitas?.every((v) => v.at && 'lat' in v), 'historico do vendedor no mapa: GPS e horario de cada visita', `${trajeto.json?.visitas?.length} visitas hoje`);

const rankingLeads = await api('/api/ranking/leads?periodo=semana', { token: vendedor });
ok(rankingLeads.json?.linhas?.length === totalVendedores, 'ranking semanal por leads validados e vendas');
ok(
  rankingLeads.json.linhas.every((l, i, arr) => i === 0 || arr[i - 1].leadsValidados >= l.leadsValidados),
  'ranking ordenado por leads validados',
  rankingLeads.json.linhas.map((l) => `${l.vendedor.name.split(' ')[0]}:${l.leadsValidados}`).join(' · ')
);
ok(rankingLeads.json.linhas.every((l) => typeof l.sequencia === 'number'), 'sequencia de dias de meta completa');
ok((await api('/api/ranking/leads?periodo=dia', { token: vendedor })).json?.periodo === 'dia', 'ranking diario');

secao('Auditoria, ocorrências e termo de conduta');

const onboardingLogin = await api('/api/auth/login', { method: 'POST', body: { email: 'onboarding@newpay.com.br', password: 'newpay123' } });
const onboarding = onboardingLogin.json?.token;
ok(onboardingLogin.status === 200 && onboardingLogin.json?.user?.role === 'onboarding', 'login do onboarding', onboardingLogin.json?.user?.name);

ok((await api('/api/auditoria', { token: vendedor })).status === 403, 'vendedor nao ve o que foi sorteado');
const fila = await api('/api/auditoria', { token: onboarding });
ok(fila.status === 200 && Array.isArray(fila.json?.fila), 'fila de ligacoes do onboarding', `${fila.json?.fila?.length} para ligar`);
ok(fila.json?.regra?.remotosPorVendedor === 3 && fila.json?.regra?.presenciaisPorVendedor === 1, 'sorteio: 3 remotos e 1 presencial por vendedor');
ok((await api('/api/auditoria/sortear', { token: onboarding, method: 'POST' })).status === 403, 'so a gestao pede sorteio extra');
ok((await api('/api/clients', { token: onboarding, method: 'POST', body: leadPresencial({ whatsapp: '(88) 96111-0009' }) })).status === 403, 'onboarding nao cadastra lead');

const paraAuditar = fila.json.fila.find((a) => a.lead && a.vendedor);
if (paraAuditar) {
  ok(paraAuditar.lead.phone || paraAuditar.lead.whatsapp, 'a fila traz o telefone do lojista e quem cadastrou', `${paraAuditar.lead.company} · ${paraAuditar.vendedor.name}`);
  ok(
    (await api(`/api/auditoria/${paraAuditar.id}/resultado`, { token: onboarding, method: 'POST', body: { resultado: 'nao_reconhece' } })).status === 400,
    '"nao reconhece" exige anotar o que o lojista disse'
  );
  const negado = await api(`/api/auditoria/${paraAuditar.id}/resultado`, {
    token: onboarding, method: 'POST', body: { resultado: 'nao_reconhece', notes: 'Smoke: lojista disse que ninguem esteve na loja.' },
  });
  ok(negado.json?.ocorrencia === true, '"nao reconhece o contato" vira fantasma e abre ocorrencia');
  ok((await api(`/api/clients/${paraAuditar.lead.id}`, { token: gestor })).json?.leadStatus === 'fantasma', 'o lead passa a fantasma e sai da contagem');

  ok((await api('/api/auditoria/ocorrencias', { token: onboarding })).status === 403, 'ocorrencias: visiveis so para a gestao');
  const ocorrencias = await api('/api/auditoria/ocorrencias', { token: gestor });
  const aberta = ocorrencias.json?.ocorrencias?.find((o) => o.clientId === paraAuditar.lead.id && o.status === 'ativa');
  ok(Boolean(aberta?.lead?.cadastradoAt), 'ocorrencia guarda o lead, os prints e as datas', `${ocorrencias.json?.ocorrencias?.length} no total`);
  ok(
    (await api('/api/notifications', { token: gestor })).json.itens.some((n) => n.kind === 'lead_fantasma'),
    'gestor e avisado do lead fantasma'
  );

  // Desfaz, para a demonstracao nao acumular fantasma a cada rodada do teste
  const anulada = await api(`/api/auditoria/ocorrencias/${aberta.id}/anular`, { token: gestor, method: 'POST', body: { motivo: 'Smoke: desfazendo o teste' } });
  ok(anulada.json?.status === 'anulada', 'gestao anula a ocorrencia, com motivo gravado');
  ok((await api(`/api/clients/${paraAuditar.lead.id}`, { token: gestor })).json?.leadStatus !== 'fantasma', 'lead deixa de ser fantasma depois da anulacao');
}

const meuTermo = await api('/api/auditoria/termo', { token: vendedor });
ok(meuTermo.json?.termo?.texto && meuTermo.json?.aceito === true, 'termo de conduta vigente e aceite do vendedor', `versao ${meuTermo.json?.termo?.versao}`);
ok(login.json?.user?.termoPendente === false, 'sessao diz se falta aceitar o termo');
ok(
  (await api('/api/auditoria/termo/aceite', { token: vendedor, method: 'POST', body: { termoId: 'outro' } })).status === 409,
  'aceite so vale para a versao vigente'
);
ok((await api('/api/auditoria/termo', { token: vendedor, method: 'PUT', body: { texto: 'x'.repeat(200) } })).status === 403, 'vendedor nao publica termo');
ok((await api('/api/auditoria/termo', { token: gestor, method: 'PUT', body: { texto: 'curto' } })).status === 400, 'termo curto demais nao e publicado');
const termoGestor = await api('/api/auditoria/termo', { token: gestor });
ok(termoGestor.json?.aceites?.length === totalVendedores, 'gestao ve quem aceitou e quando');

/* ------------------------------------------------------------- exclusões */
secao('Exclusões');

const visitasDoAlvo = (await api(`/api/visits?clientId=${alvo.id}`, { token: vendedor })).json;
const delVisita = await api(`/api/visits/${visitasDoAlvo[0].id}`, { token: vendedor, method: 'DELETE' });
ok(delVisita.json?.ok, 'excluir visita registrada', `${delVisita.json?.anexosRemovidos ?? 0} anexo(s) apagado(s) do disco`);
ok(
  (await api(`/api/visits?clientId=${alvo.id}`, { token: vendedor })).json.length === visitasDoAlvo.length - 1,
  'visita sai do histórico do cliente'
);

const dealTemp = await api('/api/deals', { token: vendedor, method: 'POST', body: { clientId: alvo.id, maquinas: 1 } });
ok((await api(`/api/deals/${dealTemp.json.id}`, { token: vendedor, method: 'DELETE' })).json?.ok, 'excluir proposta');

// Cliente com maquina ativada carrega o resultado do mes: o vendedor nao apaga
const dealAtivo = await api('/api/deals', {
  token: vendedor, method: 'POST', body: { clientId: alvo.id, maquinas: 2, status: 'ativado', taxaOfertada: '2mm', modelo: 'smart' },
});
const recusa = await api(`/api/clients/${alvo.id}`, { token: vendedor, method: 'DELETE' });
ok(recusa.status === 409, 'cliente com máquina ativada é protegido', recusa.json?.error?.slice(0, 72));
ok(
  (await api(`/api/clients/${alvo.id}`, { token: gestor, method: 'DELETE' })).status === 409,
  'gestor recebe o mesmo aviso quando não força'
);
await api(`/api/deals/${dealAtivo.json.id}`, { token: vendedor, method: 'DELETE' });

// Só o gestor, e só de propósito (?forcar=1), apaga um cliente com ativação
const descartavel = await api('/api/clients', {
  token: gestor, method: 'POST', body: { company: 'Cliente Descartável', city: 'Iguatu', ownerId: login.json.user.id },
});
await api('/api/deals', {
  token: vendedor, method: 'POST', body: { clientId: descartavel.json.id, maquinas: 1, status: 'ativado', taxaOfertada: '2mm', modelo: 'mini' },
});
ok(
  (await api(`/api/clients/${descartavel.json.id}?forcar=1`, { token: vendedor, method: 'DELETE' })).status === 409,
  'vendedor não consegue forçar'
);
ok(
  (await api(`/api/clients/${descartavel.json.id}?forcar=1`, { token: gestor, method: 'DELETE' })).json?.ok,
  'gestor força a exclusão quando precisa'
);

// Exclusão em cascata do lead de teste (no dia do cadastro o vendedor ainda pode)
const delCliente = await api(`/api/clients/${novo.json.id}`, { token: vendedor, method: 'DELETE' });
ok(delCliente.json?.ok, 'excluir cliente em cascata', JSON.stringify(delCliente.json?.removidos));
ok((await api(`/api/clients/${novo.json.id}`, { token: vendedor })).status === 404, 'cliente sai da carteira');
ok(
  (await api(`/api/visits?clientId=${novo.json.id}`, { token: vendedor })).json.length === 0,
  'visitas do cliente foram removidas junto'
);
ok(
  (await api(`/api/deals?clientId=${novo.json.id}`, { token: vendedor })).json.length === 0,
  'negócios do cliente foram removidos junto'
);
ok(
  (await api(`/api/clients/cli_inexistente`, { token: vendedor, method: 'DELETE' })).status === 404,
  'excluir cliente inexistente devolve 404'
);

const avisoTemp = await api('/api/announcements', {
  token: gestor, method: 'POST', body: { title: 'Aviso de teste', body: 'Conteúdo de teste.', category: 'geral' },
});
ok(
  (await api(`/api/announcements/${avisoTemp.json.id}`, { token: vendedor, method: 'DELETE' })).status === 403,
  'vendedor não exclui comunicado'
);
ok(
  (await api(`/api/announcements/${avisoTemp.json.id}`, { token: gestor, method: 'DELETE' })).json?.ok,
  'gestor exclui comunicado do mural'
);

const tarefaTemp = await api('/api/tasks', { token: vendedor, method: 'POST', body: { title: 'Tarefa a remover', kind: 'tarefa' } });
ok((await api(`/api/tasks/${tarefaTemp.json.id}`, { token: vendedor, method: 'DELETE' })).json?.ok, 'excluir tarefa');

const eventoTemp = await api('/api/events', {
  token: vendedor, method: 'POST', body: { title: 'Compromisso a remover', type: 'visita', start: `${hoje}T19:00:00` },
});
ok((await api(`/api/events/${eventoTemp.json.id}`, { token: vendedor, method: 'DELETE' })).json?.ok, 'excluir compromisso');

/* ---------------------------------------------------------- expediente */
secao('Expediente (entrada e saida)');

// O smoke roda contra um banco em uso: fecha o que estiver aberto antes
await api('/api/jornada/saida', { token: vendedor, method: 'POST' });
ok(
  (await api('/api/jornada/saida', { token: vendedor, method: 'POST' })).status === 409,
  'nao encerra expediente que nao comecou'
);

const entrada = await api('/api/jornada/entrada', {
  token: vendedor, method: 'POST', body: { lat: -6.3594, lng: -39.2986, precisao: 12 },
});
ok(entrada.status === 201 && entrada.json?.emAndamento, 'entrada registrada');
ok(entrada.json?.inicioLocal?.lat === -6.3594 && entrada.json?.inicioLocal?.precisao === 12, 'localizacao da entrada guardada');
ok(
  (await api('/api/jornada/entrada', { token: vendedor, method: 'POST', body: {} })).status === 409,
  'nao abre dois expedientes ao mesmo tempo'
);

const painelJornada = await api('/api/jornada/equipe', { token: gestor });
ok(painelJornada.json?.emCampo >= 1, 'gestor ve quem esta em campo', `${painelJornada.json?.emCampo} em campo`);
ok((await api('/api/jornada/equipe', { token: vendedor })).status === 403, 'vendedor nao ve o painel de expediente');

// O painel devolve cada batida do vendedor: é dela que sai o pino do mapa
const batidaNoPainel = (painel, jornadaId) =>
  painel.json?.linhas
    ?.find((l) => l.vendedor.id === login.json.user.id)
    ?.registros?.find((r) => r.id === jornadaId);

const entradaNoPainel = batidaNoPainel(painelJornada, entrada.json.id);
ok(
  entradaNoPainel?.inicioLocal?.lat === -6.3594 && entradaNoPainel.inicioLocal.mapa?.includes('-6.3594'),
  'gestor ve onde o vendedor bateu a entrada, com link do mapa'
);
ok(entradaNoPainel?.inicioLocal?.impreciso === false, 'batida com GPS (12 m) nao sai marcada como imprecisa');

const saida = await api('/api/jornada/saida', { token: vendedor, method: 'POST', body: { lat: -6.36, lng: -39.3 } });
ok(saida.status === 200 && !saida.json?.emAndamento, 'saida registrada');
ok(typeof saida.json?.duracaoMin === 'number', 'duracao calculada', `${saida.json?.duracaoMin} min`);

const saidaNoPainel = batidaNoPainel(await api('/api/jornada/equipe', { token: gestor }), saida.json.id);
ok(saidaNoPainel?.fimLocal?.lat === -6.36 && Boolean(saidaNoPainel.fimLocal.mapa), 'gestor ve onde o vendedor bateu a saida');

const semGps = await api('/api/jornada/entrada', { token: vendedor, method: 'POST', body: {} });
ok(semGps.json?.inicioLocal === null, 'sem GPS o expediente abre mesmo assim, marcado');
await api('/api/jornada/saida', { token: vendedor, method: 'POST', body: {} });

// Computador sem GPS estima pelo IP: ±50 km, e o endereço pode ser outra cidade
const porIp = await api('/api/jornada/entrada', {
  token: vendedor, method: 'POST', body: { lat: -3.8195, lng: -38.5843, precisao: 50000 },
});
ok(porIp.json?.inicioLocal?.impreciso === true, 'posicao estimada (±50 km) chega marcada como imprecisa');
await api('/api/jornada/saida', { token: vendedor, method: 'POST', body: {} });

ok(
  (await api(`/api/jornada/${saida.json.id}`, { token: vendedor, method: 'PATCH', body: { justificativa: 'tentativa' } })).status === 403,
  'vendedor nao corrige o proprio ponto'
);
ok(
  (await api(`/api/jornada/${saida.json.id}`, { token: gestor, method: 'PATCH', body: { fimAt: new Date().toISOString() } })).status === 400,
  'correcao exige justificativa'
);
const corrigido = await api(`/api/jornada/${saida.json.id}`, {
  token: gestor, method: 'PATCH',
  body: { fimAt: new Date(Date.now() + 3600_000).toISOString(), justificativa: 'esqueceu de bater a saida' },
});
ok(corrigido.json?.justificativa && corrigido.json?.duracaoMin >= 60, 'gestor corrige com motivo registrado');

// Lançamento manual: o dia que ninguém bateu não tem registro para corrigir
const duasHorasAtras = new Date(Date.now() - 2 * 3600_000).toISOString();
const umaHoraAtras = new Date(Date.now() - 3600_000).toISOString();
const daquiUmaHora = new Date(Date.now() + 3600_000).toISOString();

ok(
  (await api('/api/jornada/manual', { token: vendedor, method: 'POST', body: {} })).status === 403,
  'vendedor nao lanca o proprio expediente'
);
ok(
  (await api('/api/jornada/manual', {
    token: gestor, method: 'POST',
    body: { userId: login.json.user.id, inicioAt: duasHorasAtras, fimAt: umaHoraAtras },
  })).status === 400,
  'lancamento exige justificativa'
);
ok(
  (await api('/api/jornada/manual', {
    token: gestor, method: 'POST',
    body: { userId: login.json.user.id, inicioAt: umaHoraAtras, fimAt: duasHorasAtras, justificativa: 'invertido de proposito' },
  })).status === 400,
  'lancamento com fim antes do inicio recusado'
);
ok(
  (await api('/api/jornada/manual', {
    token: gestor, method: 'POST',
    body: { userId: login.json.user.id, inicioAt: daquiUmaHora, justificativa: 'expediente do futuro' },
  })).status === 400,
  'nao lanca expediente no futuro'
);

const lancado = await api('/api/jornada/manual', {
  token: gestor, method: 'POST',
  body: {
    userId: login.json.user.id,
    inicioAt: duasHorasAtras,
    fimAt: umaHoraAtras,
    justificativa: 'celular sem bateria, trabalhou o dia todo',
  },
});
ok(lancado.status === 201 && lancado.json?.duracaoMin === 60, 'gestor lanca expediente que nao foi batido', `${lancado.json?.duracaoMin} min`);
ok(Boolean(lancado.json?.lancadoPor), 'lancamento fica marcado como feito pela gestao');

const painelDepois = await api('/api/jornada/equipe', { token: gestor });
const linhaVendedor = painelDepois.json?.linhas?.find((l) => l.vendedor.id === login.json.user.id);
ok(
  linhaVendedor?.registros?.some((r) => r.id === lancado.json.id),
  'painel de ponto traz as batidas do dia com id para corrigir'
);

/* ------------------------------------------------ biblioteca comercial */
secao('Manutencao da biblioteca');

const bibliotecaAntes = (await api('/api/content/library', { token: vendedor })).json.itens.length;

ok(
  (await api('/api/content/library', { token: vendedor, method: 'POST', body: { titulo: 'Tentativa', url: 'http://x' } })).status === 403,
  'vendedor nao publica material'
);

const material = await api('/api/content/library', {
  token: gestor, method: 'POST',
  body: { titulo: `Tabela de taxas ${Date.now()}`, tipo: 'link', categoria: 'Taxas', url: 'https://newpay.com.br/taxas' },
});
ok(material.status === 201, 'gestor publica material para a equipe');
ok(material.json?.categoria === 'taxas', 'categoria normalizada em minuscula');
ok(
  (await api('/api/content/library', { token: gestor, method: 'POST', body: { url: 'https://x' } })).status === 400,
  'material sem titulo e recusado'
);
ok(
  (await api('/api/content/library', { token: gestor, method: 'POST', body: { titulo: 'So o titulo' } })).status === 400,
  'material sem link nem arquivo e recusado'
);
ok(
  (await api('/api/content/library', { token: vendedor })).json.itens.length === bibliotecaAntes + 1,
  'o vendedor ja ve o material novo'
);

const editado = await api(`/api/content/library/${material.json.id}`, {
  token: gestor, method: 'PATCH', body: { titulo: 'Tabela de taxas revisada' },
});
ok(editado.json?.titulo === 'Tabela de taxas revisada', 'gestor edita o material');
ok(editado.json?.url === 'https://newpay.com.br/taxas', 'link e preservado quando nao muda');

// PDF enviado pelo gestor vai para o disco e volta pela URL publica
const pdfFalso = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 smoke').toString('base64')}`;
const comPdf = await api('/api/content/library', {
  token: gestor, method: 'POST', body: { titulo: 'Apresentacao do smoke', tipo: 'pdf', arquivo: pdfFalso },
});
ok(comPdf.json?.url?.startsWith('/uploads/'), 'aceita PDF enviado', comPdf.json?.url);
ok((await fetch(`${BASE}${comPdf.json.url}`)).status === 200, 'o PDF publicado abre pela URL');

ok(
  (await api(`/api/content/library/${material.json.id}`, { token: vendedor, method: 'DELETE' })).status === 403,
  'vendedor nao apaga material'
);
const apagado = await api(`/api/content/library/${comPdf.json.id}`, { token: gestor, method: 'DELETE' });
ok(apagado.json?.arquivoApagado === true, 'apagar material leva o arquivo do disco junto');
ok((await fetch(`${BASE}${comPdf.json.url}`)).status === 404, 'o arquivo sai do servidor');
await api(`/api/content/library/${material.json.id}`, { token: gestor, method: 'DELETE' });
ok(
  (await api('/api/content/library', { token: vendedor })).json.itens.length === bibliotecaAntes,
  'biblioteca volta ao tamanho original'
);

/* ------------------------------------------------- cadastro da equipe */
secao('Cadastro da equipe e senhas');

ok((await api('/api/users', { token: vendedor })).status === 403, 'vendedor nao acessa o cadastro da equipe');

const equipeToda = await api('/api/users', { token: gestor });
ok(equipeToda.status === 200 && equipeToda.json.length >= 5, 'gestor lista a equipe', `${equipeToda.json.length} pessoas`);
ok(equipeToda.json.every((u) => u.password === undefined && u.passwordVersion === undefined), 'listagem nao devolve hash nem versao de senha');

const emailNovo = `smoke_${Date.now()}@newpay.com.br`;
const admitido = await api('/api/users', {
  token: gestor, method: 'POST',
  body: { name: 'Vendedor do Smoke', email: emailNovo, city: 'Iguatu', dailyGoal: 6 },
});
ok(admitido.status === 201 && admitido.json?.senhaProvisoria, 'gestor admite vendedor com senha provisoria');
ok(admitido.json?.user?.mustChangePassword === true, 'novo acesso nasce exigindo troca de senha');

ok(
  (await api('/api/users', { token: gestor, method: 'POST', body: { name: 'Repetido', email: emailNovo } })).status === 409,
  'e-mail repetido e recusado'
);
ok(
  (await api('/api/users', { token: gestor, method: 'POST', body: { name: 'Senha Fraca', email: `f${Date.now()}@n.com.br`, senha: '123' } })).status === 400,
  'senha curta e recusada'
);

const primeiroAcesso = await api('/api/auth/login', { method: 'POST', body: { email: emailNovo, password: admitido.json.senhaProvisoria } });
ok(primeiroAcesso.status === 200, 'entra com a senha provisoria');
const tokenNovo = primeiroAcesso.json.token;

ok(
  (await api('/api/auth/senha', { token: tokenNovo, method: 'POST', body: { atual: 'chute', nova: 'senha-nova-2026' } })).status === 400,
  'troca de senha exige a senha atual'
);
const trocou = await api('/api/auth/senha', {
  token: tokenNovo, method: 'POST',
  body: { atual: admitido.json.senhaProvisoria, nova: 'senha-nova-2026' },
});
ok(trocou.json?.user?.mustChangePassword === false, 'troca de senha libera o acesso');
ok(
  (await api('/api/auth/login', { method: 'POST', body: { email: emailNovo, password: admitido.json.senhaProvisoria } })).status === 401,
  'senha provisoria para de valer depois da troca'
);

// Sessao aberta cai quando a senha muda: e assim que celular perdido perde acesso
ok(trocou.json?.token && trocou.json.token !== tokenNovo, 'troca de senha devolve token novo');
ok((await api('/api/auth/me', { token: trocou.json.token })).status === 200, 'quem trocou continua logado');
ok((await api('/api/auth/me', { token: tokenNovo })).status === 401, 'sessao aberta antes da troca deixa de valer');

const sessaoParaDerrubar = (await api('/api/auth/login', { method: 'POST', body: { email: emailNovo, password: 'senha-nova-2026' } })).json.token;
const resetada = await api(`/api/users/${admitido.json.user.id}/senha`, { token: gestor, method: 'POST' });
ok(resetada.json?.senhaProvisoria, 'gestor reseta a senha de quem esqueceu');
ok((await api('/api/auth/me', { token: sessaoParaDerrubar })).status === 401, 'reset do gestor derruba a sessao aberta');
ok(
  (await api(`/api/users/${admitido.json.user.id}`, { token: gestor, method: 'PATCH', body: { active: false } })).json?.active === false,
  'gestor inativa o acesso'
);
ok(
  (await api('/api/auth/login', { method: 'POST', body: { email: emailNovo, password: resetada.json.senhaProvisoria } })).status === 403,
  'inativo nao entra mais'
);
ok(
  (await api(`/api/users/${gestorLogin.json.user.id}`, { token: gestor, method: 'PATCH', body: { active: false } })).status === 400,
  'gestor nao inativa a propria conta'
);

// Remocao de pessoa: para cadastro errado; quem saiu da empresa se inativa
const pessoaDescartavel = await api('/api/users', {
  token: gestor, method: 'POST',
  body: { name: 'Cadastro Errado do Smoke', email: `errado_${Date.now()}@newpay.com.br` },
});
const previa = await api(`/api/users/${pessoaDescartavel.json.user.id}/remocao`, { token: gestor });
ok(previa.json?.total === 0, 'previa de remocao: cadastro novo nao tem nada preso');
ok(previa.json?.destinos?.length > 0, 'previa lista para quem transferir a carteira');
ok(
  (await api(`/api/users/${pessoaDescartavel.json.user.id}`, { token: gestor, method: 'DELETE' })).status === 200,
  'gestor remove cadastro sem historico'
);
ok(
  (await api('/api/users', { token: gestor })).json.every((u) => u.id !== pessoaDescartavel.json.user.id),
  'removido some da equipe'
);

const comCarteira = await api('/api/users', {
  token: gestor, method: 'POST',
  body: { name: 'Vendedor Com Carteira', email: `carteira_${Date.now()}@newpay.com.br` },
});
const clienteDele = await api('/api/clients', {
  token: gestor, method: 'POST',
  body: { company: `Cliente Transferido ${Date.now()}`, city: 'Iguatu', ownerId: comCarteira.json.user.id },
});
const barrado = await api(`/api/users/${comCarteira.json.user.id}`, { token: gestor, method: 'DELETE' });
ok(barrado.status === 409, 'quem tem carteira nao some sem decisao', barrado.json?.error?.slice(0, 48));
ok(barrado.json?.itens?.some((i) => i.tabela === 'clients'), 'a recusa diz o que esta preso');

const transferido = await api(
  `/api/users/${comCarteira.json.user.id}?transferirPara=${login.json.user.id}`,
  { token: gestor, method: 'DELETE' }
);
ok(transferido.json?.transferidos?.clients === 1, 'remocao com transferencia move a carteira');
ok(
  (await api(`/api/clients/${clienteDele.json.id}`, { token: vendedor })).json?.ownerId === login.json.user.id,
  'o cliente ficou com quem recebeu'
);
await api(`/api/clients/${clienteDele.json.id}?forcar=1`, { token: gestor, method: 'DELETE' });

ok(
  (await api(`/api/users/${gestorLogin.json.user.id}`, { token: gestor, method: 'DELETE' })).status === 400,
  'gestor nao remove a propria conta'
);
ok(
  (await api(`/api/users/${login.json.user.id}`, { token: vendedor, method: 'DELETE' })).status === 403,
  'vendedor nao remove ninguem'
);

// Importacao da carteira: o gestor cadastra direto para o vendedor
const importado = await api('/api/clients', {
  token: gestor, method: 'POST',
  body: { company: `Cliente Importado ${Date.now()}`, city: 'Iguatu', ownerId: login.json.user.id },
});
ok(importado.status === 201 && importado.json.ownerId === login.json.user.id, 'gestor cadastra cliente na carteira do vendedor');
const tentativa = await api('/api/clients', {
  token: vendedor, method: 'POST',
  body: { company: `Tentativa ${Date.now()}`, ownerId: gestorLogin.json.user.id },
});
ok(tentativa.status === 403, 'vendedor nao joga cliente na carteira alheia', tentativa.json?.error);
await api(`/api/clients/${importado.json.id}?forcar=1`, { token: gestor, method: 'DELETE' });

/* ------------------------------------- carteira e visitas vistas pela gestao */
secao('Carteira e visitas vistas pela gestao');

const carteiraEquipe = await api('/api/clients', { token: gestor });
const donos = new Set((carteiraEquipe.json ?? []).map((c) => c.ownerId));
ok(donos.size > 1, 'gestor sem filtro ve a carteira da equipe inteira', `${carteiraEquipe.json?.length} clientes de ${donos.size} carteiras`);
ok(carteiraEquipe.json.every((c) => c.owner?.name), 'cada cliente diz quem e o responsavel');
ok(
  (await api(`/api/clients?userId=${login.json.user.id}`, { token: gestor })).json.every((c) => c.ownerId === login.json.user.id),
  'gestor filtra a carteira de um vendedor'
);
ok(
  (await api('/api/clients?userId=todos', { token: vendedor })).json.every((c) => c.ownerId === login.json.user.id),
  'vendedor nao enxerga carteira alheia nem pedindo "todos"'
);
ok(
  new Set((await api('/api/clients/mapa?raio=50', { token: gestor })).json.pontos.map((p) => p.ownerId)).size > 1,
  'mapa da gestao mistura as carteiras'
);

const visitasEquipe = await api('/api/visits?limite=500', { token: gestor });
ok(new Set(visitasEquipe.json.map((v) => v.userId)).size > 1, 'gestor sem filtro ve as visitas da equipe inteira', `${visitasEquipe.json.length} visitas`);
ok(visitasEquipe.json.every((v) => v.user?.name && typeof v.semGps === 'boolean'), 'cada visita traz o vendedor e a marcacao de GPS');
ok(
  (await api('/api/visits?userId=todos&limite=500', { token: vendedor })).json.every((v) => v.userId === login.json.user.id),
  'vendedor nao enxerga visita alheia nem pedindo "todos"'
);
const seteDiasAtras = new Date(Date.now() - 6 * 86400000);
const daSemana = await api(`/api/visits?de=${seteDiasAtras.toISOString().slice(0, 10)}&ate=${hoje}&limite=500`, { token: gestor });
ok(
  daSemana.json.length <= visitasEquipe.json.length &&
    daSemana.json.every((v) => new Date(v.at) >= new Date(seteDiasAtras.getTime() - 86400000)),
  'filtro por periodo das visitas',
  `${daSemana.json.length} na semana`
);
ok(
  (await api('/api/visits?resultado=fechado&limite=500', { token: gestor })).json.every((v) => v.resultado === 'fechado'),
  'filtro por resultado das visitas'
);

// Transferencia de carteira: o que a gestao cadastrou para si vai para o vendedor
const paraTransferir = await api('/api/clients', {
  token: gestor, method: 'POST',
  body: { company: `Cliente Para Transferir ${Date.now()}`, city: 'Iguatu' },
});
ok(paraTransferir.json?.ownerId === gestorLogin.json.user.id, 'sem vendedor escolhido, o cliente fica na carteira do gestor');
ok((await api(`/api/clients/${paraTransferir.json.id}`, { token: vendedor })).status === 403, 'antes da transferencia o vendedor nao abre o cliente');
ok(
  (await api(`/api/clients/${paraTransferir.json.id}/transferir`, { token: vendedor, method: 'POST', body: { ownerId: login.json.user.id } })).status === 403,
  'vendedor nao transfere cliente'
);
await api(`/api/clients/${paraTransferir.json.id}/agendar-retorno`, { token: gestor, method: 'POST', body: { date: emTresDias } });
const transf = await api(`/api/clients/${paraTransferir.json.id}/transferir`, {
  token: gestor, method: 'POST', body: { ownerId: login.json.user.id },
});
ok(transf.status === 200 && transf.json?.ownerId === login.json.user.id, 'gestor transfere o cliente para o vendedor', JSON.stringify(transf.json?.transferidos));
ok(transf.json?.transferidos?.followups === 1, 'o follow-up pendente vai junto');
const fichaTransferida = await api(`/api/clients/${paraTransferir.json.id}`, { token: vendedor });
ok(fichaTransferida.json?.ownerId === login.json.user.id, 'o cliente passa a abrir na carteira do vendedor');
ok(
  fichaTransferida.json?.followups?.some((f) => f.status === 'pendente' && f.userId === login.json.user.id),
  'o follow-up ficou com quem recebeu o cliente'
);
ok(
  (await api(`/api/clients/${paraTransferir.json.id}/transferir`, { token: gestor, method: 'POST', body: { ownerId: login.json.user.id } })).status === 409,
  'transferir para quem ja tem o cliente devolve 409'
);
ok(
  (await api(`/api/clients/${paraTransferir.json.id}/transferir`, { token: gestor, method: 'POST', body: { ownerId: 'usr_nao_existe' } })).status === 400,
  'destino inexistente e recusado'
);
await api(`/api/clients/${paraTransferir.json.id}?forcar=1`, { token: gestor, method: 'DELETE' });

// Tarefa deixada pela gestao na agenda do vendedor
const tarefaDele = await api('/api/tasks', {
  token: gestor, method: 'POST',
  body: { title: 'Ligar para o lojista', ownerId: login.json.user.id, dueAt: new Date().toISOString() },
});
ok(tarefaDele.status === 201 && tarefaDele.json?.ownerId === login.json.user.id, 'gestor deixa tarefa na agenda do vendedor');
ok(
  (await api('/api/tasks', { token: vendedor, method: 'POST', body: { title: 'x', ownerId: gestorLogin.json.user.id } })).status === 403,
  'vendedor nao cria tarefa para outra pessoa'
);
await api(`/api/tasks/${tarefaDele.json.id}`, { token: gestor, method: 'DELETE' });

console.log(`\n${falhas === 0 ? '✔ Tudo certo.' : `✖ ${falhas} verificação(ões) falharam.`}\n`);
process.exit(falhas === 0 ? 0 : 1);
