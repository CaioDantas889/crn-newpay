// Ranking gamificado.
// Hoje e Semana: leads validados e vendas (pendente e suspeito ficam de fora),
// com a sequência de dias de meta completa. Mês: pódio, níveis e ativações.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client.js';
import { useApp, useRecurso } from '../state/app.jsx';
import { Avatar, Carregando, Falha, Progresso, Vazio } from '../components/ui.jsx';

export default function Ranking() {
  const [periodo, setPeriodo] = useState('dia');

  return (
    <div className="page">
      <div>
        <h1>Ranking</h1>
        <p className="mini">Leads validados e vendas no dia e na semana; máquinas ativadas no mês.</p>
      </div>

      <div className="abas">
        <button className={`aba${periodo === 'dia' ? ' ativa' : ''}`} onClick={() => setPeriodo('dia')}>Hoje</button>
        <button className={`aba${periodo === 'semana' ? ' ativa' : ''}`} onClick={() => setPeriodo('semana')}>Semana</button>
        <button className={`aba${periodo === 'mes' ? ' ativa' : ''}`} onClick={() => setPeriodo('mes')}>Mês</button>
      </div>

      {periodo === 'mes' ? <RankingDoMes /> : <RankingDeLeads periodo={periodo} />}
    </div>
  );
}

/* ---------------------------------------------- leads validados e vendas */

