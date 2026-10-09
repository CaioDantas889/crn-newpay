// Cadastro de lead novo — feito para caber em menos de 60 segundos.
//
// Presencial: GPS e horário gravados pelo sistema, foto da fachada só pela
// câmera e o resultado da visita. Remoto: CNPJ conferido na Receita, origem,
// declaração e o print da conversa com a resposta do lojista.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { cnpjValido, mascaraDocumento, mascaraTelefone, somenteNumeros, validarTelefone } from '../lib/mascaras.js';
import { isoDoInput } from '../lib/contato.js';
import { CancelarModal, Modal } from './ui.jsx';
import CameraFoto from './CameraFoto.jsx';
import {
  LocalAgora, LojistaMarcou, PrintConversa, ResultadoChips, VENDA_VAZIA, VendaCampos, useLocalAgora,
} from './lead.jsx';

const VAZIO = {
  company: '', name: '', whatsapp: '', segment: '', maquinaAtual: '', faturamentoCartao: '',
  cnpj: '', canal: '', indicadoPor: '', declaracao: false,
};

export default function NovoLead({ onFechar, onCriado }) {
  const { meta, toast, recarregarPlacar, recarregarNotificacoes } = useApp();
  const [origem, setOrigem] = useState('presencial');
  const [form, setForm] = useState(VAZIO);
  const [foto, setFoto] = useState(null);
  const [print, setPrint] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [venda, setVenda] = useState(VENDA_VAZIA);
  const [proximoEm, setProximoEm] = useState('');
  const [duplicado, setDuplicado] = useState(null);
  const [receita, setReceita] = useState(null); // { carregando } | { erro } | { semRede } | consulta
  const [tentativaCnpj, setTentativaCnpj] = useState(0);
  const [indicacoes, setIndicacoes] = useState([]);
  const [buscaIndicacao, setBuscaIndicacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const presencial = origem === 'presencial';
  const gps = useLocalAgora(presencial);
  const consultado = useRef('');
  const navigate = useNavigate();
  // Uma chave por cadastro: se o 4G cair depois de o servidor gravar e o
  // vendedor tocar em Salvar de novo, volta o mesmo lead em vez de "duplicado"
  const chave = useRef(
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Duplicado avisado enquanto o vendedor ainda está no telefone — antes da foto
  useEffect(() => {
    if (somenteNumeros(form.whatsapp).length < 10 || validarTelefone(form.whatsapp)) return setDuplicado(null);
    const t = setTimeout(() => {
      endpoints
        .checarDuplicado({ whatsapp: form.whatsapp })
        .then((r) => setDuplicado(r.duplicado ? { mensagem: r.mensagem, clientId: r.clientId, seu: r.seu } : null))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [form.whatsapp]);

  // CNPJ completo e com dígitos certos já dispara a consulta na Receita
  useEffect(() => {
    const cnpj = somenteNumeros(form.cnpj);
    if (presencial || cnpj.length !== 14) {
      consultado.current = '';
      return setReceita(null);
    }
    if (!cnpjValido(cnpj)) return setReceita({ erro: 'CNPJ inválido — confira os números.' });
    if (consultado.current === cnpj) return undefined;

    consultado.current = cnpj;
    setReceita({ carregando: true });
    let valido = true;
    endpoints
      .consultarCnpj(cnpj)
      .then((r) => {
        if (!valido || consultado.current !== cnpj) return;
        setReceita(r);
        // A Receita preenche o que o vendedor ainda não digitou
        if (r.ok) setForm((f) => ({ ...f, company: f.company || r.nomeFantasia || r.razaoSocial }));
      })
      .catch((e) => {
        if (!valido || consultado.current !== cnpj) return;
        // CNPJ recusado de verdade (inválido, baixado, já na base) bloqueia.
        // Falta de sinal ou Receita fora do ar não: o lead salva pendente e o
        // servidor confere depois.
        if ([400, 409, 422].includes(e.status)) return setReceita({ erro: e.message });
        consultado.current = '';
        setReceita({ semRede: true });
      });
    return () => {
      valido = false;
    };
  }, [form.cnpj, presencial, tentativaCnpj]);

  // Quem indicou: busca entre os clientes já cadastrados
  useEffect(() => {
    if (form.canal !== 'indicacao') return undefined;
    let valido = true;
    const t = setTimeout(() => {
      endpoints
        .clientes({ busca: buscaIndicacao, ordem: 'nome' })
        .then((l) => valido && setIndicacoes(l.slice(0, 6)))
        .catch(() => {});
    }, 220);
    return () => {
      valido = false;
      clearTimeout(t);
    };
  }, [form.canal, buscaIndicacao]);

  const faltando = [];
  if (!form.name.trim()) faltando.push('nome do dono');
  if (somenteNumeros(form.whatsapp).length < 10 || validarTelefone(form.whatsapp)) faltando.push('WhatsApp válido');
  if (presencial) {
    if (!form.company.trim()) faltando.push('nome do comércio');
    if (!form.segment) faltando.push('segmento');
    if (!form.maquinaAtual) faltando.push('maquininha atual');
    if (!form.faturamentoCartao) faltando.push('faturamento no cartão');
    if (!foto) faltando.push('foto da fachada');
    if (!resultado) faltando.push('resultado da visita');
    if (resultado === 'fechado' && !venda.modelo) faltando.push('maquininha vendida');
    if (resultado === 'fechado' && !venda.taxaOfertada) faltando.push('tabela de taxa da venda');
    if (!gps.local) faltando.push('localização');
  } else {
    if (!cnpjValido(form.cnpj)) faltando.push('CNPJ');
    if (!form.canal) faltando.push('origem');
    if (form.canal === 'indicacao' && !form.indicadoPor) faltando.push('quem indicou');
    if (!form.declaracao) faltando.push('declaração');
    if (print && print.comResposta == null) faltando.push('dizer se o print tem a resposta do lojista');
  }
  const bloqueado = Boolean(duplicado) || Boolean(receita?.erro);

  // Remoto: valida na hora só com CNPJ ativo na Receita e print com a resposta
  const receitaAtiva = Boolean(receita?.ok && (receita.ativa ?? String(receita.situacao ?? '').toUpperCase() === 'ATIVA'));
  const previsaoRemoto = !print
    ? { ok: false, motivo: 'falta o print da conversa' }
    : print.comResposta !== true
      ? { ok: false, motivo: 'o print não mostra a resposta do lojista' }
      : !receitaAtiva
        ? { ok: false, motivo: 'a Receita ainda não confirmou o CNPJ ativo' }
        : { ok: true };

  const salvar = async () => {
    if (faltando.length) return toast(`Falta: ${faltando.join(', ')}.`, 'erro');
    setSalvando(true);
    try {
      const comum = { origem, chave: chave.current, name: form.name, company: form.company, whatsapp: form.whatsapp };
      const corpo = presencial
        ? {
            ...comum,
            segment: form.segment,
            maquinaAtual: form.maquinaAtual,
            faturamentoCartao: form.faturamentoCartao,
            foto,
            resultado,
            lat: gps.local.lat,
            lng: gps.local.lng,
            precisao: gps.local.precisao,
            proximoEm: isoDoInput(proximoEm),
            venda: resultado === 'fechado' ? venda : undefined,
          }
        : {
            ...comum,
            segment: form.segment || undefined,
            cnpj: form.cnpj,
            canal: form.canal,
            indicadoPor: form.canal === 'indicacao' ? form.indicadoPor : undefined,
            declaracao: form.declaracao,
            // Print sem a resposta do lojista não valida o lead: não gasta 4G subindo
            print: print?.comResposta ? print : undefined,
            proximoEm: isoDoInput(proximoEm),
          };

      const lead = await endpoints.criarCliente(corpo);
      const p = lead.placar;
      toast(
        lead.repetido
          ? `Este lead já tinha sido salvo antes de a conexão cair. Hoje: ${p.total}/${p.meta}.`
          : lead.leadStatus === 'pendente'
            ? `Lead salvo como pendente: ${lead.leadMotivo}`
            : `Lead salvo. Hoje: ${p.total}/${p.meta} (${p.presenciais} presenciais · ${p.remotos} remotos).`
      );
      for (const aviso of lead.avisos ?? []) toast(aviso, 'erro');

      recarregarPlacar();
      recarregarNotificacoes();
      onCriado?.(lead);
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const opcoes = (mapa, rotulo = (v) => v) =>
    Object.entries(mapa ?? {}).map(([chave, v]) => <option key={chave} value={chave}>{rotulo(v)}</option>);

  return (
    <Modal
      titulo="Novo lead"
      subtitulo={presencial ? 'Visita na loja — GPS, horário e foto' : 'Indicação ou WhatsApp — CNPJ e print'}
      onFechar={onFechar}
      ocupado={salvando}
      sujo={Boolean(foto || print || resultado || Object.entries(form).some(([k, v]) => v && v !== VAZIO[k]))}
      rodape={
        <>
          <CancelarModal />
          <button className="btn btn-brand" onClick={salvar} disabled={salvando || bloqueado}>
            {salvando ? 'Salvando...' : 'Salvar lead'}
          </button>
        </>
      }
    >
      <div className="aviso-fantasma">⚠︎ {meta?.avisoFantasma}</div>

      <div className="opcoes origem-lead">
        {Object.entries(meta?.origensLead ?? {}).map(([chave, info]) => (
          <button
            key={chave}
            type="button"
            className={`opcao${origem === chave ? ' ativa' : ''}`}
            onClick={() => setOrigem(chave)}
          >
            <b>{info.label}</b>
            <small>{info.descricao}</small>
          </button>
        ))}
      </div>

      {!presencial && (
        <div className="campo">
          <label htmlFor="nl-cnpj">CNPJ</label>
          <input
            id="nl-cnpj" className="input" inputMode="numeric" autoFocus value={form.cnpj}
            onChange={(e) => setForm((f) => ({ ...f, cnpj: mascaraDocumento(e.target.value) }))}
            placeholder="00.000.000/0000-00"
          />
          {receita?.carregando && <span className="mini">Consultando a Receita...</span>}
          {receita?.erro && <span className="mini erro-campo">{receita.erro}</span>}
          {receita?.semRede && (
            <span className="linha" style={{ flexWrap: 'wrap' }}>
              <span className="mini crescer">
                Sem internet agora. Consulte de novo, ou salve: o lead fica pendente até a Receita confirmar.
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setTentativaCnpj((n) => n + 1)}>
                Consultar de novo
              </button>
            </span>
          )}
          {receita?.aviso && <span className="mini">{receita.aviso}</span>}
          {receita?.ok && (
            <div className="receita-ok">
              <b>{receita.razaoSocial || 'CNPJ confirmado'}</b>
              <span className="mini">
                Situação: {receita.situacao}
                {receita.endereco ? ` · ${receita.endereco}` : ''}
                {receita.municipio ? ` · ${receita.municipio}/${receita.uf}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="campo">
        <label htmlFor="nl-empresa">Nome do comércio</label>
        <input
          id="nl-empresa" className="input" autoFocus={presencial} value={form.company}
          onChange={set('company')} placeholder="Ex.: Mercadinho São João"
        />
      </div>

      <div className="form-linha duas">
        <div className="campo">
          <label htmlFor="nl-dono">Nome do dono</label>
          <input id="nl-dono" className="input" value={form.name} onChange={set('name')} placeholder="Ex.: João Batista" />
        </div>
        <div className="campo">
          <label htmlFor="nl-wpp">WhatsApp</label>
          <input
            id="nl-wpp" className="input" inputMode="tel" value={form.whatsapp}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp: mascaraTelefone(e.target.value) }))}
            placeholder="(88) 99999-0000"
          />
          {validarTelefone(form.whatsapp) && <span className="mini erro-campo">{validarTelefone(form.whatsapp)}</span>}
          {duplicado && <span className="mini erro-campo">{duplicado.mensagem}</span>}
          {/* Lojista que já está na carteira dele: o certo é a revisita, a um toque */}
          {duplicado?.clientId && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                onFechar();
                navigate(`/carteira/${duplicado.clientId}${duplicado.seu ? '?visita=1' : ''}`, { replace: true });
              }}
            >
              {duplicado.seu ? '✓ Registrar visita na ficha dele' : 'Abrir a ficha'}
            </button>
          )}
        </div>
      </div>

      {presencial ? (
        <>
          <div className="form-linha tres">
            <div className="campo">
              <label htmlFor="nl-seg">Segmento</label>
              <select id="nl-seg" className="select" value={form.segment} onChange={set('segment')}>
                <option value="">Escolha</option>
                {opcoes(meta?.segmentos)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="nl-maq">Maquininha atual</label>
              <select id="nl-maq" className="select" value={form.maquinaAtual} onChange={set('maquinaAtual')}>
                <option value="">Escolha</option>
                {opcoes(meta?.maquinas)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="nl-fat">Faturamento no cartão</label>
              <select id="nl-fat" className="select" value={form.faturamentoCartao} onChange={set('faturamentoCartao')}>
                <option value="">Aproximado</option>
                {opcoes(meta?.faturamentos, (f) => f.label)}
              </select>
            </div>
          </div>

          <div className="campo">
            <label>Foto da fachada</label>
            <CameraFoto foto={foto} onFoto={setFoto} />
          </div>

          <ResultadoChips valor={resultado} onChange={setResultado} />
          {resultado === 'fechado' && <VendaCampos venda={venda} onChange={setVenda} />}
          {resultado && !['fechado', 'sem_cnpj'].includes(resultado) && (
            <LojistaMarcou valor={proximoEm} onChange={setProximoEm} />
          )}

          <LocalAgora gps={gps} obrigatorio />
        </>
      ) : (
        <>
          <div className="campo">
            <label>Origem</label>
            <div className="opcoes">
              {Object.entries(meta?.canaisRemoto ?? {}).map(([chave, label]) => (
                <button
                  key={chave}
                  type="button"
                  className={`opcao${form.canal === chave ? ' ativa' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, canal: chave }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.canal === 'indicacao' && (
            <div className="campo">
              <label htmlFor="nl-ind">Quem indicou</label>
              <input
                id="nl-ind" className="input" value={buscaIndicacao}
                onChange={(e) => setBuscaIndicacao(e.target.value)}
                placeholder="Buscar entre os seus clientes..."
              />
              <div className="card" style={{ maxHeight: 168, overflowY: 'auto' }}>
                {indicacoes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cliente-linha${form.indicadoPor === c.id ? ' escolhido' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, indicadoPor: c.id }))}
                  >
                    <span className="emoji">{form.indicadoPor === c.id ? '✓' : '◇'}</span>
                    <span className="info">
                      <b className="truncar" style={{ display: 'block' }}>{c.company}</b>
                      <span className="mini">{c.name} · {c.city}</span>
                    </span>
                  </button>
                ))}
                {indicacoes.length === 0 && <p className="vazio mini">Nenhum cliente encontrado.</p>}
              </div>
            </div>
          )}

          <PrintConversa print={print} onChange={setPrint} />
          {/* O que acontece ao salvar: o vendedor sabe antes se o lead já conta */}
          <p className={`mini ${previsaoRemoto.ok ? 'situacao-ok' : 'situacao-alerta'}`}>
            {previsaoRemoto.ok ? '✓ Vai entrar validado.' : `Vai entrar pendente (não conta ainda): ${previsaoRemoto.motivo}.`}
          </p>

          <label className="marcacao declaracao">
            <input
              type="checkbox" checked={form.declaracao}
              onChange={(e) => setForm((f) => ({ ...f, declaracao: e.target.checked }))}
            />
            <span>{meta?.declaracaoRemoto}</span>
          </label>
          <p className="mini">
            A declaração fica gravada com data, hora e o seu login. Sem print com resposta, o lead
            entra como <b>pendente</b> e só conta na meta depois de validado.
          </p>
        </>
      )}
    </Modal>
  );
}
