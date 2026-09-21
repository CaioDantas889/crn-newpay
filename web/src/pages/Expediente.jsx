// Expediente: a que horas o vendedor começou e terminou o dia.
// A localização é capturada no momento da batida — e só nesse momento.

import { useCallback, useEffect, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Carregando, Vazio } from '../components/ui.jsx';

const hora = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

const dia = (data) =>
  new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' });

/** 425 minutos → "7h05" */
const duracao = (minutos = 0) => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
};

const MOTIVOS_GPS = {
  1: 'Localização bloqueada para este endereço. Libere no cadeado da barra de endereço.',
  2: 'O aparelho não conseguiu achar a posição.',
  3: 'O GPS demorou demais para responder.',
};

/** Pede a posição e devolve { local } ou { erro } — nunca rejeita */
function posicaoAtual() {
  return new Promise((resolve) => {
    if (!window.isSecureContext) {
      return resolve({ erro: `Sem HTTPS neste endereço (${window.location.origin}), o navegador não passa a localização.` });
    }
    if (!navigator.geolocation) return resolve({ erro: 'Este aparelho não informa a localização.' });

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        local: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisao: Math.round(pos.coords.accuracy),
        },
      }),
      (erro) => resolve({ erro: MOTIVOS_GPS[erro.code] ?? 'Não consegui pegar a localização.' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 }
    );
  });
}

export default function Expediente() {
  const { toast } = useApp();
  const { dados, carregando, recarregar } = useRecurso(() => endpoints.jornada({ dias: 14 }), []);
  const [batendo, setBatendo] = useState(false);
  const [agora, setAgora] = useState(Date.now());

  // Relógio do tempo em campo, enquanto o expediente está aberto
  useEffect(() => {
    if (!dados?.aberta) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [dados?.aberta]);

  const bater = useCallback(
    async (tipo) => {
      setBatendo(true);
      try {
        const { local, erro } = await posicaoAtual();
        if (erro && tipo === 'entrada') toast(`${erro} O expediente abre sem o local.`, 'erro');

        const jornada =
          tipo === 'entrada'
            ? await endpoints.iniciarExpediente(local)
            : await endpoints.encerrarExpediente(local);

        toast(
          tipo === 'entrada'
            ? `Expediente iniciado às ${hora(jornada.inicioAt)}.`
            : `Expediente encerrado. ${duracao(jornada.duracaoMin)} em campo hoje.`
        );
        recarregar();
      } catch (e) {
        toast(e.message, 'erro');
        recarregar();
      } finally {
        setBatendo(false);
      }
    },
    [recarregar, toast]
  );

  if (carregando || !dados) return <div className="page"><Carregando linhas={4} /></div>;

  const aberta = dados.aberta;
  const minutosAgora = aberta
    ? Math.max(0, Math.round((agora - new Date(aberta.inicioAt)) / 60000))
    : dados.minutosHoje;

  const semana = dados.historico.filter((j) => !j.emAndamento);
  const mediaDia = semana.length
    ? Math.round(semana.reduce((s, j) => s + j.duracaoMin, 0) / semana.length)
    : 0;

  return (
    <div className="page">
      <div>
        <h1>Expediente</h1>
        <p className="mini">Marque o começo e o fim do seu dia em campo.</p>
      </div>

      <div className={`card card-pad expediente${aberta ? ' aberto' : ''}`}>
        <div className="expediente-estado">
          <span className="selo">{aberta ? 'Em campo desde' : 'Hoje'}</span>
          <b className="expediente-relogio">
            {aberta ? hora(aberta.inicioAt) : dados.hoje ? duracao(dados.minutosHoje) : '--:--'}
          </b>
          <span className="mini">
            {aberta
              ? `${duracao(minutosAgora)} trabalhados até agora`
              : dados.hoje
                ? `Começou ${hora(dados.hoje.inicioAt)} e encerrou ${hora(dados.hoje.fimAt)}`
                : 'Expediente ainda não iniciado.'}
          </span>
        </div>

        <button
          className={`btn btn-block ${aberta ? 'btn-danger' : 'btn-brand'}`}
          style={{ minHeight: 52, fontSize: '1rem' }}
          disabled={batendo}
          onClick={() => bater(aberta ? 'saida' : 'entrada')}
        >
          {batendo
            ? '📍 Pegando sua localização...'
            : aberta
              ? '⏹ Encerrar expediente'
              : '▶️ Iniciar expediente'}
        </button>

        {aberta && <Local rotulo="Entrada registrada" local={aberta.inicioLocal} endereco={aberta.inicioEndereco} />}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="crescer">
            <h2>Últimos dias</h2>
            <p className="mini">
              {semana.length
                ? `${semana.length} dia(s) registrados · média de ${duracao(mediaDia)} por dia`
                : 'Nenhum dia encerrado ainda.'}
            </p>
          </div>
        </div>

        {dados.historico.length === 0 ? (
          <Vazio emoji="⏱️" titulo="Nenhum expediente registrado" texto="O primeiro começa no botão acima." />
        ) : (
          dados.historico.map((j) => (
            <div key={j.id} className="cliente-linha">
              <span className="avatar" style={{ background: j.emAndamento ? 'var(--brand)' : 'var(--navy-700)' }}>
                {j.emAndamento ? '▶' : duracao(j.duracaoMin).replace('h', '')}
              </span>
              <div className="info">
                <b>{dia(j.data)}</b>
                <div className="mini">
                  {hora(j.inicioAt)} às {j.fimAt ? hora(j.fimAt) : 'agora'}
                  {j.revisar ? ' · ⚠️ revisar' : ''}
                  {j.justificativa ? ` · corrigido: ${j.justificativa}` : ''}
                </div>
                <Local rotulo="Entrada" local={j.inicioLocal} endereco={j.inicioEndereco} compacto />
              </div>
              <span className="chip">{j.emAndamento ? 'em campo' : duracao(j.duracaoMin)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- local ---- */

/**
 * Onde a batida aconteceu. Mostra o nome da rua quando o servidor conseguiu
 * descobrir, e sempre deixa o link do mapa — que funciona mesmo quando a
 * conversão do endereço falhou.
 */
function Local({ rotulo, local, endereco, compacto }) {
  if (!local) {
    return <p className="mini">📍 {rotulo} sem localização do aparelho.</p>;
  }

  const coordenada = `${local.lat.toFixed(4)}, ${local.lng.toFixed(4)}`;

  return (
    <p className="mini">
      📍 {compacto ? '' : `${rotulo} em `}
      {endereco ? <b>{endereco}</b> : coordenada}
      {local.precisao ? ` (~${local.precisao} m)` : ''}
      {local.mapa && (
        <>
          {' · '}
          <a href={local.mapa} target="_blank" rel="noreferrer">ver no mapa</a>
        </>
      )}
    </p>
  );
}
