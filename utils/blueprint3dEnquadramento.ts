// utils/blueprint3dEnquadramento.ts
//
// Onde a câmera do 3D tem de estar para caber o que existe.
//
// ─── POR QUE ISTO SAIU DO COMPONENTE ──────────────────────────────────────────
//
// A conta morava dentro do `Blueprint3DViewer`, que está sob `@ts-nocheck` (a
// augmentation de JSX do R3F foi tirada do programa TS). E ela estava INCOMPLETA:
// olhava paredes, telhado e lote, e ignorava estrutura e escada.
//
// Ninguém notou enquanto todo estudo tinha paredes. Quando a importação de IFC
// passou a trazer 393 peças estruturais, um estudo SÓ com estrutura deixava a
// lista de pontos vazia, a câmera caía no padrão (origem, alcance 20) e o modelo
// — a vinte metros dali — não aparecia. O relato foi "o IFC não aparece na
// planta 3D", e a causa não era o IFC.
//
// Aqui a função é pura e o compilador a verifica. O teste companheiro cobre o
// caso que faltava: um modelo sem parede nenhuma.

import {
  contornoDaEscada,
  contornoEmPlanta,
  medirAgua,
  medirEscada,
  type BlueprintModel,
} from './blueprintKernel';
import { medirTerreno } from './blueprintTerreno';
// A conta de CÂMERA mora em `camera3d.ts`: ela é geometria pura e serve
// qualquer cena 3D — a Planta AI usa a mesma. O que fica aqui é o que sabe do
// MODELO da Planta Inteligente: quais famílias entram na caixa.
export {
  DIRECAO_DA_CAMERA,
  distanciaParaCaber,
  gradeDaCena,
  saiuDoQuadro,
} from './camera3d';
import { saiuDoQuadro as _saiu } from './camera3d';

/** Milímetro do modelo → unidade de mundo do viewer. */
export const ESCALA_3D = 0.001;

export interface Enquadramento3d {
  /** Para onde a câmera olha, em unidade de mundo. */
  centro: [number, number, number];
  /** Meia-dimensão da caixa em cada eixo do mundo (X, Y, Z). */
  raio: [number, number, number];
  /** A maior dimensão do que existe — dita luz e grade. */
  spread: number;
  /** Cota do ponto mais alto. */
  alturaTopo: number;
  /** `false` quando não há nada desenhado: o chamador usa o padrão. */
  temConteudo: boolean;
}

/** O padrão de cena vazia. Existe nomeado para o teste poder afirmá-lo. */
export const ENQUADRAMENTO_VAZIO: Enquadramento3d = {
  centro: [0, 0, 0],
  raio: [10, 3, 10],
  spread: 20,
  alturaTopo: 6,
  temConteudo: false,
};

/**
 * A caixa do que existe, em unidade de mundo.
 *
 * ⚠️ TODAS as famílias entram. Acrescentar uma família ao kernel e esquecer
 * desta função é o defeito de 05/09/2026 se repetindo: a peça aparece na cena e
 * some do enquadramento, e num desenho que só tenha ela a câmera olha para o
 * vazio.
 *
 * `fundo` é contabilizado junto do topo porque estaca desce metros abaixo do
 * zero: centrar o olhar em `topo / 2` deixava a fundação fora do quadro. Sem
 * fundação, `fundo` é 0 e a conta devolve o que devolvia antes.
 */
export function enquadramentoDoModelo(
  model: BlueprintModel,
  mostrarTerreno: boolean,
): Enquadramento3d {
  const S = ESCALA_3D;
  const xs: number[] = [];
  const zs: number[] = [];
  let topo = 3;
  let fundo = 0;

  const cotaDo = (levelId: string) =>
    model.levels.find((l) => l.id === levelId)?.elevationMm ?? 0;

  for (const w of model.walls) {
    xs.push(w.a.x * S, w.b.x * S);
    zs.push(w.a.y * S, w.b.y * S);
    topo = Math.max(topo, (cotaDo(w.levelId) + w.heightMm) * S);
  }

  // O telhado é o ponto mais alto e o beiral o mais largo.
  for (const r of model.roofs ?? []) {
    for (const p of r.pontos) {
      xs.push(p.x * S);
      zs.push(p.y * S);
    }
    topo = Math.max(topo, (cotaDo(r.levelId) + medirAgua(r).alturaMaximaMm) * S);
  }

  // ESTRUTURA: é o que a importação de IFC traz, e pode ser TUDO o que o estudo
  // tem. A pegada vem da mesma função que desenha a peça.
  for (const e of model.structures ?? []) {
    for (const q of contornoEmPlanta(e)) {
      xs.push(q.x * S);
      zs.push(q.y * S);
    }
    const base = cotaDo(e.levelId) + e.baseMm;
    topo = Math.max(topo, (base + e.alturaMm) * S);
    fundo = Math.min(fundo, base * S);
  }

  for (const e of model.stairs ?? []) {
    for (const q of contornoDaEscada(e)) {
      xs.push(q.x * S);
      zs.push(q.y * S);
    }
    topo = Math.max(topo, (cotaDo(e.levelId) + medirEscada(model, e).desnivelMm) * S);
  }

  if (mostrarTerreno) {
    const t = medirTerreno(model.boundaries);
    for (const p of t?.anel ?? []) {
      xs.push(p.x * S);
      zs.push(p.y * S);
    }
  }

  if (xs.length === 0) return ENQUADRAMENTO_VAZIO;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    centro: [(minX + maxX) / 2, (topo + fundo) / 2, (minZ + maxZ) / 2],
    raio: [(maxX - minX) / 2, (topo - fundo) / 2, (maxZ - minZ) / 2],
    spread: Math.max(maxX - minX, maxZ - minZ, topo - fundo, 6),
    alturaTopo: topo,
    temConteudo: true,
  };
}

