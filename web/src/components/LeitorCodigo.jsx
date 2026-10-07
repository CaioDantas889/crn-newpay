// Lê o número de série pela câmera: o código de barras da etiqueta ou da
// caixa da maquininha. Usa o leitor do próprio navegador (BarcodeDetector,
// Chrome no Android). Onde ele não existe, o vendedor fotografa a etiqueta
// para a gestão conferir e digita o número.

import { useEffect, useRef, useState } from 'react';
import { reduzir } from '../lib/imagem.js';

const FORMATOS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];

const MOTIVOS = {
  NotAllowedError: 'Câmera bloqueada para este endereço. Libere no cadeado da barra de endereço e tente de novo.',
  PermissionDeniedError: 'Câmera bloqueada para este endereço. Libere no cadeado da barra de endereço.',
  NotFoundError: 'Nenhuma câmera encontrada neste aparelho.',
  NotReadableError: 'A câmera está sendo usada por outro aplicativo. Feche o outro app e tente de novo.',
};

async function criarDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const suportados = (await window.BarcodeDetector.getSupportedFormats?.()) ?? [];
    const formats = FORMATOS.filter((f) => suportados.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : new window.BarcodeDetector();
  } catch {
    return null;
  }
}

export default function LeitorCodigo({ onLido, onFoto, onFechar }) {
  const video = useRef(null);
  const fluxo = useRef(null);
  const timer = useRef(null);
  const [aoVivo, setAoVivo] = useState(false);
  const [leitor, setLeitor] = useState(undefined); // undefined = ainda não sabe
  const [erro, setErro] = useState(null);

  const desligar = () => {
    clearInterval(timer.current);
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
    setAoVivo(false);
  };

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!window.isSecureContext) {
        return setErro(`A câmera só funciona em HTTPS ou localhost — este endereço é ${window.location.origin}.`);
      }
      if (!navigator.mediaDevices?.getUserMedia) return setErro('Este navegador não dá acesso à câmera.');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!ativo) return stream.getTracks().forEach((t) => t.stop());
        fluxo.current = stream;
        setLeitor(await criarDetector());
        setAoVivo(true);
      } catch (e) {
        setErro(MOTIVOS[e?.name] ?? `Não consegui abrir a câmera (${e?.name ?? 'erro'}).`);
      }
    })();
    return () => {
      ativo = false;
      desligar();
    };
  }, []);

  // O <video> só existe depois de aoVivo: liga o fluxo e começa a procurar código
  useEffect(() => {
    if (!aoVivo || !video.current || !fluxo.current) return undefined;
    video.current.srcObject = fluxo.current;
    video.current.play().catch(() => {});
    if (!leitor) return undefined;

    let ocupado = false;
    timer.current = setInterval(async () => {
      if (ocupado || !video.current?.videoWidth) return;
      ocupado = true;
      try {
        const codigos = await leitor.detect(video.current);
        const valor = codigos.find((c) => c.rawValue?.trim())?.rawValue?.trim();
        if (valor) {
          desligar();
          onLido(valor);
        }
      } catch {
        /* quadro ruim: tenta no próximo */
      } finally {
        ocupado = false;
      }
    }, 350);
    return () => clearInterval(timer.current);
  }, [aoVivo, leitor, onLido]);

  const fotografar = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    onFoto?.({ dataUrl: reduzir(v, v.videoWidth, v.videoHeight, 1280, 0.8), tiradaAt: new Date().toISOString() });
    desligar();
    onFechar();
  };

  return (
    <div className="leitor">
      {aoVivo && <video ref={video} className="leitor-video" playsInline muted />}
      {aoVivo && (
        <p className="mini">
          {leitor
            ? 'Aponte para o código de barras da etiqueta. Quando ler, o número entra sozinho.'
            : 'Este navegador não lê código de barras: fotografe a etiqueta e digite o número.'}
        </p>
      )}
      {!aoVivo && !erro && <p className="mini">Abrindo a câmera...</p>}
      {erro && <p className="mini erro-campo">{erro} Digite o número da etiqueta.</p>}
      <div className="linha">
        {aoVivo && onFoto && (
          <button type="button" className="btn btn-sm crescer" onClick={fotografar}>◉ Fotografar etiqueta</button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => { desligar(); onFechar(); }}>Cancelar</button>
      </div>
    </div>
  );
}
