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

ok((await api('/api/events')).status === 401, 'rota protegida sem token devolve 401');

const meta = await api('/api/meta', { token: vendedor });
ok(Object.keys(meta.json?.segmentos ?? {}).length === 10, 'vocabulário traz os 10 segmentos');
ok(Object.keys(meta.json?.maquinas ?? {}).length >= 9, 'lista de máquinas concorrentes');
ok(meta.json?.niveis?.length === 5, 'níveis do ranking', meta.json.niveis.map((n) => n.label).join(' < '));
ok(meta.json?.kpisDiarios?.length === 5, 'os 5 KPIs diários obrigatórios');

/* -------------------------------------------------------------- dashboard */
secao('Dashboard do vendedor');

const dash = await api('/api/dashboard', { token: vendedor });
ok(dash.status === 200, 'GET /api/dashboard');
ok(dash.json?.resumo?.meta?.metaMaquinas > 0, 'meta do mês definida', `${dash.json?.resumo?.meta?.metaMaquinas} máquinas`);
ok(
  typeof dash.json?.resumo?.comissao?.total === 'number',
  'comissão acumulada calculada',
  `R$ ${dash.json?.resumo?.comissao?.total?.toLocaleString('pt-BR')} (${dash.json?.resumo?.maquinasAtivadas} ativações)`
);
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

const novo = await api('/api/clients', {
  token: vendedor, method: 'POST',
  body: {
    name: 'Cliente Teste', company: 'Mercadinho Teste', segment: 'mercadinho',
    cnpj: '12.345.678/0001-99', phone: '(88) 99999-0000', city: 'Iguatu',
  },
});
ok(novo.status === 201, 'cadastrar cliente novo em campo');
ok(novo.json?.stage === 'novo' && novo.json?.temperature === 'frio', 'cliente novo entra como lead frio');

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
ok(diag.json?.tpvEstimado > 0, 'TPV estimado pelo diagnóstico', `R$ ${diag.json?.tpvEstimado?.toLocaleString('pt-BR')}`);
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

/* -------------------------------------------------------- registro de visita */
secao('Registro de visita');

// depois de várias execuções a carteira pode estar toda fechada; então cai no primeiro
const alvo = clientes.json.find((c) => !['fechado', 'perdido'].includes(c.stage)) ?? clientes.json[0];

const visitaRetorno = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'retornar', notes: 'Dono não estava.', retornarEmDias: 3 },
});
ok(visitaRetorno.status === 201, 'registrar visita "retornar depois"');
ok(visitaRetorno.json?.retorno?.type === 'followup', 'retorno vira compromisso na agenda', visitaRetorno.json?.retorno?.start?.slice(0, 10));
ok(visitaRetorno.json?.cliente?.stage === 'contatado', 'visita move o cliente no funil');

// Foto de 1x1 px só para validar o anexo
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const visitaFoto = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'interessado', notes: 'Gostou da taxa.', fotos: [{ dataUrl: pixel }] },
});
ok(visitaFoto.json?.visita?.fotos?.length === 1, 'anexar foto da fachada', visitaFoto.json?.visita?.fotos?.[0]?.url);
ok((await fetch(`${BASE}${visitaFoto.json.visita.fotos[0].url}`)).ok, 'foto fica acessível na URL publicada');

const visitaFechada = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: novo.json.id, resultado: 'fechado', notes: 'Fechou na hora.', venda: { maquinas: 2, taxaOfertada: 1.89 } },
});
ok(visitaFechada.json?.negocio?.status === 'fechado', 'visita "fechado" já abre o negócio', `${visitaFechada.json?.negocio?.maquinas} máquinas`);
ok(visitaFechada.json?.cliente?.stage === 'fechado', 'cliente vai para "fechado" no funil');

const visitasDoCliente = await api(`/api/visits?clientId=${alvo.id}`, { token: vendedor });
ok(visitasDoCliente.json?.length >= 2, 'histórico de visitas do cliente', `${visitasDoCliente.json?.length} registros`);

/* ----------------------------------------------------- propostas e vendas */
secao('Propostas, vendas e ativações');

const proposta = await api('/api/deals', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, maquinas: 1, taxaOfertada: 1.99 },
});
ok(proposta.status === 201 && proposta.json?.status === 'proposta', 'enviar proposta');

const ativado = await api(`/api/deals/${proposta.json.id}`, { token: vendedor, method: 'PATCH', body: { status: 'ativado' } });
ok(ativado.json?.status === 'ativado' && ativado.json?.ativacaoAt, 'ativar a máquina');
ok(ativado.json?.tpvRealizado > 0, 'ativação passa a contar TPV', `R$ ${ativado.json?.tpvRealizado?.toLocaleString('pt-BR')}`);

const dashDepois = await api('/api/dashboard', { token: vendedor });
ok(
  dashDepois.json.resumo.maquinasAtivadas > dash.json.resumo.maquinasAtivadas,
  'ativação entra na meta do mês',
  `${dash.json.resumo.maquinasAtivadas} → ${dashDepois.json.resumo.maquinasAtivadas}`
);
ok(
  dashDepois.json.resumo.comissao.total > dash.json.resumo.comissao.total,
  'comissão sobe junto',
  `R$ ${dash.json.resumo.comissao.total} → R$ ${dashDepois.json.resumo.comissao.total}`
);

