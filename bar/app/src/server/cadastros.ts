// Mesas, cardápio e equipe (administração) e o primeiro acesso.
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { reais } from '@/domain/dinheiro';
import { NOME_PAPEL, ehPapel } from '@/domain/papeis';
import { NOME_SETOR, ehSetor } from '@/domain/pedido';
import type { Usuario } from './auth';
import { hashSenha, semUsuarios } from './auth';
import { ErroRegra } from './erros';
import { registrar } from './eventos';

const uuidOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const texto = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------- mesas ----------

export async function listarMesas(db: Db, todas = false) {
  return db.select().from(schema.mesas).where(todas ? undefined : eq(schema.mesas.ativa, true)).orderBy(asc(schema.mesas.numero));
}

export async function criarMesas(db: Db, u: Usuario, de: unknown, ate: unknown) {
  const a = Number(de);
  const b = Number(ate ?? de);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a || b > 999 || b - a > 200) throw new ErroRegra('Informe números de mesa entre 1 e 999.');
  const novas = Array.from({ length: b - a + 1 }, (_, i) => ({ numero: a + i }));
  const criadas = await db.insert(schema.mesas).values(novas).onConflictDoNothing({ target: schema.mesas.numero }).returning();
  if (criadas.length) await registrar(db, { tipo: 'mesa_criada', usuarioId: u.id, descricao: `${u.nome} criou ${criadas.length === 1 ? `a mesa ${a}` : `as mesas ${a} a ${b}`}` });
  return criadas.length;
}

export async function atualizarMesa(db: Db, u: Usuario, id: string, dados: { nome?: unknown; ativa?: unknown }) {
  if (!uuidOk(id)) throw new ErroRegra('Mesa não encontrada.', 404);
  const set: Partial<typeof schema.mesas.$inferInsert> = {};
  if (dados.nome !== undefined) set.nome = texto(dados.nome, 40) || null;
  if (typeof dados.ativa === 'boolean') set.ativa = dados.ativa;
  const [m] = await db.update(schema.mesas).set(set).where(eq(schema.mesas.id, id)).returning();
  if (!m) throw new ErroRegra('Mesa não encontrada.', 404);
  await registrar(db, { tipo: 'mesa_alterada', usuarioId: u.id, descricao: `${u.nome} alterou a mesa ${m.numero}${typeof dados.ativa === 'boolean' ? (dados.ativa ? ' (ativada)' : ' (desativada)') : ''}` });
}

// ---------- cardápio ----------

export async function listarProdutos(db: Db, todos = false) {
  return db
    .select()
    .from(schema.produtos)
    .where(todos ? undefined : eq(schema.produtos.ativo, true))
    .orderBy(asc(schema.produtos.setor), asc(schema.produtos.categoria), asc(schema.produtos.ordem), asc(schema.produtos.nome));
}

interface DadosProduto {
  nome?: unknown;
  descricao?: unknown;
  categoria?: unknown;
  setor?: unknown;
  precoCentavos?: unknown;
  ativo?: unknown;
  ordem?: unknown;
}

function validarProduto(d: DadosProduto, parcial: boolean) {
  const set: Partial<typeof schema.produtos.$inferInsert> = {};
  if (!parcial || d.nome !== undefined) {
    set.nome = texto(d.nome, 80);
    if (!set.nome) throw new ErroRegra('Informe o nome do produto.');
  }
  if (!parcial || d.categoria !== undefined) {
    set.categoria = texto(d.categoria, 40);
    if (!set.categoria) throw new ErroRegra('Informe a categoria (ex.: Petiscos, Cervejas, Drinks).');
  }
  if (!parcial || d.setor !== undefined) {
    if (!ehSetor(d.setor)) throw new ErroRegra('Escolha onde é preparado: cozinha ou bar.');
    set.setor = d.setor;
  }
  if (!parcial || d.precoCentavos !== undefined) {
    const p = Number(d.precoCentavos);
    if (!Number.isInteger(p) || p <= 0 || p > 10_000_00) throw new ErroRegra('Informe um preço válido.');
    set.precoCentavos = p;
  }
  if (d.descricao !== undefined) set.descricao = texto(d.descricao, 200) || null;
  if (typeof d.ativo === 'boolean') set.ativo = d.ativo;
  if (d.ordem !== undefined && Number.isInteger(Number(d.ordem))) set.ordem = Number(d.ordem);
  return set;
}

