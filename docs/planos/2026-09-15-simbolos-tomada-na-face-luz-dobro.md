# Planta Inteligente — símbolo da tomada na face da parede · luz 2×

**Data:** 15/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído

## Pedido original (com dois prints: o canvas e uma prancha de referência)

> 1. Aumentar 100% símbolo Luz no teto
> 2. veja prints. o simbolo da tomada deve ser alinha com a face de dentro da parede

## O que foi feito (desenho, não modelo)

1. **Luz** (`ILUMINACAO_*`): raio do símbolo × 2 (`FATOR_DO_SIMBOLO_DE_LUZ` no
   canvas); o anel da sugerida acompanha. Peça, acerto e encaixe na medida real.
2. **Tomada** (`TUG`/`TUE`): a BASE do triângulo encosta na face interna da parede
   e o símbolo inteiro fica no ambiente; a haste entra na parede até o eixo (a
   prancha de referência). Regra em `apoioDaTomada` (`utils/blueprintRede.ts`):
   `graus` (como `orientacaoDaTomada`), `recuoMm` = do ponto até a face (0 quando
   o ponto já está na face; meia espessura quando está no eixo), `aoEixoMm` =
   comprimento da haste. O ponto (`at`) não muda — é onde a peça é instalada.
   - Canvas: centro do símbolo = ponto + u·(recuo + tamanho/2); anel da sugerida,
     quadrado de piso e rótulos (VA em cima, circuito embaixo) seguem o centro.
   - **Acerto do clique**: cada tomada entra duas vezes (ponto e centro do
     símbolo, este com a largura do símbolo) — clicar no triângulo pega a tomada.
   - Prancha PDF/DXF (`blueprintPranchaEletrica.ts`): a mesma regra, em papel.

## Verificação

- `__tests__/blueprintTomadaSimbolo.test.ts` (+5): na face (recuo 0, haste 75), a
  30 mm do eixo (recuo 45), além da face (haste 120), giro declarado mantém o
  apoio, longe de parede sem recuo.
- Suíte completa **317 arquivos / 4181 testes** verde · `tsc` 0 · build ok ·
  `check-ui-standard.sh` em `BlueprintCanvas.tsx` limpo.
- App real (Playwright, escritas bloqueadas): TUG inserida junto da parede — base
  do triângulo na linha da parede, haste atravessando-a, símbolo fora da faixa da
  parede; luz de teto com o dobro do diâmetro; captura ampliada 8× olhada.
