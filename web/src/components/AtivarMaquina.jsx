// Ativação da máquina: a data real (não a do clique), o número de série que
// ainda faltava e o aviso de que a gestão confirma antes de contar na meta.

import { useState } from 'react';
import { endpoints } from '../api/client.js';
import { useApp } from '../state/app.jsx';
import { dateKey, diaMes } from '../lib/date.js';
import { Modal } from './ui.jsx';
import { SeriesCampos } from './lead.jsx';
import { SeriesChips } from './Negocio.jsx';

export default function AtivarMaquina({ negocio: n, onFechar, onAtivado }) {
  const { meta, toast, ehGestor, recarregarPlacar, recarregarNotificacoes } = useApp();
  const hoje = dateKey();
  const [data, setData] = useState(hoje);
  const faltam = n.faltamSeries ?? Math.max(0, (n.maquinas || 1) - (n.series?.length ?? 0));
  const [series, setSeries] = useState(Array.from({ length: faltam }, () => ''));
  const [fotoEtiqueta, setFotoEtiqueta] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const minimo = n.fechamentoAt ? dateKey(n.fechamentoAt) : undefined;
  const exigeConfirmacao = meta?.ativacao?.exigeConfirmacao !== false && !ehGestor;

  const salvar = async () => {
    if (!data) return toast('Informe o dia da ativação.', 'erro');
    setSalvando(true);
    try {
      const atual = await endpoints.atualizarNegocio(n.id, {
        status: 'ativado',
        data,
        series: series.filter((s) => String(s).trim()),
        ...(fotoEtiqueta ? { fotoEtiqueta } : {}),
      });
      toast(
        exigeConfirmacao
          ? 'Ativação registrada. Entra na meta quando a gestão confirmar.'
          : 'Máquina ativada! Já conta na meta e no ranking.'
      );
      recarregarPlacar();
      recarregarNotificacoes();
      onAtivado?.(atual);
      onFechar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Ativar máquina"
      subtitulo={n.client ? `${n.client.company}${n.client.city ? ` — ${n.client.city}` : ''}` : undefined}
      onFechar={onFechar}
      rodape={
        <>
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-brand" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : '✓ Confirmar ativação'}
          </button>
        </>
      }
    >
      <div className="card card-pad coluna" style={{ gap: 4 }}>
        <b>
          {n.modeloLabel ?? 'Modelo não informado'} · {n.maquinas} máquina(s)
          {n.taxaOfertada ? ` · tabela ${n.taxaOfertada}` : ''}
        </b>
        <span className="mini">Vendida em {diaMes(n.fechamentoAt)}</span>
        <SeriesChips negocio={{ ...n, faltamSeries: 0 }} />
      </div>

      <div className="campo">
        <label htmlFor="am-data">Dia em que a máquina foi ativada</label>
        <input
          id="am-data" type="date" className="input" value={data} max={hoje} min={minimo}
          onChange={(e) => setData(e.target.value)}
        />
        <p className="mini">O dia da ativação é o que conta na meta do mês. Hoje já vem marcado.</p>
      </div>

      {faltam > 0 && (
        <SeriesCampos
          series={series}
          onChange={setSeries}
          onFoto={setFotoEtiqueta}
          rotulo={faltam === n.maquinas ? 'Número de série' : `Número de série que faltava`}
          inicio={(n.series?.length ?? 0) + 1}
          dica="Leia o código da etiqueta ou digite. A gestão confere pela série."
        />
      )}
      {fotoEtiqueta && <p className="mini">▣ Foto da etiqueta anexada.</p>}

      <p className="mini">
        {exigeConfirmacao
          ? 'A ativação fica como "declarada" até a gestão confirmar. Só então entra na meta e no ranking.'
          : 'Ativação confirmada na hora: entra na meta e no ranking.'}
      </p>
    </Modal>
  );
}