export async function criarProduto(db: Db, u: Usuario, d: DadosProduto) {
  const v = validarProduto(d, false) as typeof schema.produtos.$inferInsert;
  const [p] = await db.insert(schema.produtos).values(v).returning();
  await registrar(db, { tipo: 'produto_criado', usuarioId: u.id, descricao: `${u.nome} incluiu ${p.nome} (${NOME_SETOR[p.setor as 'bar']}, ${reais(p.precoCentavos)}) no cardápio` });
  return p;
}

export async function atualizarProduto(db: Db, u: Usuario, id: string, d: DadosProduto) {
  if (!uuidOk(id)) throw new ErroRegra('Produto não encontrado.', 404);
  const [antes] = await db.select().from(schema.produtos).where(eq(schema.produtos.id, id));
  if (!antes) throw new ErroRegra('Produto não encontrado.', 404);
  const set = validarProduto(d, true);
  const [p] = await db.update(schema.produtos).set({ ...set, atualizadoEm: new Date() }).where(eq(schema.produtos.id, id)).returning();
  const mudancas = [];
  if (set.precoCentavos !== undefined && set.precoCentavos !== antes.precoCentavos) mudancas.push(`preço ${reais(antes.precoCentavos)} → ${reais(p.precoCentavos)}`);
  if (set.ativo !== undefined && set.ativo !== antes.ativo) mudancas.push(p.ativo ? 'disponível' : 'indisponível');
  if (set.nome && set.nome !== antes.nome) mudancas.push(`nome "${antes.nome}" → "${p.nome}"`);
  await registrar(db, { tipo: 'produto_alterado', usuarioId: u.id, descricao: `${u.nome} alterou ${p.nome}${mudancas.length ? `: ${mudancas.join(', ')}` : ''}` });
  return p;
}

// ---------- equipe ----------

export async function listarEquipe(db: Db) {
  return db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, usuario: schema.usuarios.usuario, papel: schema.usuarios.papel, ativo: schema.usuarios.ativo, criadoEm: schema.usuarios.criadoEm })
    .from(schema.usuarios)
    .orderBy(asc(schema.usuarios.nome));
}

function validarSenha(s: unknown): string {
  if (typeof s !== 'string' || s.length < 4 || s.length > 100) throw new ErroRegra('A senha precisa ter pelo menos 4 caracteres (pode ser um PIN de números).');
  return s;
}

function validarLogin(s: unknown): string {
  const v = texto(s, 30).toLowerCase();
  if (!/^[a-z0-9._-]{2,30}$/.test(v)) throw new ErroRegra('O usuário deve ter de 2 a 30 letras sem espaço nem acento (ex.: ana, joao.silva).');
  return v;
}

export async function criarFuncionario(db: Db, u: Usuario | null, d: { nome?: unknown; usuario?: unknown; senha?: unknown; papel?: unknown }) {
  const nome = texto(d.nome, 60);
  if (!nome) throw new ErroRegra('Informe o nome.');
  const usuario = validarLogin(d.usuario);
  const senha = validarSenha(d.senha);
  if (!ehPapel(d.papel)) throw new ErroRegra('Escolha a função.');
  const papel = d.papel;
  const [novo] = await db.insert(schema.usuarios).values({ nome, usuario, papel, senhaHash: await hashSenha(senha) }).onConflictDoNothing({ target: schema.usuarios.usuario }).returning();
  if (!novo) throw new ErroRegra('Já existe alguém com esse usuário.', 409);
  await registrar(db, { tipo: 'funcionario_criado', usuarioId: u?.id ?? novo.id, descricao: `${u ? u.nome : 'Primeiro acesso'}: cadastrou ${nome} (${NOME_PAPEL[papel]})` });
  return { id: novo.id, nome, usuario, papel };
}

