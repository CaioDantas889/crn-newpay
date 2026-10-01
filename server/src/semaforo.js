// Painel do gestor: quem não está fazendo o básico, em uma tabela.
//
// O semáforo é calculado por dia e os vermelhos sobem para o topo. A regra
// das cores está em corDoSemaforo (domain.js); aqui só se juntam os números.

import { table } from './store.js';
import { REGRAS_SEMAFORO, SEMAFORO, corDoSemaforo, ehDiaDeTrabalho, resultadoVisita } from './domain.js';
import { addDays, dateKey, endOfDay, startOfDay } from './lib/dates.js';
import {
  atrasadosEm, contagemDoDia, contagemDoPeriodo, donoDoLead, ehLead, leadsPorVendedorEDia,
  sequenciaMetaCompleta, statusDoLead,
} from './leads.js';
import { alertasDeSuspeita } from './suspeitas.js';
import { aceiteDe, segundaDe, termoVigente } from './auditoria.js';

const vendedoresAtivos = () => table('users').filter((u) => u.role === 'vendedor' && u.active !== false);
const pct = (parte, todo) => (todo ? Math.round((parte / todo) * 100) : 0);

/** Conversão lead → venda do período, presencial e remoto separados */
function conversaoPorOrigem(leads, vendeu) {
  const r = {
    presencial: { leads: 0, vendas: 0, percentual: 0 },
    remoto: { leads: 0, vendas: 0, percentual: 0 },
  };
  for (const c of leads) {
    r[c.origem].leads += 1;
    if (vendeu.has(c.id)) r[c.origem].vendas += 1;
  }
  for (const o of Object.values(r)) o.percentual = pct(o.vendas, o.leads);
  return r;
}

export function painelSemaforo(dia = new Date(), agora = new Date()) {
  const ini = startOfDay(dia);
  const fim = endOfDay(dia);
  const segunda = segundaDe(dia);
  const inicioDoMes = new Date(ini.getFullYear(), ini.getMonth(), 1);
  const janelaSuspeitos = startOfDay(addDays(dia, -REGRAS_SEMAFORO.janelaSuspeitosDias));
  const janelaFantasma = startOfDay(addDays(dia, -REGRAS_SEMAFORO.janelaFantasmaDias));
  const desde = [inicioDoMes, segunda, janelaSuspeitos].sort((a, b) => a - b)[0];

  const leads = leadsPorVendedorEDia(desde, fim);
  const vendeu = new Set(table('deals').filter((d) => d.fechamentoAt).map((d) => d.clientId));
  const alertas = alertasDeSuspeita({ de: startOfDay(addDays(dia, -6)), ate: fim });
  const termo = termoVigente();
  const util = ehDiaDeTrabalho(dia);
  const chave = dateKey(dia);

  const linhas = vendedoresAtivos().map((v) => {
    const porDia = leads.get(v.id);
    const todos = porDia ? [...porDia.values()].flat() : [];

    const hoje = contagemDoDia(porDia, dia, agora);
    const atrasados = atrasadosEm(v.id, dia);

    // % de remotos suspeitos entre os que estão em acompanhamento
    const remotos = todos.filter((c) => c.origem === 'remoto' && new Date(c.createdAt) >= janelaSuspeitos);
    const status = remotos.map((c) => statusDoLead(c, agora));
    const acompanhados = status.filter((s) => s === 'validado' || s === 'suspeito').length;
    const suspeitos = status.filter((s) => s === 'suspeito').length;

    const fantasmas = table('ocorrencias').filter(
      (o) => o.vendedorId === v.id && o.status === 'ativa' && new Date(o.at) >= janelaFantasma && new Date(o.at) <= fim
    ).length;

    const visitas = table('visits')
      .filter((x) => x.userId === v.id && new Date(x.at) >= ini && new Date(x.at) <= fim)
      .sort((a, b) => new Date(a.at) - new Date(b.at));

    // Conversão olha 30 dias corridos: pelo mês, todo dia 1º ela voltaria a zero
    const recentes = todos.filter(
      (c) => new Date(c.createdAt) >= janelaSuspeitos && statusDoLead(c, agora) !== 'fantasma'
    );
    const meusAlertas = alertas.filter((a) => a.vendedorId === v.id);

    const semaforo = util
      ? corDoSemaforo({
          leads: hoje.total,
          presenciais: hoje.presenciais,
          atrasados,
          pctSuspeitos: pct(suspeitos, acompanhados),
          fantasmas,
        })
      : { cor: 'folga', motivos: ['domingo: sem meta'] };

    return {
      vendedor: { id: v.id, name: v.name, color: v.color, city: v.city },
      semaforo,
      hoje,
      semana: contagemDoPeriodo(porDia, segunda, fim, agora),
      mes: contagemDoPeriodo(porDia, inicioDoMes, fim, agora),
      atrasados,
      primeiraVisita: visitas[0]?.at ?? null,
      ultimaVisita: visitas[visitas.length - 1]?.at ?? null,
      visitasNoDia: visitas.length,
      conversao: conversaoPorOrigem(recentes, vendeu),
      remotosSuspeitos: { acompanhados, suspeitos, percentual: pct(suspeitos, acompanhados) },
      fantasmas,
      alertas: meusAlertas,
      alertasNoDia: meusAlertas.filter((a) => a.data === chave).length,
      sequencia: sequenciaMetaCompleta(v.id, agora),
      termoAceito: termo ? Boolean(aceiteDe(v.id, termo.id)) : null,
    };
  });

  // Vermelhos no topo; dentro da mesma cor, quem está mais longe da meta
  const ordem = (l) => SEMAFORO[l.semaforo.cor]?.ordem ?? 9;
  linhas.sort((a, b) => ordem(a) - ordem(b) || a.hoje.total - b.hoje.total);

  const cor = (c) => linhas.filter((l) => l.semaforo.cor === c).length;
  return {
    data: chave,
    diaDeTrabalho: util,
    parcial: chave === dateKey(agora),
    resumo: {
      vendedores: linhas.length,
      vermelhos: cor('vermelho'),
      amarelos: cor('amarelo'),
      verdes: cor('verde'),
      leads: linhas.reduce((s, l) => s + l.hoje.total, 0),
      atrasados: linhas.reduce((s, l) => s + l.atrasados, 0),
      alertas: linhas.reduce((s, l) => s + l.alertasNoDia, 0),
    },
    linhas,
  };
}

