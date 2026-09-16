# Planta Inteligente — Lançamento automático de fundações (blocos de coroamento e estacas)

**Data:** 16/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> Implemente também estacas e blocos de coroamento

## Contexto

Fecha o grupo Estrutural automático: pilares (15/09), vigas e lajes (16/09) e agora a fundação.
Mesmo molde (planejador puro → prévia → um `runBatch` provado → Relançar por tipo). `ESTACA`
(PONTO circular, `larguraMm` = Ø, `alturaMm` = comprimento, `baseMm` negativo) e
`BLOCO_COROAMENTO` (PONTO retangular) já são tipos do kernel. Peça enterrada não cruza o piso:
não sobrepõe parede (nada cede) e não entra no arranjo — ambientes não mudam. **Sem campo novo
no kernel, sem bump.**

**O que isto NÃO é**: dimensionamento de fundação (NBR 6122 exige sondagem). Tudo aqui é
hipótese nomeada na gaveta; o lançamento marca onde e com que dimensões declaradas.

## Decisões

Com o usuário (16/09):

| Tema | Decisão |
|---|---|
| Estacas por bloco | 1 (padrão), editável para 2 (bloco alongado no eixo do pilar, 3Ø entre eixos) |
| Dimensões | Ø 30 (25/30/40) × 8 m (6/8/10/12); bloco h 60 (40/50/60/80); lado = max(Ø + 30, pilar + 20) a cada 5 cm; topo do bloco 50 cm abaixo do piso; estaca começa na base do bloco |
| Ribbon | Um botão "Fundações automáticas"; bloco + estacas num lote |

Minhas:

- **D1** Um bloco por pilar do pavimento ativo (`pilaresExistentesNoNivel`), centrado e girado com o pilar. Sem pilar → motivo 'lance os pilares antes'.
- **D2** Bloco de 2 estacas: `lc = arred5(4Ø + 30 cm)` ao longo do eixo do pilar (`rotacaoDeg`), largura `lb`; estacas em ±1,5Ø.
- **D3** `bloco.baseMm = −(arrasamento + h)`; `estaca.baseMm = bloco.baseMm − comprimento`. Arrasamento editável (30/50/80 cm).
- **D4** Pilar já tem bloco quando um bloco existente contém o centro do pilar (`pointInPolygon(contornoEmPlanta)`); a estaca não é conferida à parte.
- **D5** Pavimento ativo; aviso quando não é o de menor `elevationMm`.
- **D6** Rótulos `B<n>`/`E<n>`; comandos: todos os blocos, depois todas as estacas; `conferirPlanoDeFundacoes` confere ids nessa ordem.
- **D7** Relançar apaga blocos + estacas do pavimento.
- **D8** `PecaPrevista.circular`: o canvas desenha a estaca como círculo (arco); bloco como retângulo; rótulo só no bloco.
- Dois pilares mais perto que um bloco: aviso na linha ("bloco sobrepõe o do pilar Pn — unifique à mão"), não impedimento.

