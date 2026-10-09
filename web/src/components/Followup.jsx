// Follow-up da cadência: o cartão com o apoio de cada passo (mensagem pronta,
// botão de ligar com roteiro, rota no mapa) e a conclusão — que só existe com
// resultado registrado.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { diaMes, hora } from '../lib/date.js';
import { isoDoInput, linkTelefone, linkWhatsApp } from '../lib/contato.js';
import { CancelarModal, Modal } from './ui.jsx';
import {
  LocalAgora, LojistaMarcou, PrintConversa, ResultadoChips, VENDA_VAZIA, VendaCampos, agoraParaInput, faltaNaVenda,
  useLocalAgora,
} from './lead.jsx';

const SELO = { d1: 'D+1', d3: 'D+3', d7: 'D+7', d15: 'D+15', d30: 'D+30', avulso: 'Retorno' };

/** "hoje às 09:00", "03/10 às 09:00" */
const quando = (iso) => {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  return `${hoje ? 'hoje' : diaMes(iso)} às ${hora(iso)}`;
};

/** Como o follow-up é feito: pelo celular (mensagem ou ligação) ou indo à loja */
export const canalDoFollowup = (f) =>
  ['whatsapp', 'resgate', 'resgate_final'].includes(f.acao) ? 'mensagem' : f.acao === 'revisita' ? 'revisita' : 'ligacao';

/**
 * Dois botões na linha principal — o contato e o resultado — e o resto numa
 * linha discreta. A hora só aparece quando significa algo: atraso, ou data que
 * o lojista marcou (o 09:00 padrão parecia hora combinada e não era).
 * `mostrarCidade`: só quando a lista tem mais de uma cidade.
 */
export function FollowupCard({ followup: f, onMudou, mostrarCidade = true }) {
  const { toast } = useApp();
  const [concluir, setConcluir] = useState(false);
  const [detalhe, setDetalhe] = useState(false);
  const [remarcar, setRemarcar] = useState(null);
  const c = f.client;
  if (!c) return null;

  // O link abre na hora do toque (senão o celular bloqueia); o registro de
  // "iniciou a conversa pelo sistema" segue em paralelo.
  const abriuWhatsApp = () => endpoints.registrarWhatsApp(c.id, f.id).catch(() => {});

  const salvarRemarcacao = async () => {
    try {
      const atual = await endpoints.reagendarFollowup(f.id, isoDoInput(remarcar));
      toast(`Follow-up remarcado para ${quando(atual.dueAt)}.`);
      setRemarcar(null);
      onMudou?.();
    } catch (erro) {
      toast(erro.message, 'erro');
    }
  };

  const porWhatsApp = ['whatsapp', 'resgate', 'resgate_final'].includes(f.acao);

  return (
    <div className={`followup${f.atrasado ? ' atrasado' : ''}`}>
      <div className="followup-topo">
        <span className="followup-selo">{SELO[f.etapa] ?? 'Follow-up'}</span>
        <div className="crescer" style={{ minWidth: 0 }}>
          <Link to={`/carteira/${c.id}`} className="followup-loja truncar">{c.company}</Link>
          <span className="mini truncar" style={{ display: 'block' }}>
            {f.passo.label} · {c.name}{mostrarCidade && c.city ? ` · ${c.city}` : ''}
          </span>
        </div>
        {f.atrasado ? (
          <span className="chip chip-erro">{f.diasAtraso} dia(s) de atraso</span>
        ) : f.marcadoPeloLojista ? (
          <span className="chip" title="Data marcada pelo lojista">◷ {hora(f.dueAt)}</span>
        ) : null}
      </div>

      {f.combinado && <p className="mini">Combinado: {f.combinado}</p>}
      {f.marcadoPeloLojista && !f.combinado && <p className="mini">◷ Data marcada pelo lojista.</p>}

      {detalhe && f.mensagem && <p className="followup-texto">{f.mensagem}</p>}
      {detalhe && f.roteiro && (
        <ol className="followup-texto roteiro">
          {f.roteiro.map((linha) => <li key={linha}>{linha}</li>)}
        </ol>
      )}
      {f.acao === 'revisita' && c.address && <p className="mini">⌖ {c.address}{c.city ? ` — ${c.city}` : ''}</p>}

      <div className="followup-acoes">
        {porWhatsApp && (
          <a
            className="btn btn-sm" target="_blank" rel="noreferrer"
            href={linkWhatsApp(c.whatsapp, f.mensagem ?? '')} onClick={abriuWhatsApp}
          >
            ✉︎ WhatsApp
          </a>
        )}
        {f.acao === 'ligacao' && <a className="btn btn-sm" href={linkTelefone(c.phone || c.whatsapp)}>✆︎ Ligar</a>}
        {f.acao === 'revisita' && c.rota && (
          <a className="btn btn-sm" href={c.rota} target="_blank" rel="noreferrer">▨ Rota</a>
        )}
        <button type="button" className="btn btn-brand btn-sm" onClick={() => setConcluir(true)}>
          Registrar resultado
        </button>
      </div>
      {((f.mensagem || f.roteiro) || !f.atrasado) && (
        <div className="followup-acoes-sec">
          {(f.mensagem || f.roteiro) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetalhe((v) => !v)}>
              {detalhe ? 'Ocultar' : f.roteiro ? 'Roteiro' : 'Ver mensagem'}
            </button>
          )}
          {!f.atrasado && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemarcar(remarcar === null ? '' : null)}>
              ◷ Lojista remarcou
            </button>
          )}
        </div>
      )}

      {remarcar !== null && (
        <div className="linha">
          <input
            type="datetime-local" className="input" value={remarcar} min={agoraParaInput()}
            onChange={(e) => setRemarcar(e.target.value)} aria-label="Nova data do follow-up"
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={!remarcar} onClick={salvarRemarcacao}>
            Remarcar
          </button>
        </div>
      )}

      {concluir && (
        <ConcluirFollowup followup={f} onFechar={() => setConcluir(false)} onConcluido={onMudou} />
      )}
    </div>
  );
}

