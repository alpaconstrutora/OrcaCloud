# Incorporação › Oportunidades › aba Interesses no padrão do app — 25/11/2026

## Pedido (literal)

> aba interesse também

(continuação de "incorporacao > oportunidasdes: os dashcards, titulo, fonts alias tudo na tela não esta no padrao do
app" — plano `2026-11-25-oportunidades-padrao-do-app.md`, que deixou esta aba de fora)

## Protocolo

`apply-ui-standard` + REGRA #1: guia `docs/ui_ux_guia_unificado.md` (lido inteiro hoje; sem mudança desde então);
auditoria seção por seção antes de editar; `check-ui-standard.sh` e `tsc` depois.

## O que mudou (`components/investor/InterestsPanel.tsx`, `TornarSocioSheet.tsx`)

| Antes | Depois | § |
|---|---|---|
| Só quadro por estágio (kanban) | **Lista** (`StandardTable`) como visão padrão — interesse é registro homogêneo; o quadro fica no alternador | §6.10/§36 |
| "Interesses Recebidos" `h3 font-black` + contador em pílula | 4 `KpiCard`: Interesses · Em negociação · Fechados · Valor pretendido | §4 |
| `<select>` de oportunidade solto, sem busca | régua acoplada: busca + `FilterPopover` Oportunidade e Estágio + alternador (persistidos) | §3/§5.2/§5.4 |
| Seletor de estágio `text-xs font-bold` | `text-sm font-normal`, na cor do estágio | §7.1 |
| Papel em pílula `rounded-full`; estágio `font-black uppercase`; contagem em pílula | texto; coluna do quadro com bolinha + nome + contagem `rounded-[6px]` | §8/§36 |
| `rounded-2xl`/`rounded-xl` | `rounded-[10px]`, cartão branco com borda | §16/§36 |
| "Tornar sócio" só no cartão Fechado | sempre visível na linha; desligado com o motivo no invólucro | §9/§9.2 |
| Carregando em texto solto; vazio `bg-gray-50 rounded-2xl font-bold` | loading/vazio do `StandardTable` (§11/§12) | §11/§12 |
| Erro ao carregar e ao trocar estágio só no console | alerta com "Tentar novamente" / toast | §13 |
| Drawer: `title` no botão desligado (não aparece) | motivo no invólucro | §9.2 |

## Estado

NO AR em 25/11 (PR #735, merge 26fb36b; produção servindo 26fb36b). Conferido no Chrome: 4 KpiCard, régua com busca + Oportunidade + Estágio + lista/quadro, vazio. O banco tem 0 interesses: linhas e quadro com dados conferidos só nos testes.
