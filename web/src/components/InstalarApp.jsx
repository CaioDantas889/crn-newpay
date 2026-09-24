// Convite para instalar o CRM na tela inicial do celular.
// Some sozinho quando o app já está instalado ou quando o navegador não oferece
// instalação. No iPhone não existe o convite automático, então mostramos o
// caminho do menu Compartilhar.

import { useEffect, useState } from 'react';

const jaInstalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPad recente se apresenta como Mac, mas tem toque
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export default function InstalarApp() {
  const [convite, setConvite] = useState(null);
  const [instalado, setInstalado] = useState(jaInstalado);
  const [mostrandoPassos, setMostrandoPassos] = useState(false);

  useEffect(() => {
    const aoConvidar = (evento) => {
      evento.preventDefault(); // guardamos para disparar no clique do vendedor
      setConvite(evento);
    };
    const aoInstalar = () => {
      setInstalado(true);
      setConvite(null);
    };

    window.addEventListener('beforeinstallprompt', aoConvidar);
    window.addEventListener('appinstalled', aoInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', aoConvidar);
      window.removeEventListener('appinstalled', aoInstalar);
    };
  }, []);

  const instalar = async () => {
    if (!convite) return setMostrandoPassos(true);
    convite.prompt();
    const { outcome } = await convite.userChoice;
    if (outcome === 'accepted') setInstalado(true);
    setConvite(null);
  };

  if (instalado) return null;
  if (!convite && !ehIOS()) return null;

  return (
    <div className="card card-pad instalar-app">
      <div className="linha">
        <span className="emoji">⇩︎</span>
        <div className="crescer">
          <b>Instalar na tela inicial</b>
          <p className="mini">Abre como aplicativo, sem digitar endereço — e funciona melhor em campo.</p>
        </div>
        {!ehIOS() && (
          <button className="btn btn-brand btn-sm" onClick={instalar}>Instalar</button>
        )}
      </div>

      {ehIOS() && (
        <button className="btn btn-sm" onClick={() => setMostrandoPassos((v) => !v)}>
          {mostrandoPassos ? 'Ok, entendi' : 'Como instalar no iPhone'}
        </button>
      )}

      {mostrandoPassos && (
        <ol className="passos-instalacao">
          <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
          <li>Role e escolha <b>Adicionar à Tela de Início</b>.</li>
          <li>Confirme em <b>Adicionar</b>.</li>
        </ol>
      )}
    </div>
  );
}
