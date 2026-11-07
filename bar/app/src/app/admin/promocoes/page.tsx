'use client';
// Promoções programadas: combo de um produto (ex.: 2 Original por R$ 12) nos dias e horário marcados,
// no horário de Manaus. Liga e desliga sozinha; o garçom vê a faixa com a contagem regressiva.
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { reais } from '@/cliente/formato';
import { Aviso, Modal, useAgora } from '@/cliente/ui';
import { paraCentavos } from '@/domain/dinheiro';
import { DIAS_SEMANA, lerMesas, textoRestante, type ResultadoPromocao } from '@/domain/promocao';
import { nomeLocal } from '@/domain/mesas';
import { Cabecalho, Periodo } from '../comum';

interface Promo {
  id: string;
  nome: string;
  produtoId: string;
  produto: string;
  quantidadeCombo: number;
  precoComboCentavos: number;
  precoNormalCentavos: number;
  dias: number[];
  inicio: string;
  fim: string;
  ativa: boolean;
  destaque: string | null;
  mesas: number[] | null;
  valendo: boolean;
  terminaEm: string | null;
  resultado: ResultadoPromocao;
}
interface Produto {
  id: string;
  nome: string;
  precoCentavos: number;
  ativo: boolean;
}

const textoDias = (d: number[]) => (d.length === 7 ? 'Todos os dias' : d.map((x) => DIAS_SEMANA[x]).join(', '));

