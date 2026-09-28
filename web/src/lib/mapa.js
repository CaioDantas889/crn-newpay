// Conta de mapa sem biblioteca: a projeção Web Mercator, a mesma do Google Maps
// e do OpenStreetMap. Em cada zoom o mundo vira um quadrado de 256 × 2^zoom
// pixels, recortado em imagens de 256 px ("tiles") que o OpenStreetMap serve
// prontas, sem chave e sem custo — em troca, pede o crédito no canto do mapa.

export const TILE = 256;
const ZOOM_MAXIMO = 16; // nome de rua legível, sem virar um quarteirão só
const ZOOM_MINIMO = 3;

const urlDoTile = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/** Latitude/longitude → posição no mundo, de 0 a 1 nos dois eixos */
function projetar(lat, lng) {
  const seno = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI),
  };
}

/**
 * O maior zoom em que todos os pontos cabem na janela — com folga para o pino
 * da borda não sair cortado — e o canto superior esquerdo da janela, em pixels
 * do mundo nesse zoom.
 */
export function enquadrar(pontos, largura, altura, folga = 40) {
  const projetados = pontos.map((p) => projetar(p.lat, p.lng));
  const xs = projetados.map((p) => p.x);
  const ys = projetados.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  let zoom = ZOOM_MAXIMO;
  while (
    zoom > ZOOM_MINIMO &&
    ((maxX - minX) * TILE * 2 ** zoom > largura - 2 * folga ||
      (maxY - minY) * TILE * 2 ** zoom > altura - 2 * folga)
  ) {
    zoom--;
  }

  const escala = TILE * 2 ** zoom;
  return {
    zoom,
    x0: Math.round(((minX + maxX) / 2) * escala - largura / 2),
    y0: Math.round(((minY + maxY) / 2) * escala - altura / 2),
  };
}

/** Onde a coordenada cai dentro da janela, em pixels */
export function naJanela({ zoom, x0, y0 }, lat, lng) {
  const { x, y } = projetar(lat, lng);
  const escala = TILE * 2 ** zoom;
  return { x: x * escala - x0, y: y * escala - y0 };
}

/** Quantos pixels uma distância em metros ocupa, naquela latitude e zoom */
export const metrosEmPixels = (metros, lat, zoom) =>
  metros / ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom);

/** As imagens que cobrem a janela, cada uma com a posição onde é desenhada */
export function tilesDaJanela({ zoom, x0, y0 }, largura, altura) {
  const n = 2 ** zoom;
  const tiles = [];
  for (let ty = Math.floor(y0 / TILE); ty * TILE < y0 + altura; ty++) {
    if (ty < 0 || ty >= n) continue; // além do polo não há mapa
    for (let tx = Math.floor(x0 / TILE); tx * TILE < x0 + largura; tx++) {
      tiles.push({
        chave: `${zoom}/${tx}/${ty}`,
        url: urlDoTile(zoom, ((tx % n) + n) % n, ty),
        left: tx * TILE - x0,
        top: ty * TILE - y0,
      });
    }
  }
  return tiles;
}

/**
 * Pinos que caem um em cima do outro — a equipe que bate o ponto junta na
 * base, a entrada e a saída no mesmo balcão — se abrem em roda em volta do
 * ponto comum, para nenhum esconder o outro.
 */
export function espalhar(pinos, minimo = 30) {
  const grupos = [];
  for (const pino of pinos) {
    const grupo = grupos.find((g) => Math.hypot(g[0].x - pino.x, g[0].y - pino.y) < minimo);
    if (grupo) grupo.push(pino);
    else grupos.push([pino]);
  }

  return grupos.flatMap((grupo) => {
    if (grupo.length === 1) return grupo;
    const cx = grupo.reduce((s, p) => s + p.x, 0) / grupo.length;
    const cy = grupo.reduce((s, p) => s + p.y, 0) / grupo.length;
    const raio = 12 + grupo.length * 4;
    return grupo.map((p, i) => {
      const angulo = (2 * Math.PI * i) / grupo.length - Math.PI / 2;
      return { ...p, x: cx + raio * Math.cos(angulo), y: cy + raio * Math.sin(angulo) };
    });
  });
}

/** 12 → "12 m"; 1500 → "1,5 km"; 50000 → "50 km" */
export function distancia(metros) {
  if (metros < 1000) return `${Math.round(metros)} m`;
  const km = metros / 1000;
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
