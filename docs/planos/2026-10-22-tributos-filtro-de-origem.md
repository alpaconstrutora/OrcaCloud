# Tributos a Pagar — filtro de origem

## Pedido original (22/10/2026, literal)

> 1. criar filtro de origem
> 2.

O item 2 veio em branco. Quando perguntei qual era, o usuário respondeu: *"desconsidere 2"*. Fica só o item 1.

A pergunta que fiz antes de começar, e a proposta que segui por ele não ter objetado:

> "Filtro de origem" é em Financeiro › Tributos a Pagar? Hoje a coluna "Origem" mostra a categoria
> ("Impostos s/ Receita", "Encargos Patronais", "Pró-labore"). Minha proposta é um filtro pela fonte do tributo, com
> quatro opções: Folha, Pró-labore, Comercial (negócios de venda e locação) e Manual. A coluna "Origem" passaria a
> mostrar essa mesma fonte.

## Por quê

Folha (21/10, PR #87) e pró-labore (22/10, PR #91) passaram a gerar tributos em Tributos a Pagar. A lista mistura agora
quatro fontes e não tinha como separar uma da outra: a coluna "Origem" mostrava a **categoria contábil**, e o único
recorte possível era o filtro avançado, digitando a categoria.

## Decisões

1. **A fonte sai de `source_system` e `reference_id`** (`utils/tributoOrigem.ts`, puro):

   | Fonte | Regra |
   |---|---|
   | Folha | `source_system = LABOR` |
   | Pró-labore | `source_system = PROLABORE` |
   | Comercial | `COMMERCIAL` com `reference_id` (`tax-{negócio}-…`) |
   | Manual | `COMMERCIAL` sem `reference_id` (lançado na própria tela) |

2. **Filtro rápido na toolbar acoplada** (guia §5.4, `FilterPopover`), ao lado do Status:
   - múltipla escolha, porque a guia do mês costuma levar folha e pró-labore juntas;
   - seleção em `usePersistedState`;
   - nunca fica vazia; sem recorte, o gatilho fica neutro.
3. **O recorte vale para tudo que a tela mostra**: tabela, KPIs, filtro avançado, ordenação, agrupamento e a seleção
   para "Agrupar em DARF". Os tributos escondidos não entram no DARF.
4. **A coluna "Origem" passa a mostrar a fonte; a categoria contábil vira a coluna "Categoria"**, com o mesmo conteúdo
   de antes. No filtro avançado (§5.5): "Origem" é lista fechada, "Categoria" mantém os valores distintos. Em
   "Agrupar", "Origem" agrupa pela fonte e "Categoria" é opção nova. A busca por texto também acha pela fonte
   ("folha").
5. **Sem mudança de banco e sem dado novo**: a view já traz `source_system` e `reference_id`.

## Verificação

- `__tests__/tributoOrigem.test.ts` (9): classificação, seleção salva e filtro.
- `__tests__/components/TributosFiltroOrigem.test.tsx` (4): colunas, esconder origens, KPIs acompanham, persistência.
- `tsc --noEmit`, `check-ui-standard` e conferência na tela real com a conta de leitura (só leitura).
