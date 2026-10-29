---
type: segurança
title: "Segurança: RLS, funções SECURITY DEFINER e Edge Functions"
description: O modelo de segurança do sistema e as travas que o protegem — RLS por organização, as três perguntas obrigatórias ao escrever policy, função ou Edge Function (perna do OR que libera sozinha, EXECUTE concedido a PUBLIC por padrão, verify_jwt não é autorização), o teste segurancaMigrations no CI, o script check-rls-postura contra o banco real, a sanitização de HTML e a caça a DELETE engolido pela RLS.
tags: [security, rls, postgres, security-definer, edge-functions, xss, audit, ci-guard]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-6866c18a13750171ad185278
    resource: repo://__tests__/segurancaMigrations.test.ts
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-4fad90867f77ab21adc3edd2
    resource: repo://scripts/check-rls-delete-gap.mjs
  - id: openwiki-source-e5d636d616972f6cd0e84981
    resource: repo://scripts/check-rls-postura.sh
  - id: openwiki-source-f7d2da6f3eaade122adcb694
    resource: repo://scripts/check-xss-sinks.sh
  - id: openwiki-source-716d063b4e0e148255a21d5e
    resource: repo://scripts/verificar-views-anon.sh
  - id: openwiki-source-64f5c44ae46c33b53f076c87
    resource: repo://supabase/functions/_shared/auth.ts
  - id: openwiki-source-512ee18cd01c84960fc1b1e2
    resource: repo://utils/sanitizeHtml.ts
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Segurança: RLS, funções SECURITY DEFINER e Edge Functions

O navegador fala direto com o banco usando a **chave anon, que vai no bundle**.
Toda proteção real de dado mora no Postgres e nas Edge Functions; permissão de
tela é ergonomia. Três camadas:

| Camada | Garante |
|---|---|
| **RLS** em toda tabela | o usuário só vê/grava linhas de organizações de que é membro (`is_org_member`, `is_org_manager` sobre `organization_members`) — ver [Multi-tenancy](../conceitos/multi-tenancy-organizacao.md) |
| **Funções `SECURITY DEFINER`** (RPCs) | leituras que a RLS não permitiria (portais, consolidações), com **autorização dentro da função** |
| **Edge Functions** | operações com segredo/service_role, com gate próprio (`_shared/auth.ts`) — ver [Edge Functions](../integracoes/edge-functions.md) |

## A auditoria de 2026-09-01

`docs/security-audit/` (relatório, provas, issues) registra 22 falhas; as
**quatro críticas** foram comprovadas em produção. O desenho estava certo (RLS em
toda a base, funções de membro corretas, policies `anon` de desenvolvimento
removidas); faltava trava mecânica para perguntas que ninguém fazia ao escrever o
SQL. Delas nasceu a REGRA OBRIGATÓRIA #7.

## As três perguntas

### 1. "Esta perna do `OR` sozinha basta para liberar a linha?"

```sql
USING (is_org_member(organization_id) OR is_shared)   -- ❌
```

`OR is_shared` é verdadeiro sozinho e não diz **com quem**: 127 cadastros
(fornecedores com CPF/CNPJ e endereço) ficaram legíveis por qualquer conta
autenticada — sob uma policy chamada "Users can view suppliers of their
organization". O nome descrevia uma regra que a expressão não implementava.

Caso extremo: `WITH CHECK (true)` em `organization_members` deixava qualquer
autenticado se declarar `owner` de qualquer organização; como as funções de
membro leem essa tabela, **um INSERT anulava a RLS inteira** (0 → 2.214
lançamentos financeiros visíveis).

### 2. "Quem mais pode executar esta função?"

O PostgreSQL concede `EXECUTE` a **`PUBLIC` por padrão**, e `GRANT … TO
authenticated` não revoga isso. Oito RPCs que **emitem credencial de portal**
eram chamáveis com a chave anon, e a leitura do Portal do Colaborador entregava
folha de pagamento só com o UUID. Toda função nova:

```sql
REVOKE EXECUTE ON FUNCTION public.minha_funcao(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.minha_funcao(uuid) TO authenticated;
```

Se é `SECURITY DEFINER`, a **autorização vai dentro** dela também — `GRANT` é
privilégio de chamada, não regra de negócio. Fixe `SET search_path`.

