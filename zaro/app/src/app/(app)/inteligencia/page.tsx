import Link from 'next/link';
import { Suspense } from 'react';
import { formatarCnpj } from '@/domain/dinheiro';
import { exigirEmpresa, exigirUsuario, podeEditar } from '@/server/auth';
import { PerguntasIa } from '@/components/ZaroIa';
import { Esqueleto } from '../loading';
import { Caixa } from './caixa';
import { Executivo } from './executivo';
import { Inadimplencia } from './inadimplencia';
import { Orcamento } from './orcamento';
import { Pagamentos } from './pagamentos';

export type SP = Record<string, string | undefined>;

const ABAS = [
  ['executivo', 'Executivo', 'Faturamento, lucro, EBITDA e rentabilidade'],
  ['caixa', 'Caixa', 'Saldo, entradas, saídas e projeção'],
  ['inadimplencia', 'Inadimplência', 'Clientes em atraso e impacto no caixa'],
  ['pagamentos', 'Pagamentos', 'Boletos, NF, contas a pagar e aprovação'],
  ['orcamento', 'Orçamento', 'Orçado x realizado e desvios por área'],
] as const;

const PERGUNTAS: Record<string, string[]> = {
  executivo: ['Por que o lucro aumentou ou diminuiu?', 'Quais despesas mais impactaram a margem?', 'Qual unidade apresenta melhor resultado?', 'O EBITDA evoluiu?', 'Qual tendência exige atenção?'],
  caixa: ['Em qual semana o caixa ficará mais pressionado?', 'O saldo cobre a folha?', 'Existem pagamentos concentrados?', 'Quais recebimentos são mais importantes?', 'Como melhorar a liquidez?'],
  inadimplencia: ['Quais clientes devem ser priorizados?', 'Quem possui atrasos recorrentes?', 'Quais atrasos podem afetar a folha ou os tributos?', 'Quais cobranças precisam de acompanhamento?', 'Quais clientes possuem maior exposição?'],
  pagamentos: ['Há cobranças duplicadas?', 'Quais documentos estão sem pedido?', 'Há juros, multas ou valores fora do padrão?', 'O que preciso aprovar esta semana?'],
  orcamento: ['Quais áreas ultrapassaram o orçamento?', 'Quanto ainda posso gastar?', 'Quais centros de custo estão pressionando o resultado?', 'Se mantivermos esse ritmo, qual será o desvio anual?', 'Quais despesas podem ser revisadas?'],
};

export default async function Inteligencia({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await exigirUsuario();
  const emp = await exigirEmpresa(u);
  const sp = await searchParams;
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : 'executivo';
  const hoje = new Date().toISOString().slice(0, 10);
  const props = { u, emp, sp, hoje, edita: podeEditar(u) };
  return (
    <>
      <div className="cabeca">
        <div>
          <h1>Inteligência Financeira</h1>
          <p><b>{emp.fantasia || emp.razao}</b> · CNPJ {formatarCnpj(emp.cnpj)} · <span title="A ZARO ainda não tem cadastro de filiais: os números são da empresa (CNPJ) inteira.">Filial: matriz</span> · só dados desta empresa</p>
        </div>
      </div>
      <nav className="abas-if" aria-label="Áreas">
        {ABAS.map(([k, n, d], i) => <Link key={k} href={`/inteligencia?aba=${k}`} className={aba === k ? 'ativo' : ''} aria-current={aba === k ? 'page' : undefined}><span>{String(i + 1).padStart(2, '0')} · {n}</span><small>{d}</small></Link>)}
      </nav>
      {sp.erro && <div className="aviso erro">{sp.erro}</div>}
      {sp.msg && <div className="aviso ok">{sp.msg}</div>}
      <Suspense key={JSON.stringify(sp) + emp.id} fallback={<Esqueleto />}>
        {aba === 'executivo' && <Executivo {...props} />}
        {aba === 'caixa' && <Caixa {...props} />}
        {aba === 'inadimplencia' && <Inadimplencia {...props} />}
        {aba === 'pagamentos' && <Pagamentos {...props} />}
        {aba === 'orcamento' && <Orcamento {...props} />}
      </Suspense>
      <div className="card cartao-ia" style={{ marginTop: 16 }}>
        <h2>ZARO IA · {ABAS.find(([k]) => k === aba)![1]}</h2>
        <p className="pequeno mudo">Respostas com os números desta aba e desta empresa, citando a fonte e o período. Sem evidência, a IA diz que o dado não existe.</p>
        <PerguntasIa perguntas={PERGUNTAS[aba]} area={aba} />
      </div>
    </>
  );
}