## O que mudou

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintFundacoesAutomaticas.ts` (novo) | hipóteses, `ladoDoBloco`, `comprimentoDoBlocoDeDuas`, `planejarFundacoes`, `relancarFundacoes`, `conferirPlanoDeFundacoes`, `fundacoesExistentesNoNivel` | `__tests__/blueprintFundacoesAutomaticas.test.ts` (9) verde ✅ |
| `utils/blueprintPilaresAutomaticos.ts` | `PecaPrevista.circular` (pegada usa `circular`) | testes de pilares (25) ✅ |
| `components/blueprint/BlueprintCanvas.tsx` | prévia circular com `ctx.arc` | typecheck ✅ · app real ✅ |
| `components/blueprint/BlueprintEditor.tsx` | tarefa `fundacoes`; hipóteses persistidas (`blueprint:fundacoesAutomaticas`); botão `SquareStack`; gaveta (5 selects, prévia Pilar · Bloco · Estacas · Topo, faixas, status); rodapé Relançar/Lançar; casos em `pecasPrevistas` e `previaRecolhida` | `BlueprintEditor.test.tsx` (+2, 90) ✅ · `check-ui-standard.sh` ✅ |

## Verificação

- `npx tsc --noEmit` ✅ · suíte completa 326 arquivos / 4305 testes ✅ · `npm run build` ✅ · goldens intactos.
- App real (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 18, 0 erros JS): pilares lançados (66 + 2 existentes) → "Fundações automáticas 68" → prévia "P1 · B2 · 60 × 60 × 60 · 1 × Ø 30 · 8,00 m · −0,50"; 2 estacas por bloco → rodapé "68 bloco(s) · 136 estaca(s)" e prévia com blocos alongados girados com a parede e dois círculos cada; Lançar pela pílula → status; botão zera e "Relançar" aparece; dois Desfazer devolvem pilares (66) e fundações (2 pilares pré-existentes sem bloco). Captura `out-fd/fd-01-previa.png`.

## O pilar desce até o bloco (16/09/2026, print do 3D: casa flutuando sobre os blocos)

O pilar parava no piso (base 0) e o bloco começava em −0,50 m: 50 cm de vazio. O lote das
fundações passou a acrescentar, depois das estacas, um `SetStructuralProps` por pilar do
pavimento cujo pé está acima do arrasamento: `baseMm = −arrasamento`, `alturaMm = topo − base`
(`pilaresQueDescem`). O pilar continua cruzando o piso, então arranjo e desconto da parede não
mudam; `conferirPlanoDeFundacoes` confere que desceram. Idempotente (segunda rodada: nenhum
pilar a descer). Na planta do usuário: 16 pilares descem para −0,50 ao Relançar as fundações.

## Viga baldrame (16/09/2026, print do 3D: blocos e estacas soltos)

> faltou a viga baldrame

O lote das fundações ganhou a **viga baldrame** (`VIGA_FUNDACAO`, tipo já do kernel): UMA por
cadeia de paredes do pavimento (as mesmas cadeias das vigas), apoiada no topo dos blocos e
subindo até o piso — `baseMm = −arrasamento`, `alturaMm = arrasamento` (15 × 50 com o padrão);
largura = espessura da parede, mín. 15 cm (`LARGURA_MINIMA_DA_BALDRAME_MM`); recua até a face do
pilar em cada ponta (`recuarAteAFaceDoPilar`, extraída do módulo de vigas e agora exportada, com
`pontasDaCadeia` e `cadeiaJaTemViga`) e nasce cedendo ao pilar intermediário que ainda cruza.
Topo no piso ⇒ não cruza o piso, não entra no perfil da parede, parede nenhuma cede (provado:
zero sobreposição parede × baldrame). Rótulo `VB<n>`.

Hipótese nova `vigaBaldrame` (padrão ligada; quem já tinha as hipóteses salvas ganha ligada),
checkbox "Viga baldrame" na gaveta. Comandos: blocos, estacas, baldrames, `SetCedeSobreposicao`
das baldrames, pilares que descem; `conferirPlanoDeFundacoes` confere os três grupos de ids e o
cede. `fundacoesExistentesNoNivel` inclui baldrame (Relançar apaga as três). Blocos já lançados
antes desta versão: "Fundações automáticas" propõe SÓ as baldrames (na planta do usuário: 7,
prova ok). Prévia: segunda tabela "Prévia das vigas baldrame"; tracejado no desenho; contagem do
botão = blocos + baldrames; rodapé e status listam os três.

Prova: `blueprintFundacoesAutomaticas.test.ts` (+3, 12) · editor (+1, 91: prévia com 4 baldrames
"15 × 50 · topo no piso", Lançar "4 bloco(s), 8 estaca(s) e 4 baldrame(s)", checkbox persiste e
some da prévia) · suíte 328/4321 · tsc · build.

## Peça enterrada cresce para baixo (16/09/2026, print do 3D: estaca esticada atravessando o bloco)

> ao alterar o comprimento da estaca, deve aumentar no sentido do terreno e não no sentido do bloco de coroamento

`SetStructuralProps { alturaMm }` mantém a base e empurra o topo — certo para pilar e viga. Na
estaca o topo é o que está amarrado (base do bloco). `PainelEstruturaSelecionada` ganhou
`camposDaNovaAltura(estrutura, alturaMm)`: peça com topo no piso ou abaixo (`base + altura ≤ 0`)
mantém o topo e desce a base (`baseMm = topo − altura`); vale para estaca, bloco (topo no
arrasamento) e baldrame (topo no piso). Pilar que desce até o bloco (topo +2,80) segue crescendo
para cima. O campo da estaca se chama **Comprimento** e a ajuda diz "cresce para baixo". Sem
mudança no kernel.

Prova: `__tests__/components/PainelEstruturaSelecionada.test.tsx` (5: estaca 8→10 m → base
−11,10; bloco e baldrame; pilar só altura; campo Comprimento manda altura e base; pilar só
altura) · suíte 328/4331 · tsc · build.
