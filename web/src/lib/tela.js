import { useEffect, useState } from 'react';

/**
 * Diz se a tela é pequena (celular). Usado quando o comportamento muda de
 * verdade entre telas — não só a aparência, que o CSS já resolve.
 */
export function useTelaPequena(limite = 900) {
  const consulta = `(max-width: ${limite - 1}px)`;
  const [pequena, setPequena] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const aoMudar = () => setPequena(mq.matches);
    aoMudar();
    mq.addEventListener('change', aoMudar);
    window.addEventListener('resize', aoMudar);
    return () => {
      mq.removeEventListener('change', aoMudar);
      window.removeEventListener('resize', aoMudar);
    };
  }, [consulta]);

  return pequena;
}
