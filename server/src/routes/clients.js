// Cadastro de clientes e leads, diagnóstico comercial, funil e mapa.
//
// Lead novo entra com prova: presencial (GPS, horário e foto da fachada) ou
// remoto (CNPJ ativo, declaração e print da conversa). Só a gestão cadastra
// sem prova — é o caminho da importação da carteira — e esse cadastro não
// conta na meta de ninguém.

import { Router } from 'express';
import { find, id, insert, logActivity, remove, table, update } from '../store.js';
import { isManager, requireAuth } from '../auth.js';
import {
  CANAIS_REMOTO, DECLARACAO_REMOTO, FATURAMENTOS, FUNIL, MAQUINAS, META_LEADS, ORIGENS_LEAD,
  RESULTADOS_VISITA, RETURN_PRESETS, SEGMENTOS,
  avaliarVisita, calcularScore, resultadoVisita, temperaturaPorScore,
} from '../domain.js';
import { expandEvent, userCard } from '../serializers.js';
import { haversine } from '../lib/geo.js';
import { removerAnexosDaVisita, removerArquivo, salvarDataUrl } from '../lib/uploads.js';
import { addDays, atHour, dateKey, daysBetween, endOfDay, startOfDay } from '../lib/dates.js';
import { cnpjValido, consultarCnpj, formatarCnpj, motivoRecusaCnpj } from '../lib/cnpj.js';
import {
  buscarDuplicado, ehLead, motivoDoStatus, placarDoDia, soDigitos, statusDoLead, statusMeta, telefoneChave, telefoneValido,
  tentarValidar,
} from '../leads.js';
import {
  aplicarResultado, expandirFollowup, gerarProximo, passoDaEtapa, pendenteDoCliente,
  reagendarFollowup, salvarPrint,
} from '../followups.js';
import { termoPendente } from '../auditoria.js';
import { expandirNegocio, faltaNaVenda, negocioAberto, temVenda } from '../vendas.js';

const router = Router();
router.use(requireAuth);

const enriquecer = (c, agora = new Date()) => {
  const status = statusDoLead(c, agora);
  return {
    ...c,
    diasSemContato: daysBetween(c.lastContactAt),
    segmentoLabel: SEGMENTOS[c.segment] ?? c.segment,
    stageMeta: FUNIL[c.stage] ?? FUNIL.novo,
    // Status do lead na meta: validado, pendente, suspeito ou fantasma
    leadStatus: status,
    leadStatusMeta: statusMeta(status),
    leadMotivo: motivoDoStatus(c, agora),
    origemLabel: ORIGENS_LEAD[c.origem]?.label ?? null,
    // Quem cuida do cliente: a gestão vê a carteira da equipe inteira e
    // precisa saber de quem é cada linha.
    owner: userCard(c.ownerId),
  };
};

const podeVer = (cliente, user) => cliente.ownerId === user.id || isManager(user);

/**
 * Carteira pedida na consulta. O vendedor só enxerga a própria; a gestão
 * enxerga a equipe inteira por padrão e filtra por vendedor quando quiser
 * (`userId=<id>`), inclusive a própria (`userId=<id do gestor>`).
 */
const alvoDe = (req) => (isManager(req.user) ? req.query.userId || 'todos' : req.user.id);
const daCarteira = (alvo) => (c) => alvo === 'todos' || c.ownerId === alvo;

/** Data futura válida, ou null */
function dataFutura(valor, agora = new Date()) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) || d <= agora ? null : d;
}

/** GET /api/clients?busca=&temperatura=&cidade=&stage=&segmento=&ordem= */
router.get('/', (req, res) => {
  const { busca = '', temperatura, cidade, stage, segmento, ordem } = req.query;
  const alvo = alvoDe(req);
  const termo = String(busca).toLowerCase();
  const agora = new Date();

  let lista = table('clients')
    .filter(daCarteira(alvo))
    .filter((c) => (temperatura ? c.temperature === temperatura : true))
    .filter((c) => (cidade ? c.city === cidade : true))
    .filter((c) => (stage ? c.stage === stage : true))
    .filter((c) => (segmento ? c.segment === segmento : true))
    .filter((c) =>
      termo ? `${c.name} ${c.company} ${c.city} ${c.phone}`.toLowerCase().includes(termo) : true
    )
    .map((c) => enriquecer(c, agora));

  const ordenacoes = {
    score: (a, b) => b.score - a.score,
    contato: (a, b) => b.diasSemContato - a.diasSemContato,
    nome: (a, b) => a.company.localeCompare(b.company),
  };
  lista.sort(ordenacoes[ordem] ?? ordenacoes.score);

  res.json(lista);
});

/**
 * GET /api/clients/sugestoes?data=YYYY-MM-DD — quem visitar naquele dia.
 *
 * Existe para resolver a folha em branco: o vendedor abre a agenda do dia e o
 * CRM ja diz quem vale a pena, com o motivo do lado. Quem ja esta marcado no
 * dia fica de fora — sugerir o que ja esta na agenda e ruido.
 */
