# Controladoria — restaurar fallback por nome na DRE e destravar "DRE por SPE"

## Pedido original
> Verifique o módulo controladoria
> Sessão: 074d416c-dd6a-42e5-97d2-97038aa05a12 · 2026-09-20 ~18:30

Após o relatório de verificação (3 achados graves, 4 de dados), a pergunta foi
*"Quer que eu ataque os itens 1 e 2 (SQL) agora?"* e a resposta:

> SIM
> Sessão: 074d416c-dd6a-42e5-97d2-97038aa05a12 · 2026-09-20

Escopo aprovado: **itens 1 e 2** abaixo. Os itens 3 e 4 (categoria por direção
no `contractService`, ponte boleto → `financial_categories`) ficam FORA desta
frente e continuam pendentes.

## O que a verificação encontrou (2026-09-20, dados reais da Alpa, RLS ativa)

1. **`fn_dre_spe_summary` quebrada desde a origem** (`20261120000001`). A CTE
   `agg` faz `SELECT empresa_id … GROUP BY empresa_id` enquanto
   `RETURNS TABLE(empresa_id …)` declara variável PL/pgSQL com o mesmo nome →
   `42702: column reference "empresa_id" is ambiguous` em TODA chamada. A aba
   "DRE por SPE" só mostra o toast "Erro ao carregar DRE por SPE". As duas
   reescritas posteriores (`20270128000000`, `aplicar_20270915000003`) copiaram
   o defeito. 3ª ocorrência do padrão que já derrubou o Almoxarifado.
2. **Fallback por nome perdido em 4 de 5 funções.** A `20261103000005` tinha
   adicionado `OR (it.category_id IS NULL AND fc.organization_id =
   it.organization_id AND lower(fc.name) = lower(it.category))` ao JOIN com
   `financial_categories`. A `20261120000001` (fase 2) reescreveu `fn_dre`,
   `fn_dre_summary`, `fn_balancete` e `fn_dre_spe_summary` só com
   `fc.id = it.category_id`, e a `20270128000000` manteve assim. Só
   `fn_dre_projects_summary` guardou o fallback. Efeito medido: na MESMA tela
   DRE, o resumo e a tabela "por obra" classificam diferente; o Balancete lista
   "Mão de Obra / Serviço" duas vezes (com id → CUSTO_OBRA; sem id →
   SEM_CLASSIFICACAO, 80 lançamentos).

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-20 | Atacar itens 1 e 2 (SQL) agora? | SIM |

## Plano

### `supabase/migrations/aplicar_20270921000029_controladoria_dre_fallback_nome_e_spe.sql`
**O que muda:** `CREATE OR REPLACE` de `fn_dre`, `fn_dre_summary`, `fn_balancete`
e `fn_dre_spe_summary`, reescritas a partir dos ARQUIVOS `20270128000000` e
`aplicar_20270915000003` (não do banco — mojibake no Windows), com:
- o JOIN a `financial_categories` idêntico ao de `fn_dre_projects_summary`
  (id OU nome na mesma org quando `category_id` é nulo);
- em `fn_dre_spe_summary`, a CTE `agg` lê `FROM txs t` e qualifica
  `t.empresa_id`, `t.dre_group`, `t.direction`, `t.status`, `t.amount`;
- `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT … TO authenticated` nas 4
  (REGRA #7; são SECURITY INVOKER, a RLS já segurava, mas a ACL ficava com
  `anon=X`).
**Como sei que terminou:** aplicada com `db query -f`; como o usuário
(JWT simulado), `fn_dre_spe_summary` devolve linhas em vez de 42702;
`fn_balancete` 2026 não lista mais "Mão de Obra / Serviço" com `category_id`
nulo; `fn_dre_summary` e `fn_dre_projects_summary` fecham no mesmo custo
conciliado de 2026; `prosrc` das 4 sem mojibake; `segurancaMigrations.test.ts`
passa.

## Efeito colateral conhecido (NÃO é regressão desta frente)
Com o fallback de volta, as 53 parcelas RECEBÍVEIS de contrato que o
`contractService` grava com `category='Mão de Obra / Serviço'` passam a cair em
CUSTO_OBRA como crédito (reduzindo "Custos Diretos" em vez de aparecer como
Receita). Antes elas caíam em "Sem Classificação". A correção certa é o item 3
(categoria por direção no `contractService`) — fora deste escopo.

## Estado
- [x] migration escrita — `aplicar_20270921000029_controladoria_dre_fallback_nome_e_spe.sql` (incluiu 2º defeito latente da SPE: `SUM(a.n)` numeric × `n_transacoes BIGINT` → cast)
- [x] aplicada no banco (2026-09-20) e provada como usuário: SPE devolve 1 linha (489 lançamentos; COMPETÊNCIA custos 464.355,99) em vez de 42702; Balancete sem categoria duplicada (Mão de Obra / Serviço = 1 linha, 143); DRE "Sem Classificação" = só os 498 sem categoria (R$ 222.602,60); `prosrc` sem mojibake; ACL sem anon/PUBLIC; `segurancaMigrations` 2/2
- [x] commit `6d93029a` + push em main (2026-09-20). Frontend não mudou; a correção vive no banco, já aplicada.

## Verificação
```bash
# como usuário autenticado (JWT simulado em BEGIN … ROLLBACK):
SELECT * FROM fn_dre_spe_summary('<org>','2026-01-01','2026-12-31','CAIXA');   -- linhas, não 42702
SELECT * FROM fn_balancete('<org>','2026-01-01','2026-12-31',NULL,'CAIXA');    -- sem categoria duplicada
npx vitest run __tests__/segurancaMigrations.test.ts
```
