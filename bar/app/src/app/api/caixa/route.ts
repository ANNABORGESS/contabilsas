import { dataValida } from '@/domain/turno';
import { fecharCaixa, listarFechamentos, resumoCaixa, turnoSemFechamento } from '@/server/caixa';
import { hoje } from '@/server/config';
import { rota } from '@/server/http';

/** Resumo do caixa do turno (por forma) e os últimos fechamentos. */
export const GET = rota(['fechamento'], async ({ db, req }) => {
  const d = req.nextUrl.searchParams.get('data');
  const data = dataValida(d) ? d! : hoje();
  const [resumo, historico, semFechar] = await Promise.all([resumoCaixa(db, data), listarFechamentos(db), turnoSemFechamento(db)]);
  return { ...resumo, hoje: hoje(), semFechar, historico: historico.map((h) => ({ ...h.f, fechadoPor: h.por })) };
});

/** Fecha (ou refaz) o caixa do turno. */
export const POST = rota(['fechamento'], async ({ db, u, corpo }) => fecharCaixa(db, u, dataValida(corpo.data) ? String(corpo.data) : hoje(), corpo));
