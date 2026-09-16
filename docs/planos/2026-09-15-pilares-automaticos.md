# Planta Inteligente — Lançamento automático de pilares

**Data:** 15/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> implememte Lançamento automático de pilares

## Contexto

O grupo Estrutural da Planta (`BlueprintModel.structures`, `kind: 'PILAR'`) só nascia à mão:
Componentes → Estrutura → Pilar, um clique por peça. Uma casa de 12 cômodos pede 30–40 cliques
só nos cantos, e ninguém confere depois se algum vão passou de 5 m.

Este pedido fecha a lacuna com o mesmo molde dos Circuitos automáticos: **o sistema propõe, quem
projeta confirma, Ctrl+Z desfaz o lote inteiro.** Planejador puro → prévia (tabela na gaveta e
contornos tracejados no desenho) → um `runBatch` provado antes por simulação. **Sem campo novo
no kernel, sem bump de `KERNEL_VERSION`, sem export novo em `utils/blueprintKernel/index.ts`.**

**O que isto NÃO é**: dimensionamento. 19 × 19 cm é o mínimo da NBR 6118 (13.2.3), não um
cálculo; o lançamento marca ONDE a estrutura convencional costuma ter pilar. Seção, carga e
armadura são do responsável técnico — a gaveta diz isso.

## Decisões

Com o usuário (15/09):

| Tema | Decisão |
|---|---|
| Onde | Um pilar em cada encontro de paredes (canto, T, cruzamento) + intermediários quando a distância entre apoios passa do vão máximo |
| Vão máximo | 5 m (editável: 4 / 5 / 6 m) |
| Seção padrão | 19 × 19 cm; lado maior ao longo da parede |
| Extensão vertical | Pavimento ativo: base 0, altura = pé-direito. Outro pavimento = rodar lá |
| Entrada | Prévia + "Lançar N pilar(es)"; um `runBatch`; Ctrl+Z desfaz. Sem `sugerido` no kernel |
| Parede cede | Sim, no mesmo lote (`SetCedeSobreposicao`) para cada parede que o pilar cruza |

Minhas:

- **D1** Nó = encontro de EIXOS; pilar centrado no nó. `pontesEstruturais` já reconhece o pilar de PONTO no piso → ambientes, áreas e perímetros não mudam (travado por teste).
- **D2** Emenda em linha reta não é encontro nem apoio: as paredes viram UMA cadeia para o vão. Só emenda ponta-com-ponta encadeia; `overlap` vai para avisos.
- **D3** Ponta solta não ganha pilar, mas é extremidade de trecho; a gaveta conta.
- **D4** `incluirInternas=false` filtra as paredes antes do grafo (`paredeEhExterna !== false`; `null` = externa, com aviso).
- **D5** `larguraMm = max(b,h)` ao longo da parede, `rotacaoDeg` = ângulo do eixo (0..179); hospedeira do nó = mais grossa → mais longa → menor id.
- **D6** Intermediário em abertura desvia para a borda livre mais próxima, uma vez; vão que ficar > máximo vira aviso; sem posição → fora do plano.
- **D7** Nós a menos de uma seção um do outro dividem um pilar; **o mesmo raio vale para pilar existente** (senão um T colado num canto voltava na segunda rodada — achado na prova no app).
- **D8** Paredes que cedem = incidentes ao nó + hospedeira do intermediário, únicas, pulando as que já cedem.
- **D9** Rótulo `P<n>` continua do maior `P<n>` do modelo inteiro; ordem única (x, y).
- Sobressair 2 cm por lado (19 em 15) é normal e dito na gaveta; aviso por linha só acima de 5 cm por lado.
- **A gaveta é modal e cobre o canvas com véu**: "Ver prévia no desenho" recolhe a gaveta (mecanismo `drawerRecolhido` do "Do PDF") e uma pílula sobre o desenho devolve a gaveta ou lança dali.

