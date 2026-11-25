# Torres & Unidades › card da torre: "sem pavimentos" com pavimentos cadastrados

## Pedido original (25/11/2026)

> Corrigir detalhe que já existia e não mexi: a Torre A aparece como "sem pavimentos" no card mesmo tendo pavimentos
> cadastrados. O texto lê o "Nº de pavimentos" do cadastro da torre, que está vazio. Basta preencher na edição da torre.

## Causa

O subtítulo do card (`components/empreendimento/TowerEditor.tsx`) lia só `tower.floors_count`. A Torre A do Garden
tem esse campo vazio e 6 andares no cadastro de pavimentos (a seção Pavimentos já avisava: "sem número de pavimentos
no cadastro da torre — contados pelo cadastro de pavimentos").

## Correção

`utils/empreendimentoPavimentosDaTorre.ts` › `pavimentosDaTorre`. A ordem é:
1. o Nº de pavimentos da torre;
2. senão o cadastro de pavimentos, com a mesma conta da seção Pavimentos (soma das repetições);
3. senão os andares distintos das unidades;
4. sem nada disso, "sem pavimentos".

Quando o número não vem da torre, a dica (`title`) diz de onde veio. Nenhum dado é gravado: o Nº de pavimentos da
torre continua vazio até alguém preencher.

*Pronto quando:*
- `__tests__/empreendimentoPavimentosDaTorre.test.ts` passa;
- o caso do card em `__tests__/components/TowerEditorSubAbas.test.tsx` passa;
- no Garden, a Torre A mostra "6 pav.".

## Estado
- [x] Código e testes
- [x] Navegador: Garden › Torre A "6 pav." (dica: cadastro de pavimentos), Torre B "6 pav." (Nº da torre)
- [ ] Publicação
