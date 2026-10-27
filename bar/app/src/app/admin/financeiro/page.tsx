'use client';
// Custos e lucro: vendas do período, despesas lançadas (funcionários, bebidas, comidas...) e o lucro.
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { dataBr, reais } from '@/cliente/formato';
import { Aviso, Modal } from '@/cliente/ui';
import { paraCentavos } from '@/domain/dinheiro';
import { CATEGORIAS_DESPESA, NOME_CATEGORIA, type CategoriaDespesa, type ResumoFinanceiro } from '@/domain/financeiro';
import { Cabecalho, Periodo, hojeLocal } from '../comum';

interface Despesa {
  id: string;
  data: string;
  categoria: CategoriaDespesa;
  descricao: string;
  valorCentavos: number;
  funcionario: string | null;
}
interface Dados {
  de: string;
  ate: string;
  resumo: ResumoFinanceiro;
  vendasPorSetor: Record<string, number>;
  pedidos: number;
  despesas: Despesa[];
}

export default function Financeiro() {
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const { dados, erro } = useDados<Dados>(`/api/financeiro${periodo ? `?de=${periodo.de}&ate=${periodo.ate}` : ''}`);
  const [nova, setNova] = useState(false);
  const [msg, setMsg] = useState('');
  const r = dados?.resumo;
  const de = periodo?.de || dados?.de || '';
  const ate = periodo?.ate || dados?.ate || '';
  const maxCat = Math.max(1, ...(r?.porCategoria.map((c) => c.valorCentavos) || []));
  const gasto = (c: string) => r?.porCategoria.find((x) => x.categoria === c)?.valorCentavos || 0;

  async function excluir(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}" de ${reais(d.valorCentavos)}?`)) return;
    try {
      await api(`/api/despesas/${d.id}`, 'DELETE', {});
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <>
      <Cabecalho titulo="Custos e lucro" sub={de ? `${dataBr(de)}${ate !== de ? ` a ${dataBr(ate)}` : ''} · lucro = vendas líquidas − despesas lançadas` : ''}>
        <button className="btn primario" onClick={() => setNova(true)}>
          + Lançar despesa
        </button>
        <button className="btn" onClick={() => window.print()}>
          Imprimir / PDF
        </button>
      </Cabecalho>
      {(erro || msg) && <Aviso tipo="erro">{msg || erro}</Aviso>}
      <div className="pilha">
        {de && (
          <div className="cartao nao-imprimir">
            <Periodo de={de} ate={ate} mudar={(a, b) => setPeriodo({ de: a, ate: b })} />
          </div>
        )}
        {r && dados && (
          <>
            <div className="grade g4">
              <div className="cartao kpi">
                <span className="rotulo">Vendas líquidas</span>
                <span className="valor">{reais(r.vendasCentavos)}</span>
                <span className="det">{dados.pedidos} {dados.pedidos === 1 ? "pedido pago" : "pedidos pagos"} (sem cancelados)</span>
              </div>
              <div className="cartao kpi">
                <span className="rotulo">Despesas</span>
                <span className="valor" style={{ color: 'var(--vermelho)' }}>
                  {reais(r.despesasCentavos)}
                </span>
                <span className="det">{dados.despesas.length} {dados.despesas.length === 1 ? "lançamento" : "lançamentos"}</span>
              </div>
              <div className="cartao kpi">
                <span className="rotulo">{r.lucroCentavos >= 0 ? 'Lucro' : 'Prejuízo'}</span>
                <span className="valor" style={{ color: r.lucroCentavos >= 0 ? 'var(--verde)' : 'var(--vermelho)' }}>
                  {reais(r.lucroCentavos)}
                </span>
                <span className="det">vendas − despesas</span>
              </div>
              <div className="cartao kpi">
                <span className="rotulo">Margem</span>
                <span className="valor">{r.margem === null ? '—' : `${r.margem.toLocaleString('pt-BR')}%`}</span>
                <span className="det">do que foi vendido, quanto sobrou</span>
              </div>
            </div>

            <div className="grade g2">
              <div className="cartao">
                <header>
                  <h2>Despesas por categoria</h2>
                </header>
                <div className="barras-h">
                  {r.porCategoria.map((c) => (
                    <div key={c.categoria} className="item" style={{ gridTemplateColumns: '150px 1fr auto' }}>
                      <span>{NOME_CATEGORIA[c.categoria]}</span>
                      <div className="barra">
                        <i style={{ width: `${(c.valorCentavos / maxCat) * 100}%`, background: 'var(--vermelho)' }} />
                      </div>
                      <span className="num direita">
                        {reais(c.valorCentavos)}
                        {c.percentualDasVendas !== null && <span className="fraco"> · {c.percentualDasVendas.toLocaleString('pt-BR')}% das vendas</span>}
                      </span>
                    </div>
                  ))}
                  {!r.porCategoria.length && <span className="fraco">Nenhuma despesa lançada no período.</span>}
                </div>
              </div>
              <div className="cartao">
                <header>
                  <h2>Comidas e bebidas: vendido × gasto</h2>
                </header>
                <table className="tabela">
                  <thead>
                    <tr>
                      <th></th>
                      <th className="direita">Vendido</th>
                      <th className="direita">Gasto em compras</th>
                      <th className="direita">Sobra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['🍟 Comidas (cozinha)', dados.vendasPorSetor.cozinha || 0, gasto('comidas')],
                        ['🍺 Bebidas (bar)', dados.vendasPorSetor.bar || 0, gasto('bebidas')],
                      ] as const
                    ).map(([nome, vendido, gastoCat]) => (
                      <tr key={nome}>
                        <td>{nome}</td>
                        <td className="direita num">{reais(vendido)}</td>
                        <td className="direita num">{reais(gastoCat)}</td>
                        <td className="direita num" style={{ color: vendido - gastoCat >= 0 ? 'var(--verde)' : 'var(--vermelho)', fontWeight: 700 }}>
                          {reais(vendido - gastoCat)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>👥 Funcionários</td>
                      <td className="direita fraco">—</td>
                      <td className="direita num">{reais(gasto('funcionarios'))}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
                <p className="fraco" style={{ marginTop: 8 }}>
                  As vendas usam o valor de cada item; as compras são as despesas lançadas em Bebidas e Comidas no mesmo período.
                </p>
              </div>
            </div>

            <div className="cartao">
              <header>
                <h2>Despesas lançadas</h2>
                <button className="btn pequeno nao-imprimir" onClick={() => setNova(true)}>
                  + Lançar despesa
                </button>
              </header>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Categoria</th>
                      <th>Descrição</th>
                      <th className="direita">Valor</th>
                      <th className="nao-imprimir"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.despesas.map((d) => (
                      <tr key={d.id}>
                        <td>{dataBr(d.data)}</td>
                        <td>{NOME_CATEGORIA[d.categoria] || d.categoria}</td>
                        <td>
                          {d.descricao}
                          {d.funcionario && <div className="fraco">Funcionário: {d.funcionario}</div>}
                        </td>
                        <td className="direita num">{reais(d.valorCentavos)}</td>
                        <td className="nao-imprimir">
                          <button className="btn fantasma pequeno" onClick={() => excluir(d)}>
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!dados.despesas.length && <div className="vazio">Nenhuma despesa no período. Clique em “Lançar despesa”.</div>}
              </div>
            </div>

            <div className="cartao">
              <header>
                <h2>Dia a dia</h2>
              </header>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th className="direita">Vendas</th>
                      <th className="direita">Despesas</th>
                      <th className="direita">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porDia.map((d) => (
                      <tr key={d.data}>
                        <td>{dataBr(d.data)}</td>
                        <td className="direita num">{reais(d.vendasCentavos)}</td>
                        <td className="direita num">{reais(d.despesasCentavos)}</td>
                        <td className="direita num" style={{ color: d.lucroCentavos >= 0 ? 'var(--verde)' : 'var(--vermelho)', fontWeight: 700 }}>
                          {reais(d.lucroCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!r.porDia.length && <div className="vazio">Sem vendas nem despesas no período.</div>}
              </div>
            </div>
            <Aviso tipo="info">
              As vendas são as confirmadas pelos garçons (sem cancelados e estornados). Lance as compras de bebidas e comidas quando pagar o fornecedor, e os pagamentos de funcionários quando pagar cada um.
            </Aviso>
          </>
        )}
      </div>
      {nova && <FormDespesa fechar={() => setNova(false)} />}
    </>
  );
}

function FormDespesa({ fechar }: { fechar: () => void }) {
  const { dados: equipe } = useDados<{ equipe: { id: string; nome: string; ativo: boolean }[] }>('/api/equipe');
  const [categoria, setCategoria] = useState<CategoriaDespesa>('bebidas');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const valor = paraCentavos(String(f.get('valor') || ''));
    if (!valor || valor <= 0) return setErro('Informe um valor válido, ex.: 450,00');
    setSalvando(true);
    setErro('');
    try {
      await api('/api/despesas', 'POST', { data: f.get('data'), categoria, descricao: f.get('descricao'), valorCentavos: valor, funcionarioId: f.get('funcionarioId') || undefined });
      fechar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }
  return (
    <Modal titulo="Lançar despesa" aoFechar={fechar}>
      <form className="formulario" onSubmit={salvar}>
        <div className="filtros-rolagem" style={{ flexWrap: 'wrap' }}>
          {CATEGORIAS_DESPESA.map((c) => (
            <button type="button" key={c} className={categoria === c ? 'ativo' : ''} onClick={() => setCategoria(c)}>
              {NOME_CATEGORIA[c]}
            </button>
          ))}
        </div>
        <div className="linha-campos">
          <label className="campo">
            Data
            <input name="data" type="date" defaultValue={hojeLocal()} required />
          </label>
          <label className="campo">
            Valor (R$)
            <input name="valor" inputMode="decimal" placeholder="0,00" required autoFocus />
          </label>
        </div>
        {categoria === 'funcionarios' && (
          <label className="campo">
            Funcionário (opcional)
            <select name="funcionarioId" defaultValue="">
              <option value="">—</option>
              {equipe?.equipe
                .filter((u) => u.ativo)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="campo">
          Descrição
          <input
            name="descricao"
            required
            maxLength={120}
            placeholder={
              categoria === 'funcionarios' ? 'ex.: diária do garçom, salário da cozinheira' : categoria === 'bebidas' ? 'ex.: 10 caixas de cerveja, gelo' : categoria === 'comidas' ? 'ex.: batata, frango, óleo' : 'ex.: aluguel, luz, gás'
            }
          />
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button className="btn primario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar despesa'}
        </button>
      </form>
    </Modal>
  );
}
