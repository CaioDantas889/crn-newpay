// Gera os ícones do app (PNG) a partir da mesma marca do favicon: quadrado
// arredondado azul-marinho com o "N" verde da NewPay.
//
//   node scripts/gerar-icones.mjs
//
// Escreve direto em web/public/. Não depende de nada instalado: o PNG é montado
// na mão (zlib do próprio Node), então isso roda em qualquer máquina.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(__dirname, '..', 'public');

const FUNDO = [16, 25, 53]; // --navy-900
const MARCA = [52, 211, 153]; // --brand

/* ------------------------------------------------------------ PNG cru --- */

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function png(lado, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada linha começa com o byte de filtro (0 = sem filtro)
  const linhas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) {
    const destino = y * (lado * 4 + 1);
    linhas[destino] = 0;
    pixels.copy(linhas, destino + 1, y * lado * 4, (y + 1) * lado * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------- desenho ---- */

/** Está dentro do quadrado arredondado de lado 1 (coordenadas 0..1)? */
function dentroDoQuadrado(x, y, raio) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const px = Math.min(Math.max(x, raio), 1 - raio);
  const py = Math.min(Math.max(y, raio), 1 - raio);
  const dx = x - px;
  const dy = y - py;
  return dx * dx + dy * dy <= raio * raio;
}

/** Está dentro do "N"? Duas hastes verticais e a diagonal ligando as duas. */
function dentroDoN(x, y) {
  const topo = 0.26;
  const base = 0.74;
  if (y < topo || y > base) return false;

  const esquerda = 0.235;
  const direita = 0.765;
  const espessura = 0.115;

  if (x >= esquerda && x <= esquerda + espessura) return true;
  if (x >= direita - espessura && x <= direita) return true;

  // A diagonal desce da haste esquerda até a haste direita; a largura medida na
  // horizontal é maior que a espessura real por causa da inclinação.
  const centro =
    esquerda + espessura / 2 +
    ((y - topo) / (base - topo)) * (direita - espessura / 2 - esquerda - espessura / 2);
  const inclinacao = (direita - esquerda - espessura) / (base - topo);
  const meiaLargura = (espessura / 2) * Math.sqrt(1 + inclinacao * inclinacao);
  return Math.abs(x - centro) <= meiaLargura;
}

/**
 * Desenha o ícone com supersampling (3x3 por pixel) para as bordas saírem
 * suaves. `margem` deixa a marca menor dentro da arte — é o que o Android pede
 * nos ícones "maskable", que ele recorta em círculo.
 */
function desenhar(lado, { margem = 0, fundoInteiro = false } = {}) {
  const pixels = Buffer.alloc(lado * lado * 4);
  const amostras = 3;
  const raio = 0.22;
  const escala = 1 - margem * 2;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let cobertura = 0;
      let letra = 0;

      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const px = (x + (sx + 0.5) / amostras) / lado;
          const py = (y + (sy + 0.5) / amostras) / lado;
          // Coordenada dentro da arte, já descontada a margem
          const ax = (px - margem) / escala;
          const ay = (py - margem) / escala;

          if (fundoInteiro || dentroDoQuadrado(ax, ay, raio)) cobertura++;
          if (dentroDoN(ax, ay)) letra++;
        }
      }

      const total = amostras * amostras;
      const alfa = fundoInteiro ? 1 : cobertura / total;
      const proporcaoLetra = letra / total;

      const destino = (y * lado + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[destino + c] = Math.round(
          FUNDO[c] * (1 - proporcaoLetra) + MARCA[c] * proporcaoLetra
        );
      }
      pixels[destino + 3] = Math.round(alfa * 255);
    }
  }

  return png(lado, pixels);
}

/* ------------------------------------------------------------ arquivos -- */

fs.mkdirSync(SAIDA, { recursive: true });

const arquivos = [
  ['icone-192.png', desenhar(192)],
  ['icone-512.png', desenhar(512)],
  // Maskable: fundo sangrando até a borda e marca recuada, porque o Android
  // recorta o ícone no formato do sistema (círculo, squircle...).
  ['icone-maskable-512.png', desenhar(512, { margem: 0.14, fundoInteiro: true })],
  // iOS não usa o manifest: ele pega este arquivo, e sem transparência.
  ['apple-touch-icon.png', desenhar(180, { margem: 0.06, fundoInteiro: true })],
];

for (const [nome, conteudo] of arquivos) {
  fs.writeFileSync(path.join(SAIDA, nome), conteudo);
  console.log(`${nome} · ${(conteudo.length / 1024).toFixed(1)} kB`);
}
