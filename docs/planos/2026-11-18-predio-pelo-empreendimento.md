# Prédio pelo Empreendimento — o Garden Cambuhy pela Casa automática

## Pedido original

Sessão `b02810da-30fe-4c33-bb68-3d1c2d04877f` (Claude Code, VS Code) · 18/11/2026, depois da PA23 do prédio automático.

> acabei de gerar a Casa automática do empreendimento garden e continua gerado somente uma unidade e nao o pavimento / predio

Diagnóstico mostrado ao usuário (lido no `origin/main` 18e8948 e no banco, só leitura):
- **O Garden é prédio.** "011 - Garden Cambuhy" tem Torre A e Torre B, com 43 unidades.
- **A Casa automática gera uma casa.** "Construir pelo Empreendimento" monta o programa de uma casa com **uma** unidade.
- **O Prédio automático não está no caminho.** Ele só abre pelo painel de um bloco do estudo de massa, e o estudo "Garden" não tem bloco.

> antes de continuar, quero perguntar. o predio automatica foi o pedido que fiz e gerou o ultimo plano de implementacao que por algum motivo se desvirtuou completamente. o que aconteceu?

Resposta: o plano de 12/11 (`docs/planos/2026-11-12-predio-automatico.md`) nasceu da pergunta sobre o Garden, mas tomou três rumos errados:
- fez uma ferramenta pelo bloco da massa, com o produto do estudo;
- validou tudo em prédios de laboratório (R4/R8/R12/RL);
- nunca ligou o Empreendimento nem a Casa automática.

As PA11–PA23 poliram a compatibilização desses prédios de laboratório. A memória `feedback_pedido_de_caso_real_validar_no_caso_real` registra a lição.

> sim. Faça um plano

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 18/11/2026 | Como chegar ao prédio a partir do Empreendimento? | **Prédio pelo Empreendimento**: na Casa automática, empreendimento com torres de vários andares vira o caminho do prédio. Ele cria o bloco de cada torre pelo Empreendimento e abre o Prédio automático, uma torre por vez. Torre sem andares na ficha pede o número. |
| 18/11/2026 | Para dividir cada andar em apartamentos, o que vale? | **Unidades do Empreendimento**: as unidades por andar e a área de Torres & Unidades; as tipologias da ficha quando houver. |
| 18/11/2026 | Andares de apartamento abaixo da rua (Torre B: −1 e −2) | **A torre começa no −2.** Os 6 andares de apartamento (−2 a 3) são o pavimento tipo e suas cópias, e a garagem fica abaixo (−3, −4). O desnível vira pendência para o projetista: contenção, fachadas enterradas, ventilação e luz dos apartamentos de baixo. |
| 18/11/2026 | O térreo com apartamentos (Torre A: 2 e área comum; Torre B: 4) | **Apartamentos + condomínio.** O térreo recebe os apartamentos da ficha e o condomínio no que sobra, com o hall junto do núcleo. Térreo cheio de apartamentos, como o da Torre B, manda medição, bombas e reservatório para a garagem, com pendência. |
| 18/11/2026 | A área das unidades não cabe no contorno gravado da torre (13,5 × 26 m, de uma massa estimada) — manter o bloco e dividir na proporção? | **"Use a planta Teste 01 como referencia."** A "Teste 01" (`5c97c3e1…`, org da SPE) é o lote real do Garden pela ficha — trapézio de 18 m de frente, 21 m de fundos e 63,03 m de lateral, sem bloco. Leitura: o contorno estimado deixa de ser a referência; as torres nascem **nesse lote**, dimensionadas pelas unidades do andar tipo (PE1), e a conferência no app parte de uma cópia descartável dela. |
| 18/11/2026 | O plano captura o que você quer? | **"sim"** |
| 18/11/2026 | Como executar? | **"Nativo"** — eu implemento fase a fase nesta sessão, com um revisor independente no fim de cada fase. |
| 18/11/2026 | O térreo da Torre A (2 apartamentos + área comum): o kernel só copia o andar inteiro do tipo, e o Prédio automático põe medição, bombas, reservatório e o desvio no nível do térreo | **"Técnico na garagem"**:
- o térreo nasce como cópia do tipo, desvinculada, sem os apartamentos que ele não tem;
- o espaço deles vira hall de entrada e área comum;
- medição, bombas e reservatório vão para a garagem mais alta (−1), o mesmo mecanismo da Torre B;
- sem mudar o kernel.

Desvia da decisão "condomínio no que sobra" só na parte técnica. |

## O caso real (banco, 18/11/2026, só leitura)

**Empreendimento** `f3c21233…` "011 - Garden Cambuhy", org "Construção do Edifício Garden Cambuhy SPE":
- ligado ao estudo "Garden" (`6c68b831…`, sem bloco, salvo pela última vez em 26/10);
- a obra é `ddcdbec3…`;
- o lote da ficha tem 18 m de frente, 21 m de fundos, 63,05 m de laterais e 1.229 m²;
- a distância entre as torres é **0**: são coladas.

| Torre | Andar | Tipo (cadastro) | Elevação | Unidades |
|---|---|---|---|---|
| A | −2, −1 | GARAGEM | −6,30 / −3,30 | 1 "Estacionamento" cada |
| A | 0 | TERREO | −0,30 | 002 Tipo 4 (127 m², 3 dorm., frente) · 004 Tipo 1 (81 m², 2 dorm., lateral) · "Área Comum Horizontal" (sem área) |
| A | 1, 2, 3 | TIPO | 2,70 / 5,70 / 8,70 | 4: Tipo 1 e Tipo 2 (81 m², 2 dorm., lateral) · Tipo 3 e Tipo 4 (127 m², 3 dorm., frente) |
| B | −4, −3 | GARAGEM | −12,30 / −9,30 | 1 cada |
| B | −2, −1, 0, 1, 2, 3 | TIPO (o 0 é TERREO) | −6,30 … 8,70 | 4 por andar, sem tipologia: 104 (lateral), 108 (lateral), 113 (fundos, sem dorm.), 111 (fundos) m² |

**O que é preciso tratar no Garden:**
- **O ajuste de hoje e a Torre B.** O ajuste da massa (`comandosDoAjuste`) põe os andares −1 e −2 da Torre B dentro do bloco "Torre B · Garagem". Ele conta os andares de baixo como subsolo, não como andares da torre.
- **A Torre A sem cadastro de andares.** Ela tem `floors_count` e `units_per_floor` nulos na torre, mas tem o cadastro de pavimentos e as unidades.
- **O contorno não cabe as unidades.** O contorno gravado nas torres (`contorno_na_planta`) tem 13,5 × 26 m (351 m²) e veio de uma massa estimada, no estudo "Planta 26/10/2026". O andar tipo pede 416 m² privativos (A) e 436 m² (B), sem circulação nem núcleo. A ficha pode estar contando as vagas na área privativa (127 m² com 2 vagas).

## O que já existe (verificado no `origin/main` 18e8948)

