// Verificação do PWA, sem precisar de navegador:
//   1. executa web/public/sw.js num escopo de service worker simulado
//      (precache, limpeza de versão antiga, navegação offline, cache dos
//      arquivos com hash e o desvio das rotas de API);
//   2. confere o manifest contra o que o Chrome exige para oferecer instalação.
//
//   npm run teste:pwa

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(__dirname, '..', 'public');

let falhas = 0;
const ok = (c, label, extra = '') => {
  console.log(`${c ? '  OK  ' : ' FALHA'} · ${label}${extra ? ` — ${extra}` : ''}`);
  if (!c) falhas++;
};

/* ---------------------------------------------------- ambiente simulado */

class RespostaFalsa {
  constructor(corpo, { ok = true, type = 'basic' } = {}) {
    this.corpo = corpo;
    this.ok = ok;
    this.type = type;
  }
  clone() {
    return new RespostaFalsa(this.corpo, { ok: this.ok, type: this.type });
  }
}
RespostaFalsa.error = () => new RespostaFalsa('erro', { ok: false, type: 'error' });

const chaveDe = (req) => (typeof req === 'string' ? req : req.url);

class CacheFalso {
  constructor() { this.itens = new Map(); }
  async addAll(urls) { for (const u of urls) this.itens.set(new URL(u, 'http://app').href, new RespostaFalsa('precache:' + u)); }
  async put(req, res) { this.itens.set(new URL(chaveDe(req), 'http://app').href, res); }
  async match(req) { return this.itens.get(new URL(chaveDe(req), 'http://app').href) ?? undefined; }
}

const caches = {
  grupos: new Map(),
  async open(nome) {
    if (!this.grupos.has(nome)) this.grupos.set(nome, new CacheFalso());
    return this.grupos.get(nome);
  },
  async keys() { return [...this.grupos.keys()]; },
  async delete(nome) { return this.grupos.delete(nome); },
  async match(req) {
    for (const cache of this.grupos.values()) {
      const achado = await cache.match(req);
      if (achado) return achado;
    }
    return undefined;
  },
};

let redeDisponivel = true;
const pedidosNaRede = [];
const fetchFalso = async (req) => {
  pedidosNaRede.push(chaveDe(req));
  if (!redeDisponivel) throw new TypeError('Failed to fetch');
  return new RespostaFalsa('rede:' + chaveDe(req));
};

const ouvintes = {};
const self = {
  location: { origin: 'http://app' },
  addEventListener: (tipo, fn) => { (ouvintes[tipo] ??= []).push(fn); },
  skipWaiting: async () => { self.pulouEspera = true; },
  clients: { claim: async () => { self.assumiuControle = true; } },
};

function pedido(url, { method = 'GET', mode = 'no-cors' } = {}) {
  return { url: new URL(url, 'http://app').href, method, mode };
}

async function disparar(tipo, extra = {}) {
  const pendentes = [];
  let resposta;
  const evento = {
    ...extra,
    waitUntil: (p) => pendentes.push(p),
    respondWith: (p) => { resposta = p; },
  };
  for (const fn of ouvintes[tipo] ?? []) fn(evento);
  await Promise.all(pendentes);
  return resposta ? await resposta : undefined;
}

/* ------------------------------------------------------------ execução */

const codigo = fs.readFileSync(path.join(PUBLICO, 'sw.js'), 'utf8');
const executar = new Function('self', 'caches', 'fetch', 'Response', 'URL', codigo);
executar(self, caches, fetchFalso, RespostaFalsa, URL);

console.log('\n===== Service worker do CRM NewPay =====\n');

// 1. instalação: guarda a casca e assume o lugar na hora
await caches.open('casca-newpay-v0'); // sobra de uma versão anterior
await disparar('install');
const casca = await caches.open('casca-newpay-v1');
ok(self.pulouEspera === true, 'instalação assume sem esperar aba antiga fechar');
ok(await casca.match('/'), 'index.html guardado para abrir offline');
ok(await casca.match('/manifest.webmanifest'), 'manifest guardado');
ok(await casca.match('/icone-192.png'), 'ícone guardado');

// 2. ativação: limpa versões antigas
await disparar('activate');
ok(!(await caches.keys()).includes('casca-newpay-v0'), 'cache da versão anterior é apagado');
ok(self.assumiuControle === true, 'passa a controlar as abas abertas');

// 3. API nunca é interceptada
const respostaApi = await disparar('fetch', { request: pedido('/api/dashboard') });
ok(respostaApi === undefined, 'requisição de API passa direto, sem cache');
const respostaUpload = await disparar('fetch', { request: pedido('/uploads/foto.jpg') });
ok(respostaUpload === undefined, 'foto de visita não é guardada no aparelho');

