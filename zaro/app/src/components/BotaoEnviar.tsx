'use client';
import { useFormStatus } from 'react-dom';

export function BotaoEnviar({ texto, enviando }: { texto: string; enviando: string }) {
  const { pending } = useFormStatus();
  return <button className="btn primario" type="submit" disabled={pending}>{pending ? enviando : texto}</button>;
}
