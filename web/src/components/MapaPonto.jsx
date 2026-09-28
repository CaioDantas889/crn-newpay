// Mapa das batidas de ponto: ruas de verdade (OpenStreetMap) e um pino por
// batida, na cor do vendedor — cheio na entrada, vazado na saída. A conta de
// projeção está em lib/mapa.js; nenhuma biblioteca de mapa entra no projeto.
//
// Sem internet para as imagens das ruas, os pinos continuam no lugar certo uns
// em relação aos outros, sobre o fundo liso.

import { useEffect, useRef, useState } from 'react';
import { enquadrar, espalhar, metrosEmPixels, naJanela, tilesDaJanela } from '../lib/mapa.js';

export default function MapaPonto({ pinos, selecionado, onSelecionar }) {
  const caixa = useRef(null);
  const [tamanho, setTamanho] = useState(null);

  // O enquadramento depende do tamanho real da caixa, que muda com a tela
  useEffect(() => {
    const el = caixa.current;
    const medir = () =>
      setTamanho((atual) =>
        atual?.largura === el.clientWidth && atual?.altura === el.clientHeight
          ? atual
          : { largura: el.clientWidth, altura: el.clientHeight }
      );
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div className="mapa-ruas" ref={caixa}>
      {tamanho?.largura > 0 && pinos.length > 0 && (
        <Camadas pinos={pinos} {...tamanho} selecionado={selecionado} onSelecionar={onSelecionar} />
      )}
      <a className="mapa-credito" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap
      </a>
    </div>
  );
}

function Camadas({ pinos, largura, altura, selecionado, onSelecionar }) {
  // Posição estimada pela antena ou pelo IP não decide o enquadramento: um
  // chute a 300 km afastaria o mapa até a equipe inteira virar um ponto só.
  const confiaveis = pinos.filter((p) => !p.impreciso);
  const janela = enquadrar(confiaveis.length ? confiaveis : pinos, largura, altura);
  const posicionados = pinos.map((p) => ({ ...p, ...naJanela(janela, p.lat, p.lng) }));

  // Círculo maior que o mapa pinta a tela inteira e não diz mais nada: nesse
  // caso quem avisa é a marca de imprecisão no próprio pino.
  const raioMaximo = Math.max(largura, altura);

  // A imprecisa que caiu fora do recorte não some calada: vira atalho no canto
  const fora = posicionados.filter(
    (p) => p.impreciso && (p.x < 0 || p.y < 0 || p.x > largura || p.y > altura)
  );

  return (
    <>
      <div className="mapa-tiles" aria-hidden="true">
        {tilesDaJanela(janela, largura, altura).map((t) => (
          <img
            key={t.chave}
            src={t.url}
            alt=""
            draggable={false}
            style={{ left: t.left, top: t.top }}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ))}
      </div>

      {/* Margem de erro de cada batida, em volta do ponto verdadeiro */}
      {posicionados.map((p) => {
        const raio = p.precisao ? metrosEmPixels(p.precisao, p.lat, janela.zoom) : 0;
        if (raio < 16 || raio > raioMaximo) return null;
        return (
          <span
            key={`raio-${p.chave}`}
            className="mapa-raio"
            style={{ left: p.x, top: p.y, width: raio * 2, height: raio * 2, color: p.cor }}
          />
        );
      })}

      {espalhar(posicionados).map((p) => {
        const ativo = selecionado === p.chave;
        return (
          <button
            key={p.chave}
            type="button"
            className={`mapa-pino${p.saida ? ' saida' : ''}${p.impreciso ? ' impreciso' : ''}${ativo ? ' ativo' : ''}`}
            style={{ left: p.x, top: p.y, ...(p.saida ? { borderColor: p.cor, color: p.cor } : { background: p.cor }) }}
            title={p.titulo}
            aria-label={p.titulo}
            aria-pressed={ativo}
            onClick={() => onSelecionar(ativo ? null : p.chave)}
          >
            {p.sigla}
          </button>
        );
      })}

      {fora.length > 0 && (
        <div className="mapa-fora">
          {fora.map((p) => (
            <button key={p.chave} type="button" onClick={() => onSelecionar(p.chave)}>
              ? {p.titulo} · imprecisa, fora do mapa
            </button>
          ))}
        </div>
      )}
    </>
  );
}
