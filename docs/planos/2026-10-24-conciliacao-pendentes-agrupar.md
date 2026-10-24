# Conciliação Bancária › Pendentes — "Agrupar" com ordem dos grupos (Extrato e Lançamentos)

## Pedido original
> financeiro > conciliacao bancaria > Pendentes: incluir filtro agrupamento + ordenador do filtro agrupamento. incluir na tabela Extrat e na tabela lançamentos
>
> Sessão: a8e2ea08-5228-4f48-a778-da2044c30bf2 · 24/10/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | O que é "filtro agrupamento + ordenador"? | O **"Agrupar"** do guia §6.12 (seletor de campo + recolher/expandir todos) e o seletor **Crescente/Decrescente da ordem dos grupos** que faz parte dele desde 21/10/2026. Peças reaproveitadas, nada copiado: `useAgrupamento`, `AgruparControles`, `LinhaDeGrupo`, `agruparLinhas`. |
| 24/10/2026 | Por quais campos? | Os das colunas de cada tabela, com o MESMO texto da célula. Extrato: Contraparte, Categoria, Obra, Centro de Custo, Data (mês). Lançamentos: Cliente / Credor, Categoria, Obra, Centro de Custo, Data (mês). A coluna Valor e a Descrição não agrupam (um valor/texto por linha, sem categoria). |
| 24/10/2026 | O que o total do grupo mostra? | **Saldo** (créditos − débitos). Extrato e lançamentos misturam entrada e saída; somar em módulo não diria nada. O `title` do total explica. Nos lançamentos usa o valor da coluna (líquido, quando o cliente retém tributo). |
| 24/10/2026 | Onde ficam os controles? | Numa linha própria entre a toolbar e a tabela, em cada lado. A toolbar de cima já ocupa a meia-tela da Pendentes (as duas tabelas ficam lado a lado) e três controles a mais estourariam a largura. |
| 24/10/2026 | Modo grade (cards)? | Agrupar vale só no modo **lista** (é onde há cabeçalho de grupo); na grade os controles não aparecem e a escolha fica guardada, sem efeito. |
| 24/10/2026 | Seleção, Conciliar, lote? | Não mudam: trabalham sobre os ids marcados. O "selecionar todos" do `<thead>` continua sendo o da página (agora: as linhas da página na ordem da tela, sem as de grupo recolhido). |
| 24/10/2026 | Persistência? | Campo e sentido em `usePersistedState` (`conciliacaoPendentes:extrato:groupBy` / `:lancamentos:groupBy`, mais `:direcao`); recolhidos só em memória. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/pendentesGrupos.ts` (novo) | `agruparExtrato` / `agruparLancamentos`: chaves, rótulos "Sem …", total em saldo, mês cronológico | `__tests__/pendentesGrupos.test.ts` verde |
| `components/BankReconciliation.tsx` | dois `useAgrupamento`; grupos e linhas da tela alimentam `usePaginacaoEmMemoria`; `AgruparControles` acima de cada tabela; `<tbody>` itera `entradasDaPagina` com `LinhaDeGrupo` | typecheck; conferência na tela |
| `docs/ui_ux_guia_unificado.md` §6.12 | registra a Pendentes › Extrato/Lançamentos na lista de telas | seção atualizada |

## Estado
- [x] `utils/pendentesGrupos.ts` + teste (9 casos, mais `agruparLinhas` 14 — 23/23)
- [x] `BankReconciliation.tsx`
- [x] typecheck — `tsc --noEmit` rc=0, 0 erros (lido por grep)
- [x] `check-ui-standard.sh components/BankReconciliation.tsx`: 0 violações
- [ ] conferência na tela real (precisa do login de leitura — não feita)
- [x] guia §6.12
- [ ] PR + CI

## Verificação
1. `npx vitest run __tests__/pendentesGrupos.test.ts __tests__/agruparLinhas.test.ts`
2. `bash scripts/check-ui-standard.sh components/BankReconciliation.tsx`
3. Financeiro › Conciliação Bancária › Pendentes (modo lista) › "Agrupar" no Extrato e nos Lançamentos: A→Z, Decrescente inverte, "Sem …" no fim, recolher todos, recarregar mantém.
