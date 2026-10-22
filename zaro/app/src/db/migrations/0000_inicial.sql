CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"mime" text,
	"tamanho" integer DEFAULT 0 NOT NULL,
	"caminho" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid,
	"usuario_id" uuid,
	"usuario" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	"acao" text NOT NULL,
	"entidade" text,
	"antes" text,
	"depois" text,
	"justificativa" text
);
--> statement-breakpoint
CREATE TABLE "baixas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"titulo_id" uuid NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"forma" text,
	"obs" text,
	"estornada" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"tenant_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_tenant_id_chave_pk" PRIMARY KEY("tenant_id","chave")
);
--> statement-breakpoint
CREATE TABLE "contratos_divida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"instituicao" text NOT NULL,
	"contrato" text NOT NULL,
	"tipo" text DEFAULT 'Empréstimo' NOT NULL,
	"natureza" text DEFAULT 'recebido' NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"taxa" numeric(8, 4),
	"sistema" text,
	"parcelas" integer,
	"data_contr" date,
	"status" text DEFAULT 'Ativo' NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legado_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividas_ativas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"inscricao" text NOT NULL,
	"natureza" text,
	"situacao" text,
	"valor" numeric(14, 2),
	"atualizado_em" date,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos_entrada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"chave" text,
	"nome_arquivo" text NOT NULL,
	"arquivo_id" uuid,
	"xml" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'Novo' NOT NULL,
	"destino" text,
	"confianca" integer DEFAULT 0 NOT NULL,
	"valor" numeric(14, 2),
	"canal" text DEFAULT 'Upload' NOT NULL,
	"resultado" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cnpj" text NOT NULL,
	"razao" text NOT NULL,
	"fantasia" text,
	"regime" text,
	"regime_hist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ie" text,
	"im" text,
	"cidade" text,
	"uf" text,
	"cnae" text,
	"contador" text,
	"crc" text,
	"sem_estoque" boolean DEFAULT true NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legado_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extrato_movimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"conta" text NOT NULL,
	"data" date NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"fitid" text,
	"arquivo" text,
	"legado_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cargo" text,
	"admissao" date,
	"salario" numeric(14, 2),
	"ativo" boolean DEFAULT true NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legado_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imobilizado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"qtd" integer DEFAULT 1 NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"data" date NOT NULL,
	"taxa" numeric(6, 2) DEFAULT 10 NOT NULL,
	"residual" numeric(14, 2) DEFAULT 0 NOT NULL,
	"origem" text DEFAULT 'compra' NOT NULL,
	"nf" text,
	"legado_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamento_decisoes" (
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"lancamento_id" text NOT NULL,
	"status" text,
	"conta" text,
	"motivo_estorno" text,
	"data_estorno" date,
	"usuario" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamento_decisoes_empresa_id_lancamento_id_pk" PRIMARY KEY("empresa_id","lancamento_id")
);
--> statement-breakpoint
CREATE TABLE "legado" (
	"tenant_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legado_tenant_id_chave_pk" PRIMARY KEY("tenant_id","chave")
);
--> statement-breakpoint
CREATE TABLE "parceiros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"doc" text,
	"razao" text NOT NULL,
	"fantasia" text,
	"categoria" text,
	"origem" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_classificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"conta" text NOT NULL,
	"usuario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titulos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"parceiro_id" uuid,
	"nome" text NOT NULL,
	"doc_parceiro" text,
	"descricao" text,
	"nf" text,
	"serie" text,
	"nf_chave" text,
	"nf_emissao" date,
	"competencia" text,
	"parcela" text DEFAULT '1/1' NOT NULL,
	"venc" date,
	"valor" numeric(14, 2) NOT NULL,
	"valor_fiscal" numeric(14, 2),
	"status" text NOT NULL,
	"retorno" boolean DEFAULT false NOT NULL,
	"impacta_caixa" boolean DEFAULT true NOT NULL,
	"venc_estimado" boolean DEFAULT false NOT NULL,
	"natureza" text,
	"cfop" text,
	"categoria" text,
	"centro" text,
	"conta_contabil" text,
	"origem" text DEFAULT 'manual' NOT NULL,
	"folha_tipo" text,
	"contrato" text,
	"juros" numeric(14, 2),
	"impostos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retencoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documento_id" uuid,
	"obs" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legado_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" text DEFAULT 'Contador' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_titulo_id_titulos_id_fk" FOREIGN KEY ("titulo_id") REFERENCES "public"."titulos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_divida" ADD CONSTRAINT "contratos_divida_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_divida" ADD CONSTRAINT "contratos_divida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividas_ativas" ADD CONSTRAINT "dividas_ativas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividas_ativas" ADD CONSTRAINT "dividas_ativas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_entrada" ADD CONSTRAINT "documentos_entrada_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_entrada" ADD CONSTRAINT "documentos_entrada_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_entrada" ADD CONSTRAINT "documentos_entrada_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_movimentos" ADD CONSTRAINT "extrato_movimentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extrato_movimentos" ADD CONSTRAINT "extrato_movimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imobilizado" ADD CONSTRAINT "imobilizado_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imobilizado" ADD CONSTRAINT "imobilizado_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento_decisoes" ADD CONSTRAINT "lancamento_decisoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamento_decisoes" ADD CONSTRAINT "lancamento_decisoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legado" ADD CONSTRAINT "legado_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_classificacao" ADD CONSTRAINT "regras_classificacao_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_classificacao" ADD CONSTRAINT "regras_classificacao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_documento_id_documentos_entrada_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos_entrada"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_tenant_idx" ON "auditoria" USING btree ("tenant_id","quando");--> statement-breakpoint
CREATE INDEX "docent_empresa_idx" ON "documentos_entrada" USING btree ("empresa_id","status");--> statement-breakpoint
CREATE INDEX "docent_chave_idx" ON "documentos_entrada" USING btree ("tenant_id","chave");--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_tenant_cnpj_uq" ON "empresas" USING btree ("tenant_id","cnpj");--> statement-breakpoint
CREATE INDEX "extrato_empresa_idx" ON "extrato_movimentos" USING btree ("empresa_id","data");--> statement-breakpoint
CREATE INDEX "parceiros_empresa_idx" ON "parceiros" USING btree ("empresa_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "regras_empresa_chave_uq" ON "regras_classificacao" USING btree ("empresa_id","chave");--> statement-breakpoint
CREATE INDEX "titulos_empresa_idx" ON "titulos" USING btree ("empresa_id","tipo","status");--> statement-breakpoint
CREATE INDEX "titulos_chave_idx" ON "titulos" USING btree ("tenant_id","nf_chave");--> statement-breakpoint
CREATE UNIQUE INDEX "titulos_codigo_uq" ON "titulos" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree ("email");