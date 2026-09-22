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
  body: { clientId: novo.json.id, resultado: 'fechado', notes: 'Fechou na hora.', venda: { maquinas: 2, taxaOfertada: '2mm' } },
});
ok(visitaFechada.json?.negocio?.status === 'fechado', 'visita "fechado" já abre o negócio', `${visitaFechada.json?.negocio?.maquinas} máquinas`);
ok(visitaFechada.json?.cliente?.stage === 'fechado', 'cliente vai para "fechado" no funil');

const visitasDoCliente = await api(`/api/visits?clientId=${alvo.id}`, { token: vendedor });
ok(visitasDoCliente.json?.length >= 2, 'histórico de visitas do cliente', `${visitasDoCliente.json?.length} registros`);

/* ----------------------------------------------------- propostas e vendas */
secao('Propostas, vendas e ativações');

const proposta = await api('/api/deals', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, maquinas: 1, taxaOfertada: 'geral d0' },
});
ok(proposta.status === 201 && proposta.json?.status === 'proposta', 'enviar proposta');

const ativado = await api(`/api/deals/${proposta.json.id}`, { token: vendedor, method: 'PATCH', body: { status: 'ativado' } });
ok(ativado.json?.status === 'ativado' && ativado.json?.ativacaoAt, 'ativar a máquina');
ok(ativado.json?.tpvRealizado === undefined, 'negocio ativado nao carrega TPV');

// O MediaRecorder do Chrome manda "audio/webm;codecs=opus": ja descartou audio
// de visita em silencio uma vez, entao fica travado aqui.
const visitaComAudio = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: {
    clientId: alvo.id, resultado: 'interessado', notes: 'audio do smoke',
    audio: { dataUrl: `data:audio/webm;codecs=opus;base64,${Buffer.from('audio').toString('base64')}` },
  },
});
ok(Boolean(visitaComAudio.json?.visita?.audio?.url), 'audio gravado pelo celular e guardado', visitaComAudio.json?.visita?.audio?.url);
ok((visitaComAudio.json?.avisos ?? []).length === 0, 'anexo aceito nao gera aviso');
ok((await fetch(`${BASE}${visitaComAudio.json.visita.audio.url}`)).status === 200, 'o audio abre pela URL');

const visitaAudioRuim = await api('/api/visits', {
  token: vendedor, method: 'POST',
  body: { clientId: alvo.id, resultado: 'nao_interessado', audio: { dataUrl: 'data:audio/aiff;base64,QQ==' } },
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

const saida = await api('/api/jornada/saida', { token: vendedor, method: 'POST', body: { lat: -6.36, lng: -39.3 } });
ok(saida.status === 200 && !saida.json?.emAndamento, 'saida registrada');
ok(typeof saida.json?.duracaoMin === 'number', 'duracao calculada', `${saida.json?.duracaoMin} min`);

const semGps = await api('/api/jornada/entrada', { token: vendedor, method: 'POST', body: {} });
ok(semGps.json?.inicioLocal === null, 'sem GPS o expediente abre mesmo assim, marcado');
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

console.log(`\n${falhas === 0 ? '✔ Tudo certo.' : `✖ ${falhas} verificação(ões) falharam.`}\n`);
process.exit(falhas === 0 ? 0 : 1);
