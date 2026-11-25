# Incorporação › Oportunidades no padrão do app — 25/11/2026

## Pedido (literal)

> incorporacao > oportunidasdes: os dashcards, titulo, fonts alias tudo na tela não esta no padrao do app

(com print da tela: cards "VGV PIPELINE / TOTAL / POR STATUS", título solto ao lado das abas, tabela em caixa alta)

## Protocolo

`apply-ui-standard` + REGRA #1: guia `docs/ui_ux_guia_unificado.md` lido inteiro; auditoria seção por seção
apresentada ao usuário antes de editar; `check-ui-standard.sh` e `tsc` depois.

## O que mudou (`components/investor/OpportunitiesTab.tsx`, `OportunidadesModule.tsx`)

| Antes | Depois | § |
|---|---|---|
| `h3 text-xl font-bold`, sem subtítulo | `h1 text-3xl font-black` + subtítulo `mt-1.5` (só quando a lista é a tela: prop `titulo`) | §20 |
| Alternador Oportunidades/Interesses à mão (`bg-gray-100 rounded-lg font-bold`) | `TabsBar`, com "Nova oportunidade" à direita | §19.1/§17 |
| 3 cards à mão (fundo `#0B1727`, `font-black uppercase tracking-widest`, chips "Por status") | 4 `KpiCard`: VGV das ativas · Oportunidades · Em captação · Rascunhos | §4 |
| "Por status" em chips | `FilterPopover` Status na régua (opções do mapa de rótulos) | §5.4/§5.5 |
| Sem busca | busca persistida, a mesma na grade e na tabela | §3/§5.2 |
| Tabela à mão (`uppercase`, `py-4`, sem `border-r`, sem ordenar, ROI/TIR numa célula) | `StandardTable`: sentence case, `py-2.5`, `border-r`, ordenação, redimensionar/auto-ajuste; ROI e TIR em colunas | §6/§6.3/§6.10/§7 |
| Ícones à mão; na grade, ações só no hover | "Ver" em texto azul + `ActionIconButton` (publicar, editar, excluir) sempre visíveis | §9/§9.2 |
| Cartão escuro da grade com pílulas `rounded-full` | cartão branco `rounded-[10px]`, status em texto (§8), números `text-sm` | §8/§16 |
| Grade/lista em `useState` do pai | `usePersistedState` dentro da lista | §3 |
| Spinner próprio `py-20` / vazio `bg-gray-50 rounded-2xl` | loading e vazio do `StandardTable` (vazio com "Criar primeira oportunidade") | §11/§12 |
| Lista duplicada para o celular | uma só (a tabela rola na horizontal; a grade serve o celular) | §15 |

Também: dentro do painel do investidor (Portais › Portal do Investidor › investidor) a mesma lista aparece sem
título e sem abas (só leitura), como antes.

## Fora

- Aba **Interesses** (`InterestsPanel.tsx`) e o formulário (`OpportunityForm.tsx`): componentes próprios, não
  auditados aqui.
- O detalhe ("Ver") é a tela do portal (§24), por decisão de 25/11 (F4 do plano
  `2026-11-25-oportunidades-e-portal-do-investidor-sem-marketplace`).

## Estado

Em PR.
