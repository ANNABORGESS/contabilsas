'use client';
import { nomeLocal } from '@/domain/mesas';
import { useState } from 'react';
import { useDados } from '@/cliente/api';
import { dataBr, reais } from '@/cliente/formato';
import { Aviso } from '@/cliente/ui';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import type { Linha, Resumo } from '@/domain/relatorio';
import { AvisoConfirmacaoManual, Cabecalho, Periodo } from '../comum';

function Tabela({ titulo, linhas, nome, qtd }: { titulo: string; linhas: Linha[]; nome?: (k: string) => string; qtd?: boolean }) {
  const max = Math.max(1, ...linhas.map((l) => l.valorCentavos));
  return (
    <div className="cartao">
      <header>
        <h2>{titulo}</h2>
      </header>
      <div className="barras-h">
        {linhas.map((l) => (
          <div key={l.chave} className="item">
            <span>{nome ? nome(l.chave) : l.chave}</span>
            <div className="barra">
              <i style={{ width: `${(l.valorCentavos / max) * 100}%` }} />
            </div>
            <span className="num direita">
              {reais(l.valorCentavos)} <span className="fraco">· {qtd ? `${l.quantidade} un.` : `${l.pedidos} ped.`}</span>
            </span>
          </div>
        ))}
        {!linhas.length && <span className="fraco">Sem dados no período.</span>}
      </div>
    </div>
  );
}

export default function Relatorios() {
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const { dados, erro } = useDados<{ de: string; ate: string; resumo: Resumo; pedidos: number }>(`/api/relatorios${periodo ? `?de=${periodo.de}&ate=${periodo.ate}` : ''}`);
  const r = dados?.resumo;
  const de = periodo?.de || dados?.de || '';
  const ate = periodo?.ate || dados?.ate || '';
  const maxHora = Math.max(1, ...(r?.porHora.map((h) => h.valorCentavos) || []));
  return (
    <>
      <Cabecalho titulo="Relatórios" sub={de ? `${dataBr(de)}${ate !== de ? ` a ${dataBr(ate)}` : ''} · por turno (madrugada conta na noite anterior)` : ''}>
        <a className="btn" href={`/api/relatorios/csv?de=${de}&ate=${ate}`}>
          Exportar CSV
        </a>
        <button className="btn" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </Cabecalho>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="pilha">
        {de && (
          <div className="cartao nao-imprimir">
            <Periodo de={de} ate={ate} mudar={(a, b) => setPeriodo({ de: a, ate: b })} />
          </div>
        )}
        {r && (
          <>
            <div className="grade g4">
              <div className="cartao kpi">
                <span className="rotulo">Vendas brutas</span>
                <span className="valor">{reais(r.brutoCentavos)}</span>
                <span className="det">tudo o que foi confirmado</span>
              </div>
              <div className="cartao kpi">
                <span className="rotulo">Cancelado + estornado</span>
                <span className="valor">{reais(r.canceladoCentavos + r.estornadoCentavos + r.itensCanceladosCentavos)}</span>
                <span className="det">
                  {reais(r.canceladoCentavos)} canc. · {reais(r.estornadoCentavos)} estorno · {reais(r.itensCanceladosCentavos)} em itens
                </span>
              </div>
              <div className="cartao kpi">
                <span className="rotulo">Vendas líquidas</span>
                <span className="valor">{reais(r.liquidoCentavos)}</span>
                <span className="det">
                  {r.pedidos} pedidos · ticket {reais(r.ticketMedioCentavos)}
                </span>
              </div>
              <div className="cartao kpi">
                <span className="rotulo">Tempo médio até pronto</span>
                <span className="valor">
                  {r.tempoMedioMin.cozinha ?? '—'} / {r.tempoMedioMin.bar ?? '—'}
                </span>
                <span className="det">minutos · cozinha / bar</span>
              </div>
            </div>
            {r.divergencias > 0 && <Aviso tipo="alerta">{r.divergencias} pedido(s) cobrado(s) com preço diferente do cardápio da hora (cardápio alterado durante o atendimento). Veja em Vendas.</Aviso>}
            <div className="grade g2">
              <Tabela titulo="Por forma de pagamento (informada)" linhas={r.porForma} nome={(k) => NOME_FORMA[k as FormaPagamento] || k} />
              <Tabela titulo="Por garçom" linhas={r.porGarcom} />
            </div>
            <div className="cartao">
              <header>
                <h2>Vendas por hora</h2>
              </header>
              <div className="colunas-hora">
                {r.porHora.map((h) => (
                  <div key={h.chave} title={`${h.chave}h · ${reais(h.valorCentavos)} · ${h.pedidos} pedidos`}>
                    <i style={{ height: `${(h.valorCentavos / maxHora) * 100}%` }} />
                    {h.chave}h
                  </div>
                ))}
                {!r.porHora.length && <span className="fraco">Sem dados.</span>}
              </div>
            </div>
            <div className="grade g2">
              <div className="cartao">
                <header>
                  <h2>Produtos mais vendidos</h2>
                </header>
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Setor</th>
                        <th className="direita">Qtd.</th>
                        <th className="direita">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.porProduto.map((p) => (
                        <tr key={p.chave}>
                          <td>{p.chave}</td>
                          <td>{p.setor === 'cozinha' ? 'Cozinha' : 'Bar'}</td>
                          <td className="direita num">{p.quantidade}</td>
                          <td className="direita num">{reais(p.valorCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Tabela titulo="Por mesa" linhas={r.porMesa} nome={(k) => nomeLocal(Number(k))} />
            </div>
            <AvisoConfirmacaoManual />
          </>
        )}
      </div>
    </>
  );
}