export async function atualizarFuncionario(db: Db, u: Usuario, id: string, d: { nome?: unknown; papel?: unknown; ativo?: unknown; senha?: unknown }) {
  if (!uuidOk(id)) throw new ErroRegra('Funcionário não encontrado.', 404);
  const [antes] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.id, id));
  if (!antes) throw new ErroRegra('Funcionário não encontrado.', 404);
  const set: Partial<typeof schema.usuarios.$inferInsert> = {};
  if (d.nome !== undefined) {
    set.nome = texto(d.nome, 60);
    if (!set.nome) throw new ErroRegra('Informe o nome.');
  }
  if (d.papel !== undefined) {
    if (!ehPapel(d.papel)) throw new ErroRegra('Função inválida.');
    set.papel = d.papel;
  }
  if (typeof d.ativo === 'boolean') set.ativo = d.ativo;
  if (d.senha !== undefined && d.senha !== '') set.senhaHash = await hashSenha(validarSenha(d.senha));
  // nunca ficar sem administrador ativo
  const perdeAdmin = antes.papel === 'admin' && antes.ativo && ((set.papel && set.papel !== 'admin') || set.ativo === false);
  if (perdeAdmin) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.usuarios).where(and(eq(schema.usuarios.papel, 'admin'), eq(schema.usuarios.ativo, true), ne(schema.usuarios.id, id)));
    if (Number(r.n) === 0) throw new ErroRegra('É preciso manter pelo menos um administrador ativo.', 409);
  }
  await db.update(schema.usuarios).set(set).where(eq(schema.usuarios.id, id));
  if (set.ativo === false || set.senhaHash) await db.delete(schema.sessoes).where(eq(schema.sessoes.usuarioId, id)); // sai de todos os aparelhos
  const o = [set.nome && 'nome', set.papel && `função ${NOME_PAPEL[set.papel as 'admin']}`, set.ativo !== undefined && (set.ativo ? 'ativado' : 'desativado'), set.senhaHash && 'senha trocada'].filter(Boolean);
  await registrar(db, { tipo: 'funcionario_alterado', usuarioId: u.id, descricao: `${u.nome} alterou ${set.nome || antes.nome}: ${o.join(', ') || 'sem mudanças'}` });
}

// ---------- primeiro acesso ----------

const EXEMPLO = [
  { categoria: 'Petiscos', setor: 'cozinha', itens: [['Batata frita', 3200], ['Isca de frango', 4200], ['Calabresa acebolada', 3800], ['Bolinho de bacalhau (6 un.)', 3900], ['Porção de mandioca', 2800]] },
  { categoria: 'Cervejas', setor: 'bar', itens: [['Chopp 300 ml', 1290], ['Chopp 500 ml', 1890], ['Cerveja long neck', 1200], ['Cerveja 600 ml', 1800]] },
  { categoria: 'Drinks', setor: 'bar', itens: [['Caipirinha', 2200], ['Gin tônica', 2800], ['Aperol spritz', 3200]] },
  { categoria: 'Sem álcool', setor: 'bar', itens: [['Refrigerante lata', 700], ['Água sem gás', 500], ['Suco natural', 1200]] },
] as const;

export async function primeiroAcesso(db: Db, d: { nome?: unknown; usuario?: unknown; senha?: unknown; exemplo?: unknown; mesas?: unknown }) {
  if (!(await semUsuarios(db))) throw new ErroRegra('O sistema já foi configurado. Entre com seu usuário.', 409);
  const admin = await criarFuncionario(db, null, { ...d, papel: 'admin' });
  const u: Usuario = { id: admin.id, nome: admin.nome, usuario: admin.usuario, papel: 'admin' };
  const n = Number(d.mesas);
  await criarMesas(db, u, 1, Number.isInteger(n) && n >= 1 && n <= 200 ? n : 10);
  if (d.exemplo) {
    let ordem = 0;
    await db.insert(schema.produtos).values(EXEMPLO.flatMap((c) => c.itens.map(([nome, precoCentavos]) => ({ nome, precoCentavos, categoria: c.categoria, setor: c.setor, ordem: ordem++ }))));
    await registrar(db, { tipo: 'produto_criado', usuarioId: u.id, descricao: 'Cardápio de exemplo criado no primeiro acesso' });
  }
  return u;
}
