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

## Estado

| Fase | Situação |
|---|---|
| PE0 — marco do Garden | feita, a publicar (com a PE1) |
| PE1 — os andares e a massa | feita, a publicar |
| PE2 — o tipo com as unidades do Empreendimento | a fazer |
| PE3 — o botão na Casa automática | a fazer |
| PE4 — o térreo da Torre A com os apartamentos | a fazer |
| PE5 — condomínio e desvio sem térreo livre | a fazer |
| PE6 — abaixo da rede pública | a fazer |
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
