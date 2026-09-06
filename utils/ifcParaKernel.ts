// utils/ifcParaKernel.ts
//
// A TRADUÇÃO: peça paramétrica do IFC → comando do kernel. Função pura, sem
// React e sem parser — recebe o que `ifcParametricoService` leu e devolve o que
// `applyBatch` executa.
//
// Pura de propósito: é aqui que mora o risco de errar unidade, eixo e
// orientação, e regra escondida dentro de um componente só se testa arrastando
// o mouse. Assim ela se prova contra o arquivo real em Node.
//
// ─── AS TRÊS CONVERSÕES QUE PODEM ERRAR CALADAS ───────────────────────────────
//
// 1. UNIDADE. O arquivo do usuário está em CENTÍMETRO; o mundo do `web-ifc` é
//    METRO; o kernel é MILÍMETRO INTEIRO. A matriz do parser já converte arquivo
//    → metro, então a regra é: todo ponto nasce em unidade de arquivo, passa
//    pela matriz, e só então vira milímetro (× 1000). Nenhum fator manual.
//    Errar aqui dá um prédio 100× menor no lugar certo — plausível na miniatura.
//
// 2. EIXO VERTICAL. O mundo do `web-ifc` é Y PARA CIMA; o kernel tem o plano
//    (x, y) e a cota à parte. Então: plano.x = mundo.X, plano.y = −mundo.Z,
//    cota = mundo.Y. O sinal de Z é o que espelha a planta — e planta espelhada
//    numa estrutura simétrica só aparece quando o pilar está do lado errado, já
//    na obra.
//
// 3. O QUE É ALTURA E O QUE É LARGURA. Numa viga a extrusão é HORIZONTAL: a
//    "profundidade" da extrusão é o comprimento, e as duas dimensões do perfil
//    são a largura e a altura da seção. Num pilar a extrusão é VERTICAL e a
//    profundidade É a altura. Trocar isso dá uma viga deitada com a altura da
//    seção virando vão.
//
// ─── A CLASSE DIZ O QUE É; A GEOMETRIA TEM DE CONCORDAR ───────────────────────
//
// `IFCCOLUMN` vira PILAR, `IFCBEAM` vira VIGA. Mas se um `IFCCOLUMN` vier com
// extrusão horizontal (pilar inclinado, ou erro de exportação), a peça é
// RECUSADA em vez de virar uma viga que ninguém desenhou.

import type { PecaParametrica, PerfilIfc } from '../services/ifcParametricoService';
import type { StructuralKind } from './blueprintKernel';

/** Um ponto no plano do kernel, em milímetro (ainda não arredondado). */
interface PontoMm {
  x: number;
  y: number;
}

/** A peça já traduzida, pronta para virar `AddStructural`. */
export interface PecaTraduzida {
  /** De onde veio, para o relatório e para a conferência. */
  expressID: number;
  globalId: string;
  nome: string;
  kind: StructuralKind;
  /** No plano do kernel, em mm inteiro. */
  pontos: PontoMm[];
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  /** Cota ABSOLUTA da base, em mm. Quem importa desconta a cota do pavimento. */
  cotaBaseMm: number;
  circular: boolean;
  rotacaoDeg: number;
  /** `expressID` do pavimento do IFC, para o casamento com os `Level`. */
  pavimento: number | null;
}

export interface RecusaDeTraducao {
  expressID: number;
  nome: string;
  classe: string;
  motivo: string;
}

export interface ResultadoDaTraducao {
  pecas: PecaTraduzida[];
  recusas: RecusaDeTraducao[];
}

/** O tipo do kernel que cada classe do IFC vira. */
const KIND_POR_CLASSE: Record<string, StructuralKind> = {
  IFCCOLUMN: 'PILAR',
  IFCBEAM: 'VIGA',
  IFCPILE: 'ESTACA',
  IFCSLAB: 'LAJE',
  IFCFOOTING: 'BLOCO_COROAMENTO',
};

/** Metro do mundo do web-ifc → milímetro do kernel. */
const M_PARA_MM = 1000;

/** Um ponto local (unidade de ARQUIVO) pela matriz → mundo (METRO). */
function aplicar(matriz: number[], x: number, y: number, z: number): { X: number; Y: number; Z: number } {
  // Coluna-maior: m[0..3] é a primeira COLUNA.
  return {
    X: matriz[0] * x + matriz[4] * y + matriz[8] * z + matriz[12],
    Y: matriz[1] * x + matriz[5] * y + matriz[9] * z + matriz[13],
    Z: matriz[2] * x + matriz[6] * y + matriz[10] * z + matriz[14],
  };
}