### 3. "Esta Edge Function é protegida por código, ou só pelo gateway?"

`verify_jwt: true` **não é autorização**: o gateway só confere que o token é uma
chave válida do projeto, e a anon é uma delas. A `fiscal-nfe-processor` não tinha
gate e aceitava job forjado com a chave pública. O inverso também morde:
`--no-verify-jwt` transfere toda a autorização ao código, e só é seguro depois de
**provar contra o deploy publicado** que uma requisição sem header recebe 401 (a
`task-alert-notifier` tinha o gate no repositório e não no bundle publicado).
Chamada banco → função autentica com `CRON_SECRET`, nunca com a service_role.

## Travas

### No CI: `__tests__/segurancaMigrations.test.ts`

Lê o **texto** das migrations e falha com:

- **P1** — policy que libera sem checar nada (`WITH CHECK (true)` e afins);
- **P2** — policy para `anon` com expressão `true`;
- **P3** — `SECURITY DEFINER` sem `REVOKE` de `PUBLIC`;
- placeholder de segredo em migration.

Vale para migrations com prefixo **≥ `20270918000000`** (`CORTE`): o histórico
anterior já foi aplicado e não se reescreve. **Não mova o corte para fazer
passar.** O CI não tem (nem deve ter) credencial do banco.

### Contra o banco real: `scripts/check-rls-postura.sh`

Roda sob demanda e confere o **resultado**, que é o que vale (o histórico de
migrations tem drift). Exit ≠ 0 se achar problema. Verificações:

1. policies para `anon` sem recorte (exceção deliberada: `sinapi_items`, dado
   público do governo);
2. policies de escrita sem condição;
3. `SECURITY DEFINER` executável por `anon`;
4. tabelas com coluna de tenant e policy sem recorte;
5. placeholder de segredo no comando de cron **ou** no Vault;
6. cron que falha sem ninguém ver (respostas HTTP do `pg_net`);
7. cron que nem chega a fazer HTTP;
8. função de cron alcançável com a chave pública (sonda HTTP);
9. tabela de credencial legível com a chave pública.

Cada uma cobre um ponto cego da anterior. ⚠️ O SQL de cada consulta precisa ir
numa linha só: `supabase db query` considera só a primeira linha do argumento e o
`WHERE` seria descartado em silêncio.

Complementos: `scripts/verificar-views-anon.sh` (views expostas a `anon` devem
responder `42501` sem sessão) e `scripts/verificar-opura-market-rls.sh`.

### DELETE engolido: `scripts/check-rls-delete-gap.mjs`

Com RLS ligada e **sem policy de DELETE**, o `DELETE` apaga zero linhas e **não
devolve erro**. Um service que só testa `error` mostra "excluído" e o registro
continua lá (aconteceu com chamados de garantia). O script caça exclusões que o
app pede e a RLS engole. Ao excluir, confira as linhas afetadas
(`.select()` no delete) — ou troque por inativação/cancelamento.

### HTML: `utils/sanitizeHtml.ts` + `scripts/check-xss-sinks.sh`

HTML vindo do banco (aulas da academia, modelos de contrato) era injetado no DOM
sem sanitização, e o membro de papel mais baixo podia escrever HTML que rodava
na sessão de um administrador. Hoje todo sink de HTML passa por
`sanitizeHtml()` (DOMPurify, com o desembrulho de módulo que faz o mesmo código
funcionar no Vite e no Vitest), e `check-xss-sinks.sh` roda **no CI e no
`buildCommand` do Vercel** — sink cru quebra o build.

## Outras regras práticas

- **"Todas as organizações" nunca grava `organization_id NULL`**: a policy de
  registro global é `organization_id IS NULL OR is_org_member(...)`, então
  `NULL` vaza para todos os clientes do SaaS.
- **Portais leem por RPC**, nunca por tabela direta (devolveria `[]` em
  silêncio); ver [Portais externos](../modulos/portais/portais-externos.md).
- **Arquivo de portal sai por Edge Function** que valida token e vínculo.
- Teste de RLS com o usuário `postgres` não prova nada — ele ignora RLS. Use um
  usuário de leitura com papel `authenticated`.
- Um alerta de script de verificação **não é achado** até conferir o dado.
