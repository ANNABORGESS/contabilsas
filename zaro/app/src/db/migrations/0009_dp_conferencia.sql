CREATE TABLE "dp_conferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"etapa" text DEFAULT 'Importar documentos' NOT NULL,
	"parecer" text,
	"responsavel" text,
	"concluida_em" timestamp with time zone,
	"revisoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"competencia" text,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"arquivo_id" uuid,
	"status" text DEFAULT 'Recebido' NOT NULL,
	"resumo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usuario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_holerites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"tipo_folha" text DEFAULT 'mensal' NOT NULL,
	"funcionario_id" uuid,
	"matricula" text NOT NULL,
	"nome" text NOT NULL,
	"cpf_mascara" text,
	"cpf_hash" text,
	"cargo" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conferencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"documento_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dp_registros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"competencia" text,
	"chave" text,
	"funcionario_id" uuid,
	"descricao" text NOT NULL,
	"valor" numeric(14, 2),
	"status" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"documento_id" uuid,
	"usuario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dp_conferencias" ADD CONSTRAINT "dp_conferencias_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_conferencias" ADD CONSTRAINT "dp_conferencias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_documentos" ADD CONSTRAINT "dp_documentos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "arquivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_holerites" ADD CONSTRAINT "dp_holerites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_holerites" ADD CONSTRAINT "dp_holerites_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_holerites" ADD CONSTRAINT "dp_holerites_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_holerites" ADD CONSTRAINT "dp_holerites_documento_id_dp_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "dp_documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_registros" ADD CONSTRAINT "dp_registros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_registros" ADD CONSTRAINT "dp_registros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_registros" ADD CONSTRAINT "dp_registros_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dp_registros" ADD CONSTRAINT "dp_registros_documento_id_dp_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "dp_documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dp_conf_comp" ON "dp_conferencias" USING btree ("empresa_id","competencia");--> statement-breakpoint
CREATE INDEX "dp_doc_empresa" ON "dp_documentos" USING btree ("empresa_id","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "dp_holerite_chave" ON "dp_holerites" USING btree ("empresa_id","competencia","matricula","tipo_folha");--> statement-breakpoint
CREATE INDEX "dp_reg_empresa" ON "dp_registros" USING btree ("empresa_id","tipo","competencia");--> statement-breakpoint
CREATE UNIQUE INDEX "dp_reg_chave" ON "dp_registros" USING btree ("empresa_id","tipo","chave");