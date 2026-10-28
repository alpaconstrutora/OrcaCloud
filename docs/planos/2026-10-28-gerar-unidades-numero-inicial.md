# Gerar a partir dos pavimentos: número inicial (28/10/2026)

## Pedido original

> "o botão de gerar a partir do pavimento inicia a numeração sequencial a partir de 01. implemente opção de escolher
> iniciar de um número que o usuário decidir"

## Antes

"Gerar a partir dos pavimentos" (Torres e Unidades › Unidades) pedia só uma confirmação e numerava cada andar de 01:
101, 102… e TR01, SS101.

A Torre B do Garden numera 05–08 em cada andar (105–108). Isso não saía do gerador.

## Mudança

1. **`utils/empreendimentoUnidadesDosPavimentos.ts`** (puro, novo):
   - `unidadesDosPavimentos(tower, floors, numeroInicial = 1)`: o laço que estava no serviço. A 1ª unidade de cada
     andar é `numeroInicial`. Acima de 99 o número só cresce (1100), não corta.
   - `lerNumeroInicial(texto)`: inteiro de 0 a 99, vazio vale 1. É o número da unidade no andar, com 2 dígitos.
   - `faixasPorAndar`: a prévia, com a primeira e a última de cada andar.
2. **Serviço:** `generateUnitsFromFloors(tower, numeroInicial?)` usa a função pura. Sem o número, faz o mesmo de
   antes.
3. **Tela (`UnitEditor`):** o botão abre um painel no lugar do diálogo de confirmação. O painel tem:
   - o campo "Numeração começa em", com 1 por padrão e a explicação "1 → 101; 5 → 105";
   - a prévia por andar ("Andar 1: 105 a 108 (4 unid.)");
   - o aviso âmbar de que as unidades atuais serão substituídas;
   - o botão "Substituir e gerar N unidades". Ele fica desligado, dizendo o motivo, quando o número está fora de 0–99.

## Verificação

- **Testes:**
  - `empreendimentoUnidadesDosPavimentos` (6): o padrão de antes, o início em 5, a passagem de 99, o prefixo, a
    leitura do campo e a prévia;
  - `UnitEditorGerarDosPavimentos` (3): a prévia, o gerar com 5 e o número inválido.
- **Mecânicas:** tsc; check-ui-standard; testes que usam o serviço ou o editor (35 arquivos).