export default function Promocoes() {
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const q = periodo ? `?de=${periodo.de}&ate=${periodo.ate}` : '';
  const { dados, erro, recarregar } = useDados<{ de: string; ate: string; promocoes: Promo[] }>(`/api/promocoes${q}`);
  const cardapio = useDados<{ produtos: Produto[] }>('/api/cardapio?todos=1');
  const [editando, setEditando] = useState<Promo | 'nova' | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const agora = useAgora(15000);
  const lista = dados?.promocoes || [];
  const de = periodo?.de || dados?.de || '';
  const ate = periodo?.ate || dados?.ate || '';
  const soma = lista.reduce(
    (a, p) => ({ unidades: a.unidades + p.resultado.unidades, faturado: a.faturado + p.resultado.faturadoCentavos, custo: a.custo + p.resultado.custoCentavos, desconto: a.desconto + p.resultado.descontoCentavos }),
    { unidades: 0, faturado: 0, custo: 0, desconto: 0 },
  );

  async function excluir(p: Promo) {
    if (!confirm(`Excluir a promoção ${p.nome}? Se já foi vendida, ela só é desligada (o relatório continua).`)) return;
    try {
      const r = await api<{ desligada: boolean }>(`/api/promocoes/${p.id}`, 'DELETE', {});
      setMsg({ tipo: 'ok', texto: r.desligada ? `${p.nome} desligada (já tinha vendas).` : `${p.nome} excluída.` });
      void recarregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <>
      <Cabecalho titulo="Promoções" sub="Programadas por dia e horário (horário de Manaus). Começam e terminam sozinhas; o preço e o estoque saem certos sem o garçom fazer nada.">
        <button className="btn primario" onClick={() => setEditando('nova')}>
          + Nova promoção
        </button>
      </Cabecalho>
      {(erro || msg) && <Aviso tipo={msg?.tipo === 'ok' ? 'ok' : 'erro'}>{msg?.texto || erro}</Aviso>}

      <div className="grade g2" style={{ marginBottom: 14 }}>
        {lista.map((p) => {
          const falta = p.terminaEm ? Date.parse(p.terminaEm) - agora : 0;
          const valendo = p.valendo && falta > 0;
          return (
            <div key={p.id} className="cartao" style={valendo ? { borderColor: 'var(--marca)' } : undefined}>
              <header>
                <h2>{p.nome}</h2>
                {!p.ativa ? <span className="chip">Desligada</span> : valendo ? <span className="chip ped-pago">Valendo · termina em {textoRestante(falta)}</span> : <span className="chip">Fora do horário</span>}
              </header>
              <div className="pilha" style={{ gap: 4 }}>
                <div>
                  <b>{p.produto}</b>: {p.quantidadeCombo} por <b>{reais(p.precoComboCentavos)}</b> <span className="fraco">(normal {reais(p.precoNormalCentavos)} cada)</span>
                </div>
                <div className="fraco">
                  {textoDias(p.dias)} · das {p.inicio} às {p.fim} · baixa {p.quantidadeCombo} un. do estoque por combo
                </div>
                <div className="fraco">{p.mesas?.length ? `Só em: ${p.mesas.map((n) => nomeLocal(n)).join(', ')}` : 'Em todas as mesas e no balcão'}</div>
                {p.destaque && <div className="fraco">Aviso no cardápio: “{p.destaque}”</div>}
              </div>
              <div className="fila" style={{ marginTop: 10 }}>
                <button className="btn pequeno" onClick={() => setEditando(p)}>
                  Editar
                </button>
                <button className="btn pequeno fantasma" onClick={() => excluir(p)}>
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
        {dados && !lista.length && <div className="cartao vazio">Nenhuma promoção cadastrada.</div>}
      </div>

      <div className="cartao">
        <header>
          <h2>Relatório das promoções</h2>
          {de && <Periodo de={de} ate={ate} mudar={(a, b) => setPeriodo({ de: a, ate: b })} />}
        </header>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Promoção</th>
                <th className="direita">Combos</th>
                <th className="direita">Unidades entregues</th>
                <th className="direita">Faturado</th>
                <th className="direita">Custo dos produtos</th>
                <th className="direita">Lucro bruto</th>
                <th className="direita">Desconto dado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}</td>
                  <td className="direita num">{p.resultado.combos}</td>
                  <td className="direita num">{p.resultado.unidades}</td>
                  <td className="direita num">{reais(p.resultado.faturadoCentavos)}</td>
                  <td className="direita num">{p.resultado.custoCentavos ? reais(p.resultado.custoCentavos) : '—'}</td>
                  <td className="direita num">{p.resultado.custoCentavos ? reais(p.resultado.faturadoCentavos - p.resultado.custoCentavos) : '—'}</td>
                  <td className="direita num" style={{ color: 'var(--vermelho)' }}>
                    {reais(p.resultado.descontoCentavos)}
                  </td>
                </tr>
              ))}
              {lista.length > 1 && (
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td></td>
                  <td className="direita num">
                    <b>{soma.unidades}</b>
                  </td>
                  <td className="direita num">
                    <b>{reais(soma.faturado)}</b>
                  </td>
                  <td className="direita num">{reais(soma.custo)}</td>
                  <td className="direita num">{reais(soma.faturado - soma.custo)}</td>
                  <td className="direita num">{reais(soma.desconto)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="fraco" style={{ marginTop: 8 }}>
          Só pedidos pagos, sem itens cancelados. Custo vem do custo do produto em Custos e lucro (sem custo cadastrado aparece “—”). Desconto = preço normal das unidades − o que foi cobrado.
        </p>
      </div>
      {editando && (
        <FormPromocao
          p={editando === 'nova' ? null : editando}
          produtos={(cardapio.dados?.produtos || []).filter((x) => x.ativo)}
          fechar={() => setEditando(null)}
          salvo={(t) => {
            setEditando(null);
            setMsg({ tipo: 'ok', texto: t });
            void recarregar();
          }}
        />
      )}
    </>
  );
}

function FormPromocao({ p, produtos, fechar, salvo }: { p: Promo | null; produtos: Produto[]; fechar: () => void; salvo: (t: string) => void }) {
  const [dias, setDias] = useState<number[]>(p?.dias || [0, 1, 2, 3, 4, 5, 6]);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setIndo(true);
    setErro('');
    const corpo = {
      nome: d.get('nome'),
      produtoId: d.get('produtoId'),
      quantidadeCombo: Number(d.get('quantidadeCombo')),
      precoComboCentavos: paraCentavos(String(d.get('preco') || '')),
      dias,
      inicio: d.get('inicio'),
      fim: d.get('fim'),
      destaque: d.get('destaque'),
      mesas: lerMesas(String(d.get('mesas') || '')),
      ativa: d.get('ativa') === 'on',
    };
    try {
      await api(p ? `/api/promocoes/${p.id}` : '/api/promocoes', p ? 'PATCH' : 'POST', corpo);
      salvo(`Promoção ${corpo.nome} salva.`);
    } catch (e) {
      setErro((e as Error).message);
      setIndo(false);
    }
  }
  return (
    <Modal titulo={p ? `Editar ${p.nome}` : 'Nova promoção'} aoFechar={fechar}>
      <form className="formulario" onSubmit={salvar}>
        <label className="campo">
          Nome
          <input name="nome" defaultValue={p?.nome || ''} placeholder="ex.: Original em dobro" required autoFocus />
        </label>
        <label className="campo">
          Produto
          <select name="produtoId" defaultValue={p?.produtoId || ''} required>
            <option value="" disabled>
              Escolha…
            </option>
            {produtos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome} ({reais(x.precoCentavos)})
              </option>
            ))}
          </select>
        </label>
        <div className="linha-campos">
          <label className="campo">
            Unidades no combo
            <input name="quantidadeCombo" type="number" min={2} max={12} defaultValue={p?.quantidadeCombo || 2} required />
          </label>
          <label className="campo">
            Preço do combo (R$)
            <input name="preco" inputMode="decimal" defaultValue={p ? (p.precoComboCentavos / 100).toFixed(2).replace('.', ',') : '12,00'} required />
          </label>
        </div>
        <div className="campo">
          Dias
          <div className="filtros-rolagem" style={{ flexWrap: 'wrap' }}>
            {DIAS_SEMANA.map((n, i) => (
              <button key={n} type="button" className={dias.includes(i) ? 'ativo' : ''} onClick={() => setDias((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => setDias([0, 1, 2, 3, 4, 5, 6])}>
              Todos
            </button>
          </div>
        </div>
        <div className="linha-campos">
          <label className="campo">
            Começa (Manaus)
            <input name="inicio" type="time" defaultValue={p?.inicio || '10:00'} required />
          </label>
          <label className="campo">
            Termina (Manaus)
            <input name="fim" type="time" defaultValue={p?.fim || '20:00'} required />
          </label>
        </div>
        <label className="campo">
          Só nestas mesas (opcional — vazio vale em todas)
          <input name="mesas" defaultValue={(p?.mesas || []).map((n) => nomeLocal(n)).join(', ')} placeholder="ex.: Balcão 10  ou  Mesa 5, Mesa 12" />
        </label>
        <label className="campo">
          Aviso no cardápio do garçom
          <input name="destaque" defaultValue={p?.destaque || ''} maxLength={80} placeholder="ex.: Original em dobro até as 20h" />
        </label>
        <label className="fila">
          <input type="checkbox" name="ativa" defaultChecked={p ? p.ativa : true} /> Ligada (desligue para pausar sem apagar)
        </label>
        <p className="fraco">Cada combo completo no pedido sai pelo preço do combo; quantidade que sobra vai no preço normal. O estoque baixa todas as unidades entregues. Pedido confirmado antes do fim mantém o preço.</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button className="btn primario" disabled={indo}>
          {indo ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </Modal>
  );
}
