// "Visitei" em dois toques: resultado, foto, áudio e o CRM faz o resto
// (move o funil, registra o contato, agenda o retorno e abre a venda).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { moeda } from '../lib/date.js';
import { Modal } from './ui.jsx';

/** Reduz a foto antes de enviar: o celular do vendedor costuma estar no 4G */
function comprimirImagem(file, maxLado = 1280, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(file);
  });
}

const lerArquivo = (file) =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    leitor.readAsDataURL(file);
  });

/**
 * Por que o microfone pode não estar disponível. A causa mais comum no dia a
 * dia não é bug: é permissão negada — e ela vale por endereço, então liberar em
 * localhost:5173 não vale para localhost:4000 nem para o domínio publicado.
 */
const MOTIVOS_MICROFONE = {
  NotAllowedError:
    'Microfone bloqueado para este endereço. Clique no cadeado ao lado da barra de endereço, libere o microfone e tente de novo.',
  PermissionDeniedError:
    'Microfone bloqueado para este endereço. Libere no cadeado da barra de endereço e tente de novo.',
  NotFoundError: 'Nenhum microfone encontrado neste aparelho.',
  NotReadableError: 'O microfone está sendo usado por outro programa. Feche o outro app e tente de novo.',
  SecurityError: 'O navegador bloqueou o microfone neste endereço.',
  AbortError: 'A gravação foi interrompida pelo navegador. Tente de novo.',
};

/** Códigos do navegador para falha de GPS (1 negado, 2 indisponível, 3 demorou) */
const MOTIVOS_LOCALIZACAO = {
  1: 'Localização bloqueada para este endereço. Libere no cadeado da barra de endereço.',
  2: 'O aparelho não conseguiu achar a posição. Saia de perto de paredes e tente de novo.',
  3: 'O GPS demorou demais para responder. Tente de novo.',
};

/** Impedimento do próprio ambiente (endereço sem HTTPS, navegador sem suporte) */
function verificarSuporteAudio() {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) {
    return `O microfone só funciona em HTTPS ou localhost — este endereço é ${window.location.origin}.`;
  }
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador não dá acesso ao microfone.';
  if (typeof MediaRecorder === 'undefined') return 'Este navegador não grava áudio.';
  return null;
}