/** Mundo do web-ifc (Y para cima) → plano do kernel, em mm. Ver a nota 2. */
function paraPlano(p: { X: number; Y: number; Z: number }): PontoMm {
  return { x: p.X * M_PARA_MM, y: -p.Z * M_PARA_MM };
}

/** A cota, em mm. */
function paraCota(p: { X: number; Y: number; Z: number }): number {
  return p.Y * M_PARA_MM;
}

const arredondar = (p: PontoMm): PontoMm => ({ x: Math.round(p.x), y: Math.round(p.y) });
const dist = (a: PontoMm, b: PontoMm) => Math.hypot(b.x - a.x, b.y - a.y);

/** Os quatro cantos do perfil, em coordenadas LOCAIS (unidade de arquivo). */
function cantosDoPerfil(perfil: PerfilIfc): { x: number; y: number }[] {
  if (perfil.forma === 'RETANGULO') {
    const hx = perfil.xDim / 2;
    const hy = perfil.yDim / 2;
    return [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: hx, y: hy },
      { x: -hx, y: hy },
    ];
  }
  if (perfil.forma === 'CIRCULO') {
    // O quadrado que ENVOLVE o círculo. O kernel guarda `circular: true` e usa
    // `larguraMm` como diâmetro, então o que interessa é o diâmetro e o centro.
    const r = perfil.raio;
    return [
      { x: -r, y: -r },
      { x: r, y: -r },
      { x: r, y: r },
      { x: -r, y: r },
    ];
  }
  return perfil.pontos;
}

/**
 * Traduz as peças, recusando o que não couber no kernel.
 *
 * `toleranciaVerticalGraus` decide o que conta como extrusão vertical. 5° é
 * folgado o bastante para ruído de exportação e apertado o bastante para pegar
 * um pilar de fato inclinado — que não tem representação no kernel e por isso é
 * recusado, e não endireitado.
 */
