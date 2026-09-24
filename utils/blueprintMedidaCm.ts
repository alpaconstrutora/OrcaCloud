// utils/blueprintMedidaCm.ts
//
// ESQUADRIA E GUARDA-CORPO SE MEDEM EM CENTÍMETRO (P2.46, 23/09/2026).
//
// Pedido do usuário: *"medidas de portas, janelas e guarda corpo em
// centímetros, que é medida padrão em arquitetura"*. Uma porta é "80 × 210",
// uma janela é "120 × 100 com peitoril 100", um guarda-corpo tem "110" — é
// assim que se especifica, se desenha e se compra.
//
// ⚠️ O MODELO NÃO MUDA. O kernel guarda milímetro INTEIRO e recusa qualquer
// outra coisa (`assertIntegerMm`); centímetro é unidade de TELA. Tudo o que
// entra aqui sai em milímetro inteiro, e tudo o que sai para a tela vem daqui.
//
// ─── POR QUE A CASA DECIMAL É VARIÁVEL ──────────────────────────────────────
//
// Exibir centímetro com zero casa perderia o milímetro: 2105 mm viraria
// "211 cm", e o campo é confirmado no `blur` — bastaria clicar dentro e sair
// para gravar 2110 mm. Uma medida do usuário mudaria sozinha, sem ninguém ter
// digitado nada. Exibir sempre com uma casa resolveria isso, mas encheria a
// tela de "90,0", "210,0", "100,0" — o caso comum, que é justamente onde o
// centímetro devia ser mais limpo que o milímetro.
//
// Então a casa aparece só quando existe: múltiplo de 10 mm sai inteiro
// ("90 cm"), o resto sai com uma casa ("210,5 cm"). Uma casa basta porque
// 0,1 cm É o milímetro — abaixo disso o modelo não guarda.

/** Quantas casas decimais este valor precisa para não perder o milímetro. */
export function casasEmCm(mm: number): 0 | 1 {
  return Math.round(mm) % 10 === 0 ? 0 : 1;
}

/** Milímetro do modelo → número em centímetro, para o campo editável. */
export function mmParaCm(mm: number): number {
  return Math.round(mm) / 10;
}

/** Centímetro digitado → milímetro inteiro do modelo. */
export function cmParaMm(cm: number): number {
  return Math.round(cm * 10);
}

/**
 * Milímetro → texto em centímetro, com vírgula decimal e sem sufixo.
 *
 * Para resumo e etiqueta, onde não há campo: `90`, `210,5`.
 */
export function textoEmCm(mm: number): string {
  return mmParaCm(mm).toFixed(casasEmCm(mm)).replace('.', ',');
}
