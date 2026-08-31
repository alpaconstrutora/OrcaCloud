# Planta Inteligente — grupo Estrutural

## Pedido original

Sessão de 30/08/2026, primeira mensagem, transcrita literalmente:

> incorporacao < planta inteligente: implemente novos objetos e agrupe-os em Grupo chamado Estrutural com Pilar, Viga, Laje, estaca, Bloco de coroamento, Viga de Fundação

Duas perguntas foram feitas antes de planejar, e as respostas do usuário fecham o escopo:

1. **"Até onde os objetos estruturais devem ir nesta entrega?"**
   → *Desenho + quantitativo + orçamento* (caminho completo até o RF-122).
2. **"Como o grupo 'Estrutural' deve aparecer na barra de ferramentas?"**
   → *Botão-menu "Estrutural"* que abre os seis, no molde do `MenuExibir` que já existe.
   Razão apresentada e aceita: a barra hoje tem 11 ferramentas + selects e já quebra linha.

---

## Contexto

O editor (`components/blueprint/BlueprintEditor.tsx`, aberto por Incorporação › Planta
Inteligente → `AppRouter.tsx:549`) só desenha **vedação e limite**: parede, abertura, terreno,
divisa, medição. Não existe elemento de **estrutura**, então a planta chega ao quantitativo e ao
orçamento sem concreto e sem fôrma — as duas maiores linhas de uma obra.

⚠️ **Não confundir com o módulo Estrutural / Ferragem Armada** (`PLANO_MODULO_ESTRUTURAL.md`).
Aquele quantifica **aço** a partir de armadura já definida pelo projetista e vive fora da planta.
Este trabalho é a geometria de **concreto** dentro do kernel do blueprint. Complementares;
nenhum código compartilhado nesta entrega.

---

## Decisões de arquitetura

**1. Vai para o KERNEL, não para a camada de medições.**
`utils/blueprintMedicoes.ts` é para *afirmações sobre a planta de fundo* — fora do payload, fora
do hash. Pilar e laje são **construção derivável**: precisam sobreviver ao publish, entrar no
snapshot e alimentar o orçamento. Vale a regra que decidiu o Terreno
(`docs/planos/2026-08-21-planta-inteligente-terreno.md`): atributo de entidade do kernel tem de
ir DENTRO do payload, porque `modelFromCanonicalPayload` reatribui ids novos e uma tabela
externa chaveada por id perderia o vínculo no primeiro publish.

**2. UMA família (`structures`), seis `kind` — não seis arrays.**
Precedente do próprio kernel: `Opening` é uma família com quatro `kind`; `Boundary` com dois. E
`blueprintMedicoes.ts` já usa o par *forma geométrica × tipo*. Seis arrays multiplicariam por
seis o `cloneModel`, os invariantes, a emissão canônica e o `CHECK` do banco por uma diferença
que é de **seção**, não de estrutura de dados.

**3. UMA ferramenta (`'estrutural'`) + estado de tipo — não seis valores de `BlueprintTool`.**
É o padrão da abertura: um botão `abertura` mais o select `tipoAbertura`. O menu escolhe o tipo e
ativa a ferramenta num gesto só.

**4. Estrutura NÃO entra no arranjo planar.** `arrangement.ts` fica intocado. Um pilar dentro da
sala não parte o ambiente nem desconta área de piso — se entrasse no grafo, o `Space` se
fragmentaria e área, rodapé e revestimento mudariam junto. Decisão consciente, travada por teste.

---

## Modelo

`Structural` — uma entidade, três formas geométricas:

| kind | `pontos` | `larguraMm` | `profundidadeMm` | `alturaMm` | `baseMm` |
|---|---|---|---|---|---|
| `PILAR` | 1 (centro) | b em planta | h em planta | pé-direito | 0 |
| `ESTACA` | 1 | diâmetro (circular) | idem | profundidade | negativo |
| `BLOCO_COROAMENTO` | 1 | b em planta | h em planta | altura do bloco | negativo |
| `VIGA` | 2 (eixo) | b da seção | — | h da seção | topo − h |
| `VIGA_FUNDACAO` | 2 (eixo) | b da seção | — | h da seção | negativo |
| `LAJE` | ≥3 (anel) | — | — | espessura | cota do piso |

