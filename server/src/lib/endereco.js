// Converte coordenada em nome de rua (geocodificação reversa).
//
// Usa o Nominatim, o serviço aberto do OpenStreetMap: sem chave, sem cadastro,
// sem custo. Em troca ele pede identificação no User-Agent e no máximo uma
// consulta por segundo — folgado para o nosso uso, que é uma batida de ponto
// por vendedor no começo e outra no fim do dia.
//
// Duas regras de projeto aqui:
//   1. isto NUNCA bloqueia o registro. A batida é gravada na hora com a
//      coordenada; o endereço chega depois e completa o registro.
//   2. se o serviço estiver fora, a informação que importa (onde foi) continua
//      guardada em latitude e longitude.

import { config } from '../config.js';

const URL_BASE = 'https://nominatim.openstreetmap.org/reverse';
const TEMPO_LIMITE_MS = 5000;

// Coordenadas próximas caem no mesmo endereço: 4 casas ≈ 11 metros.
const chaveCache = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
const cache = new Map();
const CACHE_MAXIMO = 300;

/** "Rua do Comércio, 120 — Centro, Mombaça" a partir da resposta do Nominatim */
function formatar(dados) {
  const a = dados?.address ?? {};
  const rua = a.road ?? a.pedestrian ?? a.footway ?? a.neighbourhood ?? null;
  const numero = a.house_number ? `, ${a.house_number}` : '';
  const bairro = a.suburb ?? a.village ?? a.hamlet ?? null;
  const cidade = a.city ?? a.town ?? a.municipality ?? a.county ?? null;

  const inicio = rua ? `${rua}${numero}` : null;
  const fim = [bairro, cidade].filter(Boolean).join(', ');

  if (inicio && fim) return `${inicio} — ${fim}`;
  if (inicio) return inicio;
  if (fim) return fim;
  return dados?.display_name ?? null;
}

/**
 * Devolve o endereço da coordenada, ou null quando não dá para saber.
 * Nunca lança: quem chama não precisa se proteger.
 */
export async function buscarEndereco(lat, lng) {
  if (!config.geocodificar) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const chave = chaveCache(lat, lng);
  if (cache.has(chave)) return cache.get(chave);

  try {
    const url = `${URL_BASE}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`;
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: {
        // O Nominatim exige identificação de quem consulta
        'User-Agent': `NewPayCRM/1.0 (${config.contatoGeocodificacao})`,
        Accept: 'application/json',
      },
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

    const endereco = formatar(await resposta.json());

    if (cache.size >= CACHE_MAXIMO) cache.delete(cache.keys().next().value);
    cache.set(chave, endereco);
    return endereco;
  } catch (erro) {
    console.warn(`[endereco] não consegui converter ${chave}: ${erro.message}`);
    return null;
  }
}

/** Link do mapa para a coordenada — funciona mesmo sem geocodificação */
export const linkDoMapa = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : null;