/** "Marcar como feito" não existe: o follow-up sai da lista com o resultado */
export function ConcluirFollowup({ followup: f, onFechar, onConcluido }) {
  const { toast, recarregarNotificacoes, recarregarPlacar } = useApp();
  const [resultado, setResultado] = useState(null);
  const [notes, setNotes] = useState('');
  const [print, setPrint] = useState(null);
  const [venda, setVenda] = useState(VENDA_VAZIA);
  const [proximoEm, setProximoEm] = useState('');
  const [salvando, setSalvando] = useState(false);
  const gps = useLocalAgora(f.exigeGps);
  // Uma chave por formulário: o reenvio depois de a resposta se perder no 4G é
  // reconhecido; um follow-up concluído por outro caminho, não
  const chave = useRef(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  const falta = !resultado
    ? 'Escolha o resultado do contato.'
    : resultado === 'fechado' && faltaNaVenda(venda)
      ? faltaNaVenda(venda)
    : f.exigePrint && !print
      ? 'Lead remoto: anexe o print da conversa.'
      : f.exigePrint && print.comResposta == null
        ? 'Diga se o print tem a resposta do lojista.'
        : f.exigeGps && !gps.local && !gps.erro
          ? 'Pegando sua localização... espere alguns segundos.'
          : null;
  // Revisita com o GPS que falhou de verdade: salva, marcada para a gestão
  const semGps = f.exigeGps && !gps.local && Boolean(gps.erro);

  const salvar = async () => {
    if (falta) return toast(falta, 'erro');
    setSalvando(true);
    try {
      const r = await endpoints.concluirFollowup(f.id, {
        chave: chave.current,
        resultado,
        notes,
        print: print ?? undefined,
        lat: gps.local?.lat,
        lng: gps.local?.lng,
        precisao: gps.local?.precisao,
        proximoEm: isoDoInput(proximoEm),
        venda: resultado === 'fechado' ? venda : undefined,
      });
      toast(
        r.repetido
          ? 'Este resultado já estava registrado.'
          : r.negocio
          ? `Venda registrada! ${r.negocio.maquinas} máquina(s).`
          : r.proximo
            ? `Resultado registrado. Próximo passo: ${r.proximo.passo.label.toLowerCase()}, ${quando(r.proximo.dueAt)}.`
            : 'Resultado registrado. Cadência encerrada.'
      );
      recarregarNotificacoes();
      recarregarPlacar();
      onConcluido?.(r);
      onFechar();
    } catch (erro) {
      // Concluído por outro caminho (uma visita, a auditoria): o que foi
      // preenchido aqui NÃO foi salvo. Avisa e atualiza a lista.
      if (erro.status === 409) {
        toast(erro.message, 'erro');
        recarregarPlacar();
        onConcluido?.();
        onFechar();
        return;
      }
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={`${SELO[f.etapa] ?? 'Follow-up'} · ${f.passo.label}`}
      subtitulo={`${f.client.company} — ${f.client.name}`}
      onFechar={onFechar}
      ocupado={salvando}
      sujo={Boolean(resultado || notes.trim() || print)}
      rodape={
        <>
          <CancelarModal />
          <button className="btn btn-brand" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : semGps ? 'Salvar sem GPS (a gestão verá)' : 'Registrar resultado'}
          </button>
        </>
      }
    >
      <ResultadoChips valor={resultado} onChange={setResultado} rotulo="O que aconteceu no contato?" />
      {resultado === 'fechado' && (
        <VendaCampos venda={venda} onChange={setVenda} clienteId={f.clientId ?? f.client?.id} />
      )}

      {f.exigePrint && <PrintConversa print={print} onChange={setPrint} obrigatorio />}
      {f.exigeGps && <LocalAgora gps={gps} podeSemGps />}

      <div className="campo">
        <label htmlFor="cf-obs">O que o lojista falou</label>
        <textarea
          id="cf-obs" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: vai comparar com o extrato da Stone e me chama na sexta."
        />
      </div>

      {resultado && !['fechado', 'sem_cnpj'].includes(resultado) && (
        <LojistaMarcou valor={proximoEm} onChange={setProximoEm} />
      )}
      {resultado === 'sem_cnpj' && <p className="mini">Sem CNPJ: a cadência deste lead para aqui.</p>}
      {f.etapa === 'd30' && resultado && resultado !== 'fechado' && (
        <p className="mini">Resgate final: sem avanço, o lead vai para “frio”.</p>
      )}
    </Modal>
  );
}
