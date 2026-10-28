# Gerar massa avisa quando a zona mudou no Mapa Regulatório (28/10/2026)

## Pedido original

> "verifique se o gerador de massa esta considerando os recuos informados em mapa regulatorio"

## O que a verificação achou (banco, 28/10/2026)

- O gerador considera os recuos: o envelope sai de `regua.recuosBase = zona.recuos`. As divisas das plantas do Garden
  têm papel (Frente 18 m, Fundos 21 m, laterais 63 m), então cada recuo cai no lado certo.
- O que ele usa é a **cópia** que a planta guardou ao aplicar a zona (`blueprint_study_urban_context`), não o Mapa de
  hoje.
- A zona aplicável do Garden (ZEPEC 2) pede hoje **frente 5 m e fundos 3 m**. As duas plantas ("Garden" e "Planta
  26/10/2026") guardaram, em 27/10, **frente 1,5 m e fundos 0**.
- Os outros limites batem: TO 90 %, CA 3, gabarito 18 m, permeabilidade 5 %.
- O painel Zona urbanística já dizia "A zona mudou… aplique de novo". A tela do Gerar massa não dizia nada.

## Decisão do usuário

**Avisar no Gerar massa.** Foram oferecidas também a atualização automática e a atualização das plantas do Garden
direto no banco.

## Mudança

1. **`diferencasDaZona`** (`utils/blueprintZonaUrbanistica.ts`):
   - diz campo a campo o que a zona de origem diz hoje diferente da cópia em vigor;
   - usa as mesmas regras de `zonaDerivou`: o que foi ajustado à mão não entra, e os recuos passam por
     `recuosDaZona` dos dois lados;
   - `zonaDerivou` passou a ser `diferencas.length > 0`;
   - `textoDaDiferenca` escreve, por exemplo, "recuo de frente: 1,5 m → 5 m".
2. **Hook da zona:** expõe `diferencas`.
3. **Tela do Gerar massa:**
   - aviso âmbar "A zona ZEPEC 2 mudou no Mapa Regulatório depois de aplicada nesta planta — o gerador ainda usa os
     valores antigos", com a lista do que mudou;
   - botão **"Aplicar de novo"** (`zona.aplicarZona` da zona aplicada). Depois de aplicar, a régua do gerador já sai
     com os valores novos.

## Verificação

- **Testes:**
  - `blueprintZonaUrbanistica` (+2): o caso do Garden e o ajuste à mão;
  - `TelaGeradorDeMassaEmpreendimento` (+1);
  - suítes da zona.
- **Mecânicas:** tsc; check-ui-standard; `BlueprintEditor.test.tsx` sozinho (284/284).
