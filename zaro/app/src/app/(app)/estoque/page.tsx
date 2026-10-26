// Produtos e Estoque agora fica dentro do Comercial; o endereço antigo continua funcionando.
import { redirect } from 'next/navigation';

export default async function Estoque({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ t: 'produtos' });
  for (const [k, v] of Object.entries(sp)) if (v && k !== 't' && !(k === 'aba' && v === 'vendidos')) p.set(k, v);
  redirect(`/comercial?${p}`);
}
