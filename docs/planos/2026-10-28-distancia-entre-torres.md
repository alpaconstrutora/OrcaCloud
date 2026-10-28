# Distância entre torres: Empreendimento → Planta Inteligente (28/10/2026)

## Pedido original

> "quando um empreendimento tem mais de uma torre a distancia entre torres devem ser informada.
> implemente campo com esse objetivo em incorporacao > empreendimento > aba torres e unidades. Essa informacao deve
> ser considerada em incorporacao > planta inteligente"

## Decisões do usuário

- **Campo:** **uma distância por par de torres**. Também foi oferecida uma distância mínima única.
- **Na Planta**, as três opções foram marcadas:
  - o **Gerar massa usa** a distância;
  - a **conferência avisa** em vermelho;
  - o **"Ajustar ao Empreendimento" afasta** as torres.

## Antes

- A Planta só tinha a hipótese "Entre blocos (m)" do Gerar massa: 6 m, digitada à mão, sem vir do empreendimento.
- Os blocos desenhados nunca eram conferidos quanto à distância entre eles, só quanto à sobreposição.

## Mudança

1. **Banco:** `empreendimentos.distancias_entre_torres jsonb NOT NULL DEFAULT '[]'`, com CHECK de lista
   (migration `aplicar_20271028500000`).
   - Guarda `{ torre_a, torre_b, distancia_m }`, com o par em ordem.
   - O RLS de `empreendimentos` já cobre a coluna.
2. **`utils/empreendimentoDistanciasEntreTorres.ts`** (puro):
   - `paresDeTorres` (sem quadras);
   - `lerDistancias` (sanitiza o jsonb e ignora o par de torre apagada);
   - `distanciaDoPar`, `comDistancia`;
   - `lerDistanciaDigitada` (0 < m ≤ 500).
3. **Torres e Unidades:** com 2 torres ou mais, o bloco Torres ganha "Distância entre torres".
   - Há um campo por par ("Torre A ↔ Torre B (m)") e o botão "Salvar distâncias".
   - Salvar grava só os pares das torres de agora.
4. **`utils/blueprintDistanciaEntreTorres.ts`** (puro):
   - `distanciaEntrePoligonosMm`: contorno a contorno; sobreposto ou encostado = 0;
   - `afastamentoNecessario`: na direção de um centro ao outro, por busca binária;
   - `transladar`.
5. **Ajuste** (`comandosDoAjuste` e `vestirBlocosPropostos`, novo parâmetro `exigencias`):
   - `distancias` traz a conferência de cada par, medida nos blocos como estão desenhados;
   - a torre **de trás** (a segunda na ordem da aba) é afastada com a pilha inteira: térreo empilhado e garagens;
   - a linha da torre passa a "AJUSTAR";
   - aviso: "Torre B afastada 4,00 m da Torre A para ficar a 10,00 m — confira se ainda cabe no envelope";
   - o motor da massa remede, e a torre que sair do envelope fica vermelha lá.
6. **Painel do bloco:** mostra "Distância à Torre B: 6,00 m — o Empreendimento pede 10,00 m" em vermelho, ou em
   verde quando cumpre.
7. **Gerar massa:**
   - `massaDoEmpreendimento` passa a **maior** distância informada entre as torres próprias. O gerador põe a mesma
     folga entre todos os blocos.
   - Ela entra em `restricoes.doEmpreendimento.afastamentoEntreBlocosM` e vale no lugar da hipótese.
   - Avisos:
     - quando as distâncias são diferentes, avisa que vale a maior;
     - quando só parte dos pares foi informada, avisa os que faltam;
     - nenhum aviso quando o empreendimento nunca usou o campo.
   - A decisão aparece no resultado. Seguindo o empreendimento, o campo "Entre blocos" mostra o valor dele, só
     leitura, com a dica.

## Verificação

- **Testes:**
  - `empreendimentoDistanciasEntreTorres` (6);
  - `blueprintDistanciaEntreTorres` (6);
  - ajuste (+3): conferir, afastar com a pilha, já cumprido;
  - `blueprintMassaDoEmpreendimento` (+3);
  - gerador (+1): decisão e blocos a 12 m;
  - painel (+1);
  - `TowerEditor` (+2): salvar e uma torre só.
- **Mecânicas:** tsc; check-ui-standard; `BlueprintEditor.test.tsx` sozinho.
- **Banco:**
  - ensaio da migration num bloco que desfaz: OK, 19 empreendimentos com `[]`;
  - aplicar com autorização **antes** do deploy, porque o front seleciona a coluna (`EMPREENDIMENTO_COLS`).
