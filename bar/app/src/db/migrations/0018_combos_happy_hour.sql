CREATE TABLE "combos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"preco_centavos" integer NOT NULL,
	"janelas" jsonb NOT NULL,
	"itens" jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedido_itens" ADD COLUMN "combo_id" uuid;--> statement-breakpoint
-- Happy hour do Vikings: quarta e quinta 17h às 20h, sexta 16h às 20h
INSERT INTO "combos" ("nome", "descricao", "preco_centavos", "janelas", "itens", "ordem")
SELECT 'Combo Fim de Expediente', '2 long necks + batata frita (250 g)', 5990,
  '[{"dias":[3,4],"inicio":"17:00","fim":"20:00"},{"dias":[5],"inicio":"16:00","fim":"20:00"}]'::jsonb,
  jsonb_build_array(jsonb_build_object('produtoId', b."id", 'quantidade', 1, 'nome', 'Batata frita 250 g'), '{"escolha":"long-neck","quantidade":2}'::jsonb), 1
FROM (SELECT "id" FROM "produtos" WHERE "nome" ILIKE 'batata frita%' AND NOT "excluido" ORDER BY "ativo" DESC LIMIT 1) b;
--> statement-breakpoint
INSERT INTO "combos" ("nome", "descricao", "preco_centavos", "janelas", "itens", "ordem")
SELECT 'Quinta Premium Corona', 'Balde com 6 Corona · só na quinta', 7490,
  '[{"dias":[4],"inicio":"17:00","fim":"23:59"}]'::jsonb,
  jsonb_build_array(jsonb_build_object('produtoId', c."id", 'quantidade', 6, 'nome', 'Balde com 6 Corona')), 2
FROM (SELECT "id" FROM "produtos" WHERE "nome" ILIKE '%corona%' AND NOT "excluido" ORDER BY "ativo" DESC LIMIT 1) c;
--> statement-breakpoint
INSERT INTO "combos" ("nome", "descricao", "preco_centavos", "janelas", "itens", "ordem")
SELECT 'Combo Dupla da Casa', '4 long necks + batata frita (300 g)', 8490,
  '[{"dias":[3,4],"inicio":"17:00","fim":"20:00"},{"dias":[5],"inicio":"16:00","fim":"20:00"}]'::jsonb,
  jsonb_build_array(jsonb_build_object('produtoId', b."id", 'quantidade', 1, 'nome', 'Batata frita 300 g'), '{"escolha":"long-neck","quantidade":4}'::jsonb), 3
FROM (SELECT "id" FROM "produtos" WHERE "nome" ILIKE 'batata frita%' AND NOT "excluido" ORDER BY "ativo" DESC LIMIT 1) b;
--> statement-breakpoint
-- Original em dobro no horário do happy hour: quarta e quinta 17h-20h; sexta 16h-20h (segunda linha)
UPDATE "promocoes" SET "dias" = '[3,4]'::jsonb, "inicio" = '17:00', "fim" = '20:00', "mesas" = NULL, "destaque" = 'Original em dobro: pague uma e leve duas (happy hour)' WHERE "nome" = 'Original em dobro';
--> statement-breakpoint
INSERT INTO "promocoes" ("nome", "produto_id", "quantidade_combo", "preco_combo_centavos", "dias", "inicio", "fim", "destaque")
SELECT 'Original em dobro (sexta)', "produto_id", "quantidade_combo", "preco_combo_centavos", '[5]'::jsonb, '16:00', '20:00', 'Original em dobro: pague uma e leve duas (happy hour)'
FROM "promocoes" WHERE "nome" = 'Original em dobro' LIMIT 1;
