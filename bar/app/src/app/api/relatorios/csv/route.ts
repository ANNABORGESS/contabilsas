import { nomeLocal } from '@/domain/mesas';
import { reais } from '@/domain/dinheiro';
import { NOME_FORMA, type FormaPagamento } from '@/domain/pedido';
import { csv } from '@/domain/relatorio';
import { dataValida } from '@/domain/turno';
import { FUSO, hoje } from '@/server/config';
import { rota } from '@/server/http';
import { listarPedidos } from '@/server/pedidos';

const STATUS: Record<string, string> = { pago: 'Pago', cancelado: 'Cancelado', estornado: 'Estornado' };

export const GET = rota(['admin'], async ({ db, req }) => {
  const q = req.nextUrl.searchParams;
  const de = dataValida(q.get('de')) ? q.get('de')! : hoje();
  const ate = dataValida(q.get('ate')) && q.get('ate')! >= de ? q.get('ate')! : de;
  const lista = await listarPedidos(db, { de, ate, limite: 5000 });
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'medium' });
  const linhas: (string | number)[][] = [
    ['Pedido', 'Turno', 'Pago em', 'Mesa', 'Cliente', 'Garçom', 'Forma informada', 'Confirmação', 'Situação', 'Total pago (R$)', 'Itens cancelados (R$)', 'Valendo (R$)', 'Itens', 'Divergência de preço'],
    ...lista
      .slice()
      .reverse()
      .map((p) => [
        p.numero,
        p.dataOperacional,
        hora.format(new Date(p.pagoEm)),
        nomeLocal(p.mesa),
        p.cliente || '',
        p.garcom,
        NOME_FORMA[p.formaPagamento as FormaPagamento] || p.formaPagamento,
        'Manual (garçom)',
        STATUS[p.status] || p.status,
        (p.totalCentavos / 100).toFixed(2).replace('.', ','),
        (p.itensCanceladosCentavos / 100).toFixed(2).replace('.', ','),
        (p.liquidoCentavos / 100).toFixed(2).replace('.', ','),
        p.itens.map((i) => `${i.quantidade}x ${i.nome} (${reais(i.subtotalCentavos)})${i.quantidadeCancelada ? ` [${i.quantidadeCancelada} cancelado]` : ''}`).join(' | '),
        p.divergenciaPreco ? 'Sim' : '',
      ]),
  ];
  return new Response(csv(linhas), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="vendas-${de}_a_${ate}.csv"` },
  });
});
