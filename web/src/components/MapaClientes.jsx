// Mapa de clientes por GPS. Desenhado direto no navegador (sem chave de API):
// as coordenadas viram posição relativa dentro do quadro, o que basta para o
// vendedor enxergar a concentração e montar rota.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { moeda } from '../lib/date.js';
import { Carregando } from './ui.jsx';

const CORES = { quente: '#dc2626', morno: '#f59e0b', frio: '#3b82f6' };

export default function MapaClientes() {
  const navigate = useNavigate();
  const { toast } = useApp();
  const [raio, setRaio] = useState(3);
  const [posicao, setPosicao] = useState(null);
  const [selecionado, setSelecionado] = useState(null);

  const { dados, carregando } = useRecurso(
    () => endpoints.mapa({ raio, lat: posicao?.lat, lng: posicao?.lng }),
    [raio, posicao?.lat, posicao?.lng]
  );

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) return toast('Este aparelho não informa a localização.', 'erro');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosicao({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast('Mapa centralizado na sua posição.');
      },
      () => toast('Não foi possível obter sua localização.', 'erro'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Normaliza lat/lng em percentuais dentro do quadro, com folga nas bordas
  const projetar = useMemo(() => {
    const pontos = dados?.pontos ?? [];
    if (!pontos.length) return () => ({ left: '50%', top: '50%' });

    const lats = [...pontos.map((p) => p.lat), dados.origem.lat];
    const lngs = [...pontos.map((p) => p.lng), dados.origem.lng];
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const alturaLat = maxLat - minLat || 0.01;
    const larguraLng = maxLng - minLng || 0.01;

    return (ponto) => ({
      left: `${8 + ((ponto.lng - minLng) / larguraLng) * 84}%`,
      top: `${92 - ((ponto.lat - minLat) / alturaLat) * 84}%`,
    });
  }, [dados]);

  if (carregando || !dados) return <Carregando linhas={6} />;

  return (
    <div className="card-pad coluna">
      <div className="destaque-rota">
        <div>
          <h3>{dados.destaque}</h3>
          <p>
            {dados.totais.leads} leads e {dados.totais.ativos} clientes ativos na sua carteira.
          </p>
        </div>
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-brand" onClick={usarMinhaLocalizacao}>📍 Usar minha localização</button>
        </div>
      </div>

      <div className="linha" style={{ flexWrap: 'wrap' }}>
        <span className="selo">Raio:</span>
        {[1, 3, 5, 10, 25].map((r) => (
          <button key={r} className={`btn btn-sm${raio === r ? ' btn-primary' : ''}`} onClick={() => setRaio(r)}>
            {r} km
          </button>
        ))}
      </div>

      <div className="mapa-canvas">
        <svg className="mapa-grade" width="100%" height="100%" aria-hidden="true">
          <defs>
            <pattern id="grade" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dbe3ee" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grade)" />
        </svg>

        <span className="mapa-base" style={projetar(dados.origem)} title="Sua base" />

        {dados.pontos.map((p) => (
          <button
            key={p.id}
            className={`mapa-ponto${selecionado?.id === p.id ? ' ativo' : ''}`}
            style={{
              ...projetar(p),
              background: p.stage === 'fechado' ? '#0d9488' : CORES[p.temperature],
              opacity: p.distanciaKm <= raio ? 1 : 0.35,
            }}
            title={`${p.company} · ${p.distanciaKm} km`}
            onClick={() => setSelecionado(p)}
          />
        ))}
      </div>

      <div className="mapa-legenda">
        <span><i style={{ background: '#dc2626' }} /> Lead quente</span>
        <span><i style={{ background: '#f59e0b' }} /> Lead morno</span>
        <span><i style={{ background: '#3b82f6' }} /> Lead frio</span>
        <span><i style={{ background: '#0d9488' }} /> Cliente ativo</span>
        <span><i style={{ background: '#0f172a' }} /> Sua base</span>
      </div>

      {selecionado && (
        <div className="card card-pad linha">
          <span className={`score-bola ${selecionado.temperature}`}>{selecionado.score}</span>
          <div className="crescer">
            <b>{selecionado.company}</b>
            <p className="mini">
              {selecionado.name} · {selecionado.city} · {selecionado.distanciaKm} km ·{' '}
              {selecionado.segmentoLabel ?? selecionado.segment}
            </p>
          </div>
          <button className="btn btn-sm" onClick={() => navigate(`/carteira/${selecionado.id}`)}>Abrir</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelecionado(null)}>✕</button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Mais próximos de você</h3>
          <span className="card-sub">{dados.totais.proximos} em até {raio} km</span>
        </div>
        {dados.pontos.slice(0, 8).map((p) => (
          <div key={p.id} className="cliente-linha" onClick={() => navigate(`/carteira/${p.id}`)}>
            <span className={`score-bola ${p.temperature}`}>{p.score}</span>
            <div className="info">
              <b className="truncar" style={{ display: 'block' }}>{p.company}</b>
              <span className="mini">{p.city} · {p.stageMeta.label}</span>
            </div>
            <span className="chip">{p.distanciaKm} km</span>
          </div>
        ))}
      </div>
    </div>
  );
}
