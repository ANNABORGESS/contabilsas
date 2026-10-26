'use server';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb, schema } from '@/db';
import { lerCertificadoA1, type DadosCertificado } from '@/domain/certificado';
import { formatarCnpj, soDigitos } from '@/domain/dinheiro';
import { auditar } from '@/server/auditoria';
import { escolherEmpresa, exigirEdicao, exigirUsuario } from '@/server/auth';
import { consultarCnpjPublico, type DadosCnpj } from '@/server/cnpj';

export async function consultarCnpj(cnpj: string): Promise<{ ok: true; dados: DadosCnpj } | { ok: false; erro: string }> {
  await exigirUsuario();
  try {
    return { ok: true, dados: await consultarCnpjPublico(cnpj) };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// Lê o .pfx só para preencher o formulário; nada é gravado aqui.
export async function lerCertificado(form: FormData): Promise<{ ok: true; cert: DadosCertificado; dados: DadosCnpj | null; aviso: string } | { ok: false; erro: string }> {
  await exigirEdicao();
  try {
    const cert = await certificadoDoForm(form);
    if (!cert) return { ok: false, erro: 'Escolha o arquivo .pfx do certificado A1.' };
    let dados: DadosCnpj | null = null;
    let aviso = '';
    try {
      dados = await consultarCnpjPublico(cert.cnpj);
    } catch (e) {
      aviso = `Consulta da Receita indisponível (${(e as Error).message}); preenchi com os dados do certificado.`;
    }
    return { ok: true, cert, dados, aviso };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

async function certificadoDoForm(form: FormData) {
  const arq = form.get('certificado');
  if (!(arq instanceof File) || !arq.size) return null;
  if (arq.size > 100_000) throw new Error('Arquivo grande demais para um certificado A1 (.pfx).');
  return lerCertificadoA1(new Uint8Array(await arq.arrayBuffer()), String(form.get('senhaCert') || ''));
}

const texto = (f: FormData, k: string) => String(f.get(k) || '').trim() || null;

export async function salvarEmpresa(form: FormData) {
  const u = await exigirEdicao();
  const db = await getDb();
  const id = texto(form, 'id');
  const cnpj = soDigitos(form.get('cnpj'));
  const razao = texto(form, 'razao');
  const volta = id ? `/empresas?editar=${id}` : '/empresas?nova=1';
  if (cnpj.length !== 14) redirect(`${volta}&erro=${encodeURIComponent('CNPJ precisa ter 14 dígitos.')}`);
  if (!razao) redirect(`${volta}&erro=${encodeURIComponent('Informe a razão social.')}`);
  // histórico de regime: até 4 períodos (regime, de, até)
  const regimeHist = [0, 1, 2, 3]
    .map((i) => ({ regime: texto(form, `hr${i}`), de: texto(form, `hd${i}`), ate: texto(form, `ha${i}`) }))
    .filter((p) => p.regime)
    .map((p) => ({ regime: p.regime!, de: p.de, ate: p.ate }));
  const valores = {
    cnpj, razao: razao!, fantasia: texto(form, 'fantasia'), regime: texto(form, 'regime'), regimeHist, ie: texto(form, 'ie'), im: texto(form, 'im'),
    cidade: texto(form, 'cidade'), uf: texto(form, 'uf'), cnae: texto(form, 'cnae'), contador: texto(form, 'contador'), crc: texto(form, 'crc'), semEstoque: form.get('semEstoque') === 'on',
  };
  let cert: DadosCertificado | null = null;
  try {
    cert = await certificadoDoForm(form);
  } catch (e) {
    redirect(`${volta}&erro=${encodeURIComponent((e as Error).message)}`);
  }
  if (cert && cert.cnpj !== cnpj) redirect(`${volta}&erro=${encodeURIComponent(`O certificado é do CNPJ ${formatarCnpj(cert.cnpj)}, diferente do CNPJ da empresa.`)}`);
  // guarda só os dados públicos do certificado (validade, titular); o .pfx e a senha não ficam no ZARO
  const certificado = cert ? { tipo: 'A1', titular: cert.titular, emissor: cert.emissor, serie: cert.serie, validoDe: cert.validoDe, validoAte: cert.validoAte, lidoEm: new Date().toISOString().slice(0, 10) } : null;
  const [dup] = await db.select({ id: schema.empresas.id }).from(schema.empresas).where(and(eq(schema.empresas.tenantId, u.tenantId), eq(schema.empresas.cnpj, cnpj)));
  if (dup && dup.id !== id) redirect(`${volta}&erro=${encodeURIComponent('Já existe uma empresa com este CNPJ.')}`);
  if (id) {
    const [antes] = await db.select().from(schema.empresas).where(and(eq(schema.empresas.id, id), eq(schema.empresas.tenantId, u.tenantId)));
    if (!antes) redirect('/empresas');
    await db.update(schema.empresas).set({ ...valores, ...(certificado && { dados: { ...antes.dados, certificado } }) }).where(eq(schema.empresas.id, id));
    await auditar(db, u, { empresaId: id, acao: 'Alterou cadastro da empresa', entidade: `${razao} · ${formatarCnpj(cnpj)}`, antes: `regime ${antes.regime || '—'}`, depois: `regime ${valores.regime || '—'}${certificado ? ` · certificado A1 até ${certificado.validoAte.split('-').reverse().join('/')}` : ''}` });
  } else {
    const [nova] = await db.insert(schema.empresas).values({ tenantId: u.tenantId, ...valores, ...(certificado && { dados: { certificado } }) }).returning();
    await auditar(db, u, { empresaId: nova.id, acao: certificado ? 'Cadastrou empresa com certificado A1' : 'Cadastrou empresa', entidade: `${razao} · ${formatarCnpj(cnpj)}`, depois: certificado ? `certificado A1 até ${certificado.validoAte.split('-').reverse().join('/')}` : undefined });
    await escolherEmpresa(nova.id);
  }
  revalidatePath('/', 'layout');
  redirect('/empresas?ok=1');
}
