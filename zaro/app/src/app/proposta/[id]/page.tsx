// Proposta comercial do orçamento, pronta para salvar em PDF pela impressão do navegador.
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { rotuloDoc, type TipoDoc } from '@/domain/comercial';
import { brl, dataBr, formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario } from '@/server/auth';
import { docDaEmpresa } from '@/server/comercial-docs';
import { Imprimir } from './Imprimir';
import './proposta.css';

export const dynamic = 'force-dynamic';

const TITULO: Record<TipoDoc, string> = { orcamento: 'Proposta comercial', pedido: 'Pedido de venda', solicitacao: 'Solicitação de compra', compra: 'Pedido de compra' };

async function carregar(id: string) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const d = await docDaEmpresa(await getDb(), emp.id, id).catch(() => null);
  if (!d) notFound();
  return { emp, d };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { emp, d } = await carregar((await params).id);
  return { title: `${rotuloDoc(d.tipo as TipoDoc, d.numero)}_${(d.parceiro || '').replace(/[^\w]+/g, '_')}_${emp.razao.replace(/[^\w]+/g, '_')}` };
}

export default async function Proposta({ params }: { params: Promise<{ id: string }> }) {
  const { emp, d } = await carregar((await params).id);
  const tipo = d.tipo as TipoDoc;
  const venda = tipo === 'orcamento' || tipo === 'pedido';
  return (
    <div className="pp">
      <Imprimir voltar={`/comercial?t=${tipo === 'orcamento' ? 'orcamentos' : tipo === 'pedido' ? 'pedidos' : 'compras'}`} />
      <header className="pp-cab">
        <div>
          <div className="pp-emp">{emp.razao}</div>
          <div className="pp-sub">CNPJ {formatarCnpj(emp.cnpj)}{(emp.cidade || emp.uf) && ` · ${[emp.cidade, emp.uf].filter(Boolean).join('/')}`}</div>
        </div>
        <div className="pp-num">
          <div className="pp-tit">{TITULO[tipo]}</div>
          <div className="pp-n">{rotuloDoc(tipo, d.numero)}</div>
        </div>
      </header>
      <section className="pp-dados">
        <div><span>{venda ? 'Cliente' : 'Fornecedor'}</span><b>{d.parceiro || '—'}</b>{d.docParceiro && <em>{formatarCnpj(d.docParceiro)}</em>}</div>
        <div><span>Emissão</span><b>{dataBr(d.data)}</b></div>
        <div><span>{tipo === 'orcamento' ? 'Válida até' : 'Previsão de entrega'}</span><b>{d.prazo ? dataBr(d.prazo) : '—'}</b></div>
        {d.referencia && <div><span>Referência do cliente</span><b>{d.referencia}</b></div>}
      </section>
      <table className="pp-itens">
        <thead><tr><th>#</th><th>Descrição</th><th className="n">Qtd.</th><th className="n">Preço unit.</th><th className="n">Total</th></tr></thead>
        <tbody>{d.itens.map((i, k) => <tr key={k}><td>{k + 1}</td><td>{i.nome}</td><td className="n">{i.qtd.toLocaleString('pt-BR')}</td><td className="n">{brl(i.preco)}</td><td className="n">{brl(i.total)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={4}>Total</td><td className="n">{brl(d.total)}</td></tr></tfoot>
      </table>
      <section className="pp-cond">
        {d.condicao && <p><b>Condições:</b> {d.condicao}</p>}
        {d.obs && <p><b>Observações:</b> {d.obs}</p>}
        {tipo === 'orcamento' && <p className="pp-sub">Valores válidos até a data indicada. Tributos conforme a legislação vigente na data do faturamento.</p>}
      </section>
      <footer className="pp-ass">
        <div><span />{emp.razao}</div>
        <div><span />{venda ? 'Aceite do cliente' : 'Fornecedor'}</div>
      </footer>
    </div>
  );
}