- **Casa pelo Empreendimento** (plano `2026-10-25-planta-construir-pelo-empreendimento.md`):
  - `utils/blueprintCasaPeloEmpreendimento.ts` (`passosDaCasaPeloEmpreendimento`) e o botão "Construir pelo Empreendimento" em `TelaCasaAutomatica.tsx`;
  - lote pela ficha (`comandosDoLote`), zona e uma unidade no programa;
  - o Produto pelas unidades (`utils/blueprintProdutoDoEmpreendimento.ts`).
- **As torres na massa** (27–28/10):
  - `utils/blueprintEstruturaDaTorre.ts`: `estruturasDoEmpreendimento`, com `acima`, `garagens` e as **unidades de cada andar** (`PisoDaTorre.unidades`);
  - `utils/blueprintAjusteAoEmpreendimento.ts`: `comandosDoAjuste` cria e acerta os blocos "Torre X" e "Torre X · Garagem";
  - o 3D divide cada pavimento nas unidades.
- **O vínculo estudo ↔ Empreendimento.** Vale `empreendimentos.blueprint_study_id`; sem ele, a obra do estudo (`blueprint_studies.project_id`) sugere o Empreendimento (`BlueprintEditor.tsx` ~3206).
- **O Prédio automático** (PA0–PA23):
  - entrada em `utils/predioAutomatico/orquestrador.ts` (`EntradaDoPredio`, `motivoParaNaoGerarPredio`);
  - divide o tipo pelo produto (`doBloco` de `distribuirProduto`);
  - o térreo é só condomínio (`terreoECobertura.ts`) e o desvio do esgoto corre no forro do térreo (`esgoto.ts`);
  - o envio ao Empreendimento (`services/sync/massaAdapter.ts`, `torreDoPredio`) **cria** unidades com `blueprint_massa_chave`;
  - a cópia viva pode ser desvinculada (`SetLevelProps` com `tipoDeId: null`).

## Restrições de todo o plano

- **Português** em código, textos e PR.
- **O pronto de cada fase é o Garden.** Quando a fase toca o caminho do usuário, a conferência é pela Casa automática (lição de 18/11). Os marcos de laboratório só protegem o que já existe.
- **Marcos de laboratório idênticos.** O marco dos prédios (`__tests__/predioAutomaticoMarco.test.ts`, R4/R8/R12/RL) e o da casa (`__tests__/casaAutomaticaMarco.test.ts`) ficam iguais: eles não usam o Empreendimento. Toda regravação é justificada no PR.
- **O Empreendimento nunca é gravado** nas conferências: sem "Enviar ao Empreendimento" e sem editar a ficha. A conferência no app usa um **estudo descartável** na org da SPE:
  - com as divisas da "Teste 01" (copiadas; a "Teste 01" não é tocada);
  - com `project_id` = a obra do Garden, para o Empreendimento ser sugerido pela obra sem mexer em `blueprint_study_id`.

  O estudo é arquivado no fim. Para usar o botão na própria "Teste 01", ela precisa estar ligada ao Garden: hoje não está (`project_id` nulo, e o Empreendimento aponta para o estudo "Garden").
- **"Lançar" continua manual.** Construir gera a prévia.
- **Regras do projeto valem:**
  - REGRA #5: a organização é a do estudo, nunca uma prop;
  - `scripts/check-ui-standard.sh` nos `.tsx` tocados;
  - campos h-9;
  - botão desligado sempre diz o motivo;
  - nunca `supabase db push`.
- **Publicação:** uma branch e um PR por fase, CI verde, eu faço o merge, depois `scripts/conferir-producao.sh` e a CI do main.

## Foco da revisão (o que nenhuma fase cobre sozinha e mais pode morder)

1. **Torre sem cadastro de andares** (só unidades, ou só `floors_count × units_per_floor`): os papéis dos andares saem mesmo assim. Fica a fonte no aviso. Teste na PE1.
2. **Unidade sem área** ("Área Comum Horizontal") **ou sem dormitórios** (o 113 m² da Torre B):
   - área comum não é apartamento e vira condomínio;
   - apartamento sem área toma a média do andar, com aviso.

   Teste na PE1/PE2.
3. **Unidade criada pela própria massa** (`blueprint_massa_chave`) ou lote do loteamento: fica fora, como no `produtoDoEmpreendimento`. Teste na PE1.
4. **Empreendimento de casas ou loteamento:** continua no caminho da casa, sem regressão do "Construir pelo Empreendimento" de casa. Teste na PE3.
5. **Construir de novo** com os blocos já ajustados ou o tipo já montado: não duplica bloco e diz por que não gera. Teste na PE3.

## Plano

Ordem pensada para o caminho do usuário aparecer cedo:
- **PE3:** o Garden pela Casa automática, com o tipo da Torre A;
- **PE4 a PE6:** completam o térreo e a Torre B;
- **PE7:** as duas torres juntas.

### PE0 — Marco do Garden (o caso real como teste)
**O que muda.** Entra a fixture `__tests__/fixtures/empreendimentoGarden.json`, um retrato só leitura do banco em 18/11:
- as duas torres (cadastro de pavimentos, unidades, contorno);
- a ficha do lote e a distância entre as torres;
- as divisas da planta "Teste 01" (o lote de referência).

Entra também `__tests__/predioPeloEmpreendimento.test.ts`, com o teste do sintoma: "o Garden é PRÉDIO pelo Empreendimento". Hoje ele fica **vermelho**, porque os passos da casa tratam o Garden como casa.

**Pronto quando.** O teste roda e falha pelo motivo certo, e a fixture é lida pelas funções que já existem (`estruturasDoEmpreendimento`, `comandosDoAjuste`), com os números da tabela acima.

### PE1 — A torre pelo Empreendimento: os andares e a massa
**O que muda.**
- **`utils/blueprintEstruturaDaTorre.ts`:**
  - os andares da torre começam no **andar de apartamento mais baixo**: `tipo` ≠ GARAGEM, com unidade, contíguo até o 0. `acima` passa a significar "os andares da torre" (doc atualizada); `garagens` fica com o resto de baixo;
  - novo campo `abaixoDaRua: number` (quantos andares da torre ficam abaixo do 0).
- **`utils/blueprintAjusteAoEmpreendimento.ts`:** o bloco da torre nasce na elevação do andar mais baixo dela, e o da garagem logo abaixo.
- **As torres no lote, sem bloco desenhado** (decisão "Teste 01"): `blocosDasTorresNoLote(lote: Point[], frente, estruturas, distancias, recuos): { blocos: AddBloco[]; avisos: string[] }`:
  - hoje o ajuste só avisa "desenhe o bloco ou gere a massa", e o "Gerar massa" dimensiona pelo lote, não pelas unidades;
  - cada torre ganha um retângulo com a largura útil do lote (a frente menos os recuos da zona aplicada; sem zona, recuo zero e aviso) e a profundidade = a área necessária do andar tipo ÷ a largura;
  - a área necessária é a de `pegadaDaTorre`: os privativos mais núcleo e circulação;
  - as torres ficam na ordem da ficha a partir da frente, com a distância entre elas (0 no Garden: coladas);
  - o que passa do fundo do lote vira aviso com os números, e a torre não é encolhida.
