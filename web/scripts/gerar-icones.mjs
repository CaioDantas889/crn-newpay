// Gera os ícones do app instalado a partir do logotipo oficial da NewPay Bank
// (web/public/logo-npb.png): quadrado claro com o "npb" no meio.
//
//   node scripts/gerar-icones.mjs
//
// Escreve direto em web/public/. Não depende de nada instalado — o PNG é lido e
// montado na mão, com o zlib do próprio Node —, então roda em qualquer máquina.
// Trocou o logotipo? Ponha o arquivo novo no lugar e rode isto de novo.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(__dirname, '..', 'public');
const LOGOTIPO = path.join(SAIDA, 'logo-npb.png');

// Fundo claro: o logotipo tem o "p" preto, que sumiria num quadrado escuro.
const FUNDO = [255, 255, 255];

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

/**
 * Lê um PNG RGBA de 8 bits sem entrelaçamento — que é o que a arte do
 * logotipo é. Desfaz os filtros linha a linha (a especificação prevê cinco) e
 * devolve { largura, altura, pixels } com 4 bytes por pixel.
 */
function lerPng(caminho) {
  const arquivo = fs.readFileSync(caminho);
  let pos = 8; // pula a assinatura
  let largura = 0;
  let altura = 0;
  const partes = [];

  while (pos < arquivo.length) {
    const tamanho = arquivo.readUInt32BE(pos);
    const tipo = arquivo.toString('ascii', pos + 4, pos + 8);
    const dados = arquivo.subarray(pos + 8, pos + 8 + tamanho);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      if (dados[8] !== 8 || dados[9] !== 6 || dados[12] !== 0) {
        throw new Error('o logotipo precisa ser PNG RGBA de 8 bits, sem entrelaçamento');
      }
    } else if (tipo === 'IDAT') {
      partes.push(dados);
    } else if (tipo === 'IEND') {
      break;
    }
    pos += 12 + tamanho;
  }

  const cru = zlib.inflateSync(Buffer.concat(partes));
  const passo = largura * 4;
  const pixels = Buffer.alloc(altura * passo);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (passo + 1)];
    const origem = y * (passo + 1) + 1;
    const destino = y * passo;
    for (let i = 0; i < passo; i++) {
      const bruto = cru[origem + i];
      const a = i >= 4 ? pixels[destino + i - 4] : 0;
      const b = y > 0 ? pixels[destino - passo + i] : 0;
      const c = y > 0 && i >= 4 ? pixels[destino - passo + i - 4] : 0;
      let valor;
      if (filtro === 0) valor = bruto;
      else if (filtro === 1) valor = bruto + a;
      else if (filtro === 2) valor = bruto + b;
      else if (filtro === 3) valor = bruto + ((a + b) >> 1);
      else if (filtro === 4) valor = bruto + paeth(a, b, c);
      else throw new Error(`filtro de linha desconhecido: ${filtro}`);
      pixels[destino + i] = valor & 0xff;
    }
  }

  return { largura, altura, pixels };
}

/* ----------------------------------------------------------- desenho ---- */

const logotipo = lerPng(LOGOTIPO);

/**
 * Média das cores de um retângulo do logotipo, com o peso da transparência —
 * é o que evita a auréola clara em volta das letras quando a arte encolhe.
 */
function amostra(x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, alfa = 0, n = 0;
  const xa = Math.max(0, Math.floor(x0));
  const ya = Math.max(0, Math.floor(y0));
  const xb = Math.min(logotipo.largura, Math.ceil(x1));
  const yb = Math.min(logotipo.altura, Math.ceil(y1));

  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = (y * logotipo.largura + x) * 4;
      const a = logotipo.pixels[i + 3] / 255;
      r += logotipo.pixels[i] * a;
      g += logotipo.pixels[i + 1] * a;
      b += logotipo.pixels[i + 2] * a;
      alfa += a;
      n++;
    }
  }
  if (!n || alfa === 0) return [0, 0, 0, 0];
  return [r / alfa, g / alfa, b / alfa, alfa / n];
}

/**
 * Quadrado claro com o logotipo centralizado. `margem` é a folga em volta:
 * o Android recorta o ícone "maskable" no formato do sistema (círculo,
 * squircle...), então lá a arte precisa ficar bem para dentro.
 */
function desenhar(lado, { margem = 0.1 } = {}) {
  const pixels = Buffer.alloc(lado * lado * 4);

  const disponivel = lado * (1 - margem * 2);
  const escala = Math.min(disponivel / logotipo.largura, disponivel / logotipo.altura);
  const larguraArte = logotipo.largura * escala;
  const alturaArte = logotipo.altura * escala;
  const esquerda = (lado - larguraArte) / 2;
  const topo = (lado - alturaArte) / 2;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const destino = (y * lado + x) * 4;
      let [r, g, b, a] = [0, 0, 0, 0];

      if (x >= esquerda && x < esquerda + larguraArte && y >= topo && y < topo + alturaArte) {
        [r, g, b, a] = amostra(
          (x - esquerda) / escala,
          (y - topo) / escala,
          (x + 1 - esquerda) / escala,
          (y + 1 - topo) / escala
        );
      }

      // Sobre o fundo claro: o ícone é opaco, como o iOS exige
      for (let c = 0; c < 3; c++) {
        const cor = [r, g, b][c];
        pixels[destino + c] = Math.round(cor * a + FUNDO[c] * (1 - a));
      }
      pixels[destino + 3] = 255;
    }
  }

  return png(lado, pixels);
}

/* ------------------------------------------------------------ arquivos -- */

fs.mkdirSync(SAIDA, { recursive: true });

const arquivos = [
  ['icone-192.png', desenhar(192)],
  ['icone-512.png', desenhar(512)],
  // Maskable: arte recuada, porque o Android corta as beiradas
  ['icone-maskable-512.png', desenhar(512, { margem: 0.2 })],
  // iOS não usa o manifest: ele pega este arquivo, e sem transparência
  ['apple-touch-icon.png', desenhar(180, { margem: 0.08 })],
];

for (const [nome, conteudo] of arquivos) {
  fs.writeFileSync(path.join(SAIDA, nome), conteudo);
  console.log(`${nome} · ${(conteudo.length / 1024).toFixed(1)} kB`);
}
