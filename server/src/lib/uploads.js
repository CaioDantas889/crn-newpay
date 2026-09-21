// Guarda anexos enviados em base64: fotos e áudio de visita, e os PDFs da
// biblioteca comercial.
// Os arquivos vão para <NEWPAY_DATA_DIR>/uploads e são servidos em /uploads.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../store.js';

// Mesmo diretório de dados do banco: em produção é o volume persistente.
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const EXTENSOES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

const TAMANHO_MAXIMO = 8 * 1024 * 1024; // 8 MB por foto/áudio de visita
// Material da biblioteca pode ser um treinamento gravado: cabe mais.
export const TAMANHO_MAXIMO_MATERIAL = 64 * 1024 * 1024;

export const extensaoDe = (mime) => EXTENSOES[mime] ?? null;
export const tiposAceitos = () => Object.keys(EXTENSOES);

/**
 * Recebe uma data URL ("data:image/jpeg;base64,...") e grava o arquivo.
 * Devolve { url, tipo, tamanho } ou null se o conteúdo não for aceito.
 */
export function salvarDataUrl(dataUrl, prefixo = 'anexo') {
  if (typeof dataUrl !== 'string') return null;

  const match = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) return null;

  const [, mime, base64] = match;
  const extensao = EXTENSOES[mime];
  if (!extensao) return null;

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > TAMANHO_MAXIMO) return null;

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const nome = `${prefixo}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}.${extensao}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, nome), buffer);

  return { url: `/uploads/${nome}`, tipo: mime, tamanho: buffer.length };
}

/**
 * Grava um arquivo que chegou como binário puro (sem base64). É por aqui que
 * entram os vídeos: o mesmo arquivo em base64 ficaria 33% maior e estouraria
 * o limite do corpo JSON.
 */
export function salvarBinario(buffer, mime, { prefixo = 'material', limite = TAMANHO_MAXIMO_MATERIAL } = {}) {
  const extensao = EXTENSOES[mime];
  if (!extensao) return { erro: `Tipo de arquivo não aceito (${mime || 'desconhecido'}).` };
  if (!buffer?.length) return { erro: 'Arquivo vazio.' };
  if (buffer.length > limite) {
    return { erro: `Arquivo grande demais (${Math.round(buffer.length / 1048576)} MB). O limite é ${Math.round(limite / 1048576)} MB.` };
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const nome = `${prefixo}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}.${extensao}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, nome), buffer);

  return { url: `/uploads/${nome}`, tipo: mime, tamanho: buffer.length };
}

export const salvarVarios = (lista = [], prefixo) =>
  lista.map((item) => salvarDataUrl(item?.dataUrl ?? item, prefixo)).filter(Boolean);

/** Apaga um anexo do disco a partir da URL pública (/uploads/arquivo.jpg) */
export function removerArquivo(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return false;
  const nome = path.basename(url);
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, nome));
    return true;
  } catch {
    return false; // já removido ou inexistente
  }
}

/** Apaga todos os anexos de uma visita (fotos + áudio) */
export function removerAnexosDaVisita(visita) {
  const alvos = [...(visita?.fotos ?? []).map((f) => f.url), visita?.audio?.url].filter(Boolean);
  return alvos.filter(removerArquivo).length;
}
