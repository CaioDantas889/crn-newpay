// Links de contato e a posição do aparelho, usados no cadastro de lead, no
// follow-up e na ficha do cliente.

const digitos = (v = '') => String(v ?? '').replace(/\D/g, '');

/** wa.me precisa do número com o 55 na frente (e sem 0 de operadora) */
export function linkWhatsApp(telefone, texto = '') {
  let d = digitos(telefone).replace(/^0+/, '');
  if (!d) return null;
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = `55${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

export const linkTelefone = (telefone) => `tel:${digitos(telefone)}`;

/** Códigos do navegador para falha de GPS (1 negado, 2 indisponível, 3 demorou) */
const MOTIVOS_LOCALIZACAO = {
  1: 'Localização bloqueada para este endereço. Libere no cadeado da barra de endereço.',
  2: 'O aparelho não conseguiu achar a posição. Saia de perto de paredes e tente de novo.',
  3: 'O GPS demorou demais para responder. Tente de novo.',
};

/**
 * Posição do aparelho agora: { lat, lng, precisao }. Rejeita com a mensagem
 * que explica o motivo — quem chama só precisa mostrar.
 */
export function pegarPosicao() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      return reject(new Error(`Localização só funciona em HTTPS ou localhost (aqui é ${window.location.origin}).`));
    }
    if (!navigator.geolocation) return reject(new Error('Este aparelho não informa a localização.'));

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: Math.round(pos.coords.accuracy),
        }),
      (erro) => reject(new Error(MOTIVOS_LOCALIZACAO[erro.code] ?? 'Não consegui pegar a localização.')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 20_000 }
    );
  });
}

/** <input type="datetime-local"> → ISO, ou undefined quando vazio */
export const isoDoInput = (valor) => (valor ? new Date(valor).toISOString() : undefined);
