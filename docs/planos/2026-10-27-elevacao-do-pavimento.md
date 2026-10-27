# Elevação do pavimento no Empreendimento (27/10/2026)

## Pedido original

> "2. Para não haver confusão entre pavimentos, sugiro incluir elevação, assim não teremos dúvida da posição do
> pavimento. Podemos incluir elevação em incorporação > empreendimento por você ou pedir para outra sessão o fazer.
> O que você prefere?"

Escolhi fazer nesta frente: a elevação mexe nos mesmos arquivos do pé-direito (PR #205), que são `FloorEditor`,
`estruturaDaTorre` e o ajuste da massa.

Decisão do usuário sobre "digitada ou calculada": **as duas opções**.

## Regra

- **Elevação do térreo da torre** (`empreendimento_towers.elevacao_terreo_m`):
  - é a referência, podendo ser +0,00 relativo ou a cota altimétrica;
  - vazia vale 0.
- **Calculada:**
  - para cima: o pavimento de baixo mais o pé-direito dele;
  - para baixo (subsolos): o de cima menos o próprio pé-direito;
  - onde não há pé-direito (nem do pavimento nem da torre), o cálculo usa 3,00 m, o padrão do bloco de massa.
- **Digitada** (`empreendimento_floors.elevacao_m`):
  - vale no lugar do cálculo, e os andares de cima seguem a partir dela;
  - num pavimento que se repete, vale para o 1º andar.
- **Divergência:**
  - Quando a digitada não bate com o pé-direito cadastrado do vizinho, vira aviso e a digitada vence. Exemplo:
    "Tipo 1 está em +5,50 m (digitada), mas o Térreo (+0,50 m, pé-direito 4,50 m) termina em +5,00 m".
  - Se a altura resultante sair de 2 a 15 m, aparece outro aviso e a massa fica com o pé-direito.
- **Na massa da Planta:**
  - A altura do piso passa a ser a distância entre elevações quando uma digitada a define (`PisoDaTorre.alturaMm`).
  - Os blocos empilham por trecho de mesma altura, como no pé-direito.
  - A massa usa só diferenças, nunca o valor absoluto: uma cota altimétrica (745,30) não faz a torre flutuar.

## Mudança

1. **Migration** `aplicar_20271027700000_empreendimento_elevacao_do_pavimento.sql`:
   - duas colunas `numeric(7,2)` anuláveis com CHECK -1000..10000;
   - idempotente;
   - aplicar com `db query --linked -f`, só com autorização.
2. **`estruturaDaTorre`:** `PisoDaTorre` ganha `elevacaoMm`, `elevacaoDigitada` e `alturaMm`; os avisos de
   divergência entram junto. O ajuste (`trechos`) usa `alturaMm ?? peDireitoMm ?? bloco`.
3. **Torres e Unidades:**
   - Pavimentos ganha o campo e a coluna "Elevação". A coluna mostra a digitada, ou a calculada com "(calc.)", e o
     intervalo quando o pavimento se repete. Os avisos aparecem em âmbar sob a tabela.
   - A Torre ganha "Elevação do térreo (m)" na criação, na edição e no subtítulo.
4. **Planta:** o painel do pavimento mostra "Elevação +4,50 m (digitada|calculada no Empreendimento)".
5. **Duplicar empreendimento** copia pé-direito e elevação. O pé-direito tinha ficado de fora na PR #205.

## Verificação

- **Testes:**
  - `blueprintEstruturaDaTorre` (+5);
  - `blueprintAjusteAoEmpreendimento` (+1);
  - `FloorEditorPeDireito` (+3);
  - painel (+1).
- **Mecânicas:** tsc; check-ui-standard; `BlueprintEditor.test.tsx` sozinho; CI.
- **Banco:**
  - ensaio da migration dentro de bloco que desfaz: OK;
  - depois de aplicar, conferir as colunas via REST (HTTP 200).

## Seguimento: a elevação na tabela de Unidades (27/10/2026)

> "aonde está a coluna elevação?" (print de Torres e Unidades do Garden: Pavimentos vazio)

A coluna fica na tabela de Pavimentos, que só existe com pavimentos cadastrados. O Garden não tem nenhum: os andares
vêm só das unidades. Por isso o cabeçalho de cada pavimento da tabela de Unidades passa a mostrar a elevação:

- exemplo: "Pavimento 1 · Elevação +3,00 m (calc.)";
- o cálculo é o mesmo, `estruturaDaTorre` com as unidades e os pavimentos da torre;
- vale também sem cadastro de pavimentos;
- a digitada aparece sem "(calc.)".
