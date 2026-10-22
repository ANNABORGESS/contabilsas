import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // PGlite (Postgres embutido) roda como WebAssembly e não deve ser empacotado pelo Next
  serverExternalPackages: ['@electric-sql/pglite'],
  // as migrações SQL são lidas do disco na primeira conexão: precisam ir junto na publicação
  outputFileTracingIncludes: { '/**': ['./src/db/migrations/**'] },
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
};
export default nextConfig;
