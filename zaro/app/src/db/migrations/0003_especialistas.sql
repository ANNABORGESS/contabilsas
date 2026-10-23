CREATE TABLE "consultas_especialista" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"especialista_id" uuid NOT NULL,
	"usuario" text NOT NULL,
	"pergunta" text NOT NULL,
	"resposta" text NOT NULL,
	"usou_dados" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "especialistas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"conteudo" text NOT NULL,
	"pacote" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultas_especialista" ADD CONSTRAINT "consultas_especialista_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultas_especialista" ADD CONSTRAINT "consultas_especialista_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultas_especialista" ADD CONSTRAINT "consultas_especialista_especialista_id_especialistas_id_fk" FOREIGN KEY ("especialista_id") REFERENCES "especialistas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "especialistas" ADD CONSTRAINT "especialistas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultas_especialista_emp" ON "consultas_especialista" USING btree ("empresa_id","especialista_id");--> statement-breakpoint
CREATE UNIQUE INDEX "especialistas_slug" ON "especialistas" USING btree ("tenant_id","tipo","slug");