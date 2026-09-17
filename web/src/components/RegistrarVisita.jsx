// "Visitei" em dois toques: resultado, foto, áudio e o CRM faz o resto
// (move o funil, registra o contato, agenda o retorno e abre a venda).

import { useEffect, useRef, useState } from 'react';
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
  const [retornarEmDias, setRetornarEmDias] = useState(3);
  const [venda, setVenda] = useState({ maquinas: 1, taxaOfertada: 1.89 });
  const [local, setLocal] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const gravadorRef = useRef(null);
  const pedacosRef = useRef([]);

  // Busca de cliente só quando a visita não veio de um cliente específico
  useEffect(() => {
    if (clienteInicial) return undefined;
    const t = setTimeout(() => {
      endpoints.clientes({ busca, ordem: 'contato' }).then((l) => setOpcoes(l.slice(0, 8))).catch(() => {});
    }, 220);
    return () => clearTimeout(t);
  }, [busca, clienteInicial]);

  // GPS do momento da visita (silencioso quando negado)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 6000 }
    );
  }, []);

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

  const gravarAudio = async () => {
    if (gravando) {
      gravadorRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream);
      pedacosRef.current = [];
      gravador.ondataavailable = (e) => pedacosRef.current.push(e.data);
      gravador.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(pedacosRef.current, { type: gravador.mimeType || 'audio/webm' });
        setAudio({ dataUrl: await lerArquivo(blob), duracao: null });
        setGravando(false);
      };
      gravadorRef.current = gravador;
      gravador.start();
      setGravando(true);
    } catch {
      toast('Não foi possível acessar o microfone. Anexe um arquivo de áudio.', 'erro');
    }
  };

  const salvar = async () => {
    if (!cliente) return toast('Escolha o cliente visitado.', 'erro');
    if (!resultado) return toast('Informe o resultado da visita.', 'erro');

    setSalvando(true);
    try {
      const resposta = await endpoints.registrarVisita({
        clientId: cliente.id,
        resultado,
        notes,
        fotos,
        audio,
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
            <div className="card card-pad coluna" style={{ background: '#f0fdf9', borderColor: '#a7f3d0' }}>
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
                  <label htmlFor="rv-taxa">Taxa ofertada (%)</label>
                  <input
                    id="rv-taxa" type="number" step="0.01" className="input" value={venda.taxaOfertada}
                    onChange={(e) => setVenda({ ...venda, taxaOfertada: Number(e.target.value) })}
                  />
                </div>
              </div>
              <p className="mini">
                TPV previsto: {moeda((cliente.tpvEstimado || 0) * venda.maquinas)} — entra na sua meta quando a
                máquina for ativada.
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
                  <span className="emoji">📷</span>
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
              <div className="gravador">
                <audio controls src={audio.dataUrl} style={{ flex: 1, height: 38 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => setAudio(null)}>Remover</button>
              </div>
            ) : (
              <div className="gravador">
                <button className={`btn ${gravando ? 'btn-danger' : ''}`} onClick={gravarAudio}>
                  {gravando ? '⏹ Parar gravação' : '🎙️ Gravar áudio'}
                </button>
                {gravando && (
                  <span className="linha mini">
                    <span className="bolinha" /> gravando...
                  </span>
                )}
              </div>
            )}
          </div>

          {local && <p className="mini">📍 Localização capturada no momento da visita.</p>}
        </>
      )}
    </Modal>
  );
}