function RankingDeLeads({ periodo }) {
  const { user } = useApp();
  const { dados, carregando, erro } = useRecurso(() => endpoints.rankingLeads(periodo), [periodo]);

  if (erro && !dados) return <Falha erro={erro} titulo="Não consegui carregar o ranking" />;
  if (carregando || !dados) return <Carregando linhas={6} />;

  const { linhas, minha, equipe } = dados;
  const lider = linhas[0];

  return (
    <>
      {minha && (
        <div className="card-meta">
          <div className="entre">
            <span className="selo" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>
              Sua posição {periodo === 'dia' ? 'hoje' : 'na semana'}
            </span>
            {minha.sequencia > 0 && (
              <span className="chip-nivel" style={{ background: 'var(--laranja)' }}>
                ▲ {minha.sequencia} dia(s) de meta completa
              </span>
            )}
          </div>
          <div className="meta-numero">
            <b>{minha.posicao}º</b>
            <span>lugar com {minha.leadsValidados} leads validados e {minha.vendas} venda(s)</span>
          </div>
          <div className="meta-linha">
            <span>{minha.presenciais} presenciais · {minha.remotos} remotos</span>
            <span>
              {minha.posicao === 1
                ? 'Você está liderando ★'
                : `${Math.max(0, lider.leadsValidados - minha.leadsValidados)} leads para assumir a liderança`}
            </span>
          </div>
          {minha.foraDoRanking > 0 && (
            <p className="mini" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              {minha.foraDoRanking} lead(s) seu(s) fora do ranking: pendente ou suspeito não conta.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Classificação {periodo === 'dia' ? 'de hoje' : 'da semana'}</h2>
          <span className="card-sub">{equipe.leadsValidados} leads validados · {equipe.vendas} vendas</span>
        </div>
        {linhas.length === 0 ? (
          <Vazio emoji="★" titulo="Nenhum vendedor ativo" />
        ) : (
          linhas.map((l) => (
            <div key={l.vendedor.id} className={`rank-linha${l.vendedor.id === user.id ? ' eu' : ''}`}>
              <span className="rank-pos">{l.posicao}º</span>
              <Avatar nome={l.vendedor.name} cor={l.vendedor.color} />
              <div className="crescer">
                <b className="truncar" style={{ display: 'block' }}>
                  {l.vendedor.name}
                  {l.vendedor.id === user.id && <span className="mini"> (você)</span>}
                </b>
                <span className="mini">
                  {l.presenciais} presenciais · {l.remotos} remotos · {l.vendas} venda(s)
                  {l.sequencia > 0 ? ` · ▲ ${l.sequencia} dia(s) de meta completa` : ''}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{l.leadsValidados}</b>
                <div className="mini">validados</div>
              </div>
            </div>
          ))
        )}
        <p className="card-pad mini">
          Meta completa = 30 leads no dia (mínimo de 20 presenciais) e nenhum follow-up atrasado.
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------- mês: ativações e níveis */

function RankingDoMes() {
  const { user, ehGestor } = useApp();
  const navigate = useNavigate();
  const { dados, carregando, erro } = useRecurso(() => endpoints.ranking(), []);

  if (erro && !dados) return <Falha erro={erro} titulo="Não consegui carregar o ranking" />;
  if (carregando || !dados) return <Carregando linhas={6} />;

  const { linhas, niveis, minhaPosicao, equipe } = dados;
  const podio = [linhas[1], linhas[0], linhas[2]].filter(Boolean); // 2º, 1º, 3º

  return (
    <>
      <p className="mini">
        {equipe.maquinasAtivadas} máquinas ativadas pela equipe · {equipe.maquinasVendidas} vendidas
      </p>

      {minhaPosicao && (
        <div className="card-meta">
          <div className="entre">
            <span className="selo" style={{ color: 'rgba(255, 255, 255, 0.55)' }}>Sua posição</span>
            <span className="chip-nivel" style={{ background: minhaPosicao.nivel.cor }}>
              {minhaPosicao.nivel.emoji} {minhaPosicao.nivel.label}
            </span>
          </div>
          <div className="meta-numero">
            <b>{minhaPosicao.posicao}º</b>
            <span>lugar com {minhaPosicao.maquinasAtivadas} ativações</span>
          </div>
          <div className="meta-linha">
            <span>
              {minhaPosicao.proximoNivel
                ? `Faltam ${minhaPosicao.faltamParaProximo} para ${minhaPosicao.proximoNivel.emoji} ${minhaPosicao.proximoNivel.label}`
                : 'Nível máximo alcançado ★'}
            </span>
            <span>
              {minhaPosicao.posicao === 1
                ? 'Você está liderando ★'
                : `${minhaPosicao.faltamParaLiderar} para assumir a liderança`}
            </span>
          </div>
          {minhaPosicao.proximoNivel && (
            <Progresso
              atual={minhaPosicao.maquinasAtivadas}
              total={minhaPosicao.proximoNivel.min}
              cor="#fbbf24"
            />
          )}
        </div>
      )}

      {podio.length >= 3 && (
        <div className="podio">
          {podio.map((l) => (
            <div key={l.vendedor.id} className={`podio-item p${l.posicao}`}>
              <Avatar nome={l.vendedor.name} cor="rgba(255,255,255,0.25)" />
              <span className="nome">{l.vendedor.name.split(' ')[0]}</span>
              <b>{l.maquinasAtivadas}</b>
              <span className="mini">máquinas ativadas</span>
              <span className="mini">{l.posicao === 1 ? '◕' : l.posicao === 2 ? '◑' : '◔'}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid-auto-larga">
        <div className="card">
          <div className="card-header">
            <h2>Classificação</h2>
            <span className="card-sub">por máquinas ativadas</span>
          </div>
          {linhas.map((l) => (
            <div key={l.vendedor.id} className={`rank-linha${l.vendedor.id === user.id ? ' eu' : ''}`}>
              <span className="rank-pos">{l.posicao}º</span>
              <Avatar nome={l.vendedor.name} cor={l.vendedor.color} />
              <div className="crescer">
                <b className="truncar" style={{ display: 'block' }}>
                  {l.vendedor.name}
                  {l.vendedor.id === user.id && <span className="mini"> (você)</span>}
                </b>
                <span className="mini">
                  {l.vendedor.city} · {l.visitas} visitas · {l.conversao}% de conversão · {l.percentualMeta}% da meta
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{l.maquinasAtivadas}</b>
                <div className="mini">ativadas</div>
              </div>
              <span className="chip-nivel" style={{ background: l.nivel.cor }}>{l.nivel.emoji}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Níveis NewPay</h2>
            <span className="card-sub">por ativações no mês</span>
          </div>
          <div className="card-pad">
            <div className="nivel-trilha">
              {niveis.map((n) => {
                const alcancado = (minhaPosicao?.maquinasAtivadas ?? 0) >= n.min;
                return (
                  <div
                    key={n.chave}
                    className={`nivel-item${alcancado ? ' alcancado' : ''}`}
                    style={alcancado ? { color: n.cor } : undefined}
                  >
                    <span className="emoji">{n.emoji}</span>
                    <b>{n.label}</b>
                    <small>{n.min}+ ativações</small>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Detalhamento</h2></div>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th className="num">Visitas</th>
                <th className="num">Vendidas</th>
                <th className="num">Ativadas</th>
                <th className="num">Meta</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                // Para a gestão, a linha abre o perfil completo do vendedor
                <tr
                  key={l.vendedor.id}
                  className={ehGestor ? 'linha-clicavel' : undefined}
                  onClick={ehGestor ? () => navigate(`/equipe/${l.vendedor.id}`) : undefined}
                >
                  <td>
                    <div className="linha">
                      <Avatar nome={l.vendedor.name} cor={l.vendedor.color} pequeno />
                      <span className="truncar">{l.vendedor.name}</span>
                    </div>
                  </td>
                  <td className="num">{l.visitas}</td>
                  <td className="num">{l.maquinasVendidas}</td>
                  <td className="num">{l.maquinasAtivadas}</td>
                  <td className="num" style={{ color: l.percentualMeta >= 100 ? 'var(--green)' : 'var(--text)' }}>
                    {l.percentualMeta}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
