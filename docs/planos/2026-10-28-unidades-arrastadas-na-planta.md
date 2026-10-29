# Unidades na planta baixa e a 3ª forma de arrumar: arrastadas na planta (28/10/2026)

## Pedidos originais

> "1. Mostrar também na planta o posicionamento das unidades
> 2. Implemente uma terceira forma de posicionar as unidades alem das setas e das posicão. Essa terceira forma seria
> clicar segurar a arrastar para posicao deseja na planta"

O pedido veio com um print da planta 2D ao lado do 3D. Na 2D, o nome "Torre B · Garagem" estava encavalado no
nome da torre.

**Decisões do usuário:**
- **Qual pavimento a planta 2D mostra:** o escolhido no painel. Sem escolha, o 1º acima do térreo.
- **Onde arrastar:** na planta 2D.
- **Alcance:** "os dois". Quem arrasta escolhe entre o pavimento e a coluna inteira.
- **Onde gravar:** no Empreendimento.

## Mudança

1. **Banco** (`aplicar_20271029900000_unidades_vaga_arrastada_na_planta.sql`, aplicado em 28/10/2026):
   - `empreendimento_towers.ordem_das_unidades_na_planta` passa a aceitar `ARRASTO`.
   - `empreendimento_units.vaga_na_planta` é um smallint de 0 a 999, null quando não há vaga.
   - Ensaio desfeito: 9 torres, 87 unidades, nenhuma vaga preenchida.
2. **Puro:**
   - `arranjarAndar(anel, pesos, arrumação)` é a função única. Devolve as fatias e a **vaga de cada unidade**, e
     `fatiasPorArea`/`fatiasPorDirecao` viraram atalhos dela.
   - A vaga é numerada de 0 a n−1: a 1ª fileira ao longo do lado maior, depois a 2ª.
   - Novo modo `ARRASTO`: cada unidade vai para a vaga gravada. Vaga repetida ou fora do andar fica com a que sobrar.
     Andar nunca arrastado segue a posição.
   - `utils/blueprintArrastoDasUnidades.ts`:
     - `trocarVagas`: soltar A sobre B troca as duas.
     - `gravacoesDoArrasto`: o andar inteiro grava a vaga em que aparece; na COLUNA, os andares com as mesmas
       unidades (mesmo número e mesmos finais) copiam a vaga de cada final.
     - `finalDaUnidade`: 107 vira "07".
3. **Planta 2D (`BlueprintCanvas`):**
   - Camada `unidadesNaPlanta`: as fatias do pavimento mostrado, com o nome de cada unidade e o pavimento acima do
     bloco.
   - Apertar sobre uma fatia e soltar sobre outra do mesmo bloco chama `onArrastarUnidade`. A origem fica em âmbar e
     o alvo em azul.
   - Clicar sem arrastar seleciona o bloco e a unidade.
   - **Nome dos blocos:**
     - O subsolo com o mesmo contorno da torre escreve o nome **sob** o contorno. Antes, saía encavalado.
     - O bloco que mostra as unidades escreve o nome **acima** do contorno.
4. **Editor:**
   - `arranjoDoPiso` é a fonte única para o 3D, a 2D e o arrasto.
   - Item "Unidades na planta" no Exibir da planta, ligado por padrão. Desligar devolve o arrastar por dentro para
     mover o bloco.
   - Ao soltar, grava `vaga_na_planta` de cada unidade que muda. A torre passa a `ARRASTO`, e quem olhava por outra
     arrumação volta para "Do Empreendimento".
   - Depois de gravar, relê as unidades. O resultado aparece no painel do bloco.
5. **Painel do bloco:**
   - 4ª opção, "Arrastado na planta".
   - "Arrastar na planta vale para: [Este pavimento] [A coluna inteira]", lembrado por navegador.
   - Mensagem com o que a troca fez.
6. **Torres e Unidades › Unidades:** 3ª opção da torre, "Arrastado na planta".

## Verificação

- **Testes:**
  - `blueprintArrastoDasUnidades`: 10.
  - `BlueprintCanvasArrastoDeUnidade`: 4 (troca, solto no lugar ou fora, clique, Exibir desligado).
  - Painel +1 e UnitEditor +1.
  - Suítes vizinhas: 201/201.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc; check-ui-standard.