/* ------------------------------------------------------------ KPI diário */
secao('KPI diário obrigatório');

const kpi = await api('/api/kpi', { token: vendedor });
ok(kpi.json?.campos?.length === 5, 'campos do fechamento diário');
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
ok(ranking.json?.linhas?.length === 4, 'ranking da equipe');
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
ok(obj.json?.simulacao?.economiaMensal >= 0, 'simulação de economia para o cliente', `R$ ${obj.json?.simulacao?.economiaMensal?.toLocaleString('pt-BR')}/mês`);

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

const sug = await api('/api/agenda/sugestoes', { token: vendedor });
ok(
  Array.isArray(sug.json?.sugeridos) && Array.isArray(sug.json?.grupos),
  'sugestões de visita',
  sug.json?.destaque?.texto ?? `carteira toda agendada hoje (${sug.json?.agendadosHoje} clientes)`
);
// Se a carteira já está toda agendada, a rota é montada com a própria carteira
const base = sug.json.sugeridos.length ? sug.json.sugeridos : clientes.json;
const ids = base.slice(0, 4).map((s) => s.id);
const rota = await api('/api/agenda/rota', { token: vendedor, method: 'POST', body: { clientIds: ids } });
ok(rota.json?.paradas?.length === ids.length, 'montar rota', `${rota.json?.totalKm} km · ${rota.json?.minutosTotais} min`);
ok(rota.json?.mapsUrl?.startsWith('https://www.google.com/maps'), 'link do Google Maps');

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

const visao = await api('/api/gestor/visao-geral', { token: gestor });
ok(visao.json?.equipe?.length === 4, 'agenda geral da equipe');
ok(typeof visao.json?.resumo?.kpisPendentes === 'number', 'quem ainda não fechou o dia', `${visao.json?.resumo?.kpisPendentes} pendente(s)`);

const ind = await api('/api/gestor/indicadores', { token: gestor });
const t = ind.json?.totais;
ok(t?.visitas > 0, 'indicadores do mês', `${t?.leadsGerados} leads · ${t?.visitas} visitas · ${t?.propostas} propostas · ${t?.vendas} vendas`);
ok(t?.taxaConversao >= 0, 'taxa de conversão visita→venda', `${t?.taxaConversao}%`);
ok(t?.custoPorVenda >= 0, 'custo comercial por venda', `R$ ${t?.custoPorVenda?.toLocaleString('pt-BR')}`);
ok(t?.ticketMedioMaquinas >= 0, 'ticket médio', `${t?.ticketMedioMaquinas} máquinas · R$ ${t?.ticketMedioTPV?.toLocaleString('pt-BR')} de TPV`);
ok(ind.json?.porCidade?.length > 0, 'vendas por cidade', ind.json?.porCidade?.slice(0, 3).map((c) => `${c.chave}:${c.maquinas}`).join(' · '));
ok(ind.json?.porSegmento?.length > 0, 'vendas por segmento', ind.json?.porSegmento?.slice(0, 3).map((c) => `${c.chave}:${c.maquinas}`).join(' · '));
ok(
  ind.json?.porVendedor?.every((v) => typeof v.disciplinaKpi === 'number'),
  'disciplina de KPI por vendedor',
  ind.json.porVendedor.map((v) => `${v.vendedor.name.split(' ')[0]}:${v.disciplinaKpi}%`).join(' · ')
);

const kpisEquipe = await api('/api/gestor/kpis?dias=7', { token: gestor });
ok(kpisEquipe.json?.equipe?.length === 4 && kpisEquipe.json?.datas?.length === 7, 'grade de KPIs da equipe (7 dias)');

const muralGestor = await api('/api/announcements', { token: gestor });
ok(Array.isArray(muralGestor.json[0]?.pendingReaders), 'gestor vê quem não leu cada comunicado');

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

// Cliente com máquina ativada carrega comissão: o vendedor não pode apagar
const dealAtivo = await api('/api/deals', {
  token: vendedor, method: 'POST', body: { clientId: alvo.id, maquinas: 2, status: 'ativado' },
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
  token: vendedor, method: 'POST', body: { company: 'Cliente Descartável', city: 'Iguatu' },
});
await api('/api/deals', {
  token: vendedor, method: 'POST', body: { clientId: descartavel.json.id, maquinas: 1, status: 'ativado' },
});
ok(
  (await api(`/api/clients/${descartavel.json.id}?forcar=1`, { token: vendedor, method: 'DELETE' })).status === 409,
  'vendedor não consegue forçar'
);
ok(
  (await api(`/api/clients/${descartavel.json.id}?forcar=1`, { token: gestor, method: 'DELETE' })).json?.ok,
  'gestor força a exclusão quando precisa'
);

// Exclusão em cascata do cliente de teste
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

console.log(`\n${falhas === 0 ? '✔ Tudo certo.' : `✖ ${falhas} verificação(ões) falharam.`}\n`);
process.exit(falhas === 0 ? 0 : 1);
