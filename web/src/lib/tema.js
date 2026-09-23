// Tema claro/escuro. A escolha é do aparelho, não da conta: o mesmo vendedor
// usa o claro no sol da rua e o escuro na hora de fechar o dia. Por isso fica
// no localStorage e não no banco.
//
// Quem aplica o tema na primeira pintura é o script inline do index.html —
// aqui só ficam a leitura e a troca, para a tela não piscar branco antes do
// React montar.

export const CHAVE_TEMA = 'newpay-tema';
const TEMAS = ['claro', 'escuro'];

const CORES_BARRA = { claro: '#ffffff', escuro: '#04070b' };

/** O que o aparelho já decidiu: o que foi salvo, ou o que o sistema prefere */
export function temaPreferido() {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (TEMAS.includes(salvo)) return salvo;
  } catch {
    /* navegador sem storage (aba anônima, cookies bloqueados): segue o sistema */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

/** Aplica no documento, tenta lembrar, e devolve o tema aplicado */
export function aplicarTema(tema) {
  const escolhido = TEMAS.includes(tema) ? tema : 'claro';
  document.documentElement.dataset.tema = escolhido;

  // A barra do navegador/celular acompanha o tema do app
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CORES_BARRA[escolhido]);

  try {
    localStorage.setItem(CHAVE_TEMA, escolhido);
  } catch {
    /* sem storage o tema vale só nesta sessão */
  }
  return escolhido;
}

export const outroTema = (tema) => (tema === 'escuro' ? 'claro' : 'escuro');
