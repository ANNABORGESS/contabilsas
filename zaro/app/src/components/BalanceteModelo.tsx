// Balancete no modelo do escritório: as quatro seções com total, o resumo e o de-para do plano do ZARO.
import { Fragment } from 'react';
import { brl } from '@/domain/dinheiro';
import { nomeDaLinha, SECOES, type balanceteModelo } from '@/domain/balancete-modelo';

const lado = (v: number) => (Math.abs(v) < 0.005 ? '' : `${brl(Math.abs(v))} ${v > 0 ? 'D' : 'C'}`);
const valor = (v: number) => (Math.abs(v) < 0.005 ? '' : brl(v));

export function BalanceteModelo({ b, n, dePara = false }: { b: ReturnType<typeof balanceteModelo>; n: string; dePara?: boolean }) {
  const forte = { fontWeight: 700 } as const;
  return (
    <>
      {SECOES.map((s) => {
        const linhas = b.linhas.filter((l) => l.codigo === s.grupo || l.codigo.startsWith(s.grupo + '.'));
        const g = linhas[0];
        return (
          <Fragment key={s.grupo}>
            <h2>{s.titulo}</h2>
            <table>
              <thead><tr><th style={{ width: 70 }}>Código</th><th>Descrição da conta</th><th className={n}>Saldo anterior</th><th className={n}>Débitos</th><th className={n}>Créditos</th><th className={n}>Saldo atual</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.codigo} style={l.sintetica ? forte : undefined}>
                    <td>{l.codigo}</td>
                    <td style={{ paddingLeft: 6 + (l.nivel - 1) * 12 }}>{l.sintetica ? l.nome.toUpperCase() : l.nome}</td>
                    <td className={n}>{lado(l.anterior)}</td><td className={n}>{valor(l.debitos)}</td><td className={n}>{valor(l.creditos)}</td><td className={n}>{lado(l.final)}</td>
                  </tr>
                ))}
                <tr style={{ ...forte, borderTop: '2px solid currentColor' }}><td /><td>{s.total}</td><td className={n}>{lado(g.anterior)}</td><td className={n}>{valor(g.debitos)}</td><td className={n}>{valor(g.creditos)}</td><td className={n}>{lado(g.final)}</td></tr>
              </tbody>
            </table>
          </Fragment>
        );
      })}
      <h2>5. RESUMO DO BALANCETE</h2>
      <table>
        <thead><tr><th>Grupo contábil</th><th className={n}>Saldo devedor</th><th className={n}>Saldo credor</th></tr></thead>
        <tbody>
          {b.resumo.map((r) => <tr key={r.grupo}><td>{r.grupo}</td><td className={n}>{r.saldo > 0.004 ? brl(r.saldo) : ''}</td><td className={n}>{r.saldo < -0.004 ? brl(-r.saldo) : ''}</td></tr>)}
          <tr style={{ ...forte, borderTop: '2px solid currentColor' }}><td>TOTAL GERAL</td><td className={n}>{brl(b.totalDevedor)}</td><td className={n}>{brl(b.totalCredor)}</td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 8 }}>
        Movimento do período: débitos {brl(b.totalDebitos)} · créditos {brl(b.totalCreditos)} ·{' '}
        {Math.abs(b.totalDevedor - b.totalCredor) < 0.01 && Math.abs(b.totalDebitos - b.totalCreditos) < 0.01 ? 'débitos = créditos ✓' : 'há diferença: confira os lançamentos'}
      </p>
      {dePara && b.dePara.length > 0 && (
        <>
          <h2>Correspondência com o plano de contas do ZARO (movimento do período)</h2>
          <table>
            <thead><tr><th>Conta ZARO</th><th>Linha do modelo</th><th className={n}>Movimento</th></tr></thead>
            <tbody>{b.dePara.map((d) => <tr key={`${d.conta}>${d.linha}`}><td>{d.conta} {d.nome}</td><td>{d.linha} {nomeDaLinha(d.linha)}</td><td className={n}>{brl(d.valor)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </>
  );
}
