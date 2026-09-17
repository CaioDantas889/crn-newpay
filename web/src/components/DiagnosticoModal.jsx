// Diagnóstico comercial: as perguntas que definem se o lojista compra.
// A pontuação aparece ao vivo enquanto o vendedor responde.

import { useMemo, useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { CORES_TEMPERATURA, calcularScoreLocal } from '../lib/score.js';
import { Modal } from './ui.jsx';

export default function DiagnosticoModal({ cliente, onFechar, onSalvo }) {
  const { meta, toast } = useApp();
  const [form, setForm] = useState(() => ({
    maquinaAtual: cliente.diagnostico?.maquinaAtual ?? null,
    faturamento: cliente.diagnostico?.faturamento ?? null,
    volumeCartao: cliente.diagnostico?.volumeCartao ?? null,
    dores: cliente.diagnostico?.dores ?? [],
    interesse: cliente.diagnostico?.interesse ?? null,
    taxaAtual: cliente.diagnostico?.taxaAtual ?? '',
    observacoes: cliente.diagnostico?.observacoes ?? '',
  }));
  const [salvando, setSalvando] = useState(false);

  const previa = useMemo(() => calcularScoreLocal(form, meta), [form, meta]);

  const escolher = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const alternarDor = (dor) =>
    setForm((f) => ({
      ...f,
      dores: f.dores.includes(dor) ? f.dores.filter((d) => d !== dor) : [...f.dores, dor],
    }));

  const salvar = async () => {
    if (!form.maquinaAtual || !form.faturamento || !form.volumeCartao || !form.interesse) {
      return toast('Responda máquina atual, faturamento, volume e interesse.', 'erro');
    }
    setSalvando(true);
    try {
      const salvo = await endpoints.salvarDiagnostico(cliente.id, {
        ...form,
        taxaAtual: form.taxaAtual === '' ? null : Number(form.taxaAtual),
      });
      toast(`Diagnóstico salvo. Oportunidade: ${salvo.score} pontos (${salvo.temperature}).`);
      onSalvo?.(salvo);
      onFechar();
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const Grupo = ({ titulo, children }) => (
    <div className="diag-grupo">
      <span>{titulo}</span>
      <div className="opcoes">{children}</div>
    </div>
  );

  return (
    <Modal
      titulo="Diagnóstico comercial"
      subtitulo={`${cliente.company} — ${cliente.city}`}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar diagnóstico'}
          </button>
        </>
      }
    >
      <div className="score-preview">
        <div className="numero" style={{ background: CORES_TEMPERATURA[previa.temperatura] }}>
          {previa.score}
        </div>
        <div className="crescer">
          <b style={{ textTransform: 'capitalize' }}>Lead {previa.temperatura}</b>
          <div className="score-itens">
            {previa.detalhes.length === 0 ? (
              <span className="mini">Responda as perguntas para o CRM pontuar a oportunidade.</span>
            ) : (
              previa.detalhes.map((d) => (
                <div key={d.label}>
                  <span className="truncar">{d.label}</span>
                  <b>+{d.pontos}</b>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Grupo titulo="Máquina atual">
        {Object.entries(meta?.maquinas ?? {}).map(([chave, label]) => (
          <button
            key={chave}
            className={`opcao${form.maquinaAtual === chave ? ' ativa' : ''}`}
            onClick={() => escolher('maquinaAtual', chave)}
          >
            {label}
          </button>
        ))}
      </Grupo>

      {form.maquinaAtual && form.maquinaAtual !== 'nao_possui' && (
        <div className="campo">
          <label htmlFor="dg-taxa">Taxa que ele paga hoje (%)</label>
          <input
            id="dg-taxa"
            type="number"
            step="0.01"
            className="input"
            placeholder="Ex.: 3,99"
            value={form.taxaAtual}
            onChange={(e) => escolher('taxaAtual', e.target.value)}
          />
          <p className="mini">Usada na simulação de economia da Central de Objeções.</p>
        </div>
      )}

      <Grupo titulo="Faturamento mensal">
        {Object.entries(meta?.faturamentos ?? {}).map(([chave, info]) => (
          <button
            key={chave}
            className={`opcao${form.faturamento === chave ? ' ativa' : ''}`}
            onClick={() => escolher('faturamento', chave)}
          >
            {info.label}
          </button>
        ))}
      </Grupo>

      <Grupo titulo="Volume no cartão">
        {Object.entries(meta?.volumesCartao ?? {}).map(([chave, info]) => (
          <button
            key={chave}
            className={`opcao${form.volumeCartao === chave ? ' ativa' : ''}`}
            onClick={() => escolher('volumeCartao', chave)}
          >
            {info.label}
          </button>
        ))}
      </Grupo>

      <Grupo titulo="Principal dor (pode marcar mais de uma)">
        {Object.entries(meta?.dores ?? {}).map(([chave, label]) => (
          <button
            key={chave}
            className={`opcao${form.dores.includes(chave) ? ' ativa' : ''}`}
            onClick={() => alternarDor(chave)}
          >
            {label}
          </button>
        ))}
      </Grupo>

      <Grupo titulo="Interesse em trocar">
        {Object.entries(meta?.interesses ?? {}).map(([chave, info]) => (
          <button
            key={chave}
            className={`opcao${form.interesse === chave ? ' ativa' : ''}`}
            onClick={() => escolher('interesse', chave)}
          >
            {info.label} {info.pontos ? `(+${info.pontos})` : ''}
          </button>
        ))}
      </Grupo>

      <div className="campo">
        <label htmlFor="dg-obs">Observações</label>
        <textarea
          id="dg-obs"
          className="textarea"
          value={form.observacoes}
          onChange={(e) => escolher('observacoes', e.target.value)}
        />
      </div>
    </Modal>
  );
}
