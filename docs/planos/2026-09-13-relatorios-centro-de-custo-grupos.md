# ÒPURA · Relatórios › Centro de Custo em grupos (como Organização › Centro de Custo)

## Pedido original

Sessão 2e718847, 2026-09-13, depois de o centro "Ativos › Manutenção" passar a
aparecer no relatório (ver `2026-09-13-ativos-manutencao-financeiro.md`).
Com um print da tela Organização › Centro de Custo (colunas Código · Centro de
custo (grupo) · Centro de custo · Descrição · Empreendimento · Obra ·
Organização, grupo "Condomínios" expandido mostrando 010 - Galeria Altavista e
011 007 - Bella Vista):

> organizar em grupos como minha organizacao < centro de custo . veja print

## Contexto

A aba Centro de Custo do relatório listava uma linha plana por centro, com o
rótulo "Pai › Nome" vindo da `fn_opura_pivot`. O usuário quer a mesma
hierarquia do cadastro: linha do grupo com os totais somados e os centros
filhos embaixo, expansível.

## Desenho

Só frontend — a RPC continua devolvendo uma linha por `cost_center_id`. A tela
busca o catálogo `cost_centers_v2` pela mesma fonte da tela de cadastro
(`costCenterService.list`, REGRA #5: "Todas" → todas as orgs do usuário) e
monta a árvore por `parent_id`:

- grupo = totais próprios + de todos os descendentes; filhos ordenados por
  código; grupos sem lançamento no período ficam de fora (é relatório, não
  cadastro);
- grupo que tem lançamentos diretos E filhos ganha um filho sintético
  "(lançado no grupo)", para o total do grupo bater com a soma do que está
  listado embaixo;
- grupo só com lançamentos diretos (ex.: Administrativo) é folha na raiz;
- "— Sem centro de custo" fica por último; centro fora do catálogo (excluído,
  ou de outra org com o seletor numa org só) vira raiz solta com o rótulo da RPC;
- grupos nascem expandidos (o detalhe já estava visível na lista plana); o
  clique no grupo recolhe/expande; o clique numa folha abre o extrato como antes;
- coluna: código em cinza + nome; grupo em `text-gray-900`, folha em
  `text-gray-700`, indentação de 24px por nível. Sem `font-bold` em `<td>` (§7).

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/opuraCostCenterTree.ts` (novo) | `buildCostCenterTree(rows, catalog)` e `flattenCostCenterTree(tree, expanded)` — puros | testado em 2 |
| 2 | `__tests__/opuraCostCenterTree.test.ts` (novo) | agrupamento, soma, ordem, sintético, "Sem centro" por último, soltos, soma das raízes = soma plana, achatamento | verde |
| 3 | `components/OpuraReports.tsx` | carrega catálogo quando `dimension === 'cost_center'`; renderiza a árvore no `<tbody>`; chevron recolhe/expande; folha abre extrato | typecheck + `check-ui-standard.sh` limpos |
| 4 | `__tests__/components/OpuraReportsCentroDeCusto.test.tsx` (novo) | renderiza com serviços mockados: ordem grupo → filhos, grupo soma (62 / R$ -24k), "Obra" sem dado fica fora, recolher/expandir, rodapé = total plano (734) | verde |

## Estado

- [x] 1–4 — suíte completa verde; publicado (commit desta frente).
- Fora do escopo, registrado: o CSV continua plano (rótulo "Pai › Nome"); a
  tabela do relatório em si ainda não segue o §6.6 (`px-6` + `border-r`) — não
  é desta frente.
