// Peças que o cadastro de lead, a visita e o follow-up têm em comum: o
// resultado (lista fixa), os dados da venda, o print da conversa, o GPS do
// momento e a data que o lojista marcou.

import { useCallback, useEffect, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { pegarPosicao } from '../lib/contato.js';
import { prepararPrint } from '../lib/imagem.js';
import { dateKey, pad } from '../lib/date.js';
import LeitorCodigo from './LeitorCodigo.jsx';

/** Fechou · Quente · Morno · Frio · Sem CNPJ · Não atendeu */
export function ResultadoChips({ valor, onChange, rotulo = 'Resultado da visita' }) {
  const { meta } = useApp();
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <div className="resultados seis">
        {Object.entries(meta?.resultadosVisita ?? {}).map(([chave, info]) => (
          <button
            key={chave}
            type="button"
            className={`resultado-btn${valor === chave ? ' ativo' : ''}`}
            style={valor === chave ? { background: info.cor, borderColor: info.cor } : undefined}
            onClick={() => onChange(chave)}
          >
            <span className="emoji">{info.emoji}</span>
            {info.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const VENDA_VAZIA = { maquinas: 1, taxaOfertada: '', modelo: '', series: [] };

/** O que falta para a venda valer na tela (o servidor confere de novo) */
export function faltaNaVenda(venda) {
  if (!venda?.taxaOfertada) return 'Escolha a tabela de taxa da venda.';
  const series = (venda.series ?? []).filter((s) => String(s).trim());
  const maquinas = Math.max(1, Number(venda.maquinas) || 1);
  if (series.length > maquinas) return `São ${maquinas} máquina(s) e ${series.length} números de série.`;
  return null;
}

/** Número de série limpo do jeito que o servidor guarda */
export const limparSerie = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '').slice(0, 40);

/**
 * Um campo por máquina, com leitura pela câmera. `series` tem sempre o tamanho
 * do número de máquinas; vazio é série ainda não informada.
 */
export function SeriesCampos({ series, onChange, onFoto, rotulo = 'Número de série', inicio = 1, dica }) {
  const [lendo, setLendo] = useState(null);

  const trocar = (i, valor) => {
    const prox = [...series];
    prox[i] = limparSerie(valor);
    onChange(prox);
  };

  return (
    <div className="campo">
      <label>{rotulo}{series.length > 1 ? ` (${series.length})` : ''}</label>
      {series.map((s, i) => (
        <div key={i} className="serie-linha">
          <input
            className="input crescer"
            placeholder={series.length > 1 ? `Série da máquina ${inicio + i}` : 'Ex.: NP12345678901'}
            value={s}
            onChange={(e) => trocar(i, e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" className="btn btn-sm" onClick={() => setLendo(lendo === i ? null : i)}>
            {lendo === i ? 'Fechar' : '▣ Ler'}
          </button>
        </div>
      ))}
      {lendo !== null && (
        <LeitorCodigo
          onLido={(valor) => {
            trocar(lendo, valor);
            setLendo(null);
          }}
          onFoto={onFoto}
          onFechar={() => setLendo(null)}
        />
      )}
      <p className="mini">{dica ?? 'Está na etiqueta atrás da máquina ou na caixa. Pode deixar em branco e completar na ficha depois.'}</p>
    </div>
  );
}

/**
 * Dados da venda: quantas máquinas, qual tabela (obrigatória), qual modelo e
 * os números de série. Com `clienteId`, a tabela e o modelo da proposta aberta
 * já vêm preenchidos — é ela que vira a venda.
 * `onChange` aceita valor ou função (como um setState).
 */
export function VendaCampos({ venda, onChange, clienteId, titulo = 'Dados da venda' }) {
  const { meta } = useApp();
  const [origem, setOrigem] = useState(null);

  useEffect(() => {
    if (!clienteId) return undefined;
    let ativo = true;
    endpoints
      .negocios({ clientId: clienteId })
      .then((lista) => {
        const aberta = (lista ?? []).find((n) => ['proposta', 'negociacao'].includes(n.status));
        if (!ativo || !aberta) return;
        setOrigem(aberta);
        onChange((atual) => ({
          ...atual,
          maquinas: Number(atual.maquinas) > 1 ? atual.maquinas : aberta.maquinas || 1,
          taxaOfertada: atual.taxaOfertada || aberta.taxaOfertada || '',
          modelo: atual.modelo || aberta.modelo || '',
          series: atual.series?.some(Boolean) ? atual.series : aberta.series ?? [],
        }));
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const n = Math.max(1, Math.min(50, Number(venda.maquinas) || 1));
  const series = Array.from({ length: n }, (_, i) => venda.series?.[i] ?? '');
  const modelos = Object.entries(meta?.modelosMaquina ?? {});

  return (
    <div className="card card-pad coluna venda-campos">
      <div className="entre">
        <b>{titulo}</b>
        {origem && (
          <span className="mini">
            da proposta de {new Date(origem.propostaAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="vd-maq">Máquinas vendidas</label>
          <input
            id="vd-maq" type="number" min="1" max="50" className="input" value={venda.maquinas}
            onChange={(e) => onChange({ ...venda, maquinas: Number(e.target.value) })}
          />
        </div>
        <div className="campo">
          <label htmlFor="vd-taxa">Tabela de taxa *</label>
          <select
            id="vd-taxa" className="select" value={venda.taxaOfertada}
            onChange={(e) => onChange({ ...venda, taxaOfertada: e.target.value })}
          >
            <option value="">Escolha a tabela</option>
            {(meta?.tabelasTaxa ?? []).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {modelos.length > 0 && (
        <div className="campo">
          <label>Modelo</label>
          <div className="opcoes">
            {modelos.map(([chave, label]) => (
              <button
                key={chave}
                type="button"
                className={`opcao${venda.modelo === chave ? ' ativa' : ''}`}
                onClick={() => onChange({ ...venda, modelo: venda.modelo === chave ? '' : chave })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <SeriesCampos
        series={series}
        onChange={(lista) => onChange({ ...venda, series: lista })}
        onFoto={(foto) => onChange({ ...venda, fotoEtiqueta: foto })}
      />
      {venda.fotoEtiqueta && <p className="mini">▣ Foto da etiqueta anexada — vai junto com a venda.</p>}

      <p className="mini">
        Entra na sua meta do mês quando a máquina for ativada
        {meta?.ativacao?.exigeConfirmacao ? ' e a gestão confirmar' : ''}.
      </p>
    </div>
  );
}

/**
 * Print da conversa no WhatsApp. Aqui a galeria é o caminho certo — print é
 * captura de tela. O que valida é o print mostrar a data e a resposta do
 * lojista: só a mensagem do vendedor não prova nada.
 */
export function PrintConversa({ print, onChange, obrigatorio = false }) {
  const { toast } = useApp();
  const [lendo, setLendo] = useState(false);

  const escolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setLendo(true);
    try {
      onChange({ ...(await prepararPrint(arquivo)), comResposta: false });
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setLendo(false);
    }
  };

  return (
    <div className="campo">
      <label>Print da conversa no WhatsApp{obrigatorio ? '' : ' (pode enviar depois)'}</label>
      {print ? (
        <div className="print-escolhido">
          <a className="anexo-miniatura" href={print.dataUrl} target="_blank" rel="noreferrer">
            <img src={print.dataUrl} alt="Print da conversa" />
          </a>
          <div className="crescer coluna" style={{ gap: 6 }}>
            <label className="marcacao">
              <input
                type="checkbox"
                checked={print.comResposta}
                onChange={(e) => onChange({ ...print, comResposta: e.target.checked })}
              />
              <span>O print mostra a <b>data</b> e a <b>resposta do lojista</b></span>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange(null)}>
              Trocar print
            </button>
          </div>
        </div>
      ) : (
        <label className="camera-abrir">
          <span className="emoji">▤</span>
          {lendo ? 'Lendo o print...' : 'Escolher o print da conversa'}
          <input type="file" accept="image/*" onChange={escolher} style={{ display: 'none' }} />
        </label>
      )}
      <p className="mini">Só a sua mensagem, sem resposta, não valida o lead.</p>
    </div>
  );
}

/** GPS do momento, gravado pelo sistema: o vendedor vê, mas não edita */
export function useLocalAgora(ativo = true) {
  const [local, setLocal] = useState(null);
  const [erro, setErro] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const buscar = useCallback(async () => {
    setErro(null);
    setBuscando(true);
    try {
      setLocal(await pegarPosicao());
    } catch (e) {
      setLocal(null);
      setErro(e.message);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (ativo) buscar();
  }, [ativo, buscar]);

  return { local, erro, buscando, buscar };
}

export function LocalAgora({ gps, obrigatorio = false }) {
  const { local, erro, buscando, buscar } = gps;
  if (buscando) return <p className="mini">⌖ Procurando sua localização...</p>;
  if (local) {
    return (
      <p className="mini">
        ⌖ Localização e horário gravados pelo sistema
        {local.precisao ? ` (precisão de ~${local.precisao} m)` : ''}.
      </p>
    );
  }
  return (
    <div className="linha">
      <span className={`mini crescer${obrigatorio ? ' erro-campo' : ''}`}>
        ⌖ {erro ?? 'Sem localização do aparelho.'}
        {obrigatorio ? ' Sem ela não dá para salvar.' : ''}
      </span>
      <button type="button" className="btn btn-sm" onClick={buscar}>Tentar de novo</button>
    </div>
  );
}

/** Menor valor aceito num <input type="datetime-local">: daqui a pouco */
export const agoraParaInput = () => {
  const d = new Date(Date.now() + 5 * 60000);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "O lojista marcou dia e hora?" — a próxima tarefa vai para essa data */
export function LojistaMarcou({ valor, onChange }) {
  const [aberto, setAberto] = useState(Boolean(valor));
  if (!aberto) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAberto(true)}>
        ◷ O lojista marcou dia e hora para voltar?
      </button>
    );
  }
  return (
    <div className="campo">
      <label htmlFor="lm-quando">Dia e hora que o lojista marcou</label>
      <div className="linha">
        <input
          id="lm-quando" type="datetime-local" className="input" value={valor}
          min={agoraParaInput()} onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(''); setAberto(false); }}>
          Limpar
        </button>
      </div>
      <p className="mini">O próximo follow-up vai para essa data e a cadência se ajusta.</p>
    </div>
  );
}