- **`utils/predioAutomatico/andaresDoEmpreendimento.ts` (novo, puro):**
  - `papelDosAndares(estrutura: EstruturaDaTorre): AndarDoEmpreendimento[]`, com `{ numero, nome, elevacaoMm, papel: 'GARAGEM' | 'TIPO' | 'COPIA' | 'PROPRIO', unidades: UnidadeDoPiso[], comuns: UnidadeDoPiso[] }`;
  - a **assinatura** do andar é o número de apartamentos, as áreas em ordem e as tipologias;
  - TIPO é o andar mais baixo com a assinatura mais frequente; COPIA, os outros com a mesma assinatura; PROPRIO, os que diferem;
  - `comuns` são as "unidades" sem área de apartamento, como a "Área Comum Horizontal".
- **`pegadaDaTorre(andar: AndarDoEmpreendimento, bloco: Bloco, hip): { necessariaM2: number; disponivelM2: number; cabe: boolean }`:** soma os privativos com o núcleo e a circulação das hipóteses do pavimento tipo. Quando não cabe, vira aviso no painel do bloco com os dois números.
- **Consumidores conferidos:** `blueprintMassaDoEmpreendimento.ts`, `espelhoDeVendas3d.ts` (concatena garagens + acima e não muda) e `PainelBlocoSelecionado.tsx` (as contagens).

**Pronto quando** (teste com a fixture do Garden):
- **Papéis da Torre A:** −2 e −1 GARAGEM · 0 PROPRIO (2 apartamentos, 1 comum) · 1 TIPO · 2 e 3 COPIA.
- **Papéis da Torre B:** −4 e −3 GARAGEM · −2 TIPO · −1, 0, 1, 2 e 3 COPIA.
- **Ajuste da Torre B:** bloco "Torre B" com 6 pavimentos a −6.300 mm e "Torre B · Garagem" com 2 pavimentos a −12.300 mm.
- **Pegada:** no contorno estimado de 13,5 × 26 m, a da Torre A não cabe (416 m² privativos + circulação × 351 m²) e o aviso traz os números.
- **No lote da Teste 01:**
  - as duas torres nascem com área ≥ a necessária, coladas, a Torre A na frente;
  - os retângulos ficam dentro do lote, ou sai o aviso de quanto passam do fundo.
- **Regressão:** os testes do ajuste, do 3D e do espelho que já existem passam, e os marcos de laboratório ficam idênticos.
- **Foco da revisão:** itens 1, 2 e 3.

**Execução da PE0 + PE1 (18/11/2026, um PR só).** Um teste vermelho de propósito não passa na CI. Por isso a PE0 foi vista vermelha aqui e sai junto com a PE1, que a deixa verde:
- **Vermelho:** a Torre B saía com os andares 0 a 3, e o −1 e o −2 iam para a garagem.

Desvios do texto da fase:
- **Cotas relativas ao térreo:** o ajuste põe o andar 0 na cota 0, então o bloco da Torre B fica a −6,00 m (não −6,30), e a garagem a −12,00 m. O cadastro diz −6,30 para o −2 e −0,30 para o 0, a mesma diferença.
- **`papelDosAndares` devolve `{ andares, avisos }`.**
- **`pegadaDaTorre(tipo, pavimentos, hipótesesDoProduto, contorno | null)`:** a área bruta é a conta do Produto ao contrário, bruta = (privativos ÷ (1 − circulação) + núcleo) ÷ (1 − paredes). Na Torre A dá ~507 m².
- **Origem externa da unidade:** `UnidadeDoPiso.origemExterna` ('MASSA' | 'LOTE') marca a unidade que nasceu da massa e o lote do loteamento, que ficam fora.
- **Ids das divisas na fixture:** a fixture ganhou os ids das divisas da "Teste 01". O banco os guarda à parte (`identity`), e o contorno do lote anda pelo id.
- **O aviso da pegada sai do `comandosDoAjuste`:** ele já alimenta o painel do bloco, e o editor passa as hipóteses do produto do estudo.

Resultado no Garden (`__tests__/predioPeloEmpreendimento.test.ts`, 12 testes):
- **Torre A:** −2 e −1 garagem · 0 próprio (2 apartamentos + área comum) · 1 tipo · 2 e 3 cópias.
- **Torre B:** −4 e −3 garagem · −2 tipo · −1 a 3 cópias.
- **Ajuste:** bloco "Torre B" com 6 pavimentos a −6,00 m e garagem com 2 a −12,00 m; ajustar de novo não muda nada.
- **Pegada:** a Torre A não cabe no contorno estimado (~507 × 351 m², avisado).
- **No lote da Teste 01:** as torres nascem coladas na largura de 18 m, a A na frente (~28,2 m) e a B atrás (~29,7 m), dentro dos 63 m; o lote raso avisa quanto passa do fundo.
- **Regressão:** as suítes do ajuste, da estrutura, da massa, do painel do bloco e do espelho 3D seguem verdes (14 arquivos, 201 testes); `tsc` limpo.

### PE2 — O tipo com as unidades do Empreendimento
**O que muda.**
- **`EntradaDoPredio`** ganha `doEmpreendimento?: { torreId: string; andares: AndarDoEmpreendimento[] } | null`. Presente, ela manda:
  - o tipo é dividido nas unidades do andar TIPO, uma fatia por apartamento, na proporção das áreas da ficha;
  - os apartamentos FRENTE ficam nas fatias da fachada da rua, os FUNDOS nos fundos e os LATERAL nos lados;
  - o produto do estudo não entra;
  - `motivoParaNaoGerarPredio` deixa de pedir o produto.
- **Os nomes vêm da ficha.** A unidade da planta em cada andar leva o nome dela (101–104, 201–204…; na Torre B, SS205…), e não o número derivado.
- **O envio ao Empreendimento casa com as unidades que já existem** (`massaAdapter.ts`): pelo andar e pela unidade do tipo, ele **atualiza**, sem criar unidade com `blueprint_massa_chave`.

**Pronto quando** (teste com a fixture; prévia do Garden, sem Lançar):
- **Torre A:** o tipo tem 4 apartamentos com as áreas na proporção 81 : 81 : 127 : 127 (±5 %), os dois de 127 m² na fachada da rua e os nomes 101–104, 201–204 e 301–304 nos andares.
- **Torre B:** 4 apartamentos na proporção 104 : 108 : 113 : 111.
- **Envio:** o "envio" calculado (sem gravar) para a Torre A dá **0 unidades novas** e 12 atualizadas.
- **Marcos de laboratório:** idênticos.
- **Foco da revisão:** item 2.

