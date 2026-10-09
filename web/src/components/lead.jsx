// Peças que o cadastro de lead, a visita e o follow-up têm em comum: o
// resultado (lista fixa), os dados da venda, o print da conversa, o GPS do
// momento e a data que o lojista marcou.

import { useCallback, useEffect, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { pegarPosicao } from '../lib/contato.js';
import { prepararPrint } from '../lib/imagem.js';
import { dateKey, pad } from '../lib/date.js';

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

export const VENDA_VAZIA = { maquinas: 1, taxaOfertada: '', modelo: '' };

/** O que falta para a venda valer na tela (o servidor confere de novo) */
export function faltaNaVenda(venda) {
  if (!venda?.modelo) return 'Escolha qual maquininha foi vendida.';
  if (!venda?.taxaOfertada) return 'Escolha a tabela de taxa da venda.';
  return null;
}

/**
 * Dados da venda: quantas máquinas, qual tabela (obrigatória) e qual modelo.
 * Com `clienteId`, a tabela e o modelo da proposta aberta já vêm preenchidos
 * — é ela que vira a venda.
 * `onChange` aceita valor ou função (como um setState).
 */
export function VendaCampos({ venda, onChange, clienteId, titulo = 'Dados da venda', proposta = false }) {
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
        }));
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

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

      {/* A maquininha vem primeiro: é o que a venda registra */}
      {modelos.length > 0 && (
        <div className="campo">
          <label>{proposta ? 'Maquininha oferecida' : 'Qual maquininha foi vendida? *'}</label>
          <div className="opcoes">
            {modelos.map(([chave, label]) => (
              <button
                key={chave}
                type="button"
                className={`opcao${venda.modelo === chave ? ' ativa' : ''}`}
                aria-pressed={venda.modelo === chave}
                onClick={() => onChange({ ...venda, modelo: venda.modelo === chave ? '' : chave })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="vd-maq">{proposta ? 'Máquinas' : 'Máquinas vendidas'}</label>
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
      // Nada vem marcado: o vendedor diz se o print tem a resposta do lojista
      onChange({ ...(await prepararPrint(arquivo)), comResposta: null });
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
            <span className="mini">O print mostra a data e a resposta do lojista?</span>
            <div className="opcoes">
              <button
                type="button"
                className={`opcao${print.comResposta === true ? ' ativa' : ''}`}
                aria-pressed={print.comResposta === true}
                onClick={() => onChange({ ...print, comResposta: true })}
              >
                Tem a resposta do lojista
              </button>
              <button
                type="button"
                className={`opcao${print.comResposta === false ? ' ativa' : ''}`}
                aria-pressed={print.comResposta === false}
                onClick={() => onChange({ ...print, comResposta: false })}
              >
                Ainda sem resposta
              </button>
            </div>
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

/**
 * `obrigatorio`: sem GPS não salva (lead presencial novo: é a prova).
 * `podeSemGps`: salva sem, mas a gestão vê (revisita, igual ao "Visitei").
 */
export function LocalAgora({ gps, obrigatorio = false, podeSemGps = false }) {
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
        {podeSemGps ? ' Se salvar assim, a revisita fica "sem GPS" e a gestão vê.' : ''}
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
