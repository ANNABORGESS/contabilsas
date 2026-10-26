// Custos e Preços agora fica dentro do Comercial (Custos e Rentabilidade); o endereço antigo continua funcionando.
import { redirect } from 'next/navigation';

export default async function Custos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ t: 'custos' });
  for (const [k, v] of Object.entries(sp)) if (v && k !== 't') p.set(k, v);
  redirect(`/comercial?${p}`);
}
