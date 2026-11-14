# Comercial › Condomínios — coluna Organização + Agrupar

## Pedido original

Sessão de 14/11/2026, com print da tela Comercial › Condomínios (topo em "Todas as organizações"):

> comercial > Condomínios:
> 1. criar coluna organização
> 2. implementar filtro grupo + botão classificacao + botão expandir / recolher

## Decisões

- **Organização = quem OPERA o condomínio** (`utils/orgDoCondominio`: a org própria do
  condomínio, `condominio_org_id`, ou a do empreendimento quando não há). A catraca
  `__tests__/orgDoCondominioGuard.test.ts` proíbe `organization_id` nas telas de
  `components/condominio/`. Hoje: Bella Vista e Galeria Altavista têm org própria
  ("Condomínio …"); Galeria Avenida 494 cai na SPE do empreendimento.
- A coluna existe também com uma organização no topo: a lista traz os condomínios que ela
  opera **e** os que ela construiu (`listParaCondominios`), então a org varia por linha.
- "Filtro grupo + botão classificação + expandir/recolher" = o Agrupar do guia §6.12
  (`AgruparControles`: seletor Agrupar, Crescente/Decrescente da ordem dos grupos,
  recolher/expandir todos). Opções: Organização, Cidade, Centro de custo (combinação —
  um condomínio pode ter vários). Código, nome e CNPJ ficam fora (um grupo por linha).
  Só contagem (`semTotal`): a tela não tem valor em dinheiro.

## Itens

1. [x] `utils/condominioGrupos.ts` + `__tests__/condominioGrupos.test.ts` — pronto quando o
   teste passa (org por id, cidade sem caixa, CC por combinação sem duplicar linha, "Sem …" no fim).
2. [x] `CondominiosModule.tsx`: coluna Organização (ordenável, entra na busca e no
   configurar colunas) — pronto quando `check-ui-standard.sh` e `orgDoCondominioGuard` passam.
3. [x] `CondominiosModule.tsx`: `AgruparControles` na toolbar depois da busca e `<tbody>` por
   `entradasDaPagina` com `LinhaDeGrupo` — pronto quando tsc passa.
4. [x] Guia §6.12 registra a tela.
5. [ ] Conferência na tela (app local) — agrupar por Organização, alternar Crescente/Decrescente,
   recolher/expandir todos.
