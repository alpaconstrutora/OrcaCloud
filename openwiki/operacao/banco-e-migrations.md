---
type: operação
title: Banco de dados e migrations
description: O banco é um Postgres 17 do Supabase (projeto já linkado). O histórico de migrations tem buracos — boa parte foi aplicada por SQL direto, fora de schema_migrations — então supabase db push é proibido. Esta página explica a convenção de nomes (aplicar_*), como aplicar e consultar SQL com db query --linked, o teste que impede prefixo duplicado e as armadilhas de publicar código antes da migration.
tags: [database, postgres, supabase, migrations, operations, ci-guard]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-e60039c44d5ecc715b33a301
    resource: repo://__tests__/migrationsPrefixo.test.ts
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-d81538d8891efe37053aeccb
    resource: repo://supabase/config.toml
  - id: openwiki-source-97ef94bd02baac0bacfd990c
    resource: repo://supabase/migrations/20270819000004_trigger_strip_system_project.sql
  - id: openwiki-source-ff7381dcd39350b01ba18871
    resource: repo://supabase/migrations/aplicar_20271015110200_email_capture_cron.sql
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Banco de dados e migrations

- **Postgres 17** no Supabase (`supabase/config.toml`, `[db] major_version = 17`),
  com `pg_cron` e `pg_net` (agendamentos que chamam Edge Functions).
- O projeto remoto já está **linkado** (`supabase/.temp/project-ref`).
- `supabase/migrations/` tem cerca de **1.200 arquivos**; cerca de 450 com
  prefixo `aplicar_`.

## ⚠️ Nunca `supabase db push`

O histórico está furado: migrations `2027*` (e todas as `aplicar_*`) foram
aplicadas **por SQL direto**, fora de `schema_migrations`, e várias não são
idempotentes. `supabase db push` tentaria reexecutá-las e pode quebrar o banco.

> O `README.md` ainda mostra `supabase db push` na seção de setup — está
> desatualizado; o `CLAUDE.md` e esta página valem.

### Como rodar SQL

```bash
npx supabase db query --linked -o table "SELECT ..."   # consulta
npx supabase db query --linked -f caminho/arquivo.sql  # aplicar um arquivo
```

- Roda como `postgres` — **ignora RLS**. Serve para leitura/diagnóstico ou
  escrita combinada explicitamente. Para testar o que um usuário enxerga sob
  RLS, use um usuário de leitura com papel `authenticated`, não o `postgres`.
- Com vários comandos num arquivo, `db query` devolve **só o resultado do
  último** — separe as consultas que precisa ler.
- Migration nova = escrever o arquivo e aplicá-lo com `db query -f`.

## Convenção de nomes

```
supabase/migrations/AAAAMMDDHHMMSS_descricao.sql            ← históricas
supabase/migrations/aplicar_AAAAMMDDHHMMSS_descricao.sql    ← aplicadas à mão
```

- O prefixo de 14 dígitos **só diz a ordem**. Os "anos" `2027*` não são datas
  reais: o prefixo foi avançando à frente do calendário para manter a ordem.
- `aplicar_` marca que o arquivo é aplicado manualmente (por `db query -f` ou
  SQL Editor).
- `supabase/migrations_pending_review/` guarda migrations não aplicadas,
  aguardando revisão; `supabase/manual/` tem scripts pontuais de dados
  (backfills, limpezas) que não são migrations.

### A trava de prefixo duplicado

`__tests__/migrationsPrefixo.test.ts` (roda no CI) falha se:

- dois arquivos têm o **mesmo prefixo** de 14 dígitos — com várias frentes
  criando migrations em paralelo, a colisão é questão de tempo, e quem lê a pasta
  depois não sabe qual rodou primeiro;
- um `.sql` não tem prefixo de 14 dígitos (escaparia da trava);
- a **anistia** (colisões que já existiam quando a trava nasceu) cresce ou fica
  com item morto. Renomear migration antiga já aplicada é pior que a duplicata,
  então a lista é fechada.

Antes de criar uma migration, procure o maior prefixo usado **contando também
os `aplicar_*`** (um `ls | sort | tail` mostra as históricas e esconde as
`aplicar_`), deixe folga, e confira de novo logo antes do merge — outra frente
pode ter pego o número.

## Escrevendo uma migration

1. **Idempotente** sempre que possível (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `cron.unschedule` antes de `cron.schedule`), e com uma verificação no fim
   (`DO $$ … RAISE EXCEPTION` se o resultado não apareceu).
2. **Policy ou função nova** passa pelas perguntas da
   [regra de segurança](../seguranca/rls-funcoes-e-edge-functions.md): a perna do
   `OR` libera sozinha? quem mais executa a função? `REVOKE … FROM PUBLIC, anon`
   na mesma migration. O teste `segurancaMigrations.test.ts` verifica isso para
   migrations a partir do prefixo `20270918000000`.
3. **DDL em tabela quente** (`CREATE TRIGGER` em `internal_transactions`) pega
   `AccessExclusiveLock` e pode dar deadlock com as leituras do app. Use
   `SET lock_timeout` **menor** que o `deadlock_timeout` (ex.: `800ms`) para
   abortar limpo (`55P03`) em vez de morrer em `40P01`, e mantenha o script
   curto, sem `UPDATE` antes.
4. Use delimitador nomeado (`$fn$`) em funções: o SQL Editor do Supabase corta
   `$$` ao injetar comentários entre comandos.
5. **Ordem de publicação**: a migration tem de estar no banco **antes** do código
   que lê a coluna nova ser publicado — senão a consulta falha com `42703`
   (coluna inexistente). Vários services registram isso no comentário da lista
   de colunas. E coluna existir não prova que a **escrita** passa: confira
   gatilhos e policies.

## Tipos do schema

Os tipos de domínio ficam em `types/*.ts` (um arquivo por área). O `CLAUDE.md`
da raiz menciona um `types_db.ts` gerado do schema, mas ele **não existe** neste
repositório hoje; a tipagem das linhas é manual, nos services.

## Diagnóstico

`scripts/*.sql` têm consultas prontas: classificação de projetos
(`diagnostico-classificacao-projetos.sql`), centros de custo duplicados, vínculo
parcela ↔ unidade, reimportação de conciliação, provas de catálogo. A postura
real de RLS do banco é conferida por `scripts/check-rls-postura.sh` e
`scripts/verificar-views-anon.sh` (ver
[Segurança](../seguranca/rls-funcoes-e-edge-functions.md)).

Para o ciclo completo de publicação (front e banco), ver
[Frentes, publicação e conferência](./publicacao-e-frentes.md).
