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

## Seguimento: mensagem de elevação incorreta (27/10/2026)

> "investigue essa mensagem que está incorreta: Torre \"Torre A\": Estacionamento 1 está em -3,30 m (digitada) — o
> Pavimento Térreo ficaria com -3,00 m de altura, fora de 2 a 15 m; a massa usa o pé-direito."

**Causa (banco):** o cadastro da Torre A tinha Estacionamento 1/2 nos andares **1 e 2** e os tipos em **100/200/300**.
As elevações digitadas estavam certas: -6,30, -3,30, -0,30, +2,70…

A estrutura ordena pelo andar. O Estacionamento 1 caía logo acima do térreo, e a "altura" do térreo saía
-3,30 − (-0,30) = -3,00 m.

**Mudança:**

- Digitada abaixo do de baixo (ou acima do de cima, no subsolo) agora gera outro aviso:
  "… está em -3,30 m (digitada), abaixo do Pavimento Térreo (-0,30 m), mas o andar dele (1) o põe acima — confira o
  Nº inicial". Não é mais uma altura negativa.
- **Conferência do cadastro**, com as unidades da torre:
  - garagem/subsolo com andar ≥ 0;
  - andares das unidades sem pavimento junto com pavimentos sem unidade ("o andar é 1, não 101").
- **Pavimentos** mostra todos os avisos do cadastro. O FloorEditor recebe as unidades, e uma dica diz o que é o
  Nº inicial.
