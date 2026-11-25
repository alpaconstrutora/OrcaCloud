# Torres e Unidades › Unidades: Agrupar + ordem dos grupos + recolher/expandir

## Pedido original (25/11/2026)

> esse print é da tela incorporação > empreendimento > torres e unidades > sessao Unidades:
> implemente filtro Grupo + classificacao + expandir / ocultar

(O print mostra a tabela agrupada sempre por pavimento — "Estacionamento 2 · andar -2", "Pavimento Térreo"… — com o
chevron de cada grupo e nada mais.)

## Leitura do pedido

- **Grupo** = o seletor "Agrupar" do app (guia §6.12), com os campos da tabela.
- **Classificação** = a ordem dos grupos, Crescente/Decrescente (a ordem das linhas segue nos cabeçalhos das colunas).
- **Expandir/ocultar** = o botão recolher/expandir todos, sempre visível.

## Itens

1. **Função pura** `utils/unidadesGrupos.ts` — `agruparUnidades(lista, campo, direcao, leitor)` sobre `agruparLinhas`.
   Campos: Pavimento, Tipo do pavimento, Tipologia, Dormitórios, Posição, Vista, Orientação.
   *Pronto quando:* `__tests__/unidadesGrupos.test.ts` passa (ordem numérica do pavimento com o nome do cadastro,
   Decrescente, "Sem …" no fim, rótulos da célula). ✅
2. **Tela** `components/empreendimento/UnitEditor.tsx` — `useAgrupamento` (abre por Pavimento, o comportamento de
   antes) + `AgruparControles` logo acima da tabela. O cabeçalho do grupo continua o da tabela (checkbox do grupo e
   somas de área nas colunas); andar, elevação e "Ordenar por número" só por Pavimento. Sem agrupamento, lista corrida.
   As setas ↑↓ só agrupado por Pavimento (fora disso, desligadas com "Agrupe por Pavimento para mudar a ordem").
   *Pronto quando:* `__tests__/components/UnitEditorAgrupar.test.tsx` e os testes antigos do UnitEditor passam;
   `check-ui-standard.sh` limpo. ✅
3. **Guia** §6.12 — entrada de 25/11/2026. ✅

## Estado

- [x] Itens 1–3
- [x] Conferência no navegador (Garden › Torre A, 17 unid.: 6 pavimentos; recolher todos → 0 linhas, expandir → 17; Decrescente inverte; Tipologia → 5 grupos sem "Ordenar por número"; sem agrupar → lista corrida e botão desligado)
- [ ] Publicação
