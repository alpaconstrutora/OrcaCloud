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
 * De onde a câmera olha, como direção unitária do CENTRO para a CÂMERA.
 *
 * É a vista de três quartos de sempre — um pouco à direita, um pouco à frente,
 * de cima. Só o SENTIDO mora aqui; a distância é calculada, não arbitrada.
 */
export const DIRECAO_DA_CAMERA: [number, number, number] = (() => {
  const v: [number, number, number] = [1, 0.72, 1.2];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

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

/**
 * A que distância a câmera cabe TUDO — o "zoom automático" de verdade.
 *
 * ─── POR QUE NÃO UM MÚLTIPLO DA MAIOR DIMENSÃO ──────────────────────────────
 *
 * Era o que havia antes: a câmera se punha a `spread × 1,7` do centro, um
 * palpite que não sabe nem a abertura da lente nem o formato da tela. Numa
 * planta com o desenho de paredes perto da origem e a estrutura importada de
 * IFC vinte metros adiante, o resultado foi o desenho ocupando pouco mais da
 * metade da largura, perdido num mar de grade — o relato foi "a planta 3D não
 * ocupa toda a área disponível".
 *
 * ─── A CONTA ────────────────────────────────────────────────────────────────
 *
 * Cada um dos 8 cantos da caixa tem de cair dentro do tronco de visão. Com a
 * câmera em `centro + u·D` e `f = −u` apontando para o centro, um canto a
 * `rel` do centro fica a `v_f = rel·f + D` de profundidade, e precisa de
 * `|rel·direita| ≤ v_f·tanH` e `|rel·cima| ≤ v_f·tanV`. Isolando D e tomando o
 * MAIOR entre os 16 requisitos, sai a menor distância que cabe todos.
 *
 * `margem` é a folga de respiro; 1 encostaria o desenho na borda.
 */
export function distanciaParaCaber(
  raio: [number, number, number],
  fovGraus: number,
  aspecto: number,
  margem = 1.08,
): number {
  const f: [number, number, number] = [
    -DIRECAO_DA_CAMERA[0],
    -DIRECAO_DA_CAMERA[1],
    -DIRECAO_DA_CAMERA[2],
  ];
  // `direita` = f × cima do mundo; `cima` = direita × f. A câmera nunca olha na
  // vertical exata, então o produto vetorial não degenera.
  const dir: [number, number, number] = [f[2], 0, -f[0]];
  const nd = Math.hypot(dir[0], dir[1], dir[2]);
  const direita: [number, number, number] = [dir[0] / nd, dir[1] / nd, dir[2] / nd];
  const cima: [number, number, number] = [
    direita[1] * f[2] - direita[2] * f[1],
    direita[2] * f[0] - direita[0] * f[2],
    direita[0] * f[1] - direita[1] * f[0],
  ];

  const tanV = Math.tan(((fovGraus / 2) * Math.PI) / 180);
  const tanH = tanV * aspecto;

  let d = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rel: [number, number, number] = [sx * raio[0], sy * raio[1], sz * raio[2]];
        const pf = rel[0] * f[0] + rel[1] * f[1] + rel[2] * f[2];
        const pr = rel[0] * direita[0] + rel[1] * direita[1] + rel[2] * direita[2];
        const pc = rel[0] * cima[0] + rel[1] * cima[1] + rel[2] * cima[2];
        d = Math.max(d, Math.abs(pr) / tanH - pf, Math.abs(pc) / tanV - pf);
      }
    }
  }
  // O piso evita a câmera dentro da peça quando a caixa é minúscula.
  return Math.max(d * margem, 2);
}

/**
 * PASSO e ALCANCE da grade de chão — o que a impede de tremer.
 *
 * ─── O DEFEITO ──────────────────────────────────────────────────────────────
 *
 * A grade era fixa: células de 1 m desenhadas até `spread × 8`. Numa planta
 * pequena isso dá ~70 m e cada célula ainda ocupa dezenas de pixels — limpo.
 * Numa planta com estrutura importada de IFC, `spread` passa de 50 m e a grade
 * ia além de 400 m; lá a célula de 1 m vale menos de um pixel e o que aparece é
 * MOIRÉ — uma faixa perto do horizonte que cintila e anda junto com quem
 * orbita. Relatado em 06/09/2026 como "o grid está tremendo", e só ficou
 * evidente depois que o canvas voltou à altura cheia: antes essa faixa mal
 * cabia na tela.
 *
 * ─── O LIMITE ───────────────────────────────────────────────────────────────
 *
 * Uma célula a distância `z` projeta `passo · (altura em px) / (2·tg(fov/2)) ·
 * sen(inclinação) / z` pixels. Com a lente (50°), a altura típica do canvas e a
 * inclinação de três quartos daqui, ela cai abaixo de ~5 px além de
 * `passo × 60`. Daí o alcance ser limitado a isso — e o passo crescer em
 * degraus, para que uma cena grande ainda tenha grade até longe: 1 m numa casa,
 * 10 m num terreno inteiro.
 *
 * Os degraus são do MODELO, não da câmera. Dar zoom não muda o passo: se
 * mudasse, a granularidade pulsaria enquanto se navega, que é outra forma de
 * tremer.
 */
export function gradeDaCena(spread: number): { passo: number; alcance: number } {
  const passo = spread <= 14 ? 1 : spread <= 35 ? 2 : spread <= 70 ? 5 : 10;
  return { passo, alcance: Math.min(spread * 8, passo * 60) };
}

/**
 * O conteúdo SAIU do quadro enquadrado por último?
 *
 * É o gatilho do reenquadramento automático. Reenquadrar a cada mudança
 * brigaria com quem está navegando: desenhar uma parede puxaria a câmera de
 * volta a cada clique. Uma importação de centenas de peças a vinte metros dali
 * cai fora da caixa e reenquadra; uma parede a mais dentro da casa, não.
 */
export function saiuDoQuadro(
  anterior: { centro: [number, number, number]; spread: number } | null,
  atual: Enquadramento3d,
): boolean {
  if (!anterior) return true;
  if (atual.spread > anterior.spread * 1.2) return true;
  const andou = Math.hypot(
    atual.centro[0] - anterior.centro[0],
    atual.centro[2] - anterior.centro[2],
  );
  return andou > anterior.spread * 0.5;
}
