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

import type {
  LeituraEletrica,
  ParedeParametrica,
  PecaParametrica,
  PerfilIfc,
  VaoParametrico,
} from '../services/ifcParametricoService';
import { lerSecaoT } from './ifcSecaoT';
import { uidDeIfcGuid } from './blueprintIfc';
import {
  AGENTES_EXTINTORES,
  FATOR_K_MAXIMO,
  PADRAO_DO_CODIGO_DE_PLACA,
  POSICOES_DO_SPRINKLER,
  capacidadeExtintoraValida,
  type AgenteExtintor,
  DISCIPLINAS_DO_PONTO_HIDRAULICO,
  TIPOS_DE_INTERRUPTOR,
  TIPOS_DE_PONTO_ELETRICO,
  TIPOS_DE_PONTO_HIDRAULICO,
  type TipoDePontoHidraulico,
  contornoEmPlanta,
  type TipoDeInterruptor,
  type TipoDePontoEletrico,
  type AlinhamentoParede,
  type BlueprintModel,
  type CamadaParede,
  type StructuralKind,
  type Command,
} from './blueprintKernel';

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
  /** Seção em T, quando o perfil era uma. Ausente = seção cheia. */
  secaoT?: { mesaAlturaMm: number; almaLarguraMm: number };
}

/** A parede já traduzida, pronta para virar `AddWall`. */
export interface ParedeTraduzida {
  expressID: number;
  globalId: string;
  nome: string;
  /**
   * O `GlobalId` do arquivo como `uid` do kernel, ou `null` quando ele não é um
   * identificador IFC válido — e aí a parede entra com identidade NOVA, que é
   * perder a ida e volta, não perder a parede.
   */
  uid: string | null;
  /** O EIXO da parede, em mm inteiro — já corrigido do traçado pela face. */
  a: PontoMm;
  b: PontoMm;
  espessuraMm: number;
  /** `null` quando o corpo é recortado: a altura vem do pé-direito do nível. */
  alturaMm: number | null;
  camadas: CamadaParede[];
  /** De que lado do eixo estava a linha que o arquivo desenha. */
  alinhamento: AlinhamentoParede;
  /** Cota ABSOLUTA da base, em mm. Quem importa desconta a cota do pavimento. */
  cotaBaseMm: number;
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

// `+ 0` tira o −0 (o plano é −Z do mundo): −0 e 0 são o mesmo ponto, mas não o mesmo valor para quem compara.
const arredondar = (p: PontoMm): PontoMm => ({ x: Math.round(p.x) + 0, y: Math.round(p.y) + 0 });
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
/**
 * Como CHAMAR o perfil que não deu para importar.
 *
 * Existe para a recusa ser acionável: "não é retangular" manda procurar o quê?
 * Com a forma nomeada, quem lê o relatório sabe se falta uma seção no kernel ou
 * se o arquivo tem algo exótico.
 */
function descreverPerfil(perfil: PerfilIfc): string {
  if (perfil.forma === 'RETANGULO') return 'retangular';
  if (perfil.forma === 'CIRCULO') return 'circular';
  const p = perfil.pontos;
  const fechado =
    p.length > 1 && p[0].x === p[p.length - 1].x && p[0].y === p[p.length - 1].y
      ? p.slice(0, -1)
      : p;
  let reflexos = 0;
  for (let i = 0; i < fechado.length; i++) {
    const a = fechado[(i + fechado.length - 1) % fechado.length];
    const b = fechado[i];
    const c = fechado[(i + 1) % fechado.length];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0) reflexos++;
  }
  // 8 vértices com 2 cantos reflexos é a assinatura de uma seção T (mesa +
  // alma) — a viga faixa/nervurada que todo projeto de concreto tem.
  if (fechado.length === 8 && reflexos === 2) return 'em T (mesa + alma)';
  if (reflexos === 0) return `poligonal convexa de ${fechado.length} lados`;
  return `poligonal de ${fechado.length} lados`;
}

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
      if (p.perfil.forma === 'CIRCULO') {
        recusar('viga com seção circular; o kernel desenha viga de seção retangular ou em T');
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

      // ── SEÇÃO T ─────────────────────────────────────────────────────────
      //
      // O exportador dos modelos reais escreve a T como polígono de oito
      // cantos, e não como `IfcTShapeProfileDef`. A forma está toda ali.
      let secaoT: { mesaAlturaLocal: number; almaLarguraLocal: number } | null = null;
      let alturaLocal: number;
      let larguraLocal: number;

      if (p.perfil.forma === 'POLIGONO') {
        const lida = lerSecaoT(p.perfil.pontos, xLocalVertical ? 'x' : 'y');
        if ('recusa' in lida) {
          recusar(`viga com seção que o kernel não representa: ${lida.recusa}`);
          continue;
        }
        // ⚠️ A MESA TEM DE FICAR EM CIMA. O eixo de altura do perfil pode
        // apontar para baixo no mundo — a coluna da matriz diz o sinal —, e aí
        // a T que parece normal no perfil é invertida na obra. O kernel só
        // representa mesa em cima, então a invertida é RECUSADA em vez de
        // entrar de cabeça para baixo com as medidas certas.
        const colunaAltura = xLocalVertical ? 1 : 5;
        const eixoParaCima = p.matriz[colunaAltura] >= 0;
        if (lida.secao.mesaNoMaior !== eixoParaCima) {
          recusar('é uma viga T INVERTIDA (mesa embaixo), e o kernel só tem a mesa em cima');
          continue;
        }
        alturaLocal = lida.secao.alturaLocal;
        larguraLocal = lida.secao.larguraLocal;
        secaoT = {
          mesaAlturaLocal: lida.secao.mesaAlturaLocal,
          almaLarguraLocal: lida.secao.almaLarguraLocal,
        };
      } else {
        alturaLocal = xLocalVertical ? p.perfil.xDim : p.perfil.yDim;
        larguraLocal = xLocalVertical ? p.perfil.yDim : p.perfil.xDim;
      }
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
        ...(secaoT
          ? {
              secaoT: {
                mesaAlturaMm: Math.round(
                  secaoT.mesaAlturaLocal * (xLocalVertical ? escalaX : escalaY),
                ),
                almaLarguraMm: Math.round(
                  secaoT.almaLarguraLocal * (xLocalVertical ? escalaY : escalaX),
                ),
              },
            }
          : {}),
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


// ─────────────────────────────────────────────────────────────────────────────
// ONDE O MODELO CAI
// ─────────────────────────────────────────────────────────────────────────────
//
// A tradução é FIEL: cada peça entra nas coordenadas do arquivo. Está certo, e
// é o único padrão defensável — quando o calculista usa a mesma origem do
// projeto arquitetônico, o modelo assenta exatamente sobre o desenho.
//
// Mas em 06/09/2026 o usuário importou um modelo e viu a estrutura longe do
// desenho de paredes. Fui medir o arquivo real: a `GetCoordinationMatrix` dele
// é a IDENTIDADE (translação zero, escala 1), e as peças ocupam de 0,15 m a
// 19,93 m em X — ou seja, o prédio nasce no canto da origem do PRÓPRIO arquivo.
// Não havia nada sendo perdido na tradução. O que faltava era outra coisa: a
// tela não DIZIA onde as peças iriam cair, e não havia como escolher.
//
// Daí estas funções. O padrão continua sendo não mexer em nada; as outras duas
// âncoras existem para quando as duas origens simplesmente não são a mesma.

/** Uma caixa no plano do kernel, em milímetros. */
// A ancoragem saiu daqui em 07/09/2026: a importação de DXF precisa da mesma
// conta, e um módulo com nome de IFC não é lugar para ela. Reexportado para os
// chamadores que já a importavam deste arquivo.
export {
  caixaDePontos,
  caixaDoDesenho,
  deslocamentoDaImportacao,
  type AncoragemIfc,
  type CaixaPlana,
} from './ancoragemImportacao';

import { caixaDePontos, type CaixaPlana } from './ancoragemImportacao';

/** A pegada em planta do que veio do IFC. `null` se não veio nada. */
export function caixaDasPecas(pecas: PecaTraduzida[]): CaixaPlana | null {
  return caixaDePontos(pecas.flatMap((p) => p.pontos));
}


export function traduzirParedes(
  paredes: ParedeParametrica[],
  fatorParaMm: number | null,
): { paredes: ParedeTraduzida[]; recusas: RecusaDeTraducao[] } {
  const traduzidas: ParedeTraduzida[] = [];
  const recusas: RecusaDeTraducao[] = [];

  for (const p of paredes) {
    const recusar = (motivo: string) =>
      recusas.push({ expressID: p.expressID, nome: p.nome, classe: 'IFCWALL', motivo });

    if (fatorParaMm === null) {
      recusar('a escala do arquivo não pôde ser medida, e a parede sairia com o tamanho errado');
      continue;
    }

    const [ini, fim] = p.eixo;
    const dx = fim.x - ini.x;
    const dy = fim.y - ini.y;
    const comp = Math.hypot(dx, dy);
    if (!(comp > 0)) {
      recusar('o eixo da parede tem comprimento zero');
      continue;
    }

    // A normal ESQUERDA, a mesma convenção de `normalDoLado` no kernel.
    const nx = -dy / comp;
    const ny = dx / comp;
    const d = p.deslocamentoDoCentro;

    const emMm = (v: number) => Math.round(v * fatorParaMm);
    const a = { x: emMm(ini.x + nx * d), y: emMm(ini.y + ny * d) };
    const b = { x: emMm(fim.x + nx * d), y: emMm(fim.y + ny * d) };
    if (a.x === b.x && a.y === b.y) {
      recusar('a parede é mais curta que um milímetro depois de convertida');
      continue;
    }

    const espessuraMm = Math.round(p.espessuraTotal * fatorParaMm);
    if (!(espessuraMm >= 1)) {
      recusar('a espessura da parede é menor que um milímetro');
      continue;
    }

    // As camadas têm de somar EXATAMENTE a espessura: o kernel deriva
    // `thicknessMm` da soma, e arredondar cada uma por conta própria faria a
    // parede engordar ou emagrecer alguns milímetros sem que nada o dissesse.
    const camadas: CamadaParede[] = [];
    let acumulado = 0;
    for (let i = 0; i < p.camadas.length; i++) {
      const alvo =
        i === p.camadas.length - 1
          ? espessuraMm
          : Math.round(
              ((p.camadas.slice(0, i + 1).reduce((s, c) => s + c.espessura, 0)) /
                p.espessuraTotal) *
                espessuraMm,
            );
      const faixa = alvo - acumulado;
      acumulado = alvo;
      if (faixa <= 0) continue;
      camadas.push({
        espessuraMm: faixa,
        itemCode: '',
        descricao: p.camadas[i].material,
        funcao: 'VEDACAO',
      });
    }

    traduzidas.push({
      expressID: p.expressID,
      globalId: p.globalId,
      nome: p.nome,
      uid: uidDeIfcGuid(p.globalId),
      a,
      b,
      espessuraMm,
      alturaMm: p.alturaExtrusao === null ? null : Math.round(p.alturaExtrusao * fatorParaMm),
      camadas: camadas.length > 0 ? camadas : [],
      // O traço do arquivo está em `−d` a partir do eixo: `d > 0` põe o eixo à
      // ESQUERDA do traço, logo o traço ficou à DIREITA.
      //
      // ⚠️ O corte é UM MILÍMETRO, e não `d === 0`. Medido: paredes centradas
      // saem com `d` da ordem de 1e-17 — resíduo de `offset + sentido × t/2` em
      // ponto flutuante. Compará-lo a zero marcaria essas paredes como traçadas
      // pela face, e o painel passaria a mostrar um alinhamento que ninguém
      // escolheu. Abaixo de um milímetro o eixo nem se move.
      alinhamento:
        Math.abs(d * fatorParaMm) < 1 ? 'EIXO' : d > 0 ? 'DIREITA' : 'ESQUERDA',
      cotaBaseMm: Math.round(p.base * fatorParaMm),
      pavimento: p.pavimento,
    });
  }

  return { paredes: traduzidas, recusas };
}

/** A pegada em planta das paredes traduzidas, para a ancoragem. */
export function caixaDasParedes(paredes: ParedeTraduzida[]): CaixaPlana | null {
  return caixaDePontos(paredes.flatMap((p) => [p.a, p.b]));
}

/** O vão já traduzido, pronto para virar `AddOpening`. */
export interface VaoTraduzido {
  expressID: number;
  globalId: string;
  nome: string;
  /** `uid` do arquivo, ou `null` quando o `GlobalId` não é válido. */
  uid: string | null;
  /** `expressID` da parede hospedeira — quem importa acha o `wallId` por ele. */
  paredeExpressID: number;
  kind: 'door' | 'window' | 'passage';
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
}

/**
 * Os vãos do IFC virados comandos do kernel.
 *
 * ─── AQUI ERRAR É SILENCIOSO ────────────────────────────────────────────────
 *
 * `offsetMm` e `sillMm` saem de PROJETAR os cantos do sólido do vão no eixo da
 * parede. Inverter o sentido do eixo espelha a janela na fachada; errar a
 * origem da altura põe o peitoril no lugar errado. Nos dois casos o desenho
 * fica plausível, e só quem for à obra descobre.
 *
 * As travas: o vão tem de CABER na parede (o kernel recusa `OPENING_OUT_OF_BOUNDS`
 * por conta própria, e aqui a recusa vem antes, com o motivo legível), e o teste
 * confere os 265 vãos reais contra os comprimentos das paredes que os hospedam.
 *
 * ─── A DIMENSÃO VEM DO ATRIBUTO, NÃO DA GEOMETRIA ───────────────────────────
 *
 * Quando há esquadria, `OverallWidth`/`OverallHeight` mandam: medido, 131 de
 * 131 esquadrias dos arquivos reais os declaram. O sólido do vão costuma ser
 * FOLGADO de propósito (o furo é maior que a esquadria, para o booleano do
 * receptor não deixar película), então tirar a largura dele engordaria toda
 * porta e janela do projeto. Sem esquadria — o vão livre — só existe o sólido, e
 * aí ele é a fonte.
 */
export function traduzirVaos(
  vaos: VaoParametrico[],
  paredes: ParedeTraduzida[],
  fatorParaMm: number | null,
): { vaos: VaoTraduzido[]; recusas: RecusaDeTraducao[] } {
  const saida: VaoTraduzido[] = [];
  const recusas: RecusaDeTraducao[] = [];
  const porParede = new Map(paredes.map((p) => [p.expressID, p]));

  for (const v of vaos) {
    const recusar = (motivo: string) =>
      recusas.push({ expressID: v.expressID, nome: v.nome, classe: 'IFCOPENINGELEMENT', motivo });

    if (fatorParaMm === null) {
      recusar('a escala do arquivo não pôde ser medida');
      continue;
    }
    const parede = porParede.get(v.paredeExpressID);
    if (!parede) {
      recusar('a parede que o vão fura não entrou na importação');
      continue;
    }

    const dx = parede.b.x - parede.a.x;
    const dy = parede.b.y - parede.a.y;
    const comprimento = Math.hypot(dx, dy);
    if (!(comprimento > 0)) {
      recusar('a parede hospedeira tem comprimento zero');
      continue;
    }

    // Projeção no eixo da parede: o vão nasce em `parede.a` e cresce para `b`.
    const esses = v.cantos.map(
      (c) => ((c.x * fatorParaMm - parede.a.x) * dx + (c.y * fatorParaMm - parede.a.y) * dy) / comprimento,
    );
    const zs = v.cantos.map((c) => c.z * fatorParaMm);
    const sMin = Math.min(...esses);
    const sMax = Math.max(...esses);
    const zMin = Math.min(...zs);
    const zMax = Math.max(...zs);

    const declaradaL = v.esquadria?.larguraDeclarada ?? null;
    const declaradaA = v.esquadria?.alturaDeclarada ?? null;
    const widthMm = Math.round(declaradaL !== null ? declaradaL * fatorParaMm : sMax - sMin);
    const heightMm = Math.round(declaradaA !== null ? declaradaA * fatorParaMm : zMax - zMin);

    // O vão fica CENTRADO no furo: com a esquadria declarada mais estreita que
    // o furo, encostá-la numa das bordas escolheria um lado sem motivo.
    const centro = (sMin + sMax) / 2;
    const offsetMm = Math.round(centro - widthMm / 2);
    const sillMm = Math.round(zMin - parede.cotaBaseMm);

    if (!(widthMm > 0) || !(heightMm > 0)) {
      recusar('o vão tem largura ou altura zero');
      continue;
    }
    if (offsetMm < 0 || offsetMm + widthMm > Math.round(comprimento)) {
      // Acontece quando a parede foi partida no arquivo e o vão pertence a
      // outro trecho. Encaixá-lo à força moveria a janela na fachada.
      recusar(
        `o vão cai fora da parede: ${offsetMm}+${widthMm} mm num trecho de ${Math.round(comprimento)} mm`,
      );
      continue;
    }

    const classe = v.esquadria?.classe;
    saida.push({
      expressID: v.expressID,
      globalId: v.globalId,
      nome: v.nome,
      uid: uidDeIfcGuid(v.globalId),
      paredeExpressID: v.paredeExpressID,
      // Sem esquadria é VÃO LIVRE, e não porta suposta: `passage` não entra em
      // área de esquadria no orçamento, porque não há caixilho para comprar.
      kind: classe === 'IFCDOOR' ? 'door' : classe === 'IFCWINDOW' ? 'window' : 'passage',
      offsetMm,
      widthMm,
      heightMm,
      sillMm,
    });
  }

  return { vaos: saida, recusas };
}

// ─── E7.2 — A ELÉTRICA: pontos e eletrodutos ────────────────────────────────

/** Um ponto elétrico pronto para o kernel. Cota ABSOLUTA (mm); quem aplica desconta o pavimento. */
export interface PontoEletricoTraduzido {
  expressID: number;
  nome: string;
  pavimento: number | null;
  at: PontoMm;
  cotaAbsMm: number;
  tipoEletrico: TipoDePontoEletrico;
  interruptor: TipoDeInterruptor | null;
}

/** Um eletroduto pronto para o kernel: as duas pontas do caminho, cotas ABSOLUTAS (mm). */
export interface EletrodutoTraduzido {
  expressID: number;
  nome: string;
  pavimento: number | null;
  a: PontoMm;
  b: PontoMm;
  cotaAAbsMm: number;
  cotaBAbsMm: number;
  bitolaMm: number;
}

/** Tolerância para dois sólidos do mesmo eletroduto se encontrarem (mm). */
const EMENDA_MM = 5;

/**
 * O tipo do ponto: o `ObjectType` quando ele JÁ é um tipo do sistema (o nosso
 * export escreve "TUG", "INTERRUPTOR:PARALELO"…); senão, a classe e o
 * `PredefinedType` pelo que a norma IFC diz deles. `null` = sem equivalente.
 */
export function tipoDoPontoIfc(classe: string, predefinido: string | null, objectType: string | null): { tipo: TipoDePontoEletrico; interruptor: TipoDeInterruptor | null } | null {
  const [base, variante] = (objectType ?? '').split(':');
  const interruptor = variante && (TIPOS_DE_INTERRUPTOR as readonly string[]).includes(variante) ? (variante as TipoDeInterruptor) : null;
  if ((TIPOS_DE_PONTO_ELETRICO as readonly string[]).includes(base)) return { tipo: base as TipoDePontoEletrico, interruptor };
  const pd = (predefinido ?? '').replace(/\./g, '');
  switch (classe) {
    case 'IFCLIGHTFIXTURE':
      return { tipo: 'ILUMINACAO_TETO', interruptor: null };
    case 'IFCSWITCHINGDEVICE':
      return { tipo: 'INTERRUPTOR', interruptor };
    case 'IFCOUTLET':
      return { tipo: pd === 'TELEPHONEOUTLET' ? 'DADOS_TELEFONE' : pd === 'AUDIOVISUALOUTLET' ? 'DADOS_TV' : pd === 'DATAOUTLET' ? 'DADOS_REDE' : 'TUG', interruptor: null };
    case 'IFCJUNCTIONBOX':
      // Caixa de junção de outro programa é, na obra, a caixa de passagem.
      return { tipo: 'CAIXA_PASSAGEM', interruptor: null };
    case 'IFCFLOWMETER':
      return pd === 'ENERGYMETER' ? { tipo: 'MEDIDOR', interruptor: null } : null;
    default:
      return null;
  }
}

/**
 * E7.2 — traduz a elétrica lida do arquivo. O ponto entra no CENTRO da peça
 * (em planta e em cota); o eletroduto, pelas pontas do CAMINHO — os sólidos
 * encadeados (o "L" do nosso export são dois: sobe e corre), da primeira ponta
 * à última. Sólidos que não se encadeiam, ponto sem tipo ou sem geometria são
 * recusados com o motivo, nunca adivinhados.
 */
export function traduzirEletrica(leitura: LeituraEletrica): { pontos: PontoEletricoTraduzido[]; eletrodutos: EletrodutoTraduzido[]; recusas: RecusaDeTraducao[] } {
  const pontos: PontoEletricoTraduzido[] = [];
  const eletrodutos: EletrodutoTraduzido[] = [];
  const recusas: RecusaDeTraducao[] = [];
  for (const p of leitura.pontos) {
    const recusar = (motivo: string) => recusas.push({ expressID: p.expressID, nome: p.nome, classe: p.classe, motivo });
    const tipo = tipoDoPontoIfc(p.classe, p.predefinido, p.objectType);
    if (!tipo) {
      recusar(`${p.classe}${p.predefinido ? ` .${p.predefinido}.` : ''} não tem equivalente entre os pontos elétricos`);
      continue;
    }
    if (!p.centro) {
      recusar('o ponto não tem geometria para dizer onde está');
      continue;
    }
    pontos.push({
      expressID: p.expressID,
      nome: p.nome,
      pavimento: p.pavimento,
      at: arredondar(paraPlano(p.centro)),
      cotaAbsMm: Math.round(paraCota(p.centro)),
      tipoEletrico: tipo.tipo,
      interruptor: tipo.interruptor,
    });
  }
  for (const e of leitura.eletrodutos) {
    const recusar = (motivo: string) => recusas.push({ expressID: e.expressID, nome: e.nome, classe: 'IFCCABLECARRIERSEGMENT', motivo });
    const segs = e.segmentos.map((s) => ({ de: { p: paraPlano(s.de), z: paraCota(s.de) }, para: { p: paraPlano(s.para), z: paraCota(s.para) } }));
    let encadeado = true;
    for (let i = 1; i < segs.length; i++) {
      const u = segs[i - 1].para;
      const v = segs[i].de;
      if (Math.hypot(u.p.x - v.p.x, u.p.y - v.p.y, u.z - v.z) > EMENDA_MM) encadeado = false;
    }
    if (!encadeado) {
      recusar('os sólidos do eletroduto não formam um caminho contínuo');
      continue;
    }
    const ini = segs[0].de;
    const fim = segs[segs.length - 1].para;
    eletrodutos.push({
      expressID: e.expressID,
      nome: e.nome,
      pavimento: e.pavimento,
      a: arredondar(ini.p),
      b: arredondar(fim.p),
      cotaAAbsMm: Math.round(ini.z),
      cotaBAbsMm: Math.round(fim.z),
      bitolaMm: e.diametroM != null ? Math.max(1, Math.round(e.diametroM * M_PARA_MM)) : 25,
    });
  }
  return { pontos, eletrodutos, recusas };
}

/** O pavimento de destino de uma peça importada: existente (id) ou criado no mesmo lote (uid). */
export interface DestinoDaImportacao {
  levelId: string;
  levelUid?: string;
  elevationMm: number;
}

/**
 * E7.2 — os comandos da elétrica importada: `AddTerminal` e `AddTrecho` no
 * pavimento casado (novo inclusive, pelo `levelUid`), com a cota RELATIVA a ele
 * (o arquivo a traz absoluta) e o deslocamento da ancoragem. Quem não tem
 * destino (pavimento descartado) fica de fora. Puro — o painel só chama.
 */
export function comandosDaEletrica(
  pontos: readonly PontoEletricoTraduzido[],
  eletrodutos: readonly EletrodutoTraduzido[],
  destino: (pavimento: number) => DestinoDaImportacao | null,
  dx = 0,
  dy = 0,
): Command[] {
  const comandos: Command[] = [];
  for (const p of pontos) {
    const nivel = p.pavimento == null ? null : destino(p.pavimento);
    if (!nivel) continue;
    comandos.push({
      type: 'AddTerminal',
      levelId: nivel.levelId,
      ...(nivel.levelUid ? { levelUid: nivel.levelUid } : {}),
      disciplina: 'ELETRICA',
      tipo: p.nome && p.nome !== '—' ? p.nome : p.tipoEletrico,
      tipoEletrico: p.tipoEletrico,
      at: { x: p.at.x + dx, y: p.at.y + dy },
      cotaMm: p.cotaAbsMm - nivel.elevationMm,
      ...(p.interruptor ? { interruptor: p.interruptor } : {}),
    });
  }
  for (const e of eletrodutos) {
    const nivel = e.pavimento == null ? null : destino(e.pavimento);
    if (!nivel) continue;
    comandos.push({
      type: 'AddTrecho',
      levelId: nivel.levelId,
      ...(nivel.levelUid ? { levelUid: nivel.levelUid } : {}),
      disciplina: 'ELETRICA',
      a: { x: e.a.x + dx, y: e.a.y + dy },
      b: { x: e.b.x + dx, y: e.b.y + dy },
      cotaAMm: e.cotaAAbsMm - nivel.elevationMm,
      cotaBMm: e.cotaBAbsMm - nivel.elevationMm,
      bitolaMm: e.bitolaMm,
    });
  }
  return comandos;
}

// ─── E9.3 (incêndio): a SEGURANÇA CONTRA INCÊNDIO do arquivo ─────────────────

/** Os tipos do sistema que são de incêndio (os que admitem a disciplina INCENDIO e só ela). */
const TIPOS_DE_INCENDIO = new Set<string>(TIPOS_DE_PONTO_HIDRAULICO.filter((t) => DISCIPLINAS_DO_PONTO_HIDRAULICO[t].length === 1 && DISCIPLINAS_DO_PONTO_HIDRAULICO[t][0] === 'INCENDIO'));

/**
 * O tipo da peça de incêndio: o `ObjectType` quando ele JÁ é um tipo do sistema
 * (o nosso export escreve "HIDRANTE_SIMPLES", "PLACA"…); senão a classe e o
 * `PredefinedType` pelo que a norma IFC diz deles. `null` = sem equivalente —
 * o terminal .USERDEFINED. de outro programa não vira extintor por palpite.
 */
export function tipoDoPontoDeIncendioIfc(classe: string, predefinido: string | null, objectType: string | null): TipoDePontoHidraulico | null {
  const base = (objectType ?? '').split(':')[0];
  if (TIPOS_DE_INCENDIO.has(base)) return base as TipoDePontoHidraulico;
  const pd = (predefinido ?? '').replace(/\./g, '');
  switch (classe) {
    case 'IFCFIRESUPPRESSIONTERMINAL':
      return pd === 'FIREHYDRANT' ? 'HIDRANTE_SIMPLES' : pd === 'HOSEREEL' ? 'MANGOTINHO' : pd === 'BREECHINGINLET' ? 'HIDRANTE_RECALQUE' : pd === 'SPRINKLER' ? 'SPRINKLER' : null;
    case 'IFCALARM':
      return pd === 'MANUALPULLBOX' ? 'ACIONADOR_MANUAL' : pd === 'SIREN' || pd === 'BELL' || pd === 'LIGHT' ? 'AVISADOR' : null;
    case 'IFCSENSOR':
      return pd === 'SMOKESENSOR' ? 'DETECTOR_FUMACA' : pd === 'HEATSENSOR' ? 'DETECTOR_TEMPERATURA' : pd === 'FLOWSENSOR' ? 'CHAVE_FLUXO' : pd === 'PRESSURESENSOR' ? 'PRESSOSTATO' : null;
    case 'IFCLIGHTFIXTURE':
      return pd === 'SECURITYLIGHTING' ? 'LUMINARIA_EMERGENCIA' : null;
    case 'IFCSIGN':
      return 'PLACA';
    case 'IFCPUMP':
      // Só chega aqui a bomba do sistema de incêndio (o leitor filtra).
      return 'BOMBA_INCENDIO';
    default:
      return null;
  }
}

export interface PontoDeIncendioTraduzido {
  expressID: number;
  nome: string;
  pavimento: number | null;
  at: PontoMm;
  cotaAbsMm: number;
  tipoHidraulico: TipoDePontoHidraulico;
  /** C1: o que o arquivo DECLARA da peça (Pset_OpuraIncendio, sufixo _Declarado/_Declarada) — só o que passa pela regra do kernel. */
  especificacao: EspecificacaoDeIncendio;
}

/** C1: os campos de especificação que o kernel aceita na peça de incêndio. */
export interface EspecificacaoDeIncendio {
  fatorK?: number;
  posicaoSprinkler?: (typeof POSICOES_DO_SPRINKLER)[number];
  agenteExtintor?: AgenteExtintor;
  cargaExtintorKg?: number;
  capacidadeExtintora?: string;
  codigoPlaca?: string;
  autonomiaMin?: number;
}

/**
 * C1 (plano pós-roadmap): o `_Declarado` do Pset_OpuraIncendio → os campos da peça, cada um pela
 * MESMA regra que o kernel aplica (a peça com valor inválido seria recusada inteira). O `_Derivado`
 * (a numeração) e o `_Calculada` (o cálculo) ficam de fora de propósito: o desenho os refaz.
 * Valor que não passa vira AVISO — a peça entra sem ele, nunca é recusada por causa dele.
 */
export function especificacaoDoPset(props: Record<string, string> | undefined, tipo: TipoDePontoHidraulico): { especificacao: EspecificacaoDeIncendio; avisos: string[] } {
  const e: EspecificacaoDeIncendio = {};
  const avisos: string[] = [];
  if (!props) return { especificacao: e, avisos };
  // O leitor escreve "—" para valor ausente (ver `texto`): ausente não é inválido.
  const val = (k: string) => (props[k] != null && props[k] !== '' && props[k] !== '—' ? props[k] : null);
  const num = (k: string) => (val(k) != null ? Number(val(k)) : null);
  const recusar = (campo: string, valor: string) => avisos.push(`${tipo}: ${campo} "${valor}" ignorado (fora da regra do sistema)`);
  const k = num('FatorK_Declarado');
  if (k != null) Number.isInteger(k) && k > 0 && k <= FATOR_K_MAXIMO ? (e.fatorK = k) : recusar('fator K', props.FatorK_Declarado);
  const pos = val('PosicaoSprinkler_Declarada');
  if (pos) (POSICOES_DO_SPRINKLER as readonly string[]).includes(pos) ? (e.posicaoSprinkler = pos as EspecificacaoDeIncendio['posicaoSprinkler']) : recusar('posição', pos);
  const ag = val('AgenteExtintor_Declarado');
  if (ag) (AGENTES_EXTINTORES as readonly string[]).includes(ag) ? (e.agenteExtintor = ag as AgenteExtintor) : recusar('agente', ag);
  const carga = num('CargaExtintorKg_Declarada');
  if (carga != null) Number.isFinite(carga) && carga > 0 && carga <= 200 ? (e.cargaExtintorKg = carga) : recusar('carga', props.CargaExtintorKg_Declarada);
  const cap = val('CapacidadeExtintora_Declarada');
  if (cap) capacidadeExtintoraValida(cap.toUpperCase()) ? (e.capacidadeExtintora = cap.toUpperCase()) : recusar('capacidade extintora', cap);
  const placa = val('CodigoPlaca_Declarado');
  if (placa) PADRAO_DO_CODIGO_DE_PLACA.test(placa.toUpperCase()) ? (e.codigoPlaca = placa.toUpperCase()) : recusar('código da placa', placa);
  const aut = num('AutonomiaMin_Declarada');
  if (aut != null) Number.isInteger(aut) && aut >= 1 && aut <= 600 ? (e.autonomiaMin = aut) : recusar('autonomia', props.AutonomiaMin_Declarada);
  return { especificacao: e, avisos };
}

/**
 * E9.3 — traduz o incêndio lido do arquivo: a peça no CENTRO (em planta e em
 * cota), o tubo pelas pontas do caminho — como a elétrica (E7.2). Peça sem
 * tipo ou sem geometria é recusada com o motivo, nunca adivinhada.
 */
export function traduzirIncendio(leitura: LeituraEletrica): { pontos: PontoDeIncendioTraduzido[]; tubos: EletrodutoTraduzido[]; recusas: RecusaDeTraducao[] } {
  const pontos: PontoDeIncendioTraduzido[] = [];
  const recusas: RecusaDeTraducao[] = [];
  for (const p of leitura.pontos) {
    const tipo = tipoDoPontoDeIncendioIfc(p.classe, p.predefinido, p.objectType);
    if (!tipo) {
      recusas.push({ expressID: p.expressID, nome: p.nome, classe: p.classe, motivo: `${p.classe}${p.predefinido ? ` .${p.predefinido}.` : ''} não tem equivalente entre as peças de incêndio` });
      continue;
    }
    if (!p.centro) {
      recusas.push({ expressID: p.expressID, nome: p.nome, classe: p.classe, motivo: 'a peça não tem geometria para dizer onde está' });
      continue;
    }
    const { especificacao, avisos } = especificacaoDoPset(p.propriedades, tipo);
    for (const a of avisos) recusas.push({ expressID: p.expressID, nome: p.nome, classe: p.classe, motivo: a });
    pontos.push({ expressID: p.expressID, nome: p.nome, pavimento: p.pavimento, at: arredondar(paraPlano(p.centro)), cotaAbsMm: Math.round(paraCota(p.centro)), tipoHidraulico: tipo, especificacao });
  }
  // O tubo: o mesmo encadeamento dos sólidos do eletroduto; a bitola medida (65 sem geometria legível).
  const tubos = traduzirEletrica({ pontos: [], eletrodutos: leitura.eletrodutos, recusas: [] });
  return {
    pontos,
    tubos: tubos.eletrodutos.map((t) => ({ ...t, bitolaMm: leitura.eletrodutos.find((e) => e.expressID === t.expressID)?.diametroM != null ? t.bitolaMm : 65 })),
    recusas: [...recusas, ...tubos.recusas.map((r) => ({ ...r, classe: 'IFCPIPESEGMENT', motivo: r.motivo.replace('eletroduto', 'tubo') }))],
  };
}

/** E9.3 — os comandos do incêndio importado: peças e tubos na disciplina INCENDIO, cota relativa ao pavimento. */
export function comandosDoIncendio(
  pontos: readonly PontoDeIncendioTraduzido[],
  tubos: readonly EletrodutoTraduzido[],
  destino: (pavimento: number) => DestinoDaImportacao | null,
  dx = 0,
  dy = 0,
): Command[] {
  const comandos: Command[] = [];
  for (const p of pontos) {
    const nivel = p.pavimento == null ? null : destino(p.pavimento);
    if (!nivel) continue;
    comandos.push({
      type: 'AddTerminal',
      levelId: nivel.levelId,
      ...(nivel.levelUid ? { levelUid: nivel.levelUid } : {}),
      disciplina: 'INCENDIO',
      tipo: p.nome && p.nome !== '—' ? p.nome : p.tipoHidraulico,
      tipoHidraulico: p.tipoHidraulico,
      at: { x: p.at.x + dx, y: p.at.y + dy },
      cotaMm: p.cotaAbsMm - nivel.elevationMm,
      // C1: o que o arquivo declara da peça (fator K, agente, código da placa…).
      ...p.especificacao,
    } as Command);
  }
  for (const e of tubos) {
    const nivel = e.pavimento == null ? null : destino(e.pavimento);
    if (!nivel) continue;
    comandos.push({
      type: 'AddTrecho',
      levelId: nivel.levelId,
      ...(nivel.levelUid ? { levelUid: nivel.levelUid } : {}),
      disciplina: 'INCENDIO',
      a: { x: e.a.x + dx, y: e.a.y + dy },
      b: { x: e.b.x + dx, y: e.b.y + dy },
      cotaAMm: e.cotaAAbsMm - nivel.elevationMm,
      cotaBMm: e.cotaBAbsMm - nivel.elevationMm,
      bitolaMm: e.bitolaMm,
    });
  }
  return comandos;
}