**Execução da PE2a (18/11/2026).** A PE2 foi dividida em duas partes:
- **PE2a:** o motor com as unidades da ficha, feita.
- **PE2b:** o envio ao Empreendimento casando com as unidades que já existem, a fazer.

Feito na PE2a:
- **`produtoDoAndarTipo`:** uma tipologia por apartamento, com a área e os dormitórios da ficha; sem dormitórios, pela área.
- **`dividirPeloEmpreendimento`:**
  - divide e encaixa cada apartamento pela posição e refaz a divisão nessa ordem;
  - **"Frente" é a fatia que encosta na fachada da rua.** No bloco do Garden (18 × 28 m) o corredor corre da frente ao fundo e a divisão marca toda fatia como LATERAL; os de 127 m² são os que pegam a frente;
  - "lateral" serve em qualquer fatia que não seja a da frente;
  - cada unidade leva o nome da ficha.
- **`EntradaDoPredio.doEmpreendimento`:** quando presente, divide o tipo e faz as plantas pelo produto do andar; `motivoParaNaoGerarPredio` deixa de pedir o produto.

**Os nomes nos andares.**
- **Torre A:** o tipo leva 101–104 da ficha, e as cópias derivam 201… e 301…, que batem com a ficha.
- **Torre B:** o kernel deriva o número da cópia pelo andar ("T05"…), e não SS205 ou TR05. Fica pendência; a PE2b casa pelo andar e pela posição.

**Resultado** (`__tests__/predioPeloEmpreendimento.test.ts`, 17 testes):
- **Torre A:** 4 apartamentos na proporção da ficha (±5 %), os de 127 m² na fachada da rua, os de 81 m² não, 101–104 e nenhum aviso.
- **Torre B:** proporção 104 : 108 : 113 : 111.
- **Prédio automático da Torre A** no lote da Teste 01, sem produto: 4 unidades por andar, 101–104, 4 plantas.
- **Prévia velha:** a assinatura do pedido muda com as unidades.

Marcos de laboratório (prédio e casa) idênticos; suítes do prédio, da divisão e do ajuste verdes (6 arquivos, 129 testes); `tsc` limpo.

**Execução da PE2b (18/11/2026).** O planejador do sync (`services/sync/planner.ts`) já **adota** a torre e as unidades existentes pelo nome quando elas não têm vínculo; o envio da Torre A manda "Torre A" e 101–304. Teste novo, de caracterização (passou sem mudar código):
- **O que ele faz:** gera o prédio da Torre A pela ficha, envia (`ladoDaMassa` com o produto que o editor preenche pelas unidades) e planeja contra as 43 unidades reais do Garden.
- **Resultado:** 0 torres novas, 0 unidades novas; a Torre A e os 12 apartamentos (101–304) adotados.
- **Torre B:** as cópias dela teriam números derivados ("T05"…), que não batem com a ficha (SS205, TR05…); o envio criaria unidades novas. Fica para a PE6, quando a Torre B for gerada: adotar por andar e posição, ou nomear a cópia pela ficha.
- **Térreo da Torre A:** 002 e 004 entram com a PE4.

### PE3 — O botão: "Construir o prédio pelo Empreendimento"
**O que muda.**
- **`blueprintCasaPeloEmpreendimento.ts`:**
  - `tipoDoEmpreendimento(torres): 'CASA' | 'PREDIO'`: é PREDIO quando alguma torre fora de loteamento tem andar com 2 ou mais apartamentos, ou 2 ou mais andares com apartamento;
  - os passos ganham `TORRE`: PERGUNTAR com mais de uma torre, FEITO com a escolhida;
  - GERAR diz "o prédio da Torre X".
- **`TelaCasaAutomatica.tsx`:**
  - com PREDIO, a seção "Dados do Empreendimento" mostra as torres (andares × apartamentos), o seletor de torre e o botão **"Construir o prédio pelo Empreendimento"**;
  - o Gerar da casa fica desligado com o motivo "o Empreendimento é prédio — use Construir o prédio".
- **`BlueprintEditor.tsx`:** construir encadeia o que já existe:
  1. lote pela ficha;
  2. zona;
  3. `comandosDoAjuste` (os blocos das torres e das garagens);
  4. `abrirPredioAutomatico(bloco da torre)` com `doEmpreendimento`;
  5. gerar a prévia.

  Os andares PROPRIO ainda saem como o térreo de hoje, com a pendência "os 2 apartamentos do térreo entram na PE4".

**Pronto quando:**
- **Teste puro:**
  - o Garden é PREDIO;
  - um Empreendimento de uma casa e um loteamento continuam CASA;
  - construir de novo com os blocos já ajustados não gera comandos novos.
- **Testes de componente:** os da tela passam, e `check-ui-standard.sh` também.
- **Conferência no app, pelo caminho do usuário** (estudo descartável ligado ao Garden pela obra, prévia sem Lançar):
  1. Casa automática;
  2. "Construir o prédio pelo Empreendimento" com a Torre A;
  3. a prévia mostra 2 garagens, o térreo e o tipo com 4 apartamentos × 3 andares, com os nomes da ficha;
  4. aparecem o aviso da pegada e a pendência do térreo;
  5. o Empreendimento não é tocado (conferido no banco: `updated_at` igual).
- **Foco da revisão:** itens 4 e 5.

**Execução da PE3 (18/11/2026, junto com a PE2a no mesmo PR).** Feito:
- **`tipoDoEmpreendimento(estruturas)` e `passosDoPredioPeloEmpreendimento`:** o lote, o local e a zona vêm da casa; o passo TORRE pergunta com mais de uma e já vem escolhido com uma; GERAR.
- **Tela da casa:** no modo prédio, o título "— é prédio", o seletor "Torre do prédio" e o botão "Construir o prédio pelo Empreendimento". O "Gerar" da casa fica desligado com o motivo.
- **Programa do Prédio automático:** com o Empreendimento, mostra a torre, os andares (papel) e os apartamentos do andar tipo, e não pede o produto.
- **Editor, em etapas, uma por render:**
  1. lote, local e zona;
  2. os blocos das torres que faltam, no lote (`blocosDasTorresNoLote`);
  3. o ajuste da massa;
  4. abrir o Prédio automático da torre;
  5. gerar a prévia quando a entrada já traz os andares da ficha.

  O `doEmpreendimento` do bloco do prédio vem da torre de mesmo nome; também abre pelo painel do bloco.
- **Pendência nova:** o andar PRÓPRIO com apartamento diz quais ficaram fora (no Garden, o térreo da Torre A com 002 e 004), até a PE4.
- **Aviso da pegada:** não aparece na Teste 01, porque as torres nascem do tamanho que o andar tipo pede. Aparece no bloco desenhado menor (PE1).

