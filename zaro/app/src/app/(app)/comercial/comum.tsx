import type { ReactNode } from 'react';
import { LINHAS_DOC } from '@/domain/comercial';
import { brl, formatarCnpj } from '@/domain/dinheiro';
import { FecharMenu } from '@/components/FecharMenu';

export type ItemCatalogo = { id: string; nome: string; preco: number | null; custo: number | null; tipo: string };
export type Parceiro = { id: string; razao: string; doc: string | null };

export function Cabeca({ titulo, sub, children }: { titulo: string; sub: string; children?: ReactNode }) {
  return (
    <div className="cabeca central">
      <div><div className="sobretitulo">Comercial</div><h1>{titulo}</h1><p>{sub}</p></div>
      {children && <div className="linha">{children}</div>}
    </div>
  );
}

export function Avisos({ msg, erro }: { msg?: string; erro?: string }) {
  return (
    <>
      {msg && <div className="aviso ok">{msg}</div>}
      {erro && <div className="aviso erro">{erro}</div>}
    </>
  );
}

export function Kpis({ itens }: { itens: [string, ReactNode, string][] }) {
  return (
    <div className="grade" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
      {itens.map(([r, v, s]) => (
        <div key={r} className="card kpi"><div className="rotulo">{r}</div><div className="v">{v}</div><div className="s">{s}</div></div>
      ))}
    </div>
  );
}

export function EscolherParceiro({ lista, rotulo }: { lista: Parceiro[]; rotulo: 'Cliente' | 'Fornecedor' }) {
  return (
    <>
      <div style={{ gridColumn: 'span 2' }}><label>{rotulo}</label>
        <select name="parceiro" defaultValue="">
          <option value="">— {rotulo} novo (preencha ao lado) —</option>
          {lista.map((c) => <option key={c.id} value={c.id}>{c.razao}{c.doc ? ` · ${formatarCnpj(c.doc)}` : ''}</option>)}
        </select>
      </div>
      <div><label>{rotulo} novo: nome</label><input name="novoParceiro" placeholder="Só se não estiver na lista" /></div>
      <div><label>{rotulo} novo: CNPJ ou CPF</label><input name="novoDoc" inputMode="numeric" /></div>
    </>
  );
}

/** Linhas de item: do cadastro (preço e custo de lá) ou digitado. */
export function LinhasItens({ catalogo, linhas = LINHAS_DOC }: { catalogo: ItemCatalogo[]; linhas?: number }) {
  return (
    <div className="tabela-wrap"><table>
      <thead><tr><th>Item do cadastro</th><th>ou descrição</th><th className="num">Qtd.</th><th className="num">Preço unit.</th></tr></thead>
      <tbody>{Array.from({ length: linhas }, (_, k) => (
        <tr key={k}>
          <td style={{ minWidth: 220 }}><select name={`item${k}`} defaultValue=""><option value="">—</option>{catalogo.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.preco ? ` · ${brl(c.preco)}` : ''}</option>)}</select></td>
          <td style={{ minWidth: 200 }}><input name={`nome${k}`} placeholder={k === 0 ? 'Ex.: Usinagem de peça conforme desenho' : ''} /></td>
          <td className="num" style={{ width: 90 }}><input name={`qtd${k}`} inputMode="decimal" defaultValue={k === 0 ? '1' : ''} style={{ textAlign: 'right' }} /></td>
          <td className="num" style={{ width: 140 }}><input name={`preco${k}`} inputMode="decimal" placeholder="do cadastro" style={{ textAlign: 'right' }} /></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export const tagStatus = (s: string) => (/Aprovad|Faturado|Recebido|Convertido|Pedido gerado/.test(s) ? 'pos' : /Rejeit|Cancel|Atrasad/.test(s) ? 'neg' : /aprovação|Enviado|Emitido|Ajuste|A faturar/.test(s) ? 'at' : 'acento');

/** Botões de mudança de status; os que pedem motivo abrem um campo. */
export function BotoesStatus({ id, volta, opcoes, acao }: { id: string; volta: string; opcoes: string[]; acao: (f: FormData) => Promise<void> }) {
  return (
    <>
      {opcoes.map((para) => /Rejeit|Cancel|Ajuste/.test(para) ? (
        <details key={para} className="menu-acao"><summary className="btn mini">{para.replace('Ajuste solicitado', 'Pedir ajuste').replace(/^Cancelad[oa]$/, 'Cancelar').replace(/^Rejeitad[oa]$/, 'Rejeitar')}</summary>
          <form action={acao} className="card menu-acao-caixa" style={{ width: 280, top: 34 }}>
            <FecharMenu />
            <input type="hidden" name="id" value={id} /><input type="hidden" name="para" value={para} /><input type="hidden" name="volta" value={volta} />
            <input name="motivo" placeholder="Motivo" required />
            <button className="btn mini perigo" type="submit">Confirmar</button>
          </form>
        </details>
      ) : (
        <form key={para} action={acao} style={{ display: 'inline' }}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="para" value={para} /><input type="hidden" name="volta" value={volta} />
          <button className="btn mini" type="submit">{ROTULO_ACAO[para] || para}</button>
        </form>
      ))}
    </>
  );
}

const ROTULO_ACAO: Record<string, string> = { Enviado: 'Marcar enviado', Aprovado: 'Cliente aprovou', 'Em aprovação': 'Enviar para aprovação', Aprovada: 'Aprovar', Rascunho: 'Reabrir' };
