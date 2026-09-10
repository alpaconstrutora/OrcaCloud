# Gestão de Ativos — toolbar acoplada à tabela (§5.2 do guia de UI)

## Pedido original

Sessão de 2026-09-10, mensagem literal do usuário:

> aplicar o padrão ui_ux_guia_unificado.md no toolbar acoplada a tabela

## Alcance

As **quatro** abas de `OpuraAssetsModule.tsx` que têm tabela: Ativos
Patrimoniais, Reservas & Locação, Manutenções e Custos & Rateio. Fazer só uma
deixaria a mesma tela com duas escalas de moldura lado a lado — exatamente o que
o §16 proíbe ("não misturar as duas escalas dentro da mesma tela").

**Fora do alcance, de propósito:** o cabeçalho em card com breadcrumb (o §20
lista `OpuraAssetsModule.tsx` nominalmente como linguagem visual deliberada —
"não migre sem decisão explícita"), os cards de KPI do Dashboard e de
Manutenções (§4 pede `KpiCard`, mas é outro item), e os modais.

## Estado antes

| Aba | Defeito contra o §5.2 |
|---|---|
| Ativos Patrimoniais | toolbar num card `p-6 rounded-3xl` **separado** da tabela; busca com moldura dupla (input dentro de div com borda); selects `rounded-xl font-bold`; toggle grade/lista `bg-slate-900` |
| Reservas & Locação | toolbar e tabela no mesmo card `rounded-3xl`, mas a tabela com **moldura própria** dentro dele (o §5.2 chama de "duplica a moldura") |
| Manutenções | idem |
| Custos & Rateio | idem, e o período (escopo) fundido no cabeçalho do card |

## O que muda, aba por aba

### Ativos Patrimoniais

Um único card `rounded-[10px] border shadow-sm overflow-hidden`; toolbar em
`p-2 border-b`; busca `h-9 pl-9 rounded-[6px]` com uma borda só; selects
`h-9 rounded-[6px] text-sm font-medium`; separador `w-px h-6` entre "filtrar" e
"visualizar" (§5.1); colunas + autofit + toggle num só agrupador `h-9
rounded-[10px]`; toggle ativo `bg-blue-600` (§5). Grade em `gap-4 p-4`, cards
`rounded-[10px]`; vazios sem moldura própria, `py-12` (§12 dentro do acoplado).

### Reservas & Locação e Manutenções

Título da aba sai do card (é conteúdo de página, §20, com `mt-1.5` no
subtítulo). Card acoplado com toolbar `p-2 border-b`; a moldura interna da
tabela vira fragmento; vazios `py-12`.

### Custos & Rateio

O período é **escopo** — decide qual conjunto a tela olha — então vai para barra
própria (§5.3, `p-2 rounded-[10px] mb-3`, controles `h-9 rounded-[6px]`),
separada da busca, que é recorte. Métricas em `rounded-[10px]` com `mb-3`
(ritmo do §20.1). Toolbar acoplada à tabela; estados vazios ganham o card que a
tabela ocuparia.

**Pronto quando (as quatro):** medido no navegador, busca e `<table>` têm o mesmo
ancestral com borda, nenhum ancestral da tabela abaixo dele tem borda própria,
a toolbar tem `border-bottom`, o card tem raio 10px e a busca tem 36px.

## Verificação

```bash
bash scripts/check-ui-standard.sh components/OpuraAssetsModule.tsx
npx tsc --noEmit -p .
npx vitest run
```

E a tela real com Playwright, nas quatro abas (Manutenções sem tabela nesta
organização — conferida pelo print do estado vazio dentro do card acoplado).

## Sobras conhecidas (não fazem parte deste pedido)

- KPIs do Dashboard e de Manutenções ainda em `rounded-3xl` à mão — §4 pede
  `KpiCard`; ficam visivelmente com raio maior que o card acoplado logo abaixo.
- Cards do modo Blocos mantêm a pílula de status em caixa alta.
- Os modais de movimentação/reserva/manutenção/documento seguem na escala
  antiga (o drawer de cadastro já migrou em 2026-09-09).