## O que mudou

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintPilaresAutomaticos.ts` (novo) | hipóteses, `nosDeParede`, cadeias colineares, `planejarPilares`, `idsPrevistosDeEstrutura`, `conferirPlanoDePilares`, `pegadaDoPilarPrevisto` | `__tests__/blueprintPilaresAutomaticos.test.ts` (22) verde ✅ |
| `components/blueprint/BlueprintCanvas.tsx` | prop `pilaresPrevistos` (identidade estável quando vazia) + desenho tracejado `COR_PREVIA` com rótulo | typecheck ✅ · app real ✅ |
| `components/blueprint/BlueprintEditor.tsx` | tarefa `pilares`; hipóteses persistidas (`blueprint:pilaresAutomaticos`); grupo **Estrutural** na aba Arquitetura; gaveta (hipóteses, vão, seção, internas, prévia, fora do plano, status); rodapé "Lançar N pilar(es)"; "Ver prévia no desenho" + pílula | `BlueprintEditor.test.tsx` (+3) ✅ · `check-ui-standard.sh` ✅ |

## Verificação

- `npx tsc --noEmit` ✅ · suíte completa 324 arquivos / 4273 testes ✅ · `npm run build` ✅ · goldens intactos (sem bump).
- App real (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 17, 0 erros JS), estudo com 45 paredes + retângulo e interna desenhados: ribbon "Pilares automáticos 66"; gaveta com hipóteses, vão 5 m, seção 19×19; prévia com 66 linhas (P1 T · P2 canto …); rodapé "66 pilar(es) · 34 parede(s) cedem"; "Ver prévia no desenho" recolhe a gaveta e mostra os quadrados azuis tracejados nos cantos, Ts e ao longo das paredes longas; vão 6 m → 58 linhas; "Lançar 66 pilar(es)" → status verde, botão do ribbon zera, prévia vazia; UM Desfazer → 66 de novo. Capturas `out-pil/pil-01*.png`.

## Relançar (16/09/2026)

> caso o usuário queira alterar as dimensoes dos pilares ele precisa que o botão de relançar esteja sempre disponivel

O pilar não tem marca de "automático" (decisão de 15/09: sem campo no kernel), então não há
como apagar "só os que o lançamento pôs". O gesto é o do "Refazer" dos eletrodutos:
`relancarPilares(model, levelId, hip)` apaga os pilares DO PAVIMENTO — inclusive os desenhados
à mão, dito na confirmação — e lança de novo com as hipóteses atuais, num lote só
(`DeleteStructural` × N + plano; os ids previstos seguem certos porque apagar não recua
`seq.str`). Na gaveta, o botão **"Relançar N"** (âmbar) aparece sempre que o pavimento tem
pilar, ao lado de "Lançar"; confirma via `useConfirm`; o beco "todos os encontros já têm
pilar" passa a dizer como mudar seção/vão.

Prova: unitários (+2: apaga 9, relança com 25×25, ids batem, rótulos P1…P9; sem pilar =
lançar) e editor (+1: lança 4 → muda seção → "Relançar 4" → confirmação com "25 × 25 cm" →
status → Desfazer). App real: "Relançar 68" com confirmação e status "68 apagado(s) e 68
lançado(s) com 25 × 25 cm".

## Face na face (16/09/2026)

> veja que alguns pilares estao ultrapassando os limites das paredes. principalmente nos cantos mas nao somente.

O pilar nascia centrado no eixo: 19 cm numa parede de 15 (ou 12) deixava metade do excesso
para fora. Agora, quando o pilar é mais grosso que a parede, ele é EMPURRADO para dentro até a
face dele coincidir com a face externa (`empurraoParaDentro`, pela extensão da pegada projetada
na normal da parede): no canto, para o quadrante onde as duas paredes seguem (nos dois eixos);
no T, através da parede atravessada, para o lado do ramo; no intermediário, para o lado do
ambiente (`ladoDoAmbiente`, a mesma amostragem de `paredeEhExterna`; parede interna com
ambiente dos dois lados fica no eixo); no cruzamento, no nó. Pilar mais fino que a parede fica
centrado. O deslocamento é de poucos cm (20 mm para 19 em 15; 35 mm para 19 em 12), dentro do
raio em que `pontesEstruturais` e o "já tem pilar aqui" reconhecem o nó.

Prova: unitário novo (face mínima da pegada = −75 mm = face externa, no canto, no T e no
intermediário; 14 cm em 15 fica em (0,0)); expectativas da casa atualizadas (20/3980/5980);
editor "0,02 · 0,02". Nos estudos já lançados, **Relançar** reposiciona.