Tudo em milímetro inteiro, ids por `nextId(model, 'str')`. Duas funções fonte única:
`FORMA_ESTRUTURAL` e `nomeDoTipoEstrutural`.

---

## Itens

Estado: ⬜ não começado · 🟡 em curso · ✅ pronto e verificado

### Kernel

- ✅ **1. `utils/blueprintKernel/model.ts`** — `StructuralKind`, `FORMA_ESTRUTURAL`,
  `nomeDoTipoEstrutural`, `interface Structural`, `structures` em `BlueprintModel`, `emptyModel`,
  **`cloneModel` com cópia profunda de `pontos`**, laço em `assertModelInvariants`.
  *Pronto quando:* o bloco "invariantes" de `blueprintEstrutural.test.ts` passa.
- ✅ **2. `utils/blueprintKernel/commands.ts`** — `AddStructural`, `SetStructuralProps`,
  `SetStructuralKind` (recusa troca de forma), `MoveStructuralVertex`, `DeleteStructural`; e
  `TranslateEntities`/`DuplicateEntities` ganham `structuralIds`, `RemoveLevel` apaga em cascata,
  `DuplicateLevel` copia.
  *Pronto quando:* mover/copiar/colar seleção mista leva as estruturas num passo de desfazer só.
- ✅ **3. `utils/blueprintKernel/canonical.ts`** — emitir `structures` com ordem total e `level`
  por ÍNDICE; **chave omitida (`undefined`) quando não há estrutura**; leitura com `?? []`.
  *Pronto quando:* round-trip devolve o mesmo hash, e planta sem estrutura não ganha a chave.
- ✅ **4. `utils/blueprintKernel/units.ts`** — `KERNEL_VERSION` → `0.9.0` + entrada no JSDoc.
- ✅ **5. `utils/blueprintKernel/index.ts`** — reexportar tipos, funções e comandos.
- ✅ **⛔ `arrangement.ts` NÃO tocado** (decisão 4).

### Quantitativo e orçamento

- ✅ **6. `utils/blueprintKernel/quantities.ts`** — `QuantidadeEstrutural`, `estruturas[]`,
  totais de concreto/fôrma/contagem; **`POLITICA_PADRAO.version` → `quant-1.3.0`** + histórico.
  *Pronto quando:* volume e fôrma conferem com a conta feita à mão nos quatro casos.
- ✅ **7. `utils/blueprintBudget.ts`** — escopo `'ESTRUTURA'` e onze medidas novas, separadas por
  família (concreto de pilar, viga, laje e fundação são itens SINAPI diferentes).
  *Pronto quando:* mapear volume (M3) para item em m² é **recusado**, não gerado com aviso.
- ✅ **8. `utils/blueprintDiff.ts`** — estruturas na comparação entre versões.
  *Pronto quando:* publicar versão que só acrescentou pilar não diz "nada mudou".

### Banco

- ✅ **9. `supabase/migrations/aplicar_20270917000004_blueprint_estrutural.sql`** — `CHECK` de
  `object_type` ganha `'STRUCTURAL'`; `fn_blueprint_publish_snapshot` ganha o laço de
  `structures`. **Aplicar com `db query -f`, nunca `db push`.**
  *Pronto quando:* `pg_get_constraintdef` e `prosrc` relidos pelo `db query` mostram as duas
  mudanças.
- ✅ `services/blueprintService.ts` **não muda** — o payload é opaco ali.

### Editor

- ✅ **10. `hooks/useBlueprintEditor.ts`** — `BlueprintTool` ganha `'estrutural'` (um valor só).
- ✅ **11. `components/blueprint/MenuEstrutural.tsx` (novo)** — popover no molde de
  `MenuExibir.tsx`; o botão mostra o tipo ativo, para menu fechado não esconder estado.
- ✅ **12. `components/blueprint/BlueprintEditor.tsx`** — menu na barra com separador comentado,
  estado `tipoEstrutural`, controles contextuais, handlers, seção "Estrutural" no painel,
  copiar/colar e mover levando `structuralIds`.
- ✅ **13. `components/blueprint/PainelEstruturaSelecionada.tsx` (novo)** — seção, cota, rótulo,
  troca de tipo dentro da mesma forma, excluir.
- ✅ **14. `components/blueprint/BlueprintCanvas.tsx`** — render, `estruturaSob`, gestos
  (1 clique / 2 cliques / contorno que fecha), alças de vértice, seleção e arraste.
