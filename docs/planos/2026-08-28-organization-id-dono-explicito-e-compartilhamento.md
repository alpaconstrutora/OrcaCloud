# `organization_id` com dono explícito e compartilhamento declarado

## Pedido original

> Suprimentos < contratos: Bug no contrato 010. Verifique por que a coluna Obra está trazendo Plan: Garden. Plan é planejamento e não obra

Sessão: 40c6cced-2212-4b11-beb7-edeb974a3166 · 2026-08-28

O pedido acima é a origem de toda a linha de investigação. A auditoria que ele
desencadeou chegou à camada de RLS, e daí saíram os pedidos posteriores:

> **2026-08-28** — *"corrigir pendencias"* (as duas pendências abertas: auditoria
> das 40 tabelas com policy permissiva na camada `authenticated`, e as chamadas
> marcadas `REVISAR`).

> **2026-08-28** — sobre os 117 fornecedores e 7 clientes sem organização:
> *"1. Atribuir a todas as organizações"*

> **2026-08-28** — *"quai a melhor solucao tecnicamente e definitiva?"*, seguido
> de *"sim"* ao plano proposto (abrir plano em `docs/planos/` e executar as
> fases 1 e 2 hoje).

## O problema

`organization_id = NULL` carrega **dois significados incompatíveis**:

| Significado | Exemplo | Intencional? |
|---|---|---|
| "compartilhado com todas as organizações" | `suppliers` — documentado em `supplierService.ts:232,276` | sim |
| "ninguém preencheu" | 16 linhas de `automation_history`, 7 de `clients` | não |

E a policy `organization_id IS NULL OR is_org_member(...)` concede **leitura E
escrita** aos dois casos, para qualquer usuário de qualquer inquilino. O
significado intencional carrega um privilégio não intencional, e não há como
distinguir um do outro olhando a linha.

