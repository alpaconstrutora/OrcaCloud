// utils/ancoragemImportacao.ts
//
// ONDE o que vem de fora cai no desenho.
//
// ─── POR QUE ISTO É UM MÓDULO PRÓPRIO ────────────────────────────────────────
//
// Nasceu dentro de `ifcParaKernel`, e saiu de lá em 07/09/2026 quando a
// importação de DXF precisou exatamente do mesmo: os dois formatos trazem
// coordenadas que não são as do desenho, e a pergunta "onde isso cai" é a
// mesma nos dois. Deixar a resposta com nome de IFC faria a importação de DXF
// depender de um módulo cujo nome mente sobre o que ela usa.
//
// ⚠️ E não é enfeite. O kernel limita coordenada a ±1.000.000 mm; medido no
// projeto arquitetônico real da empresa, o desenho está a **3.976.897 mm da
// origem** do DXF. Sem ancorar, a importação inteira é recusada com
// "x deve ser milímetro inteiro dentro de ±1000000" — e essa foi a primeira
// coisa que o harness encontrou.

import { contornoEmPlanta, type BlueprintModel } from './blueprintKernel';

export interface CaixaPlana {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const caixaDePontos = (pontos: { x: number; y: number }[]): CaixaPlana | null => {
  if (pontos.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pontos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
};

/**
 * A pegada em planta do que JÁ EXISTE no desenho.
 *
 * Paredes e estrutura entram; o lote não. O lote costuma ser bem maior que a
 * construção, e centrar a importação nele jogaria o modelo para o meio do
 * terreno em vez de para cima do desenho.
 */
export function caixaDoDesenho(model: BlueprintModel): CaixaPlana | null {
  const pontos: { x: number; y: number }[] = [];
  for (const w of model.walls) pontos.push(w.a, w.b);
  for (const e of model.structures ?? []) pontos.push(...contornoEmPlanta(e));
  return caixaDePontos(pontos);
}

/** Onde ancorar o que vem do IFC. */
export type AncoragemIfc = 'ARQUIVO' | 'ORIGEM' | 'DESENHO';

/**
 * Quanto transladar as peças, em mm.
 *
 * - `ARQUIVO`: nada. É o padrão, e é o certo quando as duas origens coincidem.
 * - `ORIGEM`: encosta o canto da pegada em (0, 0).
 * - `DESENHO`: faz o CENTRO da pegada coincidir com o centro do que já está
 *   desenhado. Centro, e não canto, porque estrutura e arquitetura raramente
 *   têm o mesmo contorno — alinhar cantos encaixaria dois retângulos de
 *   tamanhos diferentes por um vértice arbitrário.
 *
 * Sem desenho existente, `DESENHO` não tem em que se apoiar e não desloca nada:
 * inventar um alvo seria pior que não mexer.
 */
export function deslocamentoDaImportacao(
  ancoragem: AncoragemIfc,
  pecas: CaixaPlana | null,
  desenho: CaixaPlana | null,
): { dx: number; dy: number } {
  if (!pecas || ancoragem === 'ARQUIVO') return { dx: 0, dy: 0 };
  if (ancoragem === 'ORIGEM') return { dx: -pecas.minX, dy: -pecas.minY };
  if (!desenho) return { dx: 0, dy: 0 };
  return {
    dx: (desenho.minX + desenho.maxX) / 2 - (pecas.minX + pecas.maxX) / 2,
    dy: (desenho.minY + desenho.maxY) / 2 - (pecas.minY + pecas.maxY) / 2,
  };
}

/**
 * As paredes do IFC viradas comandos do kernel.
 *
 * ─── AS TRÊS CONTAS, E POR QUE CADA UMA ERRA EM SILÊNCIO ────────────────────
 *
 * 1. **A unidade.** O eixo vem em unidade de ARQUIVO — a cadeia de placement
 *    não converte nada, ao contrário da matriz do corpo. Sem `fatorParaMm`
 *    ninguém adivinha: as paredes são RECUSADAS, e a tela diz por quê.
 *
 * 2. **O eixo verdadeiro.** A linha que o arquivo desenha pode ser uma FACE, e
 *    não o centro (ver `ParedeParametrica.deslocamentoDoCentro`). O kernel
 *    guarda o EIXO em `a`/`b` e a face só como memória em `alinhamento` — então
 *    a correção é aplicada AQUI, no ponto. Sem ela, cada parede entra meia
 *    espessura fora, todas para o mesmo lado: o desenho fecha, com os ambientes
 *    errados.
 *
 * 3. **A altura.** Corpo recortado pelo telhado não tem altura de extrusão, e
 *    ela sai do pé-direito do nível — decisão de quem importa, não daqui.
 *    `null` diz "não sei", que é diferente de zero.
 *
 * ⚠️ A FUNÇÃO DA CAMADA É DECLARADA, NÃO LIDA. `IfcMaterialLayer` tem um campo
 * `Category`, e medido nos dois arquivos reais ele vem `$` num e `'Generisch'`
 * no outro — nenhum diz se a camada é estrutural, vedação ou revestimento.
 * Deduzi-la da espessura ou do nome do material seria adivinhar num campo que o
 * 3D e o `LoadBearing` do IFC leem. Toda camada entra como `VEDACAO`, e quem
 * quiser corrigir corrige no painel.
 */
