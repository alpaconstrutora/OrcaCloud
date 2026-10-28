# Ordem das unidades na Planta: pelas setas ou pela posição (28/10/2026)

## Pedido original

> "implemente opcao de ordenação de duas maneiras pelas setas ou pela posição. O Usuário escolhe."

**Decisão do usuário:** "Nos dois".
- O Empreendimento define o padrão.
- A Planta deixa cada usuário trocar só para a própria visualização.

## Antes

- A escolha já existia, mas só no painel do pavimento da Planta, como preferência do usuário.
- Os nomes eram "Automática", que usava a Posição/Orientação e, sem elas, o número, e "Ordem do Empreendimento", que
  usava as setas.
- O Empreendimento não tinha onde escolher.

## Mudança

1. **Banco** (`aplicar_20271029700000_torre_ordem_das_unidades_na_planta.sql`, aplicado em 28/10/2026):
   - Coluna nova `empreendimento_towers.ordem_das_unidades_na_planta`, com valores `POSICAO | SETAS`.
   - Padrão `POSICAO`, que é o que a Planta já fazia, então nenhuma planta muda.
   - A escolha é **por torre**: fica ao lado das setas, e a Planta casa cada bloco com a sua torre.
2. **Torres e Unidades › Unidades** (`UnitEditor`):
   - Linha "Na Planta Inteligente, arrumar as unidades: [Pela posição] [Pelas setas]", com o que cada opção faz.
   - Grava na hora e volta à escolha anterior se der erro.
   - O `TowerEditor` atualiza a lista de torres sem recarregar (§22).
   - A cópia do empreendimento leva a escolha junto.
3. **Planta:**
   - A preferência `vista3dUnidadesNoPavimento` ganha "Do Empreendimento" (`DO_EMPREENDIMENTO`) como **padrão**.
     As outras opções passam a se chamar "Pela posição" (`AUTOMATICA`) e "Pelas setas" (`EMPREENDIMENTO`). Os
     valores internos ficam, e não havia preferência gravada no banco.
   - `arrumacaoEfetiva(escolha, daTorre)`: com "Do Empreendimento", vale a escolha da torre do bloco
     (`PapelDoBloco.ordemDasUnidades`, que vem de `estruturaDaTorre`). Com as outras duas, vale a do usuário.
   - O painel do pavimento mostra as três opções.
     - Em "Do Empreendimento", diz o que a torre usa.
     - Nas outras duas, avisa que a escolha vale só para quem está olhando e diz o que a torre usa.

## Verificação

- **Testes:**
  - `arrumacaoEfetiva`: +2.
  - `estruturaDaTorre`: +1.
  - Painel: o teste antigo foi atualizado e há +1.
  - `UnitEditorOrdemDoPavimento`: +2 (gravar e erro).
  - Suítes vizinhas: 144/144.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard nos quatro componentes.
- **Banco:**
  - Ensaio desfeito: 9 torres, todas `POSICAO`.
  - Aplicação, com a coluna conferida por REST (200).
