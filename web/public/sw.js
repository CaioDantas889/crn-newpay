// Service worker do CRM NewPay.
//
// O que ele faz: deixa o app abrir instalado e sem internet (a casca da
// aplicação fica no aparelho).
// O que ele NÃO faz de propósito: guardar respostas da API nem as fotos de
// visita. Dado de cliente, funil e comissão tem que ser o do servidor — CRM
// mostrando número velho é pior do que CRM avisando que está sem conexão.

const VERSAO = 'newpay-v1';
const CASCA = `casca-${VERSAO}`;
const ARQUIVOS = `arquivos-${VERSAO}`;

// O index.html é a porta de entrada de qualquer rota do app (SPA).
const ENTRADA = '/';
const ESSENCIAIS = [ENTRADA, '/manifest.webmanifest', '/icone-192.png', '/icone-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CASCA)
      .then((cache) => cache.addAll(ESSENCIAIS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(nomes.filter((n) => n !== CASCA && n !== ARQUIVOS).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

/** Rotas que nunca passam pelo cache */
function ignorar(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/');
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || ignorar(url)) return;

  // Navegação: tenta a rede (para pegar versão nova assim que sobe um deploy) e
  // cai para a casca guardada quando o vendedor está sem sinal.
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CASCA).then((cache) => cache.put(ENTRADA, copia));
          return resposta;
        })
        .catch(() => caches.match(ENTRADA).then((guardada) => guardada ?? Response.error()))
    );
    return;
  }

  // JS e CSS do build levam hash no nome, então o que está em cache nunca está
  // desatualizado: responde na hora e só busca na rede o que ainda não tem.
  evento.respondWith(
    caches.match(request).then((guardada) => {
      if (guardada) return guardada;
      return fetch(request)
        .then((resposta) => {
          if (resposta.ok && resposta.type === 'basic') {
            const copia = resposta.clone();
            caches.open(ARQUIVOS).then((cache) => cache.put(request, copia));
          }
          return resposta;
        })
        .catch(() => guardada ?? Response.error());
    })
  );
});
