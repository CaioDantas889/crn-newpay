// Foto da fachada tirada pela câmera, dentro do app.
//
// Não existe campo de arquivo aqui de propósito: sem ele não há caminho para a
// galeria, e a foto do lead é sempre a que a câmera viu naquele momento.

import { useEffect, useRef, useState } from 'react';
import { reduzir } from '../lib/imagem.js';

const MOTIVOS = {
  NotAllowedError: 'Câmera bloqueada para este endereço. Libere no cadeado da barra de endereço e tente de novo.',
  PermissionDeniedError: 'Câmera bloqueada para este endereço. Libere no cadeado da barra de endereço.',
  NotFoundError: 'Nenhuma câmera encontrada neste aparelho.',
  NotReadableError: 'A câmera está sendo usada por outro aplicativo. Feche o outro app e tente de novo.',
  OverconstrainedError: 'A câmera deste aparelho não atendeu ao pedido. Tente de novo.',
};

function impedimento() {
  if (!window.isSecureContext) {
    return `A câmera só funciona em HTTPS ou localhost — este endereço é ${window.location.origin}.`;
  }
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador não dá acesso à câmera.';
  return null;
}

export default function CameraFoto({ foto, onFoto, rotulo = 'Foto da fachada' }) {
  const video = useRef(null);
  const fluxo = useRef(null);
  const [aoVivo, setAoVivo] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState(null);

  const desligar = () => {
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    setAoVivo(false);
  };

  // Sair do cadastro com a câmera ligada deixaria a luz do aparelho acesa
  useEffect(() => desligar, []);

  const ligar = async () => {
    const bloqueio = impedimento();
    if (bloqueio) return setErro(bloqueio);

    setErro(null);
    setAbrindo(true);
    try {
      fluxo.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setAoVivo(true);
    } catch (e) {
      setErro(MOTIVOS[e?.name] ?? `Não consegui abrir a câmera (${e?.name ?? 'erro'}).`);
    } finally {
      setAbrindo(false);
    }
  };

  // O <video> só existe depois de aoVivo virar true: liga o fluxo nele aqui
  useEffect(() => {
    if (aoVivo && video.current && fluxo.current) {
      video.current.srcObject = fluxo.current;
      video.current.play().catch(() => {});
    }
  }, [aoVivo]);

  const fotografar = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    onFoto({ dataUrl: reduzir(v, v.videoWidth, v.videoHeight), tiradaAt: new Date().toISOString() });
    desligar();
  };

  if (foto) {
    return (
      <div className="camera">
        <img className="camera-foto" src={foto.dataUrl} alt={rotulo} />
        <button type="button" className="btn btn-sm" onClick={() => { onFoto(null); ligar(); }}>
          ↻ Tirar outra
        </button>
      </div>
    );
  }

  return (
    <div className="camera">
      {aoVivo ? (
        <>
          <video ref={video} className="camera-video" playsInline muted />
          <div className="linha">
            <button type="button" className="btn btn-brand crescer" onClick={fotografar}>◉ Tirar foto</button>
            <button type="button" className="btn" onClick={desligar}>Cancelar</button>
          </div>
        </>
      ) : (
        <button type="button" className="camera-abrir" onClick={ligar} disabled={abrindo}>
          <span className="emoji">▣</span>
          {abrindo ? 'Abrindo a câmera...' : `Abrir câmera — ${rotulo.toLowerCase()}`}
        </button>
      )}
      {erro && <p className="mini erro-campo">{erro}</p>}
    </div>
  );
}
