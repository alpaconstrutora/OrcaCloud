# Pé-direito por pavimento no Empreendimento (27/10/2026)

## Pedido original

> "Ficou de fora: o pé-direito por pavimento continua o do bloco (3,00 m), porque o empreendimento não tem esse
> campo.: crie pé-direito por pavimento em empreendimento"

(Seguimento da PR #204, em que os blocos da massa da Planta passaram a seguir as Torres e Unidades.)

## Decisões do usuário

- **Onde:** no pavimento (cadastro de pavimentos da torre) **e** um padrão na torre. O pavimento sem valor usa o da
  torre, o que cobre torres sem cadastro de pavimentos, como as do Garden Cambuhy, cujos andares vêm só das unidades.
- **Na planta:** quando a torre tem pés-direitos diferentes, a massa vira **blocos empilhados**, um por trecho de
  mesma altura ("Torre A · Térreo" 4,50 m embaixo, "Torre A" com os tipos a 3,00 m em cima).

## Mudança

1. **Banco** (`aplicar_20271027600000_empreendimento_pe_direito_por_pavimento.sql`):
   - `empreendimento_floors.pe_direito_m` e `empreendimento_towers.pe_direito_padrao_m`.
   - Tipo `numeric(5,2)`, anuláveis, faixa 2–15 m (a mesma do bloco de massa).
   - Só colunas novas; nenhuma linha muda.
   - Aplicar **antes** do deploy: o front passa a selecionar as colunas, e sem elas a lista de torres falharia.
2. **Empreendimento › Torres e Unidades:**
   - Pavimentos: coluna e campo "Pé-direito (m)", com o padrão da torre como placeholder. A tabela marca "(torre)"
     quando o valor vem da torre.
   - Torre: "Pé-direito padrão (m)" na criação, na edição e no subtítulo do card.
   - `lerPeDireito` aceita vírgula ou ponto e recusa o que estiver fora de 2–15 m.
3. **Planta:**
   - `estruturaDaTorre`: cada piso traz `peDireitoMm` (o do pavimento, senão o da torre, senão null).
   - `comandosDoAjuste` / `vestirBlocosPropostos` montam a pilha por trechos de mesma altura:
     - a torre casada é o trecho de cima, e os de baixo viram "`<torre> · <1º pavimento do trecho>`";
     - as garagens fazem o mesmo para baixo, com "`<torre> · Garagem`" no trecho mais raso;
     - o piso sem pé-direito usa o do bloco;
     - bloco que sobrou da pilha (as alturas mudaram) fica, com aviso, e nunca é apagado.
   - Painel do bloco: a altura das torres pelo Empreendimento ("4 pavimento(s) (13,50 m)").

## Verificação

- Testes:
  - `blueprintEstruturaDaTorre` (+2);
  - `blueprintAjusteAoEmpreendimento` (+5: pilha, idempotência, uniforme, sobra, Gerar massa);
  - `components/FloorEditorPeDireito` (3);
  - painel do bloco.
- tsc, check-ui-standard, `migrationsPrefixo`, `BlueprintEditor.test.tsx` sozinho; CI.
- Produção: a migration é aplicada só com "autorizado" do usuário, conferida no banco, antes do merge. Depois,
  conferir no Chrome a aba Torres e Unidades do Garden com o campo novo.