**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pe3.cjs`). Estudo descartável na SPE, com as divisas da Teste 01 e a obra do Garden; arquivado no fim. Pelo caminho do usuário:
1. **Casa automática:** diz "Dados do Empreendimento '011 - Garden Cambuhy' — é prédio", e o seletor mostra "Torre A — 3 andar(es) × 4 apartamentos + pavimento térreo com 2 · 2 de garagem" e "Torre B — 6 andar(es) × 4 apartamentos · 2 de garagem".
2. **Construir com a Torre A:** a prévia sai em 9,7 s com 12 apartamentos (4 por andar × 3), 101–104 da ficha, os de 127 m² na frente.
3. **Massa:** Torre A 4@0, Torre A · Garagem 2@−6,0, Torre B 6@−6,0, Torre B · Garagem 2@−12,0.
4. **Relatório:** traz a pendência do térreo (002, 004).
5. **Empreendimento:** intocado (`updated_at` e as 43 unidades iguais).

Sem erro de console. Testes: `predioPeloEmpreendimento` 21, `TelaCasaAutomatica` 36, `TelaPredioAutomatico` 7; `check-ui-standard` limpo nas duas telas.

**Guarda da Torre B (18/11, achado depois da conferência).** Escolher a Torre B gerava um prédio **errado**, sem erro:
- **O que saía:** o motor fazia o térreo de condomínio no 0 e 3 andares acima (12 apartamentos em vez de 24), ignorava o −2 e o −1 e deixava a garagem descolada, com um vão de 6 m.
- **Agora:** até a fase da torre abaixo da rua, `motivoParaNaoGerarPredio` recusa e diz o motivo; no passo TORRE, a torre fica em FALTA e o botão desliga com "começa abaixo da rua (Pavimento −2, Pavimento −1)…".
- **Testes:** 2 novos.

**Redesenho de 18/11 (decisão "Técnico na garagem").** A PE4 e a PE5 passam a ser um mecanismo só, **o térreo de apartamentos**. Quando o Empreendimento põe apartamento no andar 0:
- **Condomínio técnico na garagem:** o Prédio automático não monta o térreo só de condomínio. O "pavimento do condomínio" (entrada de energia e medição, casa de bombas, reservatório inferior) é a garagem mais alta, e o desvio do esgoto corre no forro dela.
- **O andar 0 sai do tipo:** é cópia viva do tipo quando é igual a ele (Torre B). Quando é PRÓPRIO (Torre A), é a cópia **desvinculada no fim**, sem os apartamentos que ele não tem; o espaço deles vira hall de entrada (com a porta para a rua) e área comum.

A PE5 abaixo descreve a parte da garagem; a PE4 fica com o andar próprio.

### PE4 — O andar próprio: o térreo da Torre A com os 2 apartamentos
**O que muda.**
- **Primeiro, uma conferência curta (spike):** a cópia viva do tipo, desvinculada (`SetLevelProps tipoDeId: null`), fica com as paredes, as plantas e as instalações como próprias? Se não ficar, a fase ganha uma mudança no kernel (versão nova) antes do resto, e o plano registra isso.
- **`utils/predioAutomatico/andarProprio.ts` (novo):** `lancarAndarProprio(ctx, base, andar: AndarDoEmpreendimento, tipoLevelId)`:
  - o andar nasce como cópia do tipo, depois que as instalações dele estão prontas, e é desvinculado;
  - saem as unidades que o andar não tem: paredes da planta, louças, ramais, QD, hidrômetro e pontos;
  - ficam as prumadas que passam: tubo de queda, colunas e a prumada elétrica;
  - a área livre vira condomínio (hall junto do núcleo, portaria, salas), como no térreo de hoje;
  - entra a porta de entrada na fachada da rua.
- **No orquestrador**, o térreo de hoje dá lugar ao andar próprio quando o Empreendimento diz que ele tem apartamento.

**Pronto quando** (Garden Torre A, teste e app):
- **Térreo:** tem exatamente 002 (Tipo 4, frente) e 004 (Tipo 1, lateral), com planta e instalações, mais hall e portaria.
- **Andares de cima:** o 1º ao 3º seguem como antes.
- **Ligação:** toda louça de todo andar, inclusive as do térreo, chega à ligação; a água das duas unidades do térreo passa pelo hidrômetro delas.
- **Compatibilização:** sem conflito novo em relação à PE3.
- **Marcos de laboratório:** idênticos.

**Execução da PE4a + PE5a (18/11/2026, Torre A do Garden).** O modo "térreo de apartamentos" liga quando a ficha põe apartamento no andar 0 e a torre tem garagem (`terreoDeApartamentosPedido` no orquestrador):
- **Durante as etapas:** o andar 0 é só o esqueleto (`montarTerreo(…, { soEsqueleto: true })`), que a garagem lê e edita como antes.
- **A garagem:** reserva a **sala técnica do condomínio** (5 × 4 m no 1º subsolo, junto ao contorno e perto do hall; as vagas fogem dela como da drenagem; pilar dentro pode). Ela vira o "térreo técnico": QGBT e medição, casa de bombas, reservatório inferior; o desvio do esgoto corre no forro dela.
- **O esgoto:** a cota enterrada e a da rede são do mundo (a da rua), não do pavimento do desvio.
- **O fim** (`concluirTerreoDeApartamentos`, depois da marca das instalações), na ordem:
  1. tira os pontos que as etapas de incêndio puseram no andar 0, porque o kernel não liga ao tipo um andar com instalação própria e a cópia traz os do tipo;
  2. liga o andar 0 ao tipo e o desvincula;
  3. casa os apartamentos da ficha com as fatias do tipo: a mesma tipologia, depois a posição, depois a área (002 Tipo 4 → 102, 004 Tipo 1 → 104);
  4. tira dos outros (101 e 103) as paredes internas, os pontos, os quadros com os circuitos e os trechos, mas deixa tubos de queda, colunas e barrilete;
  5. poda as pontas soltas;
  6. nomeia o hall de entrada (o da frente) e a área comum, tira a janela do trecho da porta e abre a porta para a rua;
  7. põe o lance da escada do andar 0 ao tipo.

**Correção no grafo da rede** (`utils/blueprintKernel/grafoDeRede.ts`, `fazerChave`):
- **O que era:** o "pavimento de baixo" era o anterior na ordem por elevação. O lote e o andar 0, na mesma cota, viravam um em cima do outro, e o pé do tubo de queda do andar 0 não encontrava o da garagem.
- **O que ficou:** agora é o mais perto **estritamente** abaixo.
- **Alcance:** conta derivada, sem comando nem versão do kernel.
- **Prova:** os marcos de laboratório (prédio R4/R8/R12/RL e casa) ficaram **idênticos**, e os 5 arquivos que usam a chave passam (67 testes).

**Resultado** (`__tests__/predioTerreoDeApartamentos.test.ts`, 3 testes):
- **Andar 0:** desvinculado, com 2 salas de estar (o tipo tem 4), o hall, a porta para a rua e nenhuma sala de medição ou bombas.
- **Garagem:** o QGBT e todo o desvio do esgoto no 1º subsolo.
- **Esgoto:** toda louça de todo andar chega à ligação, as do andar 0 também.
- **Resumo:** 14 unidades (12 + 2) e o andar 0 com o hall e a porta.

**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pe4.cjs`, pelo caminho do usuário, estudo descartável na SPE com a Teste 01): 15 portões ok, a prévia em 10,7 s.
- **Relatório:** "Andar 0: os apartamentos 002, 004 da ficha ocupam as posições dos do tipo (102, 104)" e "sala técnica do 1º subsolo"; a pendência "apartamentos do térreo fora" sumiu.
- **Planta do andar 0 na prévia:** o apartamento com os cômodos e a área comum livre.
- **Empreendimento:** intocado. Sem erro de console.

