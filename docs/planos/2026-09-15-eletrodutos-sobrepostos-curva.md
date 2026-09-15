# Planta Inteligente — eletrodutos sobrepostos: leve curva e entrada no quadro

**Data:** 14–15/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído

## Pedido original

> veja print que alguns eletrodutos estao se sobrepondo. uma solucão e fazer uma leve curva no eletroduto.

E, com a primeira versão no dev server:

> ainda estao proximos, principalmente proximo ao quadro de distribuicai

## O que foi feito (desenho 2D, não modelo)

`utils/blueprintEletrodutoSobreposto.ts` (novo) + `BlueprintCanvas.tsx`:

1. **Confundíveis** = colineares que se cobrem (mesma reta a até 20 mm, sobreposição
   > 20 mm) **ou** que saem do mesmo nó com menos de 12° entre si (o leque do quadro).
   Componentes conexas viram grupos; o primeiro (por id) fica reto, os demais
   curvam `+1, −1, +2…`, sinal por orientação canônica da reta.
2. **Curva** quadrática com controle a 14 px por nível (7 px no meio); "Ø", marcas de
   condutor e "#seção" seguem o meio da curva.
3. **Entrada no quadro**: trechos ancorados no centro do quadro entram espalhados por
   80 % da largura dele, na ordem do ângulo de chegada (sem cruzar), respeitando o giro.
   Um só trecho entra pelo centro; a prumada fica no centro.
4. **Acerto do clique** segue a geometria desenhada (`geometriaDesenhada`: curva
   amostrada em 8 segmentos + entrada deslocada); a prumada mantém o acerto do módulo.

Kernel, 3D, quantitativo, hash e `pontasPresasAsPecas` continuam com o trecho reto
ancorado no centro — nenhum bump de `KERNEL_VERSION`.

## Verificação

- `__tests__/blueprintEletrodutoSobreposto.test.ts` (12): sobreposição, leque,
  grupos/níveis/sinal, determinismo, entradas (ordem, largura útil, giro 90°, prumada
  e trecho solto de fora), geometria desenhada.
- Suíte completa **316 arquivos / 4173 testes** verde · `tsc` 0 · build ok ·
  `check-ui-standard.sh` em `BlueprintCanvas.tsx` sem violação.
- Conferência visual: pelo usuário, no dev server (o roteiro Playwright foi
  dispensado); a primeira versão (só colineares, 4 px) foi julgada insuficiente perto
  do quadro e motivou os itens 1 (leque), 2 (7 px) e 3.