O `CLAUDE.md` (REGRA #5) já decidiu isso por escrito:

> *"'Todas' nunca é `organization_id = NULL`. (…) um NULL apareceria para todos
> os clientes do SaaS, não só para as organizações de quem criou. NULL fica
> reservado aos seeds do sistema."*

A regra manda **replicar** o item por organização. Em `suppliers` isso é
impossível: `suppliers_email_key` é `UNIQUE (email)` **global** — 48 dos 119 têm
e-mail e não podem existir em duas organizações. É essa lacuna que este plano
fecha.

## A solução

Dar **dono explícito** ao registro e separar "quem é o dono" de "quem enxerga":

```sql
ALTER TABLE <t> ADD COLUMN is_shared boolean NOT NULL DEFAULT false;
ALTER TABLE <t> ALTER COLUMN organization_id SET NOT NULL;  -- só depois do backfill
```
```sql
-- leitura: o dono, ou qualquer um se for compartilhado
USING (is_org_member(organization_id) OR is_shared)
-- escrita: só o dono
USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id))
```

- O acidente deixa de ser possível: `NOT NULL` é o banco recusando, não um script
  que alguém precisa lembrar de rodar.
- Escrita cross-tenant acaba **sem perder funcionalidade**: o fornecedor
  compartilhado segue visível para todos e editável pelo dono (a integração CNPJá
  continua funcionando).
- Preserva a identidade única: sem replicação, `suppliers_email_key` e os
  `supplier_id` do histórico continuam válidos.

### A regra que fica

> **`organization_id` só pode ser nulo em tabela cuja ESCRITA seja fechada.**
> Onde o app escreve, a coluna é `NOT NULL` e o compartilhamento é declarado num
> campo próprio.

Nas tabelas de seed (38 categorias financeiras, 8 de fornecedor,
`contract_index_values`, `classification_rules`, tabelas de referência) o NULL
continua legítimo **porque a escrita já é fechada** (policies `SELECT`-only).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-28 | 117 fornecedores + 7 clientes sem vínculo: atribuir à Alpa ou apagar? | Atribuir a todas as organizações |
| 2026-08-28 | `Galeria: Manutenção` (projeto órfão): apagar ou atribuir? | Apagar — **feito**, backup em `scratch/BACKUP_projeto_galeria_manutencao.json` |
| 2026-08-28 | Investigar o sinal de `partner_workspaces`? | Sim — **feito**, 5 de 6 backfilled |
| 2026-08-28 | Melhor solução técnica e definitiva? | Este plano |
| 2026-08-28 | **Quem é o dono dos 119 fornecedores compartilhados?** | Alpa (`926cf626`) com `is_shared = true` — aplicado na Fase 2 |
| — | **Reverter o backfill dos 20 fornecedores da fase 0?** | ⏳ pendente — ver "Risco assumido". Sob o modelo novo, a correção seria `is_shared = true` neles, não reverter o dono. |

## Escopo

Tabelas onde o app escreve e `organization_id` é nulo hoje:

| Tabela | Linhas nulas | Observação |
|---|---|---|
| `suppliers` | 119 | 48 com e-mail (não replicáveis) · 2 usados por 2 organizações (Energisa, MCC) |
| `clients` | 7 | policies `UPDATE`/`DELETE` em **PUBLIC** → alcançáveis pelo `anon` |
| `partner_workspaces` | 1 | depende do fornecedor "Thiago Couto" |

## Plano

### Fase 0 — já aplicado (limpeza sem decisão) ✅

- [x] `aplicar_20270914000016` — `automation_history`: backfill de 16 linhas,
      trigger derivando a organização do projeto, perna do NULL removida das duas
      policies. **Verificado:** 0 nulas, policies com `is_org_member` limpo.
- [x] `aplicar_20270914000017` — backfill de 20 `suppliers` + 10 `clients` cuja
      organização era dedutível de vínculo existente. **Verificado:** 140→120 e
      17→7.
- [x] `suppliers` "Wilsson" — backfill (não era duplicata; ver "Erros cometidos").
      **Verificado:** 120→119.
- [x] `projects` `Galeria: Manutenção` — apagado, 0 dependências, backup salvo.
      **Verificado:** `projects` com org nula = 0.
- [x] `partner_workspaces` — 5 de 6 herdaram a organização do fornecedor.
      **Verificado:** 6→1.

### Fase 1 — `is_shared` aditivo (não muda nada para o usuário) ✅

- [x] `aplicar_20270914000018_is_shared_suppliers_clients.sql`
      **Mudou:** `is_shared boolean NOT NULL DEFAULT false` em `suppliers`,
      `clients` e `partner_workspaces`; `is_shared = true` onde
      `organization_id IS NULL`.
      **Verificado:** 0 linhas nulas sem a marca; 0 marcadas por engano;
      contagem de org nula inalterada (119 / 7 / 1) — nada foi atribuído.

### Fase 2 — backfill do dono ✅

- [x] `aplicar_20270914000019_backfill_dono_compartilhados.sql`
      **Mudou:** as 127 linhas ganharam dono = Alpa (`926cf626`), mantendo
      `is_shared = true`.
      **Verificado:** 0 linhas sem dono nas três tabelas; `is_shared` continua
      119 / 7 / 1 — ninguém perdeu visibilidade.
- [x] `aplicar_20270914000020_renumerar_codigos_compartilhados.sql`
      **Por quê:** 83 dos 119 colidiram no índice único `(organization_id, code)`
      e tiveram `code` zerado pela Fase 2. Deixar 83 cadastros sem código é
      lacuna visível na tela — a orientação da `20270132000000` ("o dono
      renumera pela UI") não escala para 83 linhas.
      **Mudou:** renumerou pela mesma regra de `get_next_supplier_code`
      (maior código numérico da organização + 1, LPAD 3), em uma passada.
      **Verificado:** 0 compartilhados sem código; 0 códigos duplicados na
      organização. (Os 7 sem código que restam na Alpa são pré-existentes,
      `is_shared = false`.)

### ⚠️ Correção de ordem (2026-08-29)

O plano dizia 3 → 4 → 5. **Está errado**, e a ordem correta é **5 → 3 → 4**:

- `SET NOT NULL` antes do código quebra a criação de fornecedor em "Todas as
  organizações", que gravava nulo de propósito;
- trocar a policy antes do código faz o compartilhado **sumir** das outras
  organizações, porque o `.or(...is.null)` antigo não o encontra.

### Fase 5 — código ✅ (commit `e29bd7e`)

- [x] `services/supplierService.ts`, `clientService.ts`, `partnerService.ts`
      **Mudou:** as leituras passaram de `organization_id.is.null` para
      `is_shared.is.true`; os quatro pontos que usavam "organização nula" como
      sinônimo de compartilhado (sincronização/desativação de `broker_profiles`,
      materialização de `partner_workspace`) passaram a usar `is_shared`; o
      workspace herda o `is_shared` do fornecedor. `listSuppliers` passou a
      mostrar dono E alcance ("Todas as Organizações (de X)"), em vez de esconder
      de quem é o cadastro. Em `clientService`, `is_shared` entrou no primeiro
      degrau da escada de fallback e ganhou um degrau novo sem ela, seguindo a
      regra escrita no próprio arquivo.
- [x] `components/SupplierModal.tsx`
      **Mudou:** a opção `🌐 Todas` (que gravava nulo) virou duas coisas — o
      seletor escolhe o **dono**, e um checkbox "Disponível em todas as
      organizações" marca `is_shared`. Validação nova barra o salvamento sem
      dono, com mensagem, em vez de deixar o `NOT NULL` da Fase 3 recusar com um
      erro que o usuário não traduz.
- [x] `types/users.ts`, `types/partner.ts` — `is_shared` em Supplier, Client e
      PartnerWorkspace.
- [x] `__tests__/partner.test.ts` — travava a string do filtro antigo;
      atualizado junto com a mudança, com o porquê no próprio teste.
      **Verificado:** tsc limpo, 1786 testes passando, check-ui-standard OK.

### Fase 3 — `NOT NULL` ✅

- [x] `aplicar_20270914000021_org_not_null_e_policies_is_shared.sql`
      **Mudou:** `ALTER COLUMN organization_id SET NOT NULL` nas três.
      Aplicada só DEPOIS de confirmar o deploy da Fase 5 no ar — comparando a
      string `is_shared.is.true` dentro do bundle de produção com a do build
      local (1 e 1; `organization_id.is.null` 2 e 2).
      **Verificado:** `is_nullable = 'NO'` nas três; `INSERT` sem organização
      recusado com `not_null_violation` (testado em transação, com ROLLBACK).

### Fase 4 — policies ⏳ (mesma migration)

- [x] **Risco do portal do cliente — RESOLVIDO, era falso.** `ClientArea` só roda
      com `portalToken` a partir de `App.tsx:139`, que passa `isPreview`; e
      `isAdmin = !isPreview && (...)`. Os **seis** pontos que chamam
      `updateClientData` estão todos dentro de `isAdmin && (...)`. No modo token
      não existe caminho de escrita em `clients` — fechar para `authenticated`
      não derruba o portal.
- [x] `aplicar_20270914000021` + `aplicar_20270914000022`
      **Mudou:** leitura = `is_org_member(organization_id) OR is_shared`;
      escrita = `is_org_member(organization_id)` com `WITH CHECK`. As policies de
      `clients` que estavam em PUBLIC foram recriadas para `authenticated` —
      inclusive `clients_org_access`, que eu ia deixar de fora por ser inofensiva
      (exige `auth.uid()`, nulo para `anon`), mas que contrariava o critério
      escrito aqui e apareceria em toda auditoria futura.
      **Verificado:** nenhuma das três tabelas tem policy com `organization_id IS
      NULL`; **0** policies em `polroles = {0}`; `is_shared` segue 119 / 7 / 1.

## Risco assumido / pontos de atenção

- 🔴 **`ClientArea` recebe `portalToken` e escreve em `clients` sem sessão
  Supabase** (`updateClientData` → `clientService.saveClient`). A Fase 4 tira as
  policies de PUBLIC e **pode quebrar o portal do cliente**. Antes da Fase 4:
  mapear quais escritas do portal acontecem como `anon` e migrá-las para RPC com
  token (padrão `fn_portal_*` já usado no projeto).
- ⚠️ **Os 20 fornecedores da Fase 0 eram globais e passaram a ter dono.** Tinham
  pedidos/contratos numa organização só, então na prática são dela — mas se a
  intenção era mantê-los disponíveis para todas, o correto sob este modelo é
  `is_shared = true` neles. Decisão pendente.
- **Energisa e MCC** aparecem em Alpa e SPE. Sob este modelo ficam com um dono e
  `is_shared = true` — é exatamente o caso que o modelo existe para resolver.

## Erros cometidos nesta investigação (para não repetir)

- **`IS NOT DISTINCT FROM` em coluna nula.** O teste de duplicata comparou
  `document` com `IS NOT DISTINCT FROM`, que trata dois `NULL` como iguais —
  "Wilsson" foi classificado como duplicata de "ECOVILLE" só porque ambos estão
  sem documento. Corrigido; ao comparar documento, exigir `IS NOT NULL` nos dois
  lados.
- **Não verifiquei uma capacidade antes de assumir que não existia.** Passei a
  sessão pedindo ao usuário para colar retorno de consulta quando
  `npx supabase db query --linked` roda SQL como `postgres`.

## Verificação de ponta a ponta

```sql
-- 1. Nenhuma linha órfã de organização nas tabelas onde o app escreve
SELECT 'suppliers' t, count(*) FROM suppliers WHERE organization_id IS NULL
UNION ALL SELECT 'clients', count(*) FROM clients WHERE organization_id IS NULL
UNION ALL SELECT 'partner_workspaces', count(*) FROM partner_workspaces WHERE organization_id IS NULL;
-- Esperado: 0, 0, 0

-- 2. Ninguém perdeu visibilidade
SELECT count(*) FROM suppliers WHERE is_shared;   -- Esperado: 119

-- 3. Nenhuma policy dessas tabelas depende de organização nula, nem está em PUBLIC
SELECT c.relname, p.polname, p.polroles::text, pg_get_expr(p.polqual, p.polrelid)
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE c.relname IN ('suppliers','clients','partner_workspaces');
```

Na tela: com cada uma das 4 organizações selecionada no topo, a lista de
Fornecedores tem que mostrar os compartilhados; editar um compartilhado só pode
funcionar na organização dona.