router.get('/sugestoes', (req, res) => {
  const alvo = req.query.userId && isManager(req.user) ? req.query.userId : req.user.id;
  const limite = Math.min(Math.max(Number(req.query.limite) || 6, 1), 20);

  const base = req.query.data ? new Date(`${req.query.data}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return res.status(400).json({ error: 'Data inválida.' });

  const ini = startOfDay(base);
  const fim = endOfDay(base);
  const dentro = (d) => d && new Date(d) >= ini && new Date(d) <= fim;

  const carteira = table('clients').filter((c) => c.ownerId === alvo);
  const porId = new Map(carteira.map((c) => [c.id, c]));

  const doDia = table('events').filter(
    (e) => e.ownerId === alvo && e.status !== 'cancelado' && dentro(e.start)
  );
  const jaNaAgenda = new Set(doDia.map((e) => e.clientId).filter(Boolean));

  // Cidades que o dia ja leva o vendedor: vira desconto de estrada na nota
  const cidadesDoDia = [
    ...new Set(doDia.map((e) => porId.get(e.clientId)?.city).filter(Boolean)),
  ];

  // Follow-up que venceu (ou vence no proprio dia) e ainda nao tem resultado
  const followupsAbertos = new Set(
    table('followups')
      .filter((f) => f.userId === alvo && f.status === 'pendente' && new Date(f.dueAt) <= fim)
      .map((f) => f.clientId)
  );

  const sugestoes = carteira
    .filter((c) => c.stage !== 'perdido' && c.leadStatus !== 'fantasma' && !jaNaAgenda.has(c.id))
    .map((c) => {
      const diasSemContato = daysBetween(c.lastContactAt);
      const { pontos, motivos } = avaliarVisita(c, {
        diasSemContato,
        followupVencido: followupsAbertos.has(c.id),
        cidadesDoDia,
      });
      return {
        id: c.id,
        company: c.company,
        name: c.name,
        city: c.city,
        address: c.address,
        phone: c.phone,
        whatsapp: c.whatsapp,
        score: c.score,
        temperature: c.temperature,
        stage: c.stage,
        stageMeta: FUNIL[c.stage] ?? FUNIL.novo,
        segmentoLabel: SEGMENTOS[c.segment] ?? c.segment,
        diasSemContato,
        pontos,
        motivos,
      };
    })
    .sort((a, b) => b.pontos - a.pontos || b.score - a.score)
    .slice(0, limite);

  res.json({
    data: dateKey(base),
    naAgenda: jaNaAgenda.size,
    cidadesDoDia,
    sugestoes,
  });
});

/** GET /api/clients/mapa?raio=3 — "Você tem 12 leads a menos de 3 km" */
router.get('/mapa', (req, res) => {
  const raio = Number(req.query.raio) || 3;
  const origem =
    req.query.lat && req.query.lng
      ? { lat: Number(req.query.lat), lng: Number(req.query.lng) }
      : req.user.base;

  const alvo = alvoDe(req);

  const pontos = table('clients')
    .filter(daCarteira(alvo))
    .map((c) => ({
      ...enriquecer(c),
      distanciaKm: Number(haversine(origem, c).toFixed(1)),
    }))
    .sort((a, b) => a.distanciaKm - b.distanciaKm);

  const proximos = pontos.filter((p) => p.distanciaKm <= raio);
  const leadsProximos = proximos.filter((p) => !['fechado', 'perdido'].includes(p.stage));

  res.json({
    origem,
    raio,
    destaque: leadsProximos.length
      ? `Você tem ${leadsProximos.length} lead(s) a menos de ${raio} km.`
      : `Nenhum lead a menos de ${raio} km. Amplie o raio para ver mais clientes.`,
    totais: {
      ativos: pontos.filter((p) => p.stage === 'fechado').length,
      leads: pontos.filter((p) => !['fechado', 'perdido'].includes(p.stage)).length,
      proximos: proximos.length,
      leadsProximos: leadsProximos.length,
    },
    pontos,
  });
});

/** Distribuição da carteira no funil */
router.get('/funil', (req, res) => {
  const meus = table('clients').filter(daCarteira(alvoDe(req)));

  res.json(
    Object.entries(FUNIL).map(([chave, info]) => {
      const doEstagio = meus.filter((c) => c.stage === chave);
      return {
        chave,
        ...info,
        total: doEstagio.length,
        clientes: doEstagio
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((c) => ({ id: c.id, company: c.company, name: c.name, score: c.score, city: c.city })),
      };
    })
  );
});

/**
 * GET /api/clients/checar?whatsapp=&cnpj= — o formulário pergunta antes de o
 * vendedor tirar a foto: descobrir o duplicado só no "salvar" custaria os 60
 * segundos do cadastro.
 */
router.get('/checar', (req, res) => {
  const duplicado = buscarDuplicado({
    telefones: [req.query.whatsapp, req.query.phone].filter(Boolean),
    documento: req.query.cnpj ?? '',
  });
  // Lojista que já está na carteira de quem cadastra: o certo é registrar a
  // visita na ficha dele, e o formulário oferece o atalho
  const existente = duplicado?.clientId ? find('clients', duplicado.clientId) : null;
  const visivel = existente && podeVer(existente, req.user);
  const seu = Boolean(existente && existente.ownerId === req.user.id);
  res.json({
    duplicado: Boolean(duplicado),
    mensagem: seu
      ? `Este lojista já está na sua carteira (${existente.company || existente.name}). Registre a visita na ficha dele.`
      : duplicado?.mensagem ?? null,
    clientId: visivel ? existente.id : null,
    seu,
  });
});

/** GET /api/clients/cnpj/:cnpj — consulta na Receita (BrasilAPI) para o lead remoto */
router.get('/cnpj/:cnpj', async (req, res, next) => {
  try {
    const cnpj = soDigitos(req.params.cnpj);
    if (!cnpjValido(cnpj)) return res.status(400).json({ error: 'CNPJ inválido — confira os 14 números.' });

    const duplicado = buscarDuplicado({ documento: cnpj });
    if (duplicado) return res.status(409).json({ error: duplicado.mensagem });

    const consulta = await consultarCnpj(cnpj);
    const recusa = motivoRecusaCnpj(consulta);
    if (recusa) return res.status(422).json({ error: recusa });
    if (!consulta.ok) {
      return res.json({
        ok: false,
        cnpj: formatarCnpj(cnpj),
        aviso:
          'A consulta à Receita não respondeu agora. Dá para cadastrar: o lead fica pendente até o CNPJ ser confirmado.',
      });
    }
    res.json(consulta);
  } catch (erro) {
    next(erro);
  }
});

router.get('/:id', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const agenda = table('events')
    .filter((e) => e.clientId === cliente.id)
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .map((e) => expandEvent(e, req.user.id));

  const visitas = table('visits')
    .filter((v) => v.clientId === cliente.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .map((v) => ({ ...v, user: userCard(v.userId), resultadoMeta: resultadoVisita(v.resultado) }));

  // A cadência do lead, do primeiro passo ao que está em aberto
  const followups = table('followups')
    .filter((f) => f.clientId === cliente.id && f.status !== 'cancelado')
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .map((f) => ({
      ...(f.status === 'pendente' ? expandirFollowup(f) : f),
      passo: passoDaEtapa(f.etapa),
      resultadoMeta: resultadoVisita(f.resultado),
    }));

  const negocios = table('deals')
    .filter((d) => d.clientId === cliente.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((d) => expandirNegocio(d));

  // O que a ficha precisa cobrar: máquina sem ativar e ativação esperando a gestão
  const pendencias = {
    semAtivar: negocios.filter((d) => d.status === 'fechado').length,
    aguardandoConfirmacao: negocios.filter((d) => d.aguardandoConfirmacao).length,
    propostaAberta: negocios.some((d) => ['proposta', 'negociacao'].includes(d.status)),
    temVenda: negocios.some((d) => ['fechado', 'ativado'].includes(d.status)),
  };

  const { detalhes } = calcularScore(cliente.diagnostico ?? {});
  const indicou = cliente.indicadoPor ? find('clients', cliente.indicadoPor) : null;

  res.json({
    ...enriquecer(cliente),
    owner: userCard(cliente.ownerId),
    scoreDetalhes: detalhes,
    visitas,
    followups,
    canalLabel: CANAIS_REMOTO[cliente.canal] ?? null,
    indicadoPorCard: indicou ? { id: indicou.id, company: indicou.company, name: indicou.name } : null,
    whatsappAberturas: table('whatsappAberturas')
      .filter((w) => w.clientId === cliente.id)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 5),
    negocios,
    pendencias,
    historico: agenda.filter((e) => new Date(e.start) < new Date()),
    proximos: agenda.filter((e) => new Date(e.start) >= new Date()).reverse(),
  });
});

/* ------------------------------------------------------------ cadastro -- */

/** Cadastro sem prova: só a gestão (importação da carteira). Não conta na meta. */
function cadastrarSemProva(req, res, b) {
  if (!b.company?.trim() && !b.name?.trim()) {
    return res.status(400).json({ error: 'Informe ao menos o nome ou a empresa.' });
  }

  const diagnostico = {
    maquinaAtual: b.diagnostico?.maquinaAtual ?? null,
    faturamento: b.diagnostico?.faturamento ?? null,
    volumeCartao: b.diagnostico?.volumeCartao ?? null,
    dores: b.diagnostico?.dores ?? [],
    interesse: b.diagnostico?.interesse ?? null,
    taxaAtual: b.diagnostico?.taxaAtual ?? null,
    observacoes: b.diagnostico?.observacoes ?? '',
    preenchidoAt: b.diagnostico ? new Date().toISOString() : null,
  };

  const { score } = calcularScore(diagnostico);

  let responsavel = req.user;
  if (b.ownerId && b.ownerId !== req.user.id) {
    const dono = find('users', b.ownerId);
    if (!dono) return res.status(400).json({ error: 'Vendedor informado não existe.' });
    responsavel = dono;
  }

  const base = responsavel.base ?? { lat: 0, lng: 0 };
  const agora = new Date().toISOString();

  const cliente = insert('clients', {
    id: id('cli'),
    name: (b.name ?? '').trim(),
    company: (b.company ?? b.name ?? '').trim(),
    segment: b.segment ?? 'outros',
    cnpj: b.cnpj ?? '',
    phone: b.phone ?? '',
    whatsapp: b.whatsapp ?? b.phone ?? '',
    city: b.city ?? responsavel.city,
    region: b.region ?? '',
    address: b.address ?? '',
    lat: Number(b.lat) || base.lat,
    lng: Number(b.lng) || base.lng,
    ownerId: responsavel.id,
    diagnostico,
    score,
    temperature: temperaturaPorScore(score),
    stage: b.stage ?? 'novo',
    stageChangedAt: agora,
    machines: 0,
    lastContactAt: agora,
    notes: b.notes ?? '',
    createdAt: agora,
  });

  logActivity({ userId: req.user.id, action: 'cliente_cadastrado', clientId: cliente.id });
  return res.status(201).json(enriquecer(cliente));
}

/**
 * POST /api/clients — lead novo, com prova.
 *
 * Presencial: { origem: 'presencial', company, name, whatsapp, segment,
 *   maquinaAtual, faturamentoCartao, foto: {dataUrl}, resultado, lat, lng,
 *   precisao, notes, proximoEm, venda: { maquinas, taxaOfertada } }
 * Remoto: { origem: 'remoto', cnpj, name, whatsapp, canal, indicadoPor,
 *   declaracao: true, print: { dataUrl, assinatura, comResposta }, ... }
 *
 * GPS chega do aparelho e o horário é o do servidor: nenhum dos dois é campo
 * de formulário.
 */
router.post('/', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const gestao = isManager(req.user);

    if (req.user.role === 'onboarding') {
      return res.status(403).json({ error: 'O onboarding não cadastra leads.' });
    }
    if (b.ownerId && b.ownerId !== req.user.id && !gestao) {
      return res.status(403).json({ error: 'Só a gestão cadastra na carteira de outro vendedor.' });
    }

    const origem = ORIGENS_LEAD[b.origem] ? b.origem : null;
    if (!origem) {
      if (gestao) return cadastrarSemProva(req, res, b);
      return res.status(400).json({ error: 'Escolha o tipo do lead: presencial ou remoto.' });
    }

    if (termoPendente(req.user)) {
      return res.status(403).json({ error: 'Aceite o Termo de Conduta antes de cadastrar leads.' });
    }

    // Reenvio do mesmo cadastro (4G caiu depois de o servidor gravar): devolve o
    // lead já salvo em vez de acusar "duplicado" do próprio vendedor
    const chave = typeof b.chave === 'string' ? b.chave.slice(0, 64) : '';
    if (chave) {
      const jaSalvo = table('clients').find((c) => c.cadastroChave === chave && c.cadastradoPor === req.user.id);
      if (jaSalvo) {
        const agoraRepetido = new Date();
        return res.status(200).json({
          ...enriquecer(jaSalvo, agoraRepetido),
          followup: null,
          negocio: null,
          placar: placarDoDia(req.user.id, agoraRepetido),
          avisos: [],
          repetido: true,
        });
      }
    }

    const agora = new Date();
    const presencial = origem === 'presencial';
    const nome = String(b.name ?? '').trim();
    let empresa = String(b.company ?? '').trim();
    const whatsapp = String(b.whatsapp ?? '').trim();
    const segmento = SEGMENTOS[b.segment] ? b.segment : null;
    const faltando = [];

    if (!nome) faltando.push('nome do dono');
    if (!telefoneChave(whatsapp)) faltando.push('WhatsApp com DDD');
    else if (!telefoneValido(whatsapp)) {
      return res.status(400).json({ error: 'WhatsApp estranho — confira se colou com +55 ou com 0 na frente.' });
    }

    /* -------------------------------------------- o que cada tipo exige */
    // Lead que já fechou no cadastro: a venda precisa da tabela de taxa
    if (b.resultado === 'fechado') {
      const faltaVenda = faltaNaVenda(b.venda);
      if (faltaVenda) return res.status(400).json({ error: faltaVenda });
    }

    let consulta = null;
    const lat = Number(b.lat);
    const lng = Number(b.lng);

    if (presencial) {
      if (!empresa) faltando.push('nome do comércio');
      if (!segmento) faltando.push('segmento');
      if (!MAQUINAS[b.maquinaAtual]) faltando.push('maquininha atual');
      if (!FATURAMENTOS[b.faturamentoCartao]) faltando.push('faturamento no cartão');
      if (!RESULTADOS_VISITA[b.resultado]) faltando.push('resultado da visita');
      if (!b.foto) faltando.push('foto da fachada');
      if (faltando.length) {
        return res.status(400).json({ error: `Falta preencher: ${faltando.join(', ')}.` });
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        return res.status(400).json({
          error: 'Sem a localização do aparelho não dá para provar a visita. Ligue o GPS e tente de novo.',
        });
      }
    } else {
      if (!CANAIS_REMOTO[b.canal]) faltando.push('origem (Indicação ou Contato WhatsApp)');
      if (faltando.length) {
        return res.status(400).json({ error: `Falta preencher: ${faltando.join(', ')}.` });
      }
      if (b.declaracao !== true) {
        return res.status(400).json({ error: 'Marque a declaração de que o contato é real.' });
      }
      if (!cnpjValido(b.cnpj)) {
        return res.status(400).json({ error: 'Lead remoto precisa de um CNPJ válido.' });
      }
      if (b.canal === 'indicacao') {
        const indicou = find('clients', b.indicadoPor);
        if (!indicou || !podeVer(indicou, req.user)) {
          return res.status(400).json({ error: 'Escolha quem indicou entre os seus clientes cadastrados.' });
        }
      }
    }

    /* --------------------------------------------------------- duplicado */
    const duplicado = buscarDuplicado({
      telefones: [whatsapp, b.phone].filter(Boolean),
      documento: b.cnpj ?? '',
    });
    if (duplicado) return res.status(409).json({ error: duplicado.mensagem, duplicado: true });

    /* ------------------------------------------------- CNPJ na Receita -- */
    const avisos = [];
    if (!presencial) {
      consulta = await consultarCnpj(b.cnpj);
      const recusa = motivoRecusaCnpj(consulta);
      if (recusa) return res.status(422).json({ error: recusa });
      if (!consulta.ok) {
        avisos.push('A Receita não respondeu: o lead fica pendente até o CNPJ ser confirmado.');
      }
      if (!empresa) empresa = consulta.nomeFantasia || consulta.razaoSocial || nome;
    }

    /* ------------------------------------------------------------ prova */
    const novoId = id('cli');
    let foto = null;
    let print = null;

    if (presencial) {
      foto = salvarDataUrl(b.foto?.dataUrl ?? b.foto, `fachada_${novoId}`);
      if (!foto || !foto.tipo.startsWith('image/')) {
        if (foto) removerArquivo(foto.url);
        return res.status(400).json({ error: 'A foto da fachada não foi aceita. Tire outra pela câmera do app.' });
      }
    } else if (b.print) {
      print = salvarPrint(b.print, novoId, agora);
      if (!print) avisos.push('O print não foi aceito (formato ou tamanho). Envie de novo pela ficha do lead.');
    }

    const placarAntes = placarDoDia(req.user.id, agora);
    if (!presencial && placarAntes.remotosValidados + placarAntes.pendentes >= META_LEADS.maxRemotos) {
      avisos.push(`Você já tem ${META_LEADS.maxRemotos} remotos hoje: este fica salvo, mas não conta na meta.`);
    }

    // Presencial: a cidade é a da loja cadastrada mais perto (até 8 km) — a
    // cidade-base do vendedor erra quando ele roda o interior
    let cidadeVizinha = null;
    if (presencial) {
      let maisPerto = 8;
      for (const c of table('clients')) {
        if (!c.city || !Number(c.lat) || !Number(c.lng)) continue;
        const km = haversine({ lat, lng }, { lat: Number(c.lat), lng: Number(c.lng) });
        if (km < maisPerto) {
          maisPerto = km;
          cidadeVizinha = c.city;
        }
      }
    }

    /* ----------------------------------------------------------- o lead */
    const diagnostico = {
      maquinaAtual: MAQUINAS[b.maquinaAtual] ? b.maquinaAtual : null,
      faturamento: null,
      faturamentoCartao: FATURAMENTOS[b.faturamentoCartao] ? b.faturamentoCartao : null,
      volumeCartao: null,
      dores: [],
      interesse: null,
      taxaAtual: Number(b.taxaAtual) > 0 ? Number(b.taxaAtual) : null,
      observacoes: '',
      preenchidoAt: null, // as 5 perguntas do diagnóstico continuam em aberto
    };
    const { score } = calcularScore(diagnostico);
    const quando = agora.toISOString();

    let cliente = insert('clients', {
      id: novoId,
      name: nome,
      company: empresa,
      segment: segmento ?? 'outros',
      cnpj: cnpjValido(b.cnpj) ? formatarCnpj(b.cnpj) : String(b.cnpj ?? '').trim(),
      phone: String(b.phone ?? '').trim() || whatsapp,
      whatsapp,
      city: String(b.city ?? '').trim() || consulta?.municipio || cidadeVizinha || req.user.city,
      region: '',
      address: String(b.address ?? '').trim() || consulta?.endereco || '',
      lat: presencial ? lat : Number(req.user.base?.lat) || 0,
      lng: presencial ? lng : Number(req.user.base?.lng) || 0,
      ownerId: req.user.id,
      cadastradoPor: req.user.id,
      cadastroChave: chave || null,
      diagnostico,
      score,
      temperature: temperaturaPorScore(score),
      stage: 'novo',
      stageChangedAt: quando,
      machines: 0,
      lastContactAt: quando,
      notes: String(b.notes ?? '').trim(),
      createdAt: quando,

      // Prova e status do lead
      origem,
      canal: presencial ? null : b.canal,
      indicadoPor: !presencial && b.canal === 'indicacao' ? b.indicadoPor : null,
      razaoSocial: consulta?.razaoSocial ?? '',
      cnpjInfo: consulta,
      declaracao: presencial
        ? null
        : { texto: DECLARACAO_REMOTO, at: quando, userId: req.user.id, login: req.user.email },
      prova: presencial
        ? { lat, lng, precisao: Number.isFinite(Number(b.precisao)) ? Math.round(Number(b.precisao)) : null, at: quando, foto }
        : null,
      print,
      validadoAt: presencial ? quando : null,
      validadoPor: presencial ? 'visita' : null,
      leadStatus: null,
      cadenciaInicio: quando,
      cadenciaEtapa: null,
      cadenciaDeslocamento: 0,
      cadenciaEncerrada: null,
      followupPendenteDesde: null,
    });

    cliente = tentarValidar(cliente, agora);

    /* ---------------------------------- visita, resultado e próxima tarefa */
    let negocio = null;
    const resultado = RESULTADOS_VISITA[b.resultado] ? b.resultado : null;

    if (presencial) {
      insert('visits', {
        id: id('vst'),
        clientId: cliente.id,
        userId: req.user.id,
        at: quando,
        tipo: 'lead',
        resultado,
        notes: cliente.notes,
        fotos: [foto],
        audio: null,
        lat,
        lng,
        precisao: cliente.prova.precisao,
        duracaoMin: null,
        eventId: null,
      });
    }
    if (resultado) {
      ({ cliente, negocio } = aplicarResultado(cliente, resultado, {
        agora, venda: b.venda, userId: req.user.id, notes: cliente.notes,
      }));
    }

    const tarefa = cliente.cadenciaEncerrada
      ? null
      : gerarProximo(cliente, { agora, proximoEm: dataFutura(b.proximoEm, agora) });

    logActivity({ userId: req.user.id, action: 'lead_cadastrado', clientId: cliente.id, origem });

    res.status(201).json({
      ...enriquecer(find('clients', cliente.id), agora),
      followup: tarefa ? expandirFollowup(tarefa, { agora }) : null,
      negocio,
      placar: placarDoDia(req.user.id, agora),
      avisos,
    });
  } catch (erro) {
    next(erro);
  }
});

router.patch('/:id', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const gestao = isManager(req.user);
  const patch = {};
  const campos = [
    'name', 'company', 'segment', 'cnpj', 'phone', 'whatsapp',
    'city', 'region', 'address', 'lat', 'lng', 'notes', 'stage',
  ];
  for (const campo of campos) if (campo in req.body) patch[campo] = req.body[campo];

  // A prova do lead não se edita: o GPS veio do aparelho e o CNPJ do remoto
  // é o que a Receita confirmou.
  if (ehLead(cliente) && !gestao) {
    delete patch.lat;
    delete patch.lng;
    if (cliente.origem === 'remoto') delete patch.cnpj;
  }

  if (patch.stage && !FUNIL[patch.stage]) return res.status(400).json({ error: 'Etapa inválida.' });

  // "Fechado" não é só uma coluna: é venda. Ou ela vem junto (`venda`), ou o
  // cliente já tem venda registrada — senão a etapa não anda e a tela pede os
  // dados da venda.
  if (patch.stage === 'fechado' && cliente.stage !== 'fechado') {
    if (req.body.venda) {
      const falta = faltaNaVenda(req.body.venda, negocioAberto(cliente.id));
      if (falta) return res.status(400).json({ error: falta });
      delete patch.stage;
      aplicarResultado(cliente, 'fechado', {
        venda: req.body.venda, userId: req.user.id, notes: String(req.body.venda.notes ?? '').trim(),
      });
      logActivity({ userId: req.user.id, action: 'venda_registrada', clientId: cliente.id });
    } else if (!temVenda(cliente.id)) {
      return res.status(400).json({
        error: 'Para fechar, registre a venda: máquinas, tabela de taxa e modelo.',
        vendaNecessaria: true,
      });
    }
  }
  if (patch.stage && patch.stage !== cliente.stage) patch.stageChangedAt = new Date().toISOString();

  if (!gestao && ['phone', 'whatsapp', 'cnpj'].some((c) => c in patch && patch[c] !== cliente[c])) {
    const duplicado = buscarDuplicado({
      telefones: [patch.phone, patch.whatsapp].filter(Boolean),
      documento: patch.cnpj ?? '',
      exceto: cliente.id,
    });
    if (duplicado) return res.status(409).json({ error: duplicado.mensagem, duplicado: true });
  }

  res.json(enriquecer(update('clients', cliente.id, patch)));
});

/** PUT /api/clients/:id/diagnostico — recalcula score e temperatura */
router.put('/:id/diagnostico', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const diagnostico = {
    maquinaAtual: req.body?.maquinaAtual ?? null,
    faturamento: req.body?.faturamento ?? null,
    // Respondido no cadastro presencial; o diagnóstico não apaga
    faturamentoCartao: cliente.diagnostico?.faturamentoCartao ?? null,
    volumeCartao: req.body?.volumeCartao ?? null,
    dores: Array.isArray(req.body?.dores) ? req.body.dores : [],
    interesse: req.body?.interesse ?? null,
    taxaAtual: req.body?.taxaAtual ? Number(req.body.taxaAtual) : null,
    observacoes: req.body?.observacoes ?? '',
    preenchidoAt: new Date().toISOString(),
  };

  const agora = new Date().toISOString();
  const avancou = cliente.stage === 'novo';
  const { score, detalhes } = calcularScore(diagnostico);
  const atualizado = update('clients', cliente.id, {
    diagnostico,
    score,
    temperature: temperaturaPorScore(score),
    lastContactAt: agora,
    stage: avancou ? 'contatado' : cliente.stage,
    ...(avancou ? { stageChangedAt: agora } : {}),
  });

  logActivity({ userId: req.user.id, action: 'diagnostico_preenchido', clientId: cliente.id, score });
  res.json({ ...enriquecer(atualizado), scoreDetalhes: detalhes });
});

/**
 * POST /api/clients/:id/agendar-retorno — o lojista marcou dia e hora.
 * Retorno por telefone/WhatsApp entra no motor de follow-up (e só sai de lá
 * com resultado); visita presencial marcada vira compromisso na agenda.
 */
router.post('/:id/agendar-retorno', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const { preset, date, hour = 9, minute = 0, type = 'followup', notes = '' } = req.body ?? {};

  let quando;
  if (preset && RETURN_PRESETS[preset]) {
    quando = atHour(addDays(new Date(), RETURN_PRESETS[preset].days), Number(hour), Number(minute));
  } else if (date) {
    quando = new Date(date);
    if (Number.isNaN(quando.getTime())) return res.status(400).json({ error: 'Data inválida.' });
  } else {
    return res.status(400).json({ error: 'Escolha um prazo ou uma data personalizada.' });
  }

  if (type !== 'visita') {
    const agora = new Date();
    if (quando <= agora) return res.status(400).json({ error: 'Escolha um dia e hora no futuro.' });
    if (cliente.leadStatus === 'fantasma') {
      return res.status(409).json({ error: 'Lead marcado como fantasma pela auditoria: a cadência está encerrada.' });
    }

    let tarefa;
    const pendente = pendenteDoCliente(cliente.id);
    if (pendente) {
      const remarcado = reagendarFollowup(pendente, quando, agora);
      if (remarcado.erro) return res.status(409).json({ error: remarcado.erro });
      tarefa = remarcado.tarefa;
    } else {
      tarefa = gerarProximo(cliente, { agora, proximoEm: quando });
    }
    if (notes) tarefa = update('followups', tarefa.id, { combinado: String(notes).slice(0, 300) });

    logActivity({ userId: req.user.id, action: 'retorno_agendado', clientId: cliente.id, followupId: tarefa.id });
    // `start` e `type` mantêm o formato que a tela de agendamento já lê
    return res.status(201).json({ ...expandirFollowup(tarefa), type: 'followup', start: tarefa.dueAt });
  }

  const evento = insert('events', {
    id: id('evt'),
    title: `Visita ${(cliente.name || cliente.company).split(' ')[0]}`,
    type,
    start: quando.toISOString(),
    end: new Date(quando.getTime() + 30 * 60000).toISOString(),
    scope: 'pessoal',
    ownerId: cliente.ownerId,
    audience: null,
    audienceIds: [],
    requiresConfirmation: false,
    clientId: cliente.id,
    location: `${cliente.company} — ${cliente.city}`,
    notes,
    status: 'agendado',
    checkinAt: null,
    outcome: null,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  });

  logActivity({ userId: req.user.id, action: 'retorno_agendado', clientId: cliente.id, eventId: evento.id });
  res.status(201).json(expandEvent(evento, req.user.id));
});

/**
 * POST /api/clients/:id/print — print da conversa com a resposta do lojista.
 * É o que tira o lead remoto do "pendente". Se a Receita estava fora do ar no
 * cadastro, a consulta do CNPJ é refeita aqui.
 */
router.post('/:id/print', async (req, res, next) => {
  try {
    let cliente = find('clients', req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
    if (!podeVer(cliente, req.user)) return res.status(403).json({ error: 'Cliente de outra carteira.' });
    if (cliente.origem !== 'remoto') {
      return res.status(400).json({ error: 'Print de conversa é a prova do lead remoto.' });
    }
    if (cliente.leadStatus === 'fantasma') {
      return res.status(409).json({ error: 'Lead marcado como fantasma pela auditoria.' });
    }

    const agora = new Date();
    const print = salvarPrint(req.body?.print, cliente.id, agora);
    if (!print) return res.status(400).json({ error: 'Print não aceito. Envie uma imagem de até 8 MB.' });
    if (!print.comResposta) {
      removerArquivo(print.url);
      return res.status(400).json({
        error: 'Só a sua mensagem não valida: o print precisa mostrar a data e a resposta do lojista.',
      });
    }

    const patch = { print };
    if (!cliente.cnpjInfo?.ok) {
      const consulta = await consultarCnpj(cliente.cnpj);
      const recusa = motivoRecusaCnpj(consulta);
      if (recusa) {
        removerArquivo(print.url);
        return res.status(422).json({ error: recusa });
      }
      patch.cnpjInfo = consulta;
      if (consulta.ok && !cliente.razaoSocial) patch.razaoSocial = consulta.razaoSocial;
    }

    if (cliente.print?.url) removerArquivo(cliente.print.url);
    cliente = tentarValidar(update('clients', cliente.id, patch), agora);

    logActivity({ userId: req.user.id, action: 'print_enviado', clientId: cliente.id });
    res.json({ ...enriquecer(cliente, agora), placar: placarDoDia(req.user.id, agora) });
  } catch (erro) {
    next(erro);
  }
});

/**
 * POST /api/clients/:id/transferir — body: { ownerId }
 * Passa o cliente para outra carteira. Vai junto o que ainda está por fazer
 * (follow-ups pendentes, visitas agendadas e tarefas abertas); o histórico
 * fica como está e quem cadastrou o lead continua valendo para a meta dele.
 */
router.post('/:id/transferir', (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Só a gestão transfere cliente de carteira.' });

  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

  const destino = find('users', req.body?.ownerId);
  if (!destino) return res.status(400).json({ error: 'Escolha para quem vai o cliente.' });
  if (destino.active === false) return res.status(400).json({ error: `${destino.name} está sem acesso ao CRM.` });
  if (destino.role === 'onboarding') return res.status(400).json({ error: 'O onboarding não tem carteira.' });
  if (destino.id === cliente.ownerId) {
    return res.status(409).json({ error: `${cliente.company} já está com ${destino.name}.` });
  }

  const origem = cliente.ownerId;
  const agora = new Date();

  const followups = table('followups').filter((f) => f.clientId === cliente.id && f.status === 'pendente');
  for (const f of followups) update('followups', f.id, { userId: destino.id });

  const eventos = table('events').filter(
    (e) => e.clientId === cliente.id && e.ownerId === origem && e.status === 'agendado' && new Date(e.start) >= agora
  );
  for (const e of eventos) update('events', e.id, { ownerId: destino.id });

  const tarefas = table('tasks').filter((t) => t.clientId === cliente.id && t.ownerId === origem && !t.done);
  for (const t of tarefas) update('tasks', t.id, { ownerId: destino.id });

  const atualizado = update('clients', cliente.id, { ownerId: destino.id });
  logActivity({
    userId: req.user.id, action: 'cliente_transferido', clientId: cliente.id, de: origem, para: destino.id,
  });

  res.json({
    ...enriquecer(atualizado, agora),
    transferidos: { followups: followups.length, compromissos: eventos.length, tarefas: tarefas.length },
  });
});

/** POST /api/clients/:id/recusar-print — a gestão viu o print e ele não prova nada */
router.post('/:id/recusar-print', (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Só a gestão recusa um print.' });
  const cliente = find('clients', req.params.id);
  if (!cliente?.print) return res.status(404).json({ error: 'Lead sem print.' });

  const motivo = String(req.body?.motivo ?? '').trim();
  if (motivo.length < 5) return res.status(400).json({ error: 'Explique o motivo da recusa (mínimo de 5 letras).' });

  const atualizado = update('clients', cliente.id, {
    print: {
      ...cliente.print,
      recusado: true,
      motivoRecusa: motivo,
      recusadoPor: req.user.id,
      recusadoAt: new Date().toISOString(),
    },
    validadoAt: null,
    validadoPor: null,
  });
  logActivity({ userId: req.user.id, action: 'print_recusado', clientId: cliente.id });
  res.json(enriquecer(atualizado));
});

/**
 * POST /api/clients/:id/whatsapp — botão "Abrir WhatsApp" do CRM: registra a
 * hora em que o vendedor iniciou a conversa pelo sistema.
 */
router.post('/:id/whatsapp', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) return res.status(403).json({ error: 'Cliente de outra carteira.' });

  const abertura = insert('whatsappAberturas', {
    id: id('wpp'),
    clientId: cliente.id,
    userId: req.user.id,
    followupId: req.body?.followupId ?? null,
    at: new Date().toISOString(),
  });
  if (!cliente.whatsappIniciadoAt) update('clients', cliente.id, { whatsappIniciadoAt: abertura.at });
  res.status(201).json(abertura);
});

/**
 * DELETE /api/clients/:id — remove o cliente e tudo que depende dele.
 * Cliente com máquina ativada carrega o resultado do mês: o vendedor não
 * apaga (recebe 409 e a orientação de marcar como perdido); o gestor pode
 * forçar com ?forcar=1.
 *
 * Lead com prova só sai pela mão do vendedor no próprio dia do cadastro
 * (erro de digitação). Depois disso ele já contou na meta e pode ser
 * auditado: quem apaga é a gestão.
 */
router.delete('/:id', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const gestao = isManager(req.user);
  if (ehLead(cliente) && !gestao && dateKey(cliente.createdAt) !== dateKey()) {
    return res.status(403).json({
      error: 'Lead com prova só pode ser excluído no dia do cadastro. Depois disso, peça à gestão.',
    });
  }
  if (table('ocorrencias').some((o) => o.clientId === cliente.id && o.status === 'ativa')) {
    return res.status(409).json({
      error: 'Este lead tem ocorrência registrada e serve de prova. Anule a ocorrência antes de excluir.',
    });
  }

  const negocios = table('deals').filter((d) => d.clientId === cliente.id);
  const ativados = negocios.filter((d) => d.status === 'ativado');
  const podeForcar = gestao && req.query.forcar === '1';

  if (ativados.length && !podeForcar) {
    const maquinas = ativados.reduce((s, d) => s + d.maquinas, 0);
    return res.status(409).json({
      error:
        `${cliente.company} tem ${maquinas} máquina(s) ativada(s) e entra no resultado do mês. ` +
        'Marque como "perdido" em vez de excluir, ou peça ao gestor.',
      maquinasAtivadas: maquinas,
    });
  }

  const visitas = table('visits').filter((v) => v.clientId === cliente.id);
  const eventos = table('events').filter((e) => e.clientId === cliente.id);
  const tarefas = table('tasks').filter((t) => t.clientId === cliente.id);
  const followups = table('followups').filter((f) => f.clientId === cliente.id);

  let anexos = 0;
  for (const v of visitas) {
    anexos += removerAnexosDaVisita(v);
    remove('visits', v.id);
  }
  for (const f of followups) {
    if (f.print?.url && removerArquivo(f.print.url)) anexos += 1;
    remove('followups', f.id);
  }
  if (cliente.print?.url && removerArquivo(cliente.print.url)) anexos += 1;
  for (const d of negocios) remove('deals', d.id);
  for (const e of eventos) remove('events', e.id);
  for (const t of tarefas) remove('tasks', t.id);
  for (const w of table('whatsappAberturas').filter((x) => x.clientId === cliente.id)) {
    remove('whatsappAberturas', w.id);
  }
  // Auditoria ainda na fila não tem mais para quem ligar
  for (const a of table('auditorias').filter((x) => x.clientId === cliente.id && x.status === 'pendente')) {
    remove('auditorias', a.id);
  }
  remove('clients', cliente.id);

  logActivity({ userId: req.user.id, action: 'cliente_excluido', clientId: cliente.id, company: cliente.company });

  res.json({
    ok: true,
    removidos: {
      cliente: cliente.company,
      visitas: visitas.length,
      negocios: negocios.length,
      compromissos: eventos.length,
      tarefas: tarefas.length,
      followups: followups.length,
      anexos,
    },
  });
});

/** Registra contato sem criar compromisso (zera o contador de dias) */
router.post('/:id/contato', (req, res) => {
  const cliente = find('clients', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (!podeVer(cliente, req.user)) {
    return res.status(403).json({ error: 'Cliente de outra carteira.' });
  }

  const agora = new Date().toISOString();
  const patch = { lastContactAt: agora };
  if (req.body?.stage && FUNIL[req.body.stage] && req.body.stage !== cliente.stage) {
    patch.stage = req.body.stage;
    patch.stageChangedAt = agora;
  }

  res.json(enriquecer(update('clients', cliente.id, patch)));
});

export default router;
