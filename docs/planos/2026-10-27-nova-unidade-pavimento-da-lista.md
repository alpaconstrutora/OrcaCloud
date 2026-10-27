# Nova unidade: Pavimento da lista + seções separadas na torre (27/10/2026)

## Pedido original

> "1. ao clicar na gaveta nova unidade, o campo Pavimento deve listar os pavimento criados na secão pavimentos
> 2. Separar cada seção para melhorar a organizacao"

Decisão do usuário sobre o item 2: **blocos separados**. Pavimentos e Unidades continuam um abaixo do outro, cada um
no seu quadro com borda. Foram oferecidas também abas e seções recolhíveis.

## Mudança

1. **`andaresDoCadastro(pavimentos)`** (`utils/blueprintEstruturaDaTorre`, exportada):
   - expande o cadastro de pavimentos em andares ("Tipo 1", "Tipo 2"…), de baixo para cima;
   - cada andar traz o pavimento de onde veio (`floorId`);
   - é a mesma expansão da massa da Planta (`doCadastro` passa a usá-la), uma fonte só.
2. **Campo "Pavimento" da gaveta Nova unidade** (`UnitFormFields`):
   - **Com pavimentos cadastrados:** o campo vira lista ("Tipo 2 — andar 2"). Escolher grava o andar, o tipo de
     pavimento e o vínculo `floor_id`. O andar que a unidade já tem fora do cadastro continua na lista.
   - **Sem cadastro:** continua o número digitado. Digitar à mão desfaz o vínculo, para o andar não ficar ligado a um
     pavimento que já não é o dele.
   - **Vínculo:** `floor_id` vai e volta do registro (`unitFormFromRecord`/`unitFormToPayload`), então editar não o
     apaga. Em Características, trocar a torre limpa o vínculo.
3. **Card da torre** (`TowerEditor`): Pavimentos e Unidades em blocos separados (`section` com borda, espaço entre
   eles).

## Verificação

- **Testes:** `UnitFormFieldsPavimento` (5) cobre:
  - a expansão;
  - a lista;
  - o andar fora do cadastro;
  - sem cadastro;
  - o vínculo de ida e volta.
- **Suítes vizinhas:** UnitEditor, FloorEditor, TowerEditor, Características, estrutura, ajuste.
- **Mecânicas:** tsc; check-ui-standard.