- ✅ **15. `components/blueprint/Blueprint3DViewer.tsx`** — caixa, cilindro e extrusão do anel.

### Testes

- ✅ **16. `__tests__/blueprintEstrutural.test.ts` (novo)** — as sete asserções do molde de tipo
  novo, mais `SetStructuralKind` recusando troca de forma, `cloneModel` profundo e os quatro
  comandos coletivos.
- ✅ **17. `__tests__/blueprintKernelGoldens.test.ts`** — **prova de reversão antes de tocar em
  hash**: com `KERNEL_VERSION` de volta em `0.8.0`, os seis payloads batem byte a byte e as
  contagens seguem `9/49/144/3/78/4`. Só depois trocar os hashes e escrever a entrada no
  cabeçalho.
- ✅ **18. `blueprintQuantities.test.ts` · `blueprintBudget.test.ts` ·
  `components/BlueprintEditor.test.tsx`** — blocos novos.
- ✅ **19. Este arquivo.**

### Verificação em Chrome real (30/08/2026)

Roteiro dirigido por Playwright sobre uma planta em rascunho de verdade (17
paredes, planta de fundo escaneada), na conta `agente-leitura`:

- os SEIS tipos foram desenhados pelo gesto de cada forma — um clique no pilar,
  na estaca e no bloco; dois na viga e no baldrame; contorno fechado na laje;
- cada um se lê distinto na planta: pilar em cinza cheio, **estaca como círculo
  de verdade** (não o quadrado envolvente), fundação **tracejada e em tom
  terroso** contra a superestrutura sólida;
- o painel da peça selecionada mostrou `6,720 m³ de concreto · 56,00 m² de
  fôrma` na laje, com Espessura/Cota/Rótulo editáveis;
- a aba Quantitativos trouxe as QUATRO famílias com total, e anunciou
  `Política quant-1.3.0`;
- o cabeçalho passou a **"Rascunho salvo"** — as estruturas entraram no
  `draft_payload`, que é o mesmo payload canônico do snapshot.

Dois defeitos que só o navegador pegou, ambos corrigidos:

1. **Placeholder de rótulo divergente** — a barra sugeria `L1` para a laje e o
   painel sugeria `P1` para a MESMA peça, cada um com o seu ternário. Virou
   `prefixoDeRotulo` no kernel, fonte única, ao lado de `nomeDoTipoEstrutural`.
2. (no roteiro, não no produto) as primeiras coordenadas de clique caíam fora do
   canvas de 985×604 e a laje não nascia — o sintoma era "Concreto — lajes"
   ausente do quantitativo, que **parece defeito de cálculo e era erro do
   teste**. Registrado no script: coordenada de teste sai do `boundingBox` real.

---

## Fase 2 — elevações e exportação (pedido de 31/08/2026)

> Pedido, literal: *"Implemente elevações e exportações dar/ifc e salve para mais tarde as
> duas ressalvas"* (`dar` = `dxf`).

- ✅ **20. `utils/blueprintElevation.ts`** — `EstruturaElevacao` e `estruturas[]` em
  `ProjecaoElevacao`. Projeção UNIFORME para as três formas: a pegada de
  `contornoEmPlanta` achatada sobre `u`, a cota vinda de `baseMm`. Sem `switch (kind)`.
  ⚠️ O `bbox` desce até a fundação; a `linhaDoSolo` NÃO — ela continua no piso.
- ✅ **21. `components/blueprint/ElevationCanvas.tsx`** — desenho da estrutura (concreto
  cheio; fundação tracejada e terrosa), toggle `mostrarEstrutura`, e o "vazio" passou a
  contar as peças (uma planta de fôrmas mostrava "desenhe paredes" com o esqueleto atrás).
- ✅ **22. `BlueprintEditor.tsx`** — toggle "Estrutura" no menu Exibir das elevações,
  **ligado por padrão** (ao contrário de "Paredes internas": esconder o que o usuário
  acabou de desenhar parece defeito, não preferência).
- ✅ **23. `utils/blueprintDxf.ts`** — camadas `PLANTA-ESTRUTURA` / `PLANTA-FUNDACAO`
  (separadas porque são etapas de obra diferentes) e `ELEVACAO-ESTRUTURA`. Seção redonda
  sai como **`CIRCLE`**, não como o quadrado envolvente. Rótulo carrega a seção em cm.
