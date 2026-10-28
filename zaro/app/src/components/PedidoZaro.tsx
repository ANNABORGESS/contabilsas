// Caixa "Peça à ZARO": o usuário escreve o pedido ("balancete de 2026 até setembro em PDF") e a ZARO
// devolve a demonstração pronta, com o resumo dos números e os links para tela, PDF e Excel.
import Link from 'next/link';
import { aprovarTodosExceto } from '@/app/(app)/contabilidade/acoes';
import { brl } from '@/domain/dinheiro';
import type { RespostaPedido } from '@/server/pedidos';

export const EXEMPLOS_PEDIDO = ['Aprovar todos menos os pix', 'Balancete de 2026 até setembro em PDF', 'DRE de janeiro a setembro', 'Balanço em 30/09/2026 no Excel', 'Balancete, DRE e balanço do 3º trimestre', 'Impostos a recuperar'];

export function PedidoZaro({ acao, texto, resposta }: { acao: string; texto?: string; resposta?: RespostaPedido | null }) {
  return (
    <div className="card nao-imprimir" style={{ marginBottom: 16 }}>
      <form action={acao} className="linha">
        <div style={{ flex: 1, minWidth: 260 }}>
          <label htmlFor="pedido">Peça à ZARO</label>
          <input id="pedido" name="pedido" defaultValue={texto} placeholder="Ex.: balancete de 2026 até setembro em PDF · DRE de março · balanço em 30/09/2026 no Excel" />
        </div>
        <button className="btn primario" type="submit" style={{ alignSelf: 'flex-end' }}>Gerar</button>
      </form>
      {!texto && (
        <div className="sugestoes-ia" style={{ marginTop: 8 }}>
          {EXEMPLOS_PEDIDO.map((e) => <Link key={e} className="chip" href={`${acao}?pedido=${encodeURIComponent(e)}`}>{e}</Link>)}
        </div>
      )}
      {texto && resposta === null && (
        <div className="aviso" style={{ marginTop: 10 }}>Não entendi o pedido. Diga a demonstração (balancete, DRE ou balanço), o período (ex.: “até setembro”, “de janeiro a março de 2026”, “3º trimestre”) e, se quiser, “em PDF” ou “no Excel”.</div>
      )}
      {resposta?.tipo === 'aprovacao' && (
        <div style={{ marginTop: 12 }}>
          <p>Vou aprovar <b>{resposta.aprovar} lançamento(s)</b> pendentes ({brl(resposta.valorAprovar)}).
            {resposta.exceto.length > 0 && <> Ficam de fora, para você revisar, <b>{resposta.fora}</b> com {resposta.exceto.map((x) => `“${x}”`).join(', ')} ({brl(resposta.valorFora)}).</>}</p>
          {resposta.exemplosFora.length > 0 && <ul className="pequeno mudo" style={{ paddingLeft: 18 }}>{resposta.exemplosFora.map((x, i) => <li key={i}>{x}</li>)}{resposta.fora > resposta.exemplosFora.length && <li>…</li>}</ul>}
          {resposta.aprovar > 0 && (
            <form action={aprovarTodosExceto} className="linha">
              <input type="hidden" name="volta" value={acao} />
              <input type="hidden" name="exceto" value={resposta.exceto.join(',')} />
              <button className="btn primario" type="submit">Confirmar aprovação</button>
              <span className="pequeno mudo">Aprovado ainda pode voltar para revisão; só “Contabilizado” trava.</span>
            </form>
          )}
        </div>
      )}
      {resposta?.tipo === 'atalho' && (
        <div style={{ marginTop: 10 }}>Isso fica em <Link href={resposta.href}><b>{resposta.nome}</b></Link>. <Link className="btn mini primario" href={resposta.href}>Abrir</Link></div>
      )}
      {resposta?.tipo === 'demonstracao' && (
        <div style={{ marginTop: 12 }}>
          {resposta.previa && resposta.pendentes > 0 && (
            <div className="aviso" style={{ marginBottom: 10 }}>
              {resposta.pendentes} lançamento(s) até {resposta.pedido.ate.split('-').reverse().join('/')} ainda não foram aprovados: a demonstração saiu como <b>prévia</b> (inclui todos).
              {' '}A versão oficial sai depois de aprovar em <Link href="/contabilidade?aba=lancamentos">Lançamentos</Link>.
            </div>
          )}
          <div className="grade g2">
            {resposta.itens.map((i) => (
              <div key={i.demo} className="card" style={{ margin: 0 }}>
                <h2 style={{ marginTop: 0 }}>{i.titulo}{resposta.previa ? ' · prévia' : ''}</h2>
                <ul className="pequeno" style={{ paddingLeft: 18 }}>{i.resumo.map((x) => <li key={x}>{x}</li>)}</ul>
                <div className="linha">
                  <a className={`btn mini ${resposta.pedido.formato === 'tela' ? 'primario' : ''}`} href={i.links.tela}>Abrir na tela</a>
                  <a className={`btn mini ${resposta.pedido.formato === 'pdf' ? 'primario' : ''}`} href={i.links.pdf} target="_blank" rel="noreferrer">Salvar em PDF</a>
                  <a className={`btn mini ${resposta.pedido.formato === 'excel' ? 'primario' : ''}`} href={i.links.excel}>Excel</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
