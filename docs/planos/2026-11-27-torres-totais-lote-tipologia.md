# Torres & Unidades: Total geral na aba Unidades, edição em lote completa, área da tipologia

## Pedido original (27/11/2026)

> 1. A somatoria de areas ficou na aba de torres. deveria estar na ana unidades
> 2. Aba unidades: incluir todas as colunas na edição em lote
> 3. Aba tipologia: Trazer informação que identifique cada ripologia: área privativa

## Itens

1. **Total geral → aba Unidades** (`components/empreendimento/TowerEditor.tsx`)
   - O bloco (unidades e áreas de todas as torres) sai da aba Torres e entra no topo da aba Unidades, acima do
     seletor de torre e da tabela (guia §6.14). Com mais de uma torre, o título diz quantas.
   - O rótulo e as métricas (`TorreTotalMetric`, usado só aqui) perdem a caixa alta, pela regra do app (#348).
   - *Pronto quando:* o teste em `TowerEditorSubAbas.test.tsx` passa.
2. **Edição em lote com todas as colunas editáveis** (`UnitEditor.tsx`)
   - Faltava **Vagas** (o salvar já gravava, mas o campo não existia).
   - Os campos seguem a ordem das colunas, com altura `h-9`, `aria-label` e o texto "…" no lugar de "...".
   - Ficam de fora:
     - Unidade, porque cada uma tem o seu nome;
     - Elevação, porque vem do pavimento.
     A barra diz isso.
   - *Pronto quando:* o teste em `UnitEditorAgrupar.test.tsx` acha os 12 campos e "Vagas = 2" grava `parking_spaces: 2`.
3. **Área privativa identifica a tipologia** — `utils/espelhoPlantaDaTipologia.ts` + serviço + Plantas e Decorado.
   - `tipologiasNoCadastro` traz `private_area` das unidades (`areasDasUnidades`, na mesma posição de `unidades`).
   - `tipologiasDoEmpreendimento` calcula a menor e a maior área por tipologia, e `textoDaAreaPrivativa` mostra:
     - "81 m²" quando todas batem;
     - "127–130,5 m²" quando varia.
   - Tipologia sem área, ou que só existe no estoque, fica sem texto (nunca "0 m²").
   - A Planta mostra "Área privativa …" sob o nome; o Decorado mostra "· 81 m²" no botão da tipologia.
   - *Pronto quando:* os testes em `espelhoPlantaDaTipologia.test.ts` passam.

## Estado
- [x] Itens 1–3, testes, tsc, check-ui
- [x] Navegador (Garden): Total geral ausente em Torres e no topo de Unidades ("Total geral (2 torres) · 43 · 4.072 m² · 50 m² · 4.122 m²"); barra do lote com os 14 campos, Vagas incluída, nada cortado; Plantas e Decorado com a área das 11 tipologias (81 a 127 m²)
- [ ] Publicação
