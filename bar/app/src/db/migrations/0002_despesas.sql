CREATE TABLE "despesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data" text NOT NULL,
	"categoria" text NOT NULL,
	"descricao" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"funcionario_id" uuid,
	"criado_por_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_funcionario_id_usuarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "despesas_data_idx" ON "despesas" USING btree ("data");