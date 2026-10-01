// Imagens que saem do celular do vendedor: foto de visita e print de conversa.

const carregar = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
    img.src = src;
  });

const lerComoDataUrl = (arquivo) =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.readAsDataURL(arquivo);
  });

/** Desenha a imagem (ou o quadro da câmera) reduzida e devolve um JPEG leve */
export function reduzir(fonte, largura, altura, maxLado = 1280, qualidade = 0.72) {
  const escala = Math.min(1, maxLado / Math.max(largura, altura));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  canvas.getContext('2d').drawImage(fonte, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', qualidade);
}

/** Reduz o arquivo antes de enviar: o celular do vendedor costuma estar no 4G */
export async function comprimirImagem(arquivo, maxLado = 1280, qualidade = 0.72) {
  const img = await carregar(await lerComoDataUrl(arquivo));
  return reduzir(img, img.width, img.height, maxLado, qualidade);
}

/**
 * "Assinatura visual" da imagem: 256 bits que mudam pouco quando duas imagens
 * são quase iguais (o mesmo print recortado, ou com a hora editada). A imagem
 * vira uma miniatura cinza de 16×16 e cada ponto vira 1 se for mais claro que
 * a média. O servidor compara as assinaturas e avisa o gestor — não bloqueia.
 */
export async function assinaturaVisual(dataUrl) {
  const img = await carregar(dataUrl);
  const LADO = 16;
  const canvas = document.createElement('canvas');
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, LADO, LADO);
  const { data } = ctx.getImageData(0, 0, LADO, LADO);

  const cinzas = [];
  for (let i = 0; i < data.length; i += 4) {
    cinzas.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  const media = cinzas.reduce((s, v) => s + v, 0) / cinzas.length;

  let hex = '';
  for (let i = 0; i < cinzas.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (cinzas[i + b] > media ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** Print de conversa pronto para enviar: comprimido e com a assinatura */
export async function prepararPrint(arquivo) {
  const dataUrl = await comprimirImagem(arquivo, 1600, 0.8);
  let assinatura = null;
  try {
    assinatura = await assinaturaVisual(dataUrl);
  } catch {
    /* sem assinatura o print vale do mesmo jeito */
  }
  return { dataUrl, assinatura, nome: arquivo.name };
}
