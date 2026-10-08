// utils/blueprint3dSelecao.ts
//
// Clicar numa peça do 3D sem confundir com ORBITAR.
//
// ─── O PROBLEMA ──────────────────────────────────────────────────────────────
//
// Numa cena 3D o mesmo botão do mouse faz duas coisas: arrastar gira a câmera,
// clicar escolhe a peça. O `onClick` do R3F dispara no `pointerup` mesmo depois
// de um arraste — então girar a cena e soltar o botão sobre uma parede a
// selecionaria, e a pessoa veria o painel trocar sem ter pedido nada.
//
// A decisão mora aqui, e não no componente, porque `Blueprint3DViewer` está sob
// `@ts-nocheck` (a augmentation de JSX do R3F saiu do programa TS) — nem
// compilador nem teste alcançam lá dentro. É a mesma lição que o enquadramento
// e a grade já custaram.

/** Quantos pixels de arraste ainda contam como clique parado. */
export const TOLERANCIA_DE_CLIQUE_PX = 4;

/**
 * Foi CLIQUE, ou foi órbita?
 *
 * Quatro pixels: acima disso a intenção era girar; abaixo, escolher. O limite
 * não é zero de propósito — a mão treme, e exigir imobilidade perfeita
 * transformaria metade dos cliques em nada, que é um defeito pior porque parece
 * intermitente.
 *
 * Sem ponto de partida não há como saber, e o silêncio é a resposta segura:
 * selecionar sem ter visto o `pointerdown` seria adivinhar.
 */
export function ehClique(
  inicio: { x: number; y: number } | null,
  fim: { x: number; y: number },
): boolean {
  if (!inicio) return false;
  return Math.hypot(fim.x - inicio.x, fim.y - inicio.y) <= TOLERANCIA_DE_CLIQUE_PX;
}

// ─── E10.3 do roadmap de climatização (08/10/2026): o EDITOR no 3D ──────────

/**
 * A seleção depois de um clique numa peça do 3D — a MESMA regra do 2D
 * (`BlueprintCanvas`): com Shift, Ctrl ou ⌘ o clique ACUMULA (põe ou tira a
 * peça); sem modificador, a seleção vira só ela.
 */
export function selecaoDoClique(
  atual: readonly string[] | ReadonlySet<string>,
  id: string,
  mod: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
): string[] {
  if (!(mod.shiftKey || mod.ctrlKey || mod.metaKey)) return [id];
  const lista = [...atual];
  return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
}

/**
 * O deslocamento de um arraste no 3D (METRO, Y para cima) no plano do MODELO
 * (mm): o X do 3D é o x da planta e o Z do 3D é o y — sem troca de sinal. A
 * altura é IGNORADA de propósito: o `TranslateEntities` só move em planta (cota
 * não muda). Arredondado ao `passoMm`, como o arraste do 2D.
 */
export function deltaDoMundoParaModelo(d: readonly [number, number, number], passoMm = 10): { x: number; y: number } {
  const r = (v: number) => Math.round((v * 1000) / passoMm) * passoMm + 0;
  return { x: r(d[0]), y: r(d[2]) };
}

/** A CAIXA DE CORTE, em METRO no 3D (Y = altura). */
export interface CaixaDeCorte {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Os seis planos da caixa na convenção do `THREE.Plane`: fica VISÍVEL o lado em
 * que `normal · p + constante ≥ 0` — ou seja, o miolo da caixa.
 */
export function planosDaCaixaDeCorte(c: CaixaDeCorte): { normal: [number, number, number]; constante: number }[] {
  return [
    { normal: [1, 0, 0], constante: -c.min[0] },
    { normal: [-1, 0, 0], constante: c.max[0] },
    { normal: [0, 1, 0], constante: -c.min[1] },
    { normal: [0, -1, 0], constante: c.max[1] },
    { normal: [0, 0, 1], constante: -c.min[2] },
    { normal: [0, 0, -1], constante: c.max[2] },
  ];
}

/** O ponto (metro) fica dentro da caixa? — o que os planos deixam ver. */
export const dentroDaCaixa = (c: CaixaDeCorte, p: readonly [number, number, number]) =>
  planosDaCaixaDeCorte(c).every((pl) => pl.normal[0] * p[0] + pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.constante >= -1e-9);

/** A caixa inicial: o enquadramento do modelo (centro ± meia extensão) com uma folga. */
export function caixaInicial(enq: { centro: readonly number[]; raio: readonly number[] }, folgaM = 0.5): CaixaDeCorte {
  return {
    min: [enq.centro[0] - enq.raio[0] - folgaM, enq.centro[1] - enq.raio[1] - folgaM, enq.centro[2] - enq.raio[2] - folgaM],
    max: [enq.centro[0] + enq.raio[0] + folgaM, enq.centro[1] + enq.raio[1] + folgaM, enq.centro[2] + enq.raio[2] + folgaM],
  };
}

/** Um lado da caixa mudou: o min nunca passa do max (fica a pelo menos `folgaM` dele). */
export function limitarCaixa(c: CaixaDeCorte, folgaM = 0.05): CaixaDeCorte {
  const min = [...c.min] as [number, number, number];
  const max = [...c.max] as [number, number, number];
  for (let i = 0; i < 3; i++) if (min[i] > max[i] - folgaM) min[i] = max[i] - folgaM;
  return { min, max };
}