export function traduzirPecas(
  pecas: PecaParametrica[],
  toleranciaVerticalGraus = 5,
): ResultadoDaTraducao {
  const traduzidas: PecaTraduzida[] = [];
  const recusas: RecusaDeTraducao[] = [];
  const cosLimite = Math.cos((toleranciaVerticalGraus * Math.PI) / 180);

  for (const p of pecas) {
    const kind = KIND_POR_CLASSE[p.classe];
    const recusar = (motivo: string) =>
      recusas.push({ expressID: p.expressID, nome: p.nome, classe: p.classe, motivo });

    if (!kind) {
      recusar(`a classe ${p.classe} não tem equivalente no kernel`);
      continue;
    }
    if (!(p.profundidade > 0)) {
      recusar('a extrusão tem comprimento zero');
      continue;
    }

    // A DIREÇÃO da extrusão no mundo: a terceira coluna da matriz, normalizada.
    const eixo = { X: p.matriz[8], Y: p.matriz[9], Z: p.matriz[10] };
    const norma = Math.hypot(eixo.X, eixo.Y, eixo.Z) || 1;
    const cosComVertical = Math.abs(eixo.Y / norma);
    const vertical = cosComVertical >= cosLimite;
    const horizontal = cosComVertical <= Math.cos(((90 - toleranciaVerticalGraus) * Math.PI) / 180);

    const cantos = cantosDoPerfil(p.perfil);
    const base = cantos.map((c) => aplicar(p.matriz, c.x, c.y, 0));
    const topo = cantos.map((c) => aplicar(p.matriz, c.x, c.y, p.profundidade));
    const todos = [...base, ...topo];
    const cotas = todos.map(paraCota);
    const cotaMin = Math.min(...cotas);
    const cotaMax = Math.max(...cotas);

    // ── VIGA: extrusão horizontal ────────────────────────────────────────────
    if (kind === 'VIGA') {
      if (!horizontal) {
        recusar('é uma viga com extrusão vertical — o kernel desenha viga como eixo em planta');
        continue;
      }
      if (p.perfil.forma !== 'RETANGULO') {
        recusar('viga com perfil que não é retangular; o kernel só tem seção retangular ou circular');
        continue;
      }
      // O EIXO é o centro do perfil nas duas pontas da extrusão.
      const centroDe = (ps: { X: number; Y: number; Z: number }[]): { X: number; Y: number; Z: number } => ({
        X: ps.reduce((s, q) => s + q.X, 0) / ps.length,
        Y: ps.reduce((s, q) => s + q.Y, 0) / ps.length,
        Z: ps.reduce((s, q) => s + q.Z, 0) / ps.length,
      });
      const a = arredondar(paraPlano(centroDe(base)));
      const b = arredondar(paraPlano(centroDe(topo)));
      if (dist(a, b) < 1) {
        recusar('as duas pontas da viga caem no mesmo ponto em planta');
        continue;
      }

      // Qual dimensão do perfil é a ALTURA: a que aponta para cima no mundo.
      // A coluna 0 da matriz é o X local; a coluna 1, o Y local.
      const xLocalVertical = Math.abs(p.matriz[1]) > Math.abs(p.matriz[0]) && Math.abs(p.matriz[1]) > Math.abs(p.matriz[2]);
      const alturaLocal = xLocalVertical ? p.perfil.xDim : p.perfil.yDim;
      const larguraLocal = xLocalVertical ? p.perfil.yDim : p.perfil.xDim;
      // Do local (unidade de arquivo) para mm: pela ESCALA da matriz, nunca por
      // fator solto. `escala` é o comprimento da coluna correspondente × 1000.
      const escalaX = Math.hypot(p.matriz[0], p.matriz[1], p.matriz[2]) * M_PARA_MM;
      const escalaY = Math.hypot(p.matriz[4], p.matriz[5], p.matriz[6]) * M_PARA_MM;
      const alturaMm = Math.round(alturaLocal * (xLocalVertical ? escalaX : escalaY));
      const larguraMm = Math.round(larguraLocal * (xLocalVertical ? escalaY : escalaX));

      traduzidas.push({
        expressID: p.expressID,
        globalId: p.globalId,
        nome: p.nome,
        kind: 'VIGA',
        pontos: [a, b],
        larguraMm,
        profundidadeMm: larguraMm,
        alturaMm,
        cotaBaseMm: Math.round(cotaMin),
        circular: false,
        rotacaoDeg: 0,
        pavimento: p.pavimento,
      });
      continue;
    }

    // ── O resto sobe: pilar, estaca, laje, bloco ────────────────────────────
    if (!vertical) {
      recusar(`é ${p.classe} com extrusão inclinada, e o kernel só representa peça em pé`);
      continue;
    }

    const alturaMm = Math.round(cotaMax - cotaMin);
    if (alturaMm <= 0) {
      recusar('a peça tem altura zero depois da conversão');
      continue;
    }

    const planoBase = base.map((q) => paraPlano(q));

    if (kind === 'LAJE') {
      const anel = planoBase.map(arredondar);
      if (anel.length < 3) {
        recusar('a laje tem menos de 3 vértices em planta');
        continue;
      }
      traduzidas.push({
        expressID: p.expressID,
        globalId: p.globalId,
        nome: p.nome,
        kind: 'LAJE',
        pontos: anel,
        larguraMm: 0,
        profundidadeMm: 0,
        alturaMm,
        cotaBaseMm: Math.round(cotaMin),
        circular: false,
        rotacaoDeg: 0,
        pavimento: p.pavimento,
      });
      continue;
    }

    // PONTO: pilar, estaca, bloco. Centro, lados e giro do retângulo em planta.
    if (planoBase.length !== 4) {
      recusar('a seção não é um retângulo nem um círculo em planta');
      continue;
    }
    const centro = arredondar({
      x: planoBase.reduce((s, q) => s + q.x, 0) / 4,
      y: planoBase.reduce((s, q) => s + q.y, 0) / 4,
    });
    const lado1 = dist(planoBase[0], planoBase[1]);
    const lado2 = dist(planoBase[1], planoBase[2]);
    // O giro da seção: a direção do primeiro lado, em planta.
    const dx = planoBase[1].x - planoBase[0].x;
    const dy = planoBase[1].y - planoBase[0].y;
    const rotacaoDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

    traduzidas.push({
      expressID: p.expressID,
      globalId: p.globalId,
      nome: p.nome,
      kind,
      pontos: [centro],
      larguraMm: Math.round(lado1),
      profundidadeMm: Math.round(lado2),
      alturaMm,
      cotaBaseMm: Math.round(cotaMin),
      circular: p.perfil.forma === 'CIRCULO',
      // Seção redonda não tem giro que se veja, e um número aqui só confundiria
      // quem for conferir contra a prancha.
      rotacaoDeg: p.perfil.forma === 'CIRCULO' ? 0 : ((rotacaoDeg % 180) + 180) % 180,
      pavimento: p.pavimento,
    });
  }

  return { pecas: traduzidas, recusas };
}