// 4. POST e outras origens também passam direto
ok(
  (await disparar('fetch', { request: pedido('/api/visits', { method: 'POST' }) })) === undefined,
  'POST passa direto'
);
ok(
  (await disparar('fetch', { request: pedido('https://outro.site/x.js') })) === undefined,
  'requisição para outro domínio passa direto'
);

// 5. navegação com internet: vem da rede e atualiza a casca
pedidosNaRede.length = 0;
const nav = await disparar('fetch', { request: pedido('/pipeline', { mode: 'navigate' }) });
ok(nav?.corpo?.startsWith('rede:'), 'com internet, a navegação vem da rede (pega deploy novo)');
ok((await casca.match('/'))?.corpo?.startsWith('rede:'), 'a casca é atualizada com o que veio da rede');

// 6. navegação sem internet: cai para a casca guardada
redeDisponivel = false;
const navOffline = await disparar('fetch', { request: pedido('/carteira', { mode: 'navigate' }) });
ok(navOffline?.corpo?.startsWith('rede:'), 'sem internet, o app abre pela casca guardada', 'rota /carteira');
ok(navOffline?.type !== 'error', 'não devolve erro de rede na navegação offline');

// 7. arquivos com hash: primeira vez pela rede, depois direto do cache
redeDisponivel = true;
const arquivo = pedido('/assets/index-abc123.js');
const primeira = await disparar('fetch', { request: arquivo });
ok(primeira?.corpo === 'rede:http://app/assets/index-abc123.js', 'primeiro acesso ao JS vem da rede');
pedidosNaRede.length = 0;
const segunda = await disparar('fetch', { request: arquivo });
ok(segunda?.corpo?.startsWith('rede:'), 'segunda vez responde do cache');
ok(pedidosNaRede.length === 0, 'segunda vez não toca a rede', 'economiza dado do vendedor');

// 8. o mesmo arquivo continua abrindo offline
redeDisponivel = false;
const offline = await disparar('fetch', { request: arquivo });
ok(offline?.corpo?.startsWith('rede:'), 'JS do app carrega offline');

/* ------------------------------------------- manifest e icones no disco */

console.log('\n===== Manifest de instalação =====\n');

const manifest = JSON.parse(fs.readFileSync(path.join(PUBLICO, 'manifest.webmanifest'), 'utf8'));

ok(Boolean(manifest.name && manifest.short_name), 'tem nome e nome curto', manifest.short_name);
ok(Boolean(manifest.start_url), 'tem start_url', manifest.start_url);
ok(
  ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display),
  'abre fora do navegador',
  manifest.display
);
ok(/^#[0-9a-f]{6}$/i.test(manifest.theme_color ?? ''), 'tem cor de tema', manifest.theme_color);
ok(/^#[0-9a-f]{6}$/i.test(manifest.background_color ?? ''), 'tem cor de fundo da abertura');

/** Le largura e altura direto do cabecalho do PNG */
function tamanhoPng(arquivo) {
  const b = fs.readFileSync(path.join(PUBLICO, arquivo));
  if (b.slice(1, 4).toString() !== 'PNG') return null;
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

const porUso = (uso) =>
  (manifest.icons ?? []).filter((i) => (i.purpose ?? 'any').split(' ').includes(uso));

ok(porUso('any').some((i) => i.sizes === '192x192'), 'tem ícone de 192 (exigência do Chrome)');
ok(porUso('any').some((i) => i.sizes === '512x512'), 'tem ícone de 512 (exigência do Chrome)');
ok(porUso('maskable').length > 0, 'tem ícone maskable (não fica com moldura branca no Android)');

for (const icone of manifest.icons ?? []) {
  const arquivo = icone.src.replace(/^\//, '');
  const tamanho = fs.existsSync(path.join(PUBLICO, arquivo)) ? tamanhoPng(arquivo) : null;
  ok(tamanho === icone.sizes, `${arquivo} existe e mede o que o manifest promete`, tamanho ?? 'ausente');
}

ok(fs.existsSync(path.join(PUBLICO, 'apple-touch-icon.png')), 'tem ícone para iPhone (apple-touch-icon)');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
ok(html.includes('rel=\"manifest\"'), 'index.html aponta para o manifest');
ok(html.includes('apple-touch-icon'), 'index.html aponta o ícone do iPhone');

console.log(falhas ? `\n✖ ${falhas} falha(s)\n` : '\n✔ Tudo certo.\n');
process.exitCode = falhas ? 1 : 0;
