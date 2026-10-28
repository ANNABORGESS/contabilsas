'use client';
import { useState } from 'react';
import { api, useDados } from '@/cliente/api';
import { reais } from '@/cliente/formato';
import { Aviso, Modal } from '@/cliente/ui';
import { paraCentavos } from '@/domain/dinheiro';
import { Cabecalho } from '../comum';

interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  setor: 'cozinha' | 'bar';
  precoCentavos: number;
  ativo: boolean;
  ordem: number;
}

export default function Cardapio() {
  const { dados, erro } = useDados<{ produtos: Produto[] }>('/api/cardapio?todos=1');
  const [editando, setEditando] = useState<Produto | 'cozinha' | 'bar' | null>(null);
  const [msg, setMsg] = useState('');
  const produtos = dados?.produtos || [];
  async function alternar(p: Produto) {
    try {
      await api(`/api/cardapio/${p.id}`, 'PATCH', { ativo: !p.ativo });
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function excluir(p: Produto) {
    if (!confirm(`Excluir "${p.nome}" do cardápio?`)) return;
    setMsg('');
    try {
      await api(`/api/cardapio/${p.id}`, 'DELETE', {});
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <>
      <Cabecalho titulo="Cardápio" sub="Petiscos vão para o painel da cozinha; bebidas, para o painel do bar.">
        <button className="btn primario" onClick={() => setEditando('cozinha')}>
          + Adicionar produto
        </button>
      </Cabecalho>
      {(erro || msg) && <Aviso tipo="erro">{msg || erro}</Aviso>}
      <div className="grade g2">
        {(['cozinha', 'bar'] as const).map((s) => {
          const doSetor = produtos.filter((p) => p.setor === s);
          return (
            <div key={s} className="cartao">
              <header>
                <h2>{s === 'cozinha' ? '🍟 Petiscos · Cozinha' : '🍺 Bebidas · Bar'}</h2>
                <div className="fila">
                  <span className="fraco">{doSetor.filter((p) => p.ativo).length} disponíveis</span>
                  <button className="btn pequeno" onClick={() => setEditando(s)}>
                    + Adicionar
                  </button>
                </div>
              </header>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th className="direita">Preço</th>
                    <th>Disponível</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {doSetor.map((p) => (
                    <tr key={p.id} className={`clicavel ${p.ativo ? '' : 'apagado'}`}>
                      <td onClick={() => setEditando(p)}>
                        <b>{p.nome}</b>
                        {p.descricao && <div className="fraco">{p.descricao}</div>}
                      </td>
                      <td onClick={() => setEditando(p)}>{p.categoria}</td>
                      <td className="direita num" onClick={() => setEditando(p)}>
                        {reais(p.precoCentavos)}
                      </td>
                      <td>
                        <input type="checkbox" checked={p.ativo} onChange={() => alternar(p)} aria-label={`${p.nome} disponível`} />
                      </td>
                      <td className="direita">
                        <button className="btn fantasma pequeno" style={{ color: 'var(--vermelho)' }} onClick={() => excluir(p)} aria-label={`Excluir ${p.nome}`}>
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!doSetor.length && <div className="vazio">Nenhum produto. Clique em “+ Adicionar”.</div>}
            </div>
          );
        })}
      </div>
      {editando && (
        <FormProduto
          produto={typeof editando === 'string' ? null : editando}
          setorInicial={typeof editando === 'string' ? editando : editando.setor}
          categorias={[...new Set(produtos.map((p) => p.categoria))]}
          fechar={() => setEditando(null)}
          excluir={typeof editando === 'string' ? undefined : () => excluir(editando).then(() => setEditando(null))}
        />
      )}
    </>
  );
}

function FormProduto({ produto, setorInicial, categorias, fechar, excluir }: { produto: Produto | null; setorInicial: 'cozinha' | 'bar'; categorias: string[]; fechar: () => void; excluir?: () => void }) {
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const preco = paraCentavos(String(f.get('preco') || ''));
    if (!preco || preco <= 0) return setErro('Informe um preço válido, ex.: 12,90');
    const corpo = { nome: f.get('nome'), descricao: f.get('descricao'), categoria: f.get('categoria'), setor: f.get('setor'), precoCentavos: preco, ativo: f.get('ativo') === 'on' };
    setSalvando(true);
    try {
      if (produto) await api(`/api/cardapio/${produto.id}`, 'PATCH', corpo);
      else await api('/api/cardapio', 'POST', corpo);
      fechar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }
  return (
    <Modal titulo={produto ? `Editar ${produto.nome}` : setorInicial === 'bar' ? 'Adicionar bebida' : 'Adicionar petisco'} aoFechar={fechar}>
      <form className="formulario" onSubmit={salvar}>
        <label className="campo">
          Nome
          <input name="nome" defaultValue={produto?.nome} required autoFocus />
        </label>
        <div className="linha-campos">
          <label className="campo">
            Preparado em
            <select name="setor" defaultValue={produto?.setor || setorInicial}>
              <option value="cozinha">Cozinha (petisco)</option>
              <option value="bar">Bar (bebida)</option>
            </select>
          </label>
          <label className="campo">
            Categoria
            <input name="categoria" list="categorias" defaultValue={produto?.categoria} placeholder="ex.: Petiscos, Cervejas" required />
            <datalist id="categorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="campo">
            Preço (R$)
            <input name="preco" inputMode="decimal" defaultValue={produto ? (produto.precoCentavos / 100).toFixed(2).replace('.', ',') : ''} placeholder="0,00" required />
          </label>
        </div>
        <label className="campo">
          Descrição (opcional)
          <input name="descricao" defaultValue={produto?.descricao || ''} />
        </label>
        <label className="fila">
          <input type="checkbox" name="ativo" defaultChecked={produto ? produto.ativo : true} /> Disponível para venda
        </label>
        {produto && <p className="fraco">Mudar o preço vale para os próximos pedidos. Pedidos já pagos mantêm o valor cobrado.</p>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button className="btn primario" disabled={salvando}>
          {salvando ? 'Salvando…' : produto ? 'Salvar' : 'Adicionar ao cardápio'}
        </button>
        {excluir && (
          <button type="button" className="btn contorno-perigo" onClick={excluir}>
            Excluir do cardápio
          </button>
        )}
      </form>
    </Modal>
  );
}
