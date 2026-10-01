// Sinais de alerta automáticos. Nada aqui bloqueia cadastro nem acusa
// ninguém: aponta o que o gestor precisa olhar — o histórico no mapa e o
// print estão a um clique. Os limites ficam em ALERTAS_SUSPEITA (domain.js).

import { table } from './store.js';
import { ALERTAS_SUSPEITA, PRECISAO_MAXIMA_PONTO_M, TIPOS_ALERTA } from './domain.js';
import { haversine } from './lib/geo.js';
import { addDays, dateKey, startOfDay } from './lib/dates.js';
import { donoDoLead, ehLead, statusDoLead } from './leads.js';

const metros = (a, b) => haversine(a, b) * 1000;
const temGps = (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng) && (v.lat !== 0 || v.lng !== 0);
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Bits diferentes entre duas assinaturas visuais (hex de 64 caracteres) */
function distancia(a, b) {
  let bits = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/** Todos os prints da base: o do cadastro do lead e os de cada follow-up */
function todosOsPrints() {
  const prints = [];
  for (const c of table('clients')) {
    if (c.print?.hash) prints.push({ ...c.print, clientId: c.id, userId: donoDoLead(c) });
  }
  for (const f of table('followups')) {
    if (f.print?.hash) prints.push({ ...f.print, clientId: f.clientId, userId: f.concluidoPor ?? f.userId });
  }
  return prints;
}

/**
 * Alertas de suspeita de um intervalo. Cada alerta diz de quem é, quando foi,
 * o que chamou atenção e quais leads olhar.
 */
export function alertasDeSuspeita({ de, ate, userId = null }) {
  const L = ALERTAS_SUSPEITA;
  const alertas = [];
  const nomeDoCliente = new Map(table('clients').map((c) => [c.id, c.company || c.name]));
  const usuarios = new Map(table('users').map((u) => [u.id, u]));
  const dentro = (iso) => new Date(iso) >= de && new Date(iso) <= ate;
  const doAlvo = (id) => !userId || id === userId;

  const push = (tipo, vendedorId, at, texto, extra = {}) =>
    alertas.push({
      id: `${tipo}:${vendedorId}:${extra.chave ?? at}`,
      tipo,
      label: TIPOS_ALERTA[tipo],
      vendedorId,
      at,
      data: dateKey(at),
      texto,
      clientIds: extra.clientIds ?? [],
      urls: extra.urls ?? [],
    });

  /* ------------------------------------------------ GPS e horário ------ */
  const porVendedorEDia = new Map();
  for (const v of table('visits')) {
    if (!dentro(v.at) || !doAlvo(v.userId)) continue;
    const chave = `${v.userId}|${dateKey(v.at)}`;
    if (!porVendedorEDia.has(chave)) porVendedorEDia.set(chave, []);
    porVendedorEDia.get(chave).push(v);
  }

  for (const visitas of porVendedorEDia.values()) {
    visitas.sort((a, b) => new Date(a.at) - new Date(b.at));
    const vendedor = usuarios.get(visitas[0].userId);

    // Várias visitas (a clientes diferentes) no mesmo ponto
    const agrupadas = new Set();
    for (const centro of visitas) {
      if (agrupadas.has(centro.id) || !temGps(centro)) continue;
      const grupo = visitas.filter((v) => temGps(v) && metros(centro, v) <= L.raioMesmoPontoM);
      const clientes = [...new Set(grupo.map((v) => v.clientId))];
      if (clientes.length < L.minVisitasMesmoPonto) continue;
      grupo.forEach((v) => agrupadas.add(v.id));
      push(
        'gps_mesmo_ponto', centro.userId, centro.at,
        `${clientes.length} lojas diferentes registradas no mesmo ponto (raio de ${L.raioMesmoPontoM} m), ` +
          `entre ${hhmm(grupo[0].at)} e ${hhmm(grupo[grupo.length - 1].at)}.`,
        { clientIds: clientes, chave: centro.id }
      );
    }

    // Menos de 3 minutos entre uma visita e outra
    for (let i = 1; i < visitas.length; i++) {
      const anterior = visitas[i - 1];
      const atual = visitas[i];
      if (anterior.clientId === atual.clientId) continue;
      const minutos = (new Date(atual.at) - new Date(anterior.at)) / 60000;
      if (minutos < L.minutosEntreVisitas) {
        push(
          'intervalo_curto', atual.userId, atual.at,
          `${nomeDoCliente.get(anterior.clientId) ?? 'Visita'} às ${hhmm(anterior.at)} e ` +
            `${nomeDoCliente.get(atual.clientId) ?? 'outra'} às ${hhmm(atual.at)}: ` +
            `${minutos < 1 ? 'menos de 1 minuto' : `${Math.floor(minutos)} min`} de intervalo.`,
          { clientIds: [anterior.clientId, atual.clientId], chave: atual.id }
        );
      }
    }

    for (const v of visitas) {
      const loja = nomeDoCliente.get(v.clientId) ?? 'Visita';

      if (!temGps(v)) {
        if (v.semGps) {
          push('sem_gps', v.userId, v.at, `${loja} às ${hhmm(v.at)}: revisita registrada sem a posição do aparelho.`, {
            clientIds: [v.clientId], chave: v.id,
          });
        }
        continue;
      }

      // Fora da região: longe demais da base do vendedor
      const base = vendedor?.base;
      if (base && (base.lat || base.lng)) {
        const raio = Number(vendedor.raioRegiaoKm) || L.raioRegiaoKmPadrao;
        const km = haversine(base, v);
        if (km > raio) {
          push(
            'fora_da_regiao', v.userId, v.at,
            `${loja} às ${hhmm(v.at)}: a ${Math.round(km)} km da base (região de ${raio} km).`,
            { clientIds: [v.clientId], chave: v.id }
          );
        }
      }

      if (Number(v.precisao) > PRECISAO_MAXIMA_PONTO_M) {
        push(
          'gps_impreciso', v.userId, v.at,
          `${loja} às ${hhmm(v.at)}: posição com margem de ±${Math.round(v.precisao)} m — o aparelho não usou o GPS.`,
          { clientIds: [v.clientId], chave: v.id }
        );
      }
    }
  }

  /* --------------------------------------------------------- prints ---- */
  const prints = todosOsPrints();
  const janelaParecidos = startOfDay(addDays(ate, -30));
  const vistos = new Set();

  for (const p of prints) {
    if (!dentro(p.at) || !doAlvo(p.userId)) continue;

    for (const outro of prints) {
      if (outro === p || outro.clientId === p.clientId) continue;
      // Cada par aparece uma vez, do lado do print mais recente
      if (new Date(outro.at) > new Date(p.at)) continue;
      const par = [`${p.clientId}@${p.at}`, `${outro.clientId}@${outro.at}`].sort().join('|');
      if (vistos.has(par)) continue;

      const lojas = `${nomeDoCliente.get(p.clientId) ?? 'um lead'} e ${nomeDoCliente.get(outro.clientId) ?? 'outro lead'}`;

      if (outro.hash === p.hash) {
        vistos.add(par);
        const deQuem = outro.userId !== p.userId ? ` (o outro é de ${usuarios.get(outro.userId)?.name ?? 'outro vendedor'})` : '';
        push('print_repetido', p.userId, p.at, `O mesmo arquivo de print foi usado em ${lojas}${deQuem}.`, {
          clientIds: [p.clientId, outro.clientId], urls: [p.url, outro.url], chave: par,
        });
      } else if (
        outro.userId === p.userId &&
        p.assinatura && outro.assinatura &&
        new Date(outro.at) >= janelaParecidos &&
        distancia(p.assinatura, outro.assinatura) <= L.distanciaPrintParecido
      ) {
        vistos.add(par);
        push('print_parecido', p.userId, p.at, `Prints muito parecidos em ${lojas}. Vale abrir os dois lado a lado.`, {
          clientIds: [p.clientId, outro.clientId], urls: [p.url, outro.url], chave: par,
        });
      }
    }
  }

  /* ------------------------------------------- remotos em sequência ---- */
  const remotos = table('clients')
    .filter((c) => c.origem === 'remoto' && dentro(c.createdAt) && doAlvo(donoDoLead(c)))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const porVendedor = new Map();
  for (const c of remotos) {
    const dono = donoDoLead(c);
    if (!porVendedor.has(dono)) porVendedor.set(dono, []);
    porVendedor.get(dono).push(c);
  }

  for (const [vendedorId, leads] of porVendedor) {
    let i = 0;
    while (i < leads.length) {
      // A rajada cresce enquanto o próximo lead estiver dentro da janela
      let j = i;
      while (
        j + 1 < leads.length &&
        (new Date(leads[j + 1].createdAt) - new Date(leads[i].createdAt)) / 60000 <= L.minutosSequenciaRemotos
      ) {
        j++;
      }
      const rajada = leads.slice(i, j + 1);
      if (rajada.length >= L.remotosEmSequencia) {
        const ultimo = rajada[rajada.length - 1];
        push(
          'remotos_sequencia', vendedorId, ultimo.createdAt,
          `${rajada.length} leads remotos cadastrados entre ${hhmm(rajada[0].createdAt)} e ${hhmm(ultimo.createdAt)}.`,
          { clientIds: rajada.map((c) => c.id), chave: rajada[0].id }
        );
        i = j + 1;
      } else {
        i++;
      }
    }
  }

  /* ------------------- remoto que não converte, presencial que sim ----- */
  const desde = startOfDay(addDays(ate, -30));
  const conv = new Map();
  const vendeu = new Set(table('deals').filter((d) => d.fechamentoAt).map((d) => d.clientId));

  for (const c of table('clients')) {
    if (!ehLead(c) || new Date(c.createdAt) < desde || new Date(c.createdAt) > ate) continue;
    if (statusDoLead(c, ate) === 'fantasma') continue;
    const dono = donoDoLead(c);
    if (!doAlvo(dono)) continue;
    if (!conv.has(dono)) conv.set(dono, { presencial: 0, presencialVendas: 0, remoto: 0, remotoVendas: 0 });
    const linha = conv.get(dono);
    linha[c.origem] += 1;
    if (vendeu.has(c.id)) linha[`${c.origem}Vendas`] += 1;
  }

  for (const [vendedorId, c] of conv) {
    if (c.remoto >= L.minRemotosSemVenda && c.remotoVendas === 0 && c.presencialVendas > 0) {
      push(
        'conversao_remota', vendedorId, new Date(Math.min(ate.getTime(), Date.now())).toISOString(),
        `${c.remoto} leads remotos em 30 dias e nenhuma venda, enquanto os presenciais fecharam ${c.presencialVendas}.`,
        { chave: dateKey(ate) }
      );
    }
  }

  return alertas.sort((a, b) => new Date(b.at) - new Date(a.at));
}