**Ficam como pendência no relatório:**
- **Pluvial no chão do andar 0:** as caixas de areia e o condutor enterrado. Enterrar a partir da garagem daria −3,3 m.
- **Medidores e `Unidade` do kernel do 002 e do 004:** o desvinculado traz os rótulos, não a unidade. O resumo conta 14, a medição conta 12, e o envio ainda não leva os 2.
- **Fechamento da sala técnica:** paredes e porta.

**Execução da PE4b (18/11/2026).** No fim de `concluirTerreoDeApartamentos`, os apartamentos que ficaram viram **unidades do kernel** com os números da ficha (`AddUnidade` 002 e 004, com as etiquetas do andar 0 dentro da fatia):
- **Vínculos religados:** o QD e o hidrômetro que a cópia trouxe apontavam para o 102 e o 104 do tipo e contariam duas vezes; agora apontam para o 002 e o 004.
- **Medidores:** um medidor para cada um na medição da sala técnica.
- **O pluvial no chão:** `lancarPluvial` foi dividido, e a parte do chão virou `lancarPluvialNoChao`. No térreo de apartamentos ela roda depois do andar 0, porque a cópia já traz o vertical do tipo até a junção: daí descem a caixa de areia e o coletor até a saída na frente.

**Resultado** (`__tests__/predioTerreoDeApartamentos.test.ts`, agora 5 testes):
- **Elétrica:** 14 unidades atendidas e 14 medidas, 15 medidores.
- **Água:** 14 hidrômetros.
- **Unidades:** `unidadesDoPredio` lista 14.
- **Pluvial:** cada ralo da cobertura chega à ligação pluvial no andar 0, e a pendência "sem o térreo" sumiu.
- **Marcos de laboratório** (prédio e casa): idênticos; 12 arquivos e 118 testes passam.

**Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pe4b.cjs`): 16 portões ok.
- **Card da elétrica:** "15 medidor(es) · 14 de 14 unidade(s) medidas".
- **Relatório:** "viraram as unidades 002, 004 do kernel" e "Pluvial: a saída na frente do lote".
- **Card das unidades:** agora diz "+ 2 no térreo".

**Fica:** o fechamento da sala técnica (paredes e porta), como pendência.

### PE5 — O condomínio e o desvio quando o térreo é de apartamentos
**O que muda.**
- **Térreo sem área livre** (Torre B: o 0 é cópia do tipo): centro de medição, casa de bombas, reservatório inferior e salas vão para a garagem mais alta (−3).
- **Desvio do esgoto:** corre no forro do primeiro andar sem apartamento abaixo da torre:
  - Torre A: o forro do −1;
  - Torre B: o forro do −3.
- **Pendência da Torre B:** como o andar 0 é cópia do tipo, a entrada pela rua no andar 0 fica para o projetista (a cópia viva não aceita porta só nela).

**Pronto quando** (Garden):
- **Torre B:** medição, bombas e reservatório inferior no −3.
- **Desvio:** o da Torre A no forro do −1 (e não mais no do térreo) e o da Torre B no do −3.
- **Pendência:** a da entrada pela rua no relatório.
- **Marcos de laboratório:** idênticos (térreo livre continua como hoje).

### PE6 — Os andares abaixo da rede pública (Torre B)
**O que muda.**
- **Esgoto abaixo da rede:** quando o desvio chega abaixo da rede pública (−1,50 m presumida), ele termina numa **caixa coletora com 2 bombas** e o recalque sobe à caixa de inspeção na cota da rua. É a peça e o desenho da drenagem da garagem (PA8c, `POCO_DE_RECALQUE`), com as bombas no quadro de serviço.
- **Rota de fuga ascendente:** dos andares −2 e −1 até a saída no 0 (IT 11), na conferência do PPCI do prédio.
- **Pendências:**
  - contenção e impermeabilização das paredes enterradas;
  - ventilação e luz dos apartamentos abaixo da rua;
  - separar o desvio dos andares acima da rede, que é o usual e fica para o projetista.

**Pronto quando** (Garden Torre B):
- **Ligação:** toda louça chega à ligação passando pelas bombas, com as 2 bombas num circuito do quadro de serviço.
- **Rota de fuga:** −2 e −1 têm rota até a saída.
- **Relatório:** as pendências aparecem.

**Spike da Torre B (18/11/2026, descartado).** Tirei a guarda e incluí os pisos abaixo da rua (`pisosAcimaDoSolo` com os negativos). A geração passou, mas com quatro erros:
- **24 unidades, 24 atendidas e 24 medidas** (25 medidores). A elétrica e a água já fecham.
- **O tipo foi parar no −1:** o motor ainda conta "o 2º piso é o tipo" (`ordinalDoTipo`). O −2 virou "térreo", e os apartamentos do 0 da ficha (TR05…) foram aplicados no −2.
- **O esgoto ficou abaixo da rede:** o coletor a −20 % ("preveja estação elevatória").
- **A rota de fuga não fechou:** 281 ambientes sem caminho até a saída, e o andar 0 (cópia) não tem porta para a rua.
- **Garagem:** nenhuma vaga coube no −3. A nomeação dos subsolos ("3º/4º subsolo") também está errada.

**Mapa da PE6** (cada passo com teste antes, na Torre B do Garden):
1. **PE6a — a torre do −2.** Quando a ficha tem apartamento abaixo da rua, o orquestrador passa à montagem do tipo os pisos do bloco a partir da base dele, e não só os de cota ≥ 0. O tipo fica no 1º piso (o −2), as cópias no −1 a 3, e o térreo não é montado (o 0 é cópia).
   - **O técnico:** a sala técnica fica no subsolo mais alto (−3), como na PE5a.
   - **A garagem:** lê a torre pelo tipo e não escreve nele (a escada de emergência dela não pode ir para todo andar).
   - **A massa e os marcos:** `pisosAcimaDoSolo` não muda para eles.
2. **PE6b — o esgoto abaixo da rede.** O desvio no forro do −3 termina na caixa coletora com 2 bombas (a peça do poço da PA8c), e o recalque sobe à caixa de inspeção na cota da rua. As bombas ficam no quadro de serviço.
3. **PE6c — a rota de fuga até o 0.** A descarga é o andar 0 (cópia), e a escada do núcleo sobe do −2. Como a porta para a rua no 0 não cabe na cópia, ela vira pendência; a rota conta até a chegada da escada no 0.
**Execução da PE6a e da PE6b (18/11/2026).** As duas ficam atrás da guarda: a opção `permitirTorreAbaixoDaRua`, que só os testes usam, vale até a PE6d.
- **PE6a, a torre do −2** (`pisosDoBloco` e `OpcoesDaMontagem.pisos`; a divisão com o ordinal 1):
  - **Andares:** o tipo no −2 e as cópias no −1, 0, 1, 2 e 3; a garagem é o 3º e o 4º subsolo.
  - **Unidades:** 24 apartamentos, 24 atendidos e medidos, 25 medidores.
  - **Técnico:** o QGBT na sala técnica do 3º subsolo.
  - **Garagem:** lê o tipo e não escreve nele (`terreoSoLeitura`). A saída da escada de emergência dela vira pendência.
  - **Pendências:** a da entrada pela rua no 0 e a dos andares enterrados.
- **PE6b, o esgoto abaixo da rede:**
  - **Caixa coletora:** a saída do desvio no −3 é a caixa coletora, com 2 bombas de 1,5 kW no QDG do −3 (`bombas.ts`, o mesmo helper da drenagem).
  - **Recalque:** DN 75 até a caixa de inspeção na cota da rua, no lote; dali o coletor vai por gravidade.
  - **Drenagem:** recalca na caixa coletora.
  - **`fazerChave`:** a cota abaixo do piso desce quantos pavimentos ela pedir. Isso só acrescenta ligações, e os marcos ficaram idênticos.
  - **Prova:** toda louça chega à ligação, e a caixa coletora está no caminho. 24 arquivos e 223 testes passam.
- **Achados:**
  - **Garagem:** só 7 vagas, e o −3 sem nenhuma. A rampa do −3 sobe para o tipo, porque o acesso de veículos da Torre B é pela garagem da Torre A (coladas). Isso fica para a PE7.
  - **Pluvial:** o da Torre B não chega ao chão.

**Decisão do usuário (18/11/2026, depois da PE6b): "Desvincular o 0".** O 0 da Torre B nasce cópia do tipo e é desvinculado no fim, como o da Torre A: o kernel não aceita porta só numa cópia, e sem porta para a rua a rota de fuga do −2 e do −1 não tinha saída. **Custo:** o que mudar no tipo depois deixa de chegar ao 0.

**Execução da PE6c e da PE6d (18/11/2026).**
- **PE6c:** `concluirTerreoDeApartamentos(…, { jaECopia: true })` só desvincula. Os 4 apartamentos da ficha (TR05–TR08) viram unidades do kernel, e os QDs, os hidrômetros e os 4 medidores que a elétrica já tinha posto para o 0 são religados a elas, sem criar outros (25 medidores). Sem fatia livre, o hall é o corredor junto do núcleo voltado para a rua, com a porta. **Resultado:** a rota de fuga fecha em todo andar e uma pendência CONFERIR avisa do desvínculo.
- **PE6d, liberação da Torre B:**
  - **Nomes:** saem da ficha (`numeroPeloAndar`, `andarDoPavimento`): "SS" e o subsolo, depois a posição (SS205 no −2 → SS105 no −1, 105…305 em cima).
  - **Envio:** `massaAdapter` usa o andar −1/−2 em vez do ordinal 0 e leva as unidades do 0 desvinculado (`pavimentosDoPredioDoBloco`, pelos uids de cópia e do térreo do bloco). Isso fechou também o furo da PE4b: o 002/004 da Torre A não iam no envio.
  - **Guardas:** saem a do motor, a da tela (o seletor da Casa automática) e a opção `permitirTorreAbaixoDaRua`.
- **Provas:**
  - `predioTorreAbaixoDaRua` (5 testes): os nomes da ficha e o envio, que adota os 24 sem criar unidade nova.
  - `predioTerreoDeApartamentos`: o envio da Torre A adota os 14; esse teste falhou sem a correção.
  - Numeração por andar: 2 testes.
  - Suíte inteira: 42 arquivos e 378 testes passam, com os marcos idênticos; o `tsc` sai sem erro.
- **Conferência no app** (`c:/tmp/pwtest/conferencia-predio-pe6.cjs`, Torre B pelo caminho do usuário): 15 portões ok, prévia em 42 s, Empreendimento intocado, sem erro de console, estudo arquivado.
- **Ficam:**
  - **Garagem:** vagas e rampa da Torre B (o acesso é pela Torre A) → PE7.
  - **Pluvial:** o da Torre B não chega ao chão.
  - **Card do tipo:** ainda conta o 0 desvinculado como cópia ("1 + 5").

4. **PE6d — liberar a Torre B.** Tirar a guarda (motor e passo TORRE na Casa automática), nomear os andares e as unidades pela ficha (SS205…, TR05…) e conferir no app.

### PE7 — As duas torres no mesmo estudo
**O que muda.** A Torre B é gerada depois da Torre A, no mesmo estudo. O Garden as tem coladas (distância 0).
- **Uma entrada por rede pública:** uma ligação de esgoto e uma de água, e uma entrada de energia. As redes da segunda torre se ligam às da primeira.
- **A parede comum:** sem janela.
- **Sem conflito entre as torres:** nem térreo × térreo, nem garagem × garagem.
- **O Prédio automático da segunda torre:** reconhece o lote e a primeira torre já lançados.

**Pronto quando** (Garden, as duas torres no estudo descartável):
- **Entradas:** 1 ligação de esgoto, 1 de água e 1 entrada de energia.
- **Parede comum:** nenhuma janela.
- **Compatibilização:** nenhum conflito entre peças de torres diferentes.
- **Relatório:** um só para o lote.

**Decisões do usuário (18/11/2026, início da PE7):**
- **"Rampa pela garagem da A":** a rampa desce do −2 da Torre A, junto da parede comum, até o −3 da Torre B. A garagem da A cede o espaço, a B fica sem rampa própria, e a rampa entre o −3 e o −4 da B continua.
- **"Entrada na A, quadro geral na B":** uma entrada de serviço, na A. A B mantém o quadro geral e os medidores na sala técnica dela, alimentados a partir do QGBT da A, e a demanda da entrada soma as duas torres.

**Spike (18/11):** a Torre A gerada e lançada, e depois a Torre B por cima.
- **Unidades:** 24 na B, com os nomes de cada torre sem colisão (38 no total).
- **Conferências que misturavam as torres:**
  - os equipamentos de incêndio da B falhavam ao propor num andar cópia da A;
  - a pressão pegava o reservatório superior da A (384 pontos "fora da rede");
  - a rota acusava 148 ambientes da A.
- **Entradas duplicadas:** 2 ligações de esgoto, 2 entradas de energia e 2 QGBTs.
- **Janelas na parede comum:** 16 na A e 24 na B.
- **Desempenho:** a B sobre a A levava 150 s, porque o kernel confere as invariantes do desenho inteiro a cada comando.

**Execução, parte 1:**
- **PE7a, cada torre se confere sozinha.** O motor roda sobre a VISTA do desenho sem os pavimentos que já estavam nele, menos o do lote (`utils/predioAutomatico/vistaDaTorre.ts`, `semOsPavimentos`). O resultado no desenho inteiro é a vista mais o que ficou de fora (`juntarComOsPavimentos`), sem reaplicar os comandos, e é conferido pelas invariantes do kernel uma vez; se não fechar, cai no caminho lento de reaplicar.
  - **Prova:** o hash da junção é igual ao de reaplicar os comandos, num desenho com um pavimento "vizinho".
  - **Tempo:** a aplicação final caiu de 114 s para 1,4 s.
  - **Resultado:** a B confere só os pavimentos dela, e os equipamentos de incêndio lançam.
- **PE7b, energia:** a B perde a entrada de serviço e o QGBT dela vira filho do QGBT da A. Uma pendência CONFERIR traz a demanda conjunta.
- **PE7c, parede comum cega:** depois das plantas, as janelas no lado do contorno que encosta em outro bloco de torre saem do tipo, e as cópias acompanham. Uma pendência diz quantas saíram.
- **Pequenos da PE6:**
  - **Card do tipo:** passou a "1 + 4 cópia(s) · + 1 desvinculada (o andar 0)" (`copiasDesvinculadas`).
  - **Prévia de 42 s:** era o servidor de desenvolvimento recompilando o worker depois das edições (medido: 9,3 s com o worker quente). Não era o motor.

**Falta na PE7:**
- **Esgoto e água:** uma ligação de cada. As duas torres têm pavimentos na MESMA cota (a garagem −1 da A e o −1 da B, a −3 m), e a chave da rede, que desce pela cota, escolhe um deles sem critério, então a ligação entre as torres precisa de cuidado.
- **Garagem:** a rampa pela garagem da A.
- **Pluvial da B.**
- **Relatório:** um só para o lote.

## Mapa de implementação da PE4–PE6 (18/11/2026, lido no código depois do merge do #577)

O "térreo de apartamentos" (decisão "Técnico na garagem") esbarra em três travas do orquestrador
(`utils/predioAutomatico/orquestrador.ts`). Cada uma tem de ser resolvida antes do resto.

1. **A garagem depende do térreo e mexe nele.** `lancarSubsolos(ctx, base, g, terreoLevelId, hip)` (`garagem.ts`):
   - recebe o térreo;
   - cria nele a caixa e a porta da escada de emergência (`lados(terreoLevelId, true)`, `porta(terreoLevelId, …)`);
   - lê os pilares e o hall dele.

   Se o andar 0 for cópia viva do tipo durante o motor, o kernel recusa essas edições. Saída: no modo "térreo de apartamentos", a garagem recebe o andar 0 só para ler. A escada de emergência que chega ao andar 0 fica para depois do desvínculo (Torre A) ou vira pendência (Torre B, o 0 é cópia).
2. **As instalações do condomínio vão no nível do térreo.**
   - Hoje elétrica, reservatórios, água, esgoto, pluvial, eletrodutos e drenagem recebem `terreo = { levelId, salas }`, e `montarTerreo` nomeia as salas "Centro de medição" e "Casa de bombas".
   - Saída: um "térreo técnico" na garagem mais alta. Os pontos de medição e bombas ficam numa área técnica reservada antes das vagas, como a separadora da PA8c. O `levelId` dela vai a essas etapas, e o desvio do esgoto corre no forro dela.
3. **O andar próprio vira unidade só se o kernel souber.** Depois do desvínculo, os rótulos dos 2 apartamentos que ficam precisam pertencer a uma `Unidade` do kernel. Senão medição, QDs, quantitativos e envio não os contam.
   - O spike mostrou os rótulos copiados; falta conferir se a `Unidade` derivada vira própria.
   - Se não virar: criar a `Unidade` 002 e 004 com as etiquetas dela.

**Ordem proposta** (cada passo com teste antes e o Garden de prova):
1. **PE5a:** o térreo técnico na garagem, para Torre A e B. As etapas recebem o nível técnico; a medição e as bombas ficam na área técnica da garagem; o desvio corre no forro da garagem.
2. **PE4a:** o andar 0 como cópia do tipo. Na Torre A, desvinculado no fim e sem os apartamentos que não tem; o espaço livre vira hall e área comum, com a porta para a rua; as unidades 002 e 004 ficam no kernel.
3. **PE6:** a torre que começa abaixo da rua (o tipo no −2, o esgoto por bombas, a rota de fuga subindo), e só então a Torre B sai do bloqueio.
4. **PE7:** as duas torres no mesmo estudo.

## Estado

| Fase | Situação |
|---|---|
| PE0 — marco do Garden | feita, no ar (#573, 947df0e) |
| PE1 — os andares e a massa | feita, no ar (#573, 947df0e) |
| PE2 — o tipo com as unidades do Empreendimento | PE2a no ar (#577, 6fd6816); PE2b: a Torre A já casa pelo nome (teste de caracterização, no ar); a Torre B fica para a PE6 |
| PE3 — o botão na Casa automática | feita, no ar (#577, 6fd6816); conferida no app pelo caminho do usuário; a Torre B fica bloqueada (com o motivo) até a PE4–PE6 |
| PE4 — o térreo da Torre A com os apartamentos | PE4a (#582) e PE4b feitas, conferidas no app: o andar 0 com 002/004 como unidades do kernel (QD, hidrômetro, medidor), o hall, a porta e o pluvial no chão |
| PE5 — condomínio e desvio sem térreo livre | PE5a feita com a PE4a (a sala técnica na garagem, o desvio no forro dela); a Torre B (o andar 0 cópia, sem desvínculo) vem com a PE6 |
| PE6 — abaixo da rede pública | PE6a–PE6d feitas e conferidas no app: a Torre B do −2, o esgoto por bombas, o 0 desvinculado com a porta (decisão do usuário), os nomes da ficha e o envio; a Torre B liberada |
| PE7 — as duas torres no mesmo estudo | a fazer |

## Verificação

1. **Testes:** os da fase, as suítes do prédio, da casa pelo Empreendimento, do ajuste e do 3D, os dois marcos de laboratório, e `tsc` (com `NODE_OPTIONS=--max-old-space-size=8192`).
2. **`bash scripts/check-ui-standard.sh`** nos `.tsx` tocados.
3. **Conferência no app** (a partir da PE3, pelo caminho do usuário):
   - estudo descartável na org da SPE com `project_id` = a obra do Garden;
   - Casa automática › Construir o prédio;
   - prévia sem Lançar;
   - conferir no banco que o Empreendimento não mudou;
   - arquivar o estudo.
4. **Publicação:** PR por fase, CI verde, merge, `conferir-producao.sh` e a CI do main.