- ✅ **24. `utils/blueprintIfc.ts`** — classe IFC de verdade por tipo: `IfcColumn`,
  `IfcBeam`, `IfcSlab`, `IfcPile`, `IfcFooting` (`PILE_CAP` / `FOOTING_BEAM`). Não é
  proxy: quem federa filtra POR CLASSE. ⚠️ `IfcPile` tem um atributo a mais
  (`ConstructionType`) — a tabela `CLASSE_IFC` carrega isso em `extra`.
  Cobertura declara explicitamente **NÃO CONTÉM ARMADURA**.
- ✅ **25. `utils/blueprintExport.ts`** — a estrutura entra também no PDF: contorno na
  planta (sem preencher, para não virar mancha) e retângulo na elevação.
- ✅ **26. `__tests__/blueprintEstruturalSaidas.test.ts`** — 21 casos, um risco por saída.

### Um defeito que só a tela pegou (31/08/2026)

Com o toggle **"Estrutura" DESLIGADO**, o enquadramento continuava dimensionado para a
estaca escondida: a fachada encolhia para o alto da tela, sobrava um vazio de 9 m embaixo,
e a cota de altura anunciava **12,02 m** medindo até uma peça apagada. Corrigido com
`bboxVisivel` em `ElevationCanvas` — a função pura segue derivando TUDO, e quem escolhe o
que enquadrar é quem sabe o que pintou. Travado por três casos no teste.

---

## Fase 3 — "Componentes" (pedido de 31/08/2026)

> Pedido, literal: *"portas, janelas vão, pliar, vigas lajes etc. vamos chama-los de
> 'componentes'"*
>
> Respondendo às perguntas: **um menu único** na barra, e **a parede entra** como
> componente.

- ✅ **27. `components/blueprint/MenuComponentes.tsx` (novo)** — os ONZE tipos em quatro
  grupos (Alvenaria, Esquadrias, Estrutura, Fundação), 13 entradas contando as três formas
  de traçar parede. Substitui `MenuEstrutural.tsx`, que foi removido.
- ✅ **28. `BlueprintEditor.tsx`** — saem os botões Parede/Retângulo/Polígono/Abertura, o
  menu Estrutural E o select "Tipo" da abertura. **Cinco controles a menos**, e a barra
  voltou a caber numa linha.
- ✅ **29. `__tests__/components/BlueprintEditor.test.tsx`** — sete casos migrados para o
  menu. Afirmam o MESMO comportamento (quais controles aparecem em cada ferramenta); só o
  caminho mudou.

**O que NÃO é componente, e por quê:** `Selecionar` é modo. `Juntar` corrige, não constrói.
`Terreno` e `Divisa` são limite jurídico — o próprio comentário da barra diz que o que sai
dali não é construção. As três medições são afirmação sobre a planta de fundo e nem passam
pelo kernel. Nenhum dos cinco é algo que a obra levanta.

**`BlueprintTool` não mudou.** O menu escolhe o PAR (ferramenta, subtipo), porque é isso que
um componente é aqui: "parede em retângulo" é a ferramenta `retangulo`; "janela" é `abertura`
com `tipoAbertura: 'window'`.

**Dois achados na tela:**
1. O botão do menu **quase nunca diz "Componentes"** — o editor abre com a Parede ativa,
   então ele já nasce "Parede". É o correto (menu fechado não esconde estado), mas contraria
   a expectativa de quem procura a palavra na barra. Está documentado no teste.
2. **Três ícones se repetiam entre grupos** (Janela≡Pilar, Correr≡Viga, Vão≡Laje). Num menu
   de treze linhas feito para escanear, ícone repetido faz o olho parar e ler o texto. Os
   treze são distintos agora.

---

## Fora desta entrega (explícito)

- **Armadura / ferragem** — segue no módulo Estrutural existente, sem ponte com a planta.
  A ponte natural (`Structural.id` → elemento de ferragem) **não funciona por id**: ele é
  reatribuído a cada publish. Registrado para decisão de produto.
- **Pilar descontando área de piso** — decisão 4; exigiria entrar no arranjo planar.
- **Remoção de linha oculta na elevação** — limitação declarada da v1, agora também para a
  estrutura: uma viga ATRÁS de uma parede aparece mesmo assim.
- **xlsx** — o quantitativo estrutural não foi levado para a planilha de exportação.
