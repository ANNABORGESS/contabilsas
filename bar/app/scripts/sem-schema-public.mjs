// O drizzle-kit escreve REFERENCES "public"."tabela", mas na nuvem as tabelas do bar ficam no
// schema "bar" (search_path da conexão). Tira o "public" para seguir o search_path.
import fs from 'node:fs';
import path from 'node:path';

const pasta = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'db', 'migrations');
for (const nome of fs.readdirSync(pasta).filter((n) => n.endsWith('.sql'))) {
  const arq = path.join(pasta, nome);
  const antes = fs.readFileSync(arq, 'utf8');
  const depois = antes.replaceAll('REFERENCES "public".', 'REFERENCES ');
  if (depois !== antes) fs.writeFileSync(arq, depois);
}