export default function RegistrarVisita({ cliente: clienteInicial, eventId, onFechar, onRegistrado }) {
  const { meta, toast, recarregarNotificacoes } = useApp();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(clienteInicial ?? null);
  const [busca, setBusca] = useState('');
  const [opcoes, setOpcoes] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [notes, setNotes] = useState('');
  const [fotos, setFotos] = useState([]);
  const [audio, setAudio] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [preparandoAudio, setPreparandoAudio] = useState(false);
  const [audioErro, setAudioErro] = useState(null);
  const [retornarEmDias, setRetornarEmDias] = useState(3);
  const [venda, setVenda] = useState({ maquinas: 1, taxaOfertada: '' });
  const [local, setLocal] = useState(null);
  const [localErro, setLocalErro] = useState(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const gravadorRef = useRef(null);
  const pedacosRef = useRef([]);
  const pendenteRef = useRef(null);
  const impedimentoAudio = verificarSuporteAudio();

  // Busca de cliente só quando a visita não veio de um cliente específico
  useEffect(() => {
    if (clienteInicial) return undefined;
    const t = setTimeout(() => {
      endpoints.clientes({ busca, ordem: 'contato' }).then((l) => setOpcoes(l.slice(0, 8))).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [busca, clienteInicial]);

  // GPS do momento da visita. Quando falha, a visita ainda é registrada — mas
  // com a coordenada cadastrada do cliente, então o vendedor precisa saber.
  const pegarLocalizacao = useCallback(() => {
    if (!window.isSecureContext) {
      return setLocalErro(`Localização só funciona em HTTPS ou localhost (aqui é ${window.location.origin}).`);
    }
    if (!navigator.geolocation) return setLocalErro('Este aparelho não informa a localização.');

    setLocalErro(null);
    setBuscandoLocal(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: Math.round(pos.coords.accuracy) });
        setBuscandoLocal(false);
      },
      (erro) => {
        setBuscandoLocal(false);
        setLocalErro(MOTIVOS_LOCALIZACAO[erro.code] ?? 'Não consegui pegar a localização.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
  }, []);

  useEffect(() => {
    pegarLocalizacao();
  }, [pegarLocalizacao]);

  const adicionarFotos = async (e) => {
    const arquivos = [...e.target.files].slice(0, 4 - fotos.length);
    for (const arquivo of arquivos) {
      try {
        const dataUrl = await comprimirImagem(arquivo);
        setFotos((f) => [...f, { dataUrl, nome: arquivo.name }]);
      } catch (err) {
        toast(err.message, 'erro');
      }
    }
    e.target.value = '';
  };

  /**
   * Encerra a gravação e só resolve quando o arquivo está pronto.
   * É o que impede o áudio de se perder quando o vendedor aperta "Salvar
   * visita" com a gravação ainda rodando — que era o caminho natural de quem
   * está com pressa na porta do cliente.
   */
  const pararGravacao = () =>
    new Promise((resolve) => {
      const gravador = gravadorRef.current;
      if (!gravador || gravador.state === 'inactive') return resolve(audio);
      pendenteRef.current = resolve;
      setPreparandoAudio(true);
      gravador.stop();
    });

  const gravarAudio = async () => {
    if (gravando) return pararGravacao();

    // Antes de pedir o microfone, diz o que impede — em vez de falhar no clique
    // com uma mensagem genérica.
    if (impedimentoAudio) return toast(impedimentoAudio, 'erro');

    setAudioErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream);
      pedacosRef.current = [];
      gravador.ondataavailable = (e) => pedacosRef.current.push(e.data);
      gravador.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || 'audio/webm' });

        const gravado = blob.size
          ? { dataUrl: await lerArquivo(blob), duracao: null, tamanho: blob.size }
          : null;
        if (!gravado) setAudioErro('A gravação saiu vazia. Tente de novo, falando por alguns segundos.');

        setAudio(gravado);
        setGravando(false);
        setPreparandoAudio(false);
        pendenteRef.current?.(gravado);
        pendenteRef.current = null;
      };
      gravadorRef.current = gravador;
      gravador.start();
      setGravando(true);
    } catch (erro) {
      console.warn('[audio] microfone recusado:', erro);
      setGravando(false);
      setPreparandoAudio(false);
      const motivo = MOTIVOS_MICROFONE[erro?.name] ?? `Não consegui acessar o microfone (${erro?.name ?? 'erro'}).`;
      setAudioErro(motivo);
      toast(motivo, 'erro');
    }
  };

  const salvar = async () => {
    if (!cliente) return toast('Escolha o cliente visitado.', 'erro');
    if (!resultado) return toast('Informe o resultado da visita.', 'erro');

    setSalvando(true);
    try {
      // Gravação em andamento: encerra e espera o arquivo, em vez de salvar a
      // visita sem o áudio que o vendedor acabou de gravar.
      const audioFinal = gravando ? await pararGravacao() : audio;

      const resposta = await endpoints.registrarVisita({
        clientId: cliente.id,
        resultado,
        notes,
        fotos,
        audio: audioFinal,
        eventId,
        lat: local?.lat,
        lng: local?.lng,
        retornarEmDias: resultado === 'retornar' ? Number(retornarEmDias) : undefined,
        venda: resultado === 'fechado' ? venda : undefined,
      });

      const dataRetorno = resposta.retorno
        ? new Date(resposta.retorno.start).toLocaleDateString('pt-BR')
        : null;

      toast(
        resultado === 'fechado'
          ? `Venda registrada! ${venda.maquinas} máquina(s).`
          : resultado === 'interessado'
            ? 'Visita registrada. Cliente movido para negociação.'
            : dataRetorno
              ? `Visita registrada. Retorno agendado para ${dataRetorno}.`
              : 'Visita registrada.'
      );
      // Anexo que o servidor recusou vira aviso na tela, não desaparece calado
      for (const aviso of resposta.avisos ?? []) toast(aviso, 'erro');

      recarregarNotificacoes();
      onRegistrado?.(resposta);
      onFechar();
      if (resultado === 'fechado') navigate(`/carteira/${cliente.id}`);
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const resultados = Object.entries(meta?.resultadosVisita ?? {});

  return (
    <Modal
      titulo="Registrar visita"
      subtitulo={cliente ? `${cliente.company} — ${cliente.city}` : 'Escolha o cliente visitado'}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-brand" onClick={salvar} disabled={salvando || !cliente || !resultado}>
            {salvando ? 'Salvando...' : 'Salvar visita'}
          </button>
        </>
      }
    >
      {!cliente && (
        <div className="campo">
          <label htmlFor="rv-busca">Cliente</label>
          <input
            id="rv-busca"
            className="input"
            placeholder="Buscar por empresa, nome ou cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            autoFocus
          />
          <div className="card" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {opcoes.map((c) => (
              <div key={c.id} className="cliente-linha" onClick={() => setCliente(c)}>
                <span className={`score-bola ${c.temperature}`}>{c.score}</span>
                <div className="info">
                  <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                  <span className="mini">{c.name} · {c.city} · {c.diasSemContato}d sem contato</span>
                </div>
              </div>
            ))}
            {opcoes.length === 0 && <p className="vazio mini">Nenhum cliente encontrado.</p>}
          </div>
        </div>
      )}

      {cliente && (
        <>
          {!clienteInicial && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCliente(null)} style={{ alignSelf: 'flex-start' }}>
              ← trocar cliente
            </button>
          )}

          <div className="campo">
            <label>O que aconteceu na visita?</label>
            <div className="resultados">
              {resultados.map(([chave, info]) => (
                <button
                  key={chave}
                  className={`resultado-btn${resultado === chave ? ' ativo' : ''}`}
                  style={resultado === chave ? { background: info.cor, borderColor: info.cor } : undefined}
                  onClick={() => setResultado(chave)}
                >
                  <span className="emoji">{info.emoji}</span>
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {resultado === 'fechado' && (
            <div className="card card-pad coluna" style={{ background: 'var(--ok-bg)', borderColor: 'var(--ok-line)' }}>
              <b>Dados da venda</b>
              <div className="form-linha duas">
                <div className="campo">
                  <label htmlFor="rv-maq">Máquinas vendidas</label>
                  <input
                    id="rv-maq" type="number" min="1" className="input" value={venda.maquinas}
                    onChange={(e) => setVenda({ ...venda, maquinas: Number(e.target.value) })}
                  />
                </div>
                <div className="campo">
                  <label htmlFor="rv-taxa">Tabela de taxa</label>
                  <select
                    id="rv-taxa"
                    className="select"
                    value={venda.taxaOfertada}
                    onChange={(e) => setVenda({ ...venda, taxaOfertada: e.target.value })}
                  >
                    <option value="">Escolha a tabela</option>
                    {(meta?.tabelasTaxa ?? []).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mini">
                Entra na sua meta do mês quando a máquina for ativada.
              </p>
            </div>
          )}

          {resultado === 'retornar' && (
            <div className="campo">
              <label>Retornar em</label>
              <div className="opcoes">
                {[1, 3, 7, 15].map((d) => (
                  <button
                    key={d}
                    className={`opcao${Number(retornarEmDias) === d ? ' ativa' : ''}`}
                    onClick={() => setRetornarEmDias(d)}
                  >
                    {d === 1 ? 'Amanhã' : `${d} dias`}
                  </button>
                ))}
              </div>
              <p className="mini">O follow-up já entra na sua agenda.</p>
            </div>
          )}

          <div className="campo">
            <label htmlFor="rv-obs">O que o cliente falou</label>
            <textarea
              id="rv-obs"
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: reclamou da taxa da Ton, quer comparar com a nossa tabela."
            />
          </div>

          <div className="campo">
            <label>Anexos</label>
            <div className="anexos">
              {fotos.map((f, i) => (
                <div key={i} className="anexo-miniatura">
                  <img src={f.dataUrl} alt={`Anexo ${i + 1}`} />
                  <button onClick={() => setFotos(fotos.filter((_, x) => x !== i))} aria-label="Remover">✕</button>
                </div>
              ))}
              {fotos.length < 4 && (
                <label className="botao-anexo">
                  <span className="emoji">▣</span>
                  Foto
                  <input
                    type="file" accept="image/*" capture="environment" multiple
                    onChange={adicionarFotos} style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
            <p className="mini">Fachada, máquina atual do cliente, contrato assinado.</p>
          </div>

          <div className="campo">
            <label>Áudio rápido</label>
            {audio ? (
              <>
                <div className="gravador">
                  <audio controls src={audio.dataUrl} style={{ flex: 1, height: 38 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setAudio(null)}>Remover</button>
                </div>
                <p className="mini">
                  ● Áudio anexado{audio.tamanho ? ` · ${Math.max(1, Math.round(audio.tamanho / 1024))} KB` : ''} —
                  vai junto ao salvar a visita.
                </p>
              </>
            ) : (
              <>
                <div className="gravador">
                  <button
                    className={`btn ${gravando ? 'btn-danger' : ''}`}
                    onClick={gravarAudio}
                    disabled={Boolean(impedimentoAudio) || preparandoAudio}
                    title={impedimentoAudio ?? undefined}
                  >
                    {preparandoAudio ? '⋯ Preparando...' : gravando ? '■︎ Parar gravação' : '● Gravar áudio'}
                  </button>
                  {gravando && (
                    <span className="linha mini">
                      <span className="bolinha" /> gravando... toque em parar quando terminar
                    </span>
                  )}
                </div>
                {impedimentoAudio && <p className="mini">{impedimentoAudio} Você ainda pode anexar um arquivo de áudio.</p>}
                {audioErro && !impedimentoAudio && <p className="mini erro-campo">{audioErro}</p>}
              </>
            )}
          </div>

          <div className="campo">
            {buscandoLocal && <p className="mini">⌖ Procurando sua localização...</p>}

            {local && !buscandoLocal && (
              <p className="mini">
                ⌖ Localização capturada no momento da visita
                {local.precisao ? ` (precisão de ~${local.precisao} m)` : ''}.
              </p>
            )}

            {!local && !buscandoLocal && (
              <div className="linha">
                <span className="mini crescer">
                  ⌖ {localErro ?? 'Sem localização do aparelho.'} A visita vai usar o endereço
                  cadastrado do cliente.
                </span>
                <button type="button" className="btn btn-sm" onClick={pegarLocalizacao}>
                  Tentar de novo
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
