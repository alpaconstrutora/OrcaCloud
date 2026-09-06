// utils/blueprintKernel/secaoT.ts
//
// A seção em T de uma viga — mesa e alma.
//
// ─── POR QUE ELA EXISTE ──────────────────────────────────────────────────────
//
// Medido em 06/09/2026 nos dois modelos estruturais reais: das vigas com perfil
// poligonal, 219 são T e ZERO são L, I, U ou cruz. A viga faixa/nervurada é o
// caso que faltava; o resto não aparece.
//
// ─── O CONTRATO ──────────────────────────────────────────────────────────────
//
// `larguraMm` da peça é a largura da MESA — a parte mais larga, e o que a viga
// ocupa em planta. `alturaMm` é a altura TOTAL. A mesa fica em cima.
//
//        ◄──────── larguraMm ────────►
//        ┌───────────────────────────┐  ▲            ▲
//        │           mesa            │  │ mesaAltura │
//        └────────┬─────────┬────────┘  ▼            │ alturaMm
//                 │  alma   │                        │
//                 └─────────┘                        ▼
//                 ◄─ almaLargura ─►
//
// Tudo aqui é PURO e mede a seção, não a peça: quem multiplica por comprimento
// é `medirEstrutura`.

import type { Structural } from './model';

export interface SecaoT {
  mesaAlturaMm: number;
  almaLarguraMm: number;
}

/**
 * A seção T VÁLIDA de uma peça, ou `null` quando ela é cheia.
 *
 * Recusa em vez de corrigir: uma mesa mais alta que a viga, ou uma alma mais
 * larga que a mesa, não é uma T — é dado errado, e tratá-la como retangular em
 * silêncio produziria um volume plausível. `null` faz o chamador cair no
 * caminho da seção cheia, que é o comportamento de sempre e é conferível.
 */
export function secaoTValida(s: Structural): SecaoT | null {
  const t = s.secaoT;
  if (!t) return null;
  if (!(t.mesaAlturaMm > 0) || !(t.almaLarguraMm > 0)) return null;
  if (t.mesaAlturaMm >= s.alturaMm) return null;
  if (t.almaLarguraMm >= s.larguraMm) return null;
  return t;
}

/** Área da seção, em mm². */
export function areaDaSecaoT(larguraMm: number, alturaMm: number, t: SecaoT): number {
  return larguraMm * t.mesaAlturaMm + t.almaLarguraMm * (alturaMm - t.mesaAlturaMm);
}

/**
 * Perímetro que precisa de FÔRMA, em mm.
 *
 * A face de CIMA da mesa não entra — é a que recebe o concreto, como já
 * acontece na viga retangular (`2 × altura + base`, sem o topo). O resto do
 * contorno entra inteiro: os dois lados da mesa, as duas faces inferiores dela,
 * os dois lados da alma e o fundo.
 */
export function perimetroDeFormaDaSecaoT(
  larguraMm: number,
  alturaMm: number,
  t: SecaoT,
): number {
  const abas = larguraMm - t.almaLarguraMm; // as duas sobras da mesa, somadas
  return (
    2 * t.mesaAlturaMm + // os dois lados da mesa
    abas + // as faces de baixo das abas
    2 * (alturaMm - t.mesaAlturaMm) + // os dois lados da alma
    t.almaLarguraMm // o fundo
  );
}

/**
 * O contorno da seção, em coordenadas locais, com a origem no CENTRO da caixa.
 *
 * Oito vértices em sentido anti-horário, começando pelo canto inferior
 * esquerdo da alma. É o que o 3D extruda e o que o IFC escreve.
 */
export function contornoDaSecaoT(
  larguraMm: number,
  alturaMm: number,
  t: SecaoT,
): { x: number; y: number }[] {
  const meiaL = larguraMm / 2;
  const meiaA = t.almaLarguraMm / 2;
  const base = -alturaMm / 2;
  const topo = alturaMm / 2;
  const sobMesa = topo - t.mesaAlturaMm;
  return [
    { x: -meiaA, y: base },
    { x: meiaA, y: base },
    { x: meiaA, y: sobMesa },
    { x: meiaL, y: sobMesa },
    { x: meiaL, y: topo },
    { x: -meiaL, y: topo },
    { x: -meiaL, y: sobMesa },
    { x: -meiaA, y: sobMesa },
  ];
}
