# Contas a Receber — "Agrupar" igual a Boletos a Pagar

## Pedido original
> financeiro > contas a receber: implemente a mesma funcionalidade agrupamentos aplicada em financeiro > boletos a pagar
>
> (com print de Boletos a Pagar mostrando o seletor "Agrupar" aberto: Status, Fornecedor, Obra, Centro de Custo, Vencimento (mês), Capturado por)
>
> Sessão: 6480dfb9-9abe-4ab4-adce-d776e13c7443 · 15/10/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 15/10/2026 | Quais dimensões, se Contas a Receber não tem fornecedor nem "capturado por"? | As colunas equivalentes da tela: Status, Cliente / Parte, Empreendimento, Obra, Centro de Custo, Plano de Contas, Vencimento (mês). "Capturado por" não existe aqui. |
| 15/10/2026 | Total do grupo soma qual valor? | Valor bruto (`amount`) — o mesmo que o total da barra de seleção em lote já soma. `title` no total diz isso. |
| 15/10/2026 | "Selecionar todos" com grupo recolhido? | Só o que está na tela (como Boletos). O lote mantém o que já estava marcado antes de recolher (Boletos usa `filtered` no lote). |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/recebivelGrupos.ts` (novo) | Função pura `agruparRecebiveis`, molde de `boletoGrupos.ts`, reusando `rotuloMes` | `__tests__/recebivelGrupos.test.ts` verde (8 casos) |
| `components/ContasReceberManager.tsx` | Seletor "Agrupar" + recolher/expandir todos na toolbar; linha de grupo com contagem e total; seleção sobre as linhas na tela; deep-link expande o grupo | `__tests__/components/ContasReceberAgrupar.test.tsx` verde, e reprova se o "selecionar todos" voltar a usar a lista plana (provado) |
| `docs/ui_ux_guia_unificado.md` | §6.12 novo — o padrão "Agrupar" não estava no guia (REGRA #1, item 4) | seção presente + item no checklist de auditoria |

## Estado
- [x] `utils/recebivelGrupos.ts` + teste
- [x] `ContasReceberManager.tsx` + teste de tela
- [x] guia §6.12
- [x] conferência visual na tela — preview local, login de leitura, dados reais (362 títulos; 15 grupos por cliente; colSpan 16 = colgroup; reload mantém; 0 escritas, 0 erros). Script: `c:/tmp/pwtest/receber-agrupar.js`
- [ ] publicado (push em main) e conferido em produção

## Verificação
1. `npx vitest run __tests__/recebivelGrupos.test.ts __tests__/components/ContasReceberAgrupar.test.tsx`
2. `bash scripts/check-ui-standard.sh components/ContasReceberManager.tsx`
3. Financeiro › Contas a Receber › Agrupar › Cliente / Parte: cabeçalhos com contagem e total; clicar recolhe; Shift+clique e "selecionar todos" respeitam os grupos recolhidos.
