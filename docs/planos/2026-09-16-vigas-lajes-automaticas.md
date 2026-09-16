# Planta Inteligente — Lançamento automático de vigas e lajes

**Data:** 16/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> aproveitar a experiencia com a implementacao do lançamento automatico de pilares e entao implementar também Lançamento automático de vigas e lajes

## Contexto

Ontem entrou o lançamento automático de pilares (`docs/planos/2026-09-15-pilares-automaticos.md`).
O molde — planejador puro → prévia (tabela + tracejado no canvas) → um `runBatch` provado por
simulação → "Relançar" sempre disponível — e as peças de geometria (grafo de eixos, cadeias
colineares, ids previstos) são reaproveitados aqui para os dois outros tipos do grupo
Estrutural. **Sem campo novo no kernel, sem bump de `KERNEL_VERSION`.**

**O que isto NÃO é**: dimensionamento. L/10 é regra de lançamento; 12 cm de largura e as
espessuras de laje são mínimos da NBR 6118 (13.2.2 / 13.2.4.1). Cálculo, armadura e flecha são
do responsável técnico — as gavetas dizem isso.

## Decisões

Com o usuário (16/09):

| Tema | Decisão |
|---|---|
| Vigas onde | Uma viga por parede, de pilar a pilar (cadeia colinear = uma viga); largura = espessura da parede |
| Altura | h = maior vão entre apoios ÷ 10 (ou 12), a cada 5 cm, mínimo 30 cm |
| Lajes onde | Uma laje por ambiente fechado (anel do ambiente), apoiada no topo das paredes; 10 cm (8/10/12/15) |
| Ribbon | Dois botões separados no grupo Estrutural, cada um com a própria gaveta |

Minhas:

- **D1** Apoios da viga = pontas da cadeia + encontros ao longo dela + pilares EXISTENTES sobre ela. A gaveta pede para lançar os pilares antes.
- **D2** Largura = maior espessura da cadeia, mín. 12 cm; a viga fica no eixo (embutida); só avisa quando é 4 cm ou mais mais larga que a parede mais fina.
- **D3** Topo no pé-direito (`baseMm = pé-direito − h`); paredes da cadeia cedem.
- **D4** Cadeia já tem viga quando uma VIGA existente é colinear (pontas a ≤ tol do eixo) e se sobrepõe em mais de tol; viga só no prolongamento não conta.
- **D5** Laje por `Space`; anel = `space.ring`; ilha ignorada com aviso; ambiente < 0,5 m² fora do plano.
- **D6** Ambiente já tem laje quando uma LAJE existente contém o `interiorPoint`. A laje não cede parede.
- **D7** Rótulos `V<n>` / `L<n>` pelo maior do modelo (`proximoNumeroDoRotulo`).
- **D8** Relançar apaga só as peças do próprio tipo no pavimento.
- **D9** A prop do canvas virou `pecasPrevistas` (`PecaPrevista` = kind + pontos + seção); `pegadaDaPecaPrevista` desenha PONTO/LINHA/AREA pelo mesmo `contornoEmPlanta` da peça de verdade; laje com preenchimento mais leve e rótulo no `interiorPoint`. A pílula da gaveta recolhida é parametrizada pela tarefa.

## O que mudou

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintPilaresAutomaticos.ts` | exporta `cadeiasDeParedes`, `coordenadaNaCadeia`, `paredeEm`, `pontoNaParede`, `proximoNumeroDoRotulo`, `pegadaDaPecaPrevista` + `PecaPrevista` (wrappers antigos mantidos) | testes de pilares (25) verdes ✅ |
| `utils/blueprintVigasLajesAutomaticas.ts` (novo) | `planejarVigas` / `relancarVigas` / `conferirPlanoDeVigas`, `alturaDaViga`, `planejarLajes` / `relancarLajes` / `conferirPlanoDeLajes`, hipóteses e constantes | `__tests__/blueprintVigasLajesAutomaticas.test.ts` (14) verde ✅ |
| `components/blueprint/BlueprintCanvas.tsx` | prop `pecasPrevistas` (era `pilaresPrevistos`), desenho por tipo | typecheck ✅ · app real ✅ |
| `components/blueprint/BlueprintEditor.tsx` | tarefas `vigas` e `lajes`; hipóteses persistidas (`blueprint:vigasAutomaticas`, `blueprint:lajesAutomaticas`); dois botões no grupo Estrutural; duas gavetas (hipóteses, selects, prévia, faixas, status); rodapés com Relançar/Lançar; pílula genérica | `BlueprintEditor.test.tsx` (+3, 88) ✅ · `check-ui-standard.sh` ✅ |

## Verificação

- `npx tsc --noEmit` ✅ · suíte completa 325 arquivos / 4294 testes ✅ · `npm run build` ✅ · goldens intactos.
- App real (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 18, 0 erros JS), estudo com 45 paredes + retângulo e interna: Pilares 66 → Lançar; Vigas 38 (prévia tracejada ao longo de cada parede, rótulos V34…, tabela com seção por vão) → Lançar pela pílula; Lajes 7 (prévia preenchendo cada ambiente, L6/L7; "Cozinha 6,70 m²") → Lançar; três Desfazer devolvem 66 / 38 / 7. Capturas `out-vl/vl-0*.png`.