/** O dia do vendedor no mapa: cada visita com GPS e horário, na ordem */
export function trajetoDoDia(userId, dia = new Date()) {
  const ini = startOfDay(dia);
  const fim = endOfDay(dia);
  const clientes = new Map(table('clients').map((c) => [c.id, c]));

  return table('visits')
    .filter((v) => v.userId === userId && new Date(v.at) >= ini && new Date(v.at) <= fim)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map((v, i) => {
      const c = clientes.get(v.clientId);
      return {
        id: v.id,
        ordem: i + 1,
        at: v.at,
        tipo: v.tipo ?? 'revisita',
        lat: v.lat,
        lng: v.lng,
        precisao: v.precisao ?? null,
        semGps: !Number.isFinite(v.lat) || !Number.isFinite(v.lng),
        resultado: v.resultado,
        resultadoMeta: resultadoVisita(v.resultado),
        foto: v.fotos?.[0]?.url ?? null,
        cliente: c ? { id: c.id, company: c.company, city: c.city, origem: c.origem ?? null } : null,
      };
    });
}

/** Leads remotos do dia de um vendedor, com o print — para o gestor conferir */
export function remotosDoDia(userId, dia = new Date(), agora = new Date()) {
  const ini = startOfDay(dia);
  const fim = endOfDay(dia);
  return table('clients')
    .filter(
      (c) => ehLead(c) && c.origem === 'remoto' && donoDoLead(c) === userId &&
        new Date(c.createdAt) >= ini && new Date(c.createdAt) <= fim
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((c) => ({
      id: c.id,
      company: c.company,
      name: c.name,
      cnpj: c.cnpj,
      createdAt: c.createdAt,
      status: statusDoLead(c, agora),
      print: c.print ? { url: c.print.url, comResposta: c.print.comResposta, recusado: Boolean(c.print.recusado) } : null,
      whatsappIniciadoAt: c.whatsappIniciadoAt ?? null,
    }));
}
