// services/ifcParametricoService.ts
//
// A leitura PARAMÉTRICA do IFC — a que a importação usa.
//
// ─── PARAMÉTRICA, E NUNCA A MALHA ─────────────────────────────────────────────
//
// Deduzir "isto parece um pilar de 20×40" da malha produziria número plausível e
// errado, que é o defeito que este projeto combate em toda parte
// (`sobreposicao.ts`, a trava de unidade do orçamento, os `DEGENERATE_*` do
// kernel). Um `IfcRectangleProfileDef` diz `XDim` e `YDim`: é a medida que o
// calculista desenhou, não uma estimativa tirada de triângulos.
//
// O que não for `IfcExtrudedAreaSolid` com UM item é RECUSADO e relatado, com o
// motivo. No modelo real do usuário isso são 46 sapatas (`IfcFacetedBrep`) e 6
// lajes decompostas em dezenas de pedaços — e ele fica sabendo quais, em vez de
// descobrir uma fundação a menos no orçamento.
//
// Separado de `ifcViewerService` porque são dois usos distintos do mesmo
// parser: aquele produz malha para VER; este produz medida para IMPORTAR.

import { obterApi, texto, type FlatMeshIfc } from './ifcViewerService';

/** O perfil de uma extrusão, na unidade do ARQUIVO. */
export type PerfilIfc =
  | { forma: 'RETANGULO'; xDim: number; yDim: number }
  | { forma: 'CIRCULO'; raio: number }
  | { forma: 'POLIGONO'; pontos: { x: number; y: number }[] };

/** Uma peça lida do arquivo, ainda em coordenadas do IFC. */
export interface PecaParametrica {
  expressID: number;
  /** `IFCCOLUMN`, `IFCBEAM`, `IFCPILE`, `IFCSLAB`, `IFCFOOTING`. */
  classe: string;
  nome: string;
  globalId: string;
  perfil: PerfilIfc;
  /** Comprimento da extrusão, na unidade do arquivo. */
  profundidade: number;
  /**
   * A matriz 4×4 (coluna-maior) que leva a geometria local ao mundo do web-ifc.
   *
   * ⚠️ ELA JÁ CARREGA A CONVERSÃO DE UNIDADE. O modelo real do usuário está em
   * CENTÍMETRO e esta matriz tem escala 0,01 — o mundo do web-ifc é METRO.
   * Misturar uma dimensão de perfil (cm) com uma posição da matriz (m) erra por
   * 100×, e o desenho sairia PLAUSÍVEL: um pilar de 20×40 no lugar certo, com
   * um centésimo do tamanho.
   *
   * A regra que evita isso, e que `ifcParaKernel` segue: todo ponto nasce em
   * unidade de ARQUIVO, passa pela matriz, e sai em METRO. Nenhum fator manual.
   */
  matriz: number[];
  /** `expressID` do `IfcBuildingStorey` que contém a peça. */
  pavimento: number | null;
}

export interface PavimentoIfc {
  expressID: number;
  nome: string;
  /** Cota na unidade do ARQUIVO. */
  elevacao: number;
  /**
   * A mesma cota em MILÍMETRO, ou `null` quando o fator não pôde ser medido.
   *
   * ⚠️ É este campo que a tela usa para sugerir o par de pavimentos. Converter
   * na tela foi o defeito de 06/09/2026 — ver `fatorParaMm`.
   */
  elevacaoMm: number | null;
}

/** Uma camada da composição da parede, na unidade do ARQUIVO. */
export interface CamadaIfc {
  espessura: number;
  material: string;
}

/**
 * Uma parede lida do arquivo — caminho PRÓPRIO, e não `PecaParametrica`.
 *
 * A peça estrutural é "um perfil extrudado"; a parede é "um eixo com espessura
 * e camadas". Forçar as duas no mesmo tipo distorceria as duas, e é a diferença
 * entre ler o arquivo e traduzi-lo por analogia.
 */
export interface ParedeParametrica {
  expressID: number;
  globalId: string;
  nome: string;
  /** Eixo já no mundo, na unidade do ARQUIVO — ver `matrizDoPlacement`. */
  eixo: [{ x: number; y: number }, { x: number; y: number }];
  /** Cota da base do eixo, na unidade do arquivo. */
  base: number;
  camadas: CamadaIfc[];
  espessuraTotal: number;
  /**
   * Onde a LINHA DE CENTRO da parede está, em relação ao eixo lido, medida ao
   * longo da normal `(−dy, dx)` e na unidade do arquivo.
   *
   * ─── POR QUE ESTE NÚMERO, E NÃO O `OffsetFromReferenceLine` CRU ───────────
   *
   * No IFC o material vai de `OffsetFromReferenceLine` até
   * `offset + DirectionSense × espessura`. Só o offset não diz onde a parede
   * está, e só o sentido também não — os dois juntos é que dizem. Guardar o
   * centro já resolvido evita que cada leitor refaça a conta de um jeito.
   *
   * ⚠️ Ignorar isto desloca a parede MEIA ESPESSURA, em silêncio e todas para
   * o mesmo lado: o desenho fecha, com os ambientes errados. Medido em
   * 06/09/2026 conferindo o CORPO desenhado contra o eixo:
   *
   * | arquivo | largura do corpo / espessura | onde o eixo cai |
   * |---|---|---|
   * | DigitalHub (102 paredes) | 1,00 | 0,50 — o eixo é a linha de centro |
   * | FZK-Haus (4) | 1,00 | 1,00 — o eixo é uma FACE |
   * | FZK-Haus (2) | 1,00 | 0,00 — o eixo é a outra face |
   *
   * Os três casos saem da mesma fórmula, e é isso que a torna confiável: os
   * dois arquivos discordam no offset (−t/2 contra 0) e no sentido, e mesmo
   * assim o centro sai certo nos dois.
   */
  deslocamentoDoCentro: number;
  /**
   * De que lado do eixo o material foi empilhado: `+1` na normal `(−dy, dx)`,
   * `−1` no lado oposto. É o que vira `alinhamento` no kernel — a memória de
   * que a parede foi traçada por uma FACE, e não pelo eixo.
   */
  sentidoDasCamadas: 1 | -1;
  /**
   * Altura da extrusão do corpo, na unidade do arquivo, ou `null` quando o
   * corpo não é uma extrusão simples — a parede recortada pelo telhado.
   *
   * ⚠️ `null` NÃO é erro: o eixo e as camadas dessas paredes são legíveis, e só
   * a altura precisa vir do pé-direito do pavimento. Medido: 13 das 191.
   */
  alturaExtrusao: number | null;
  pavimento: number | null;
}

/** A esquadria que preenche um vão. */
export interface EsquadriaIfc {
  /** `IFCDOOR` ou `IFCWINDOW`. */
  classe: string;
  globalId: string;
  nome: string;
  /**
   * `OverallWidth`/`OverallHeight` DECLARADOS pela esquadria.
   *
   * Medido em 07/09/2026: **131 de 131** esquadrias dos dois arquivos reais
   * trazem os dois. É por isso que a dimensão do vão sai de atributo e não de
   * geometria — ler o número que o projetista escreveu é sempre melhor que
   * medi-lo de volta a partir de um sólido.
   */
  larguraDeclarada: number | null;
  alturaDeclarada: number | null;
}

/**
 * Um vão lido do arquivo, com os oito cantos do sólido no mundo.
 *
 * Os cantos ficam em unidade de ARQUIVO, como o eixo da parede — quem traduz
 * projeta no eixo da hospedeira para achar `offsetMm` e `sillMm`.
 */
export interface VaoParametrico {
  expressID: number;
  globalId: string;
  nome: string;
  /** `expressID` da parede que o vão fura (`IfcRelVoidsElement`). */
  paredeExpressID: number;
  cantos: { x: number; y: number; z: number }[];
  esquadria: EsquadriaIfc | null;
}

/** Uma peça que o arquivo tem e a importação não sabe ler, com o motivo. */
export interface RecusaGeometrica {
  expressID: number;
  classe: string;
  nome: string;
  motivo: string;
}

export interface LeituraParametrica {
  pecas: PecaParametrica[];
  paredes: ParedeParametrica[];
  vaos: VaoParametrico[];
  pavimentos: PavimentoIfc[];
  recusas: RecusaGeometrica[];
  /**
   * Quantos milímetros vale UMA unidade de comprimento do arquivo.
   *
   * `null` quando não há peça de onde medir — e aí ninguém adivinha: a tela
   * pede o par de pavimentos ao usuário, que é o que ela já faria.
   */
  fatorParaMm: number | null;
}

/**
 * Quantos milímetros vale uma unidade de comprimento do arquivo.
 *
 * ─── POR QUE SAI DA MATRIZ, E NÃO DE UMA HEURÍSTICA ─────────────────────────
 *
 * A matriz de cada peça já leva a geometria da unidade do ARQUIVO ao metro do
 * web-ifc: a norma de uma coluna dela É essa escala. Medi-la aqui é usar a
 * mesma fonte que a geometria usa — a regra que este módulo segue desde o
 * início ("nenhum fator manual").
 *
 * ─── O QUE ISTO SUBSTITUIU ──────────────────────────────────────────────────
 *
 * A tela deduzia o fator comparando a cota declarada do pavimento com o TOPO
 * das peças dele. Topo inclui a ALTURA da peça, então a razão nunca dava a
 * escala: medido no modelo real (arquivo em centímetro, fator 10), as razões
 * foram 15,00 · 15,90 · 13,17 · 11,87. Nenhuma passava perto de 1, 10 ou 1000,
 * e a conta caía no fallback `1` — as cotas viravam 0,34 m onde eram 3,40 m, e
 * os pavimentos altos passavam todos a apontar para o térreo. Exatamente o
 * "393 peças entram um andar fora, em silêncio" que a tela existe para impedir.
 *
 * A mediana, e não a média: uma peça com placement estranho não pode arrastar
 * a escala do arquivo inteiro.
 */
export function medirFatorParaMm(
  pecas: PecaParametrica[],
  outrasMatrizes: number[][] = [],
): number | null {
  // ⚠️ As paredes entram como segunda fonte desde 07/09/2026. Um modelo só de
  // arquitetura — quatro paredes e nada mais — não tem PEÇA nenhuma, e o fator
  // saía `null`: o nosso próprio export era recusado inteiro por "a escala do
  // arquivo não pôde ser medida". A malha da parede vem do mesmo parser e traz
  // a mesma matriz, então é a mesma fonte, não uma heurística nova.
  const escalas = [...pecas.map((p) => p.matriz), ...outrasMatrizes]
    .map((m) => Math.hypot(m[0], m[1], m[2]))
    .filter((e) => Number.isFinite(e) && e > 0)
    .sort((a, b) => a - b);
  if (escalas.length === 0) return null;
  const escala = escalas[Math.floor(escalas.length / 2)];
  // A escala é arquivo→METRO; o kernel quer milímetro.
  return escala * 1000;
}

/**
 * Tira do contorno o que não muda a forma: pontos repetidos e pontos no meio de
 * um lado reto.
 *
 * ─── POR QUE ISTO NÃO É APROXIMAR ───────────────────────────────────────────
 *
 * Um ponto igual ao anterior e um ponto colinear entre dois outros descrevem
 * exatamente o mesmo polígono — removê-los é reescrever a mesma forma com menos
 * letras, não simplificá-la. A geometria resultante é idêntica, ponto a ponto.
 *
 * Medido no modelo real (Garden Cambuhy) em 06/09/2026: dos 589 perfis
 * poligonais, **28** eram reconhecíveis como retângulo direto e **132** depois
 * desta limpeza. Os 104 a mais eram retângulos escritos com um vértice a mais no
 * meio de um lado — 5 pontos para 4 cantos.
 *
 * ⚠️ UM DE CADA VEZ, e não em bloco. Remover todos os colineares num `filter`
 * usa os vizinhos ORIGINAIS: com dois pontos colineares seguidos, os dois se
 * julgam removíveis olhando um para o outro e a forma desmonta. Foi o que
 * aconteceu na primeira tentativa desta medição — 157 polígonos ortogonais
 * viraram "triângulos", que é geometricamente impossível.
 */
export function limparContorno(pontos: { x: number; y: number }[]): { x: number; y: number }[] {
  let q = pontos.slice();
  if (
    q.length > 1 &&
    q[0].x === q[q.length - 1].x &&
    q[0].y === q[q.length - 1].y
  ) {
    q = q.slice(0, -1);
  }

  const removerUmaVez = (achar: (i: number) => boolean): void => {
    let mudou = true;
    while (mudou && q.length > 3) {
      mudou = false;
      for (let i = 0; i < q.length; i++) {
        if (!achar(i)) continue;
        q.splice(i, 1);
        mudou = true;
        break;
      }
    }
  };

  // 1. pontos repetidos (lado de comprimento zero)
  removerUmaVez((i) => {
    const b = q[i];
    const c = q[(i + 1) % q.length];
    return Math.hypot(b.x - c.x, b.y - c.y) < 1e-9;
  });

  // 2. pontos no meio de um lado reto
  removerUmaVez((i) => {
    const a = q[(i + q.length - 1) % q.length];
    const b = q[i];
    const c = q[(i + 1) % q.length];
    const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const escala = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
    return escala > 0 && Math.abs(cruz) / escala < 1e-9;
  });

  return q;
}

/**
 * Um polígono que É um retângulo alinhado aos eixos vira RETANGULO.
 *
 * ─── POR QUE ISTO NÃO É ESTIMATIVA ──────────────────────────────────────────
 *
 * Exportador nenhum é obrigado a usar `IfcRectangleProfileDef` para uma seção
 * retangular; escrever os quatro cantos como `IfcArbitraryClosedProfileDef` é
 * igualmente válido, e é o que o AltoQi faz em parte das vigas. Reconhecer isso
 * é LER o que está no arquivo, não deduzir dele — as dimensões saem dos
 * próprios lados, exatas.
 *
 * Medido no modelo real (Garden Cambuhy, 14 MB) em 06/09/2026: 28 vigas eram
 * recusadas por "perfil não retangular" sendo retângulos de 19 × 70 cm.
 *
 * ─── E POR QUE SÓ ALINHADO AOS EIXOS ────────────────────────────────────────
 *
 * `RETANGULO` guarda `xDim`/`yDim` e nada mais: não há onde pôr um ângulo. Um
 * retângulo RODADO dentro do plano do perfil viraria, ao ser convertido, um
 * retângulo alinhado — a seção giraria em silêncio, com as medidas certas no
 * lugar errado. Então ele continua POLIGONO e continua sendo recusado, que é a
 * resposta honesta. (No modelo real os 28 estão todos alinhados; nenhum rodado.)
 */
export function normalizarRetangulo(pontos: { x: number; y: number }[]): PerfilIfc {
  const poligono: PerfilIfc = { forma: 'POLIGONO', pontos };
  const p = limparContorno(pontos);
  if (p.length !== 4) return poligono;

  const xs = p.map((c) => c.x);
  const ys = p.map((c) => c.y);
  const xDim = Math.max(...xs) - Math.min(...xs);
  const yDim = Math.max(...ys) - Math.min(...ys);
  if (!(xDim > 0) || !(yDim > 0)) return poligono;

  // Cada lado paralelo a um eixo.
  const tol = Math.max(xDim, yDim) * 1e-6;
  const eixoAlinhado = p.every((c, i) => {
    const d = p[(i + 1) % 4];
    return Math.abs(c.x - d.x) <= tol || Math.abs(c.y - d.y) <= tol;
  });
  if (!eixoAlinhado) return poligono;

  // E a área tem de ser a da caixa: um polígono degenerado (dois cantos
  // coincidentes) passaria nos testes acima e não é retângulo nenhum.
  let dobro = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    dobro += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  if (Math.abs(Math.abs(dobro) / 2 - xDim * yDim) > xDim * yDim * 1e-6) return poligono;

  // ⚠️ E TEM DE ESTAR CENTRADO NA ORIGEM.
  //
  // `RETANGULO` guarda só `xDim`/`yDim`, e quem o consome (`cantosDoPerfil`)
  // reconstrói os cantos em −xDim/2..+xDim/2 — ou seja, CENTRADOS, como manda
  // `IfcRectangleProfileDef`. Um polígono retangular desenhado longe da origem
  // do perfil tem a mesma forma e OUTRA posição: convertê-lo moveria a peça
  // pela distância do centro até a origem, em silêncio, com as medidas certas.
  //
  // Descoberto ao investigar por que a limpeza de contorno não rendia peça
  // nenhuma: os 104 perfis que ela recuperava eram de LAJE, e foi aí que a
  // pergunta "e se não estiver centrado?" apareceu. No modelo real os 28 casos
  // que já entravam estão todos centrados — sorte, não projeto.
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  if (Math.hypot(cx, cy) > Math.max(xDim, yDim) * 1e-6) return poligono;

  return { forma: 'RETANGULO', xDim, yDim };
}

/**
 * O `expressID` de uma referência, venha ela achatada ou não.
 *
 * `GetLine(id, eid, true)` resolve as referências em objetos completos; sem o
 * `true` elas ficam como `{ value }`. Aceitar as duas formas é o que impede uma
 * relação inteira de sumir por causa de um flag.
 */
function referencia(v: unknown): number | undefined {
  const o = v as { value?: number; expressID?: number } | null | undefined;
  return o?.value ?? o?.expressID;
}

const CLASSES_ESTRUTURAIS = ['IFCCOLUMN', 'IFCBEAM', 'IFCPILE', 'IFCSLAB', 'IFCFOOTING'];

/** Produto de duas matrizes 4×4 coluna-maior. */
function multiplicar(a: number[], b: number[]): number[] {
  const c = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let lin = 0; lin < 4; lin++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + lin] * b[col * 4 + k];
      c[col * 4 + lin] = s;
    }
  }
  return c;
}

/**
 * A matriz do OBJETO, composta pela cadeia de `IfcLocalPlacement`.
 *
 * ─── POR QUE NÃO SERVE A MATRIZ QUE O PARSER JÁ DÁ ──────────────────────────
 *
 * `PecaParametrica.matriz` vem de `StreamAllMeshes` e é a transformação do
 * CORPO — placement do objeto composto com a posição da extrusão. Para uma peça
 * estrutural isso é exatamente o que se quer, porque ela é aplicada aos cantos
 * do PERFIL, que vivem no sistema da extrusão.
 *
 * ⚠️ O eixo da parede (`Axis`) NÃO vive nesse sistema: ele está nas coordenadas
 * locais do objeto. Aplicar a matriz do corpo a ele dá número plausível e
 * errado — medido em 06/09/2026 nos dois arquivos reais:
 *
 * | | matriz do corpo | cadeia de placement |
 * |---|---|---|
 * | FZK-Haus · eixos que colapsam para zero | 1 | **0** |
 * | FZK-Haus · cantos que se encontram | 23% | **69%** |
 * | DigitalHub · eixos que colapsam para zero | **70** | **0** |
 * | DigitalHub · comprimento mediano | 2,20 | **5,40** |
 *
 * Uma parede de 4,25 m com eixo local `[(0,0),(4,25,0)]` saía com comprimento
 * ZERO. Setenta paredes do DigitalHub faziam isso, e as demais entrariam
 * encolhidas — no lugar certo, com a medida errada.
 *
 * O resultado fica na unidade do ARQUIVO (a cadeia de placement não converte
 * nada); quem chama multiplica por `fatorParaMm`, como o resto do módulo.
 */
export function matrizDoPlacement(placement: unknown): number[] | null {
  const p = placement as Record<string, unknown> | null | undefined;
  if (!p) return null;
  const local = matrizDeEixo(p.RelativePlacement);
  if (!local) return null;
  const pai = matrizDoPlacement(p.PlacementRelTo);
  return pai ? multiplicar(pai, local) : local;
}

/**
 * A matriz de UM `IfcAxis2Placement` (2D ou 3D), sem cadeia.
 *
 * Separada porque a mesma conta serve a três lugares com donos diferentes: o
 * placement do objeto, a `Position` da extrusão e a `Position` do perfil. Cada
 * um deles desloca a geometria, e esquecer qualquer um põe o vão no lugar
 * errado da parede — com largura e altura certas.
 */
export function matrizDeEixo(eixo: unknown): number[] | null {
  const rel = eixo as Record<string, unknown> | null | undefined;
  if (!rel) return null;

  const coords = (v: unknown): number[] =>
    (((v as Record<string, unknown> | undefined)?.Coordinates ??
      (v as Record<string, unknown> | undefined)?.DirectionRatios ??
      []) as { value?: number }[]).map((c) => Number(c?.value ?? 0));

  const loc = coords(rel.Location);
  const normalizar = (v: number[]): number[] => {
    const n = Math.hypot(v[0], v[1], v[2]);
    return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 1];
  };

  // Ausentes têm padrão pela norma: Z = (0,0,1) e X = (1,0,0). Um placement 2D
  // (`IfcAxis2Placement2D`) só traz duas coordenadas, e os `?? 0` cuidam disso.
  const eixoZ = rel.Axis ? normalizar([...coords(rel.Axis), 0, 0, 0].slice(0, 3)) : [0, 0, 1];
  const bruto = rel.RefDirection ? [...coords(rel.RefDirection), 0, 0, 0].slice(0, 3) : [1, 0, 0];
  const d = bruto[0] * eixoZ[0] + bruto[1] * eixoZ[1] + bruto[2] * eixoZ[2];
  const eixoX = normalizar([
    bruto[0] - d * eixoZ[0],
    bruto[1] - d * eixoZ[1],
    bruto[2] - d * eixoZ[2],
  ]);
  const eixoY = [
    eixoZ[1] * eixoX[2] - eixoZ[2] * eixoX[1],
    eixoZ[2] * eixoX[0] - eixoZ[0] * eixoX[2],
    eixoZ[0] * eixoX[1] - eixoZ[1] * eixoX[0],
  ];

  return [
    eixoX[0], eixoX[1], eixoX[2], 0,
    eixoY[0], eixoY[1], eixoY[2], 0,
    eixoZ[0], eixoZ[1], eixoZ[2], 0,
    loc[0] ?? 0, loc[1] ?? 0, loc[2] ?? 0, 1,
  ];
}

async function tabelaDeTipos(): Promise<Record<string, unknown>> {
  const mod = (await import('web-ifc')) as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  return (mod.IfcAPI ? mod : mod.default) as Record<string, unknown>;
}

export async function lerPecasParametricas(modeloId: number): Promise<LeituraParametrica> {
  const api = await obterApi();
  const raiz = await tabelaDeTipos();

  // A matriz de cada produto vem do próprio parser, já composta e já com a
  // unidade embutida — ver `PecaParametrica.matriz`.
  const matrizes = new Map<number, number[]>();
  const geometriasPorProduto = new Map<number, number>();
  api.StreamAllMeshes(modeloId, (malha: FlatMeshIfc) => {
    geometriasPorProduto.set(malha.expressID, malha.geometries.size());
    if (malha.geometries.size() > 0) {
      matrizes.set(malha.expressID, malha.geometries.get(0).flatTransformation);
    }
  });

  // Pavimento de cada elemento, por `IfcRelContainedInSpatialStructure`.
  const pavimentoDe = new Map<number, number>();
  const rels = api.GetLineIDsWithType(modeloId, raiz.IFCRELCONTAINEDINSPATIALSTRUCTURE as number);
  for (let i = 0; i < rels.size(); i++) {
    const rel = api.GetLine(modeloId, rels.get(i), true) as Record<string, unknown>;
    const estrutura = rel.RelatingStructure as { type?: number; expressID?: number } | undefined;
    if (!estrutura || estrutura.type !== raiz.IFCBUILDINGSTOREY) continue;
    for (const o of (rel.RelatedElements ?? []) as { value?: number; expressID?: number }[]) {
      const id = o?.value ?? o?.expressID;
      if (id !== undefined && estrutura.expressID !== undefined) {
        pavimentoDe.set(id, estrutura.expressID);
      }
    }
  }

  const pavimentos: PavimentoIfc[] = [];
  const idsPav = api.GetLineIDsWithType(modeloId, raiz.IFCBUILDINGSTOREY as number);
  for (let i = 0; i < idsPav.size(); i++) {
    const p = api.GetLine(modeloId, idsPav.get(i), true) as Record<string, unknown>;
    pavimentos.push({
      expressID: idsPav.get(i),
      nome: texto(p.Name),
      elevacao: Number((p.Elevation as { value?: number } | undefined)?.value ?? 0),
      // Preenchido no fim, quando o fator já foi medido nas peças.
      elevacaoMm: null,
    });
  }
  pavimentos.sort((a, b) => a.elevacao - b.elevacao);

  const pecas: PecaParametrica[] = [];
  const recusas: RecusaGeometrica[] = [];

  /** Segue `IfcMappedItem` até o item de verdade. */
  const itensDe = (rep: Record<string, unknown>): Record<string, unknown>[] => {
    const saida: Record<string, unknown>[] = [];
    for (const it of (rep.Items ?? []) as Record<string, unknown>[]) {
      if (it.type === raiz.IFCMAPPEDITEM) {
        const fonte = (it.MappingSource as Record<string, unknown> | undefined)?.MappedRepresentation as
          | Record<string, unknown>
          | undefined;
        if (fonte) saida.push(...itensDe(fonte));
      } else saida.push(it);
    }
    return saida;
  };

  for (const classe of CLASSES_ESTRUTURAIS) {
    const codigo = raiz[classe] as number | undefined;
    if (typeof codigo !== 'number') continue;
    const ids = api.GetLineIDsWithType(modeloId, codigo);

    for (let i = 0; i < ids.size(); i++) {
      const eid = ids.get(i);
      const el = api.GetLine(modeloId, eid, true) as Record<string, unknown>;
      const nome = texto(el.Name);
      const recusar = (motivo: string) => recusas.push({ expressID: eid, classe, nome, motivo });

      const representacoes = ((el.Representation as Record<string, unknown> | undefined)
        ?.Representations ?? []) as Record<string, unknown>[];
      const itens = representacoes
        .filter((r) => texto(r.RepresentationIdentifier) === 'Body')
        .flatMap(itensDe);

      if (itens.length !== 1) {
        recusar(
          itens.length === 0
            ? 'não tem representação de corpo no arquivo'
            : `a forma é composta por ${itens.length} sólidos; a importação lê um só`,
        );
        continue;
      }
      const item = itens[0];
      if (item.type !== raiz.IFCEXTRUDEDAREASOLID) {
        recusar('a forma é uma malha, não a extrusão de um perfil — sair dela seria estimar');
        continue;
      }
      const matriz = matrizes.get(eid);
      if (!matriz || (geometriasPorProduto.get(eid) ?? 0) !== 1) {
        recusar('a peça tem mais de uma geometria colocada, e não dá para saber qual é o perfil');
        continue;
      }

      const area = item.SweptArea as Record<string, unknown>;
      let perfil: PerfilIfc | null = null;
      if (area.type === raiz.IFCRECTANGLEPROFILEDEF) {
        perfil = {
          forma: 'RETANGULO',
          xDim: Number((area.XDim as { value?: number } | undefined)?.value ?? 0),
          yDim: Number((area.YDim as { value?: number } | undefined)?.value ?? 0),
        };
      } else if (area.type === raiz.IFCCIRCLEPROFILEDEF) {
        perfil = {
          forma: 'CIRCULO',
          raio: Number((area.Radius as { value?: number } | undefined)?.value ?? 0),
        };
      } else if (area.type === raiz.IFCARBITRARYCLOSEDPROFILEDEF) {
        const curva = area.OuterCurve as Record<string, unknown> | undefined;
        const pts = (curva?.Points ?? []) as { Coordinates?: { value: number }[] }[];
        const pontos = pts
          .map((p) => ({
            x: Number(p.Coordinates?.[0]?.value ?? NaN),
            y: Number(p.Coordinates?.[1]?.value ?? NaN),
          }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (pontos.length >= 3) perfil = normalizarRetangulo(pontos);
      }

      if (!perfil) {
        recusar('o perfil da extrusão não é retângulo, círculo nem polígono fechado');
        continue;
      }

      pecas.push({
        expressID: eid,
        classe,
        nome,
        globalId: texto(el.GlobalId),
        perfil,
        profundidade: Number((item.Depth as { value?: number } | undefined)?.value ?? 0),
        matriz,
        pavimento: pavimentoDe.get(eid) ?? null,
      });
    }
  }

  // ─── PAREDES ──────────────────────────────────────────────────────────────
  //
  // A composição vem por `IfcRelAssociatesMaterial`. Indexar antes evita
  // percorrer a relação uma vez por parede.
  const camadasDe = new Map<
    number,
    { camadas: CamadaIfc[]; offset: number; sentido: 1 | -1 }
  >();
  const relsMat = api.GetLineIDsWithType(modeloId, raiz.IFCRELASSOCIATESMATERIAL as number);
  for (let i = 0; i < relsMat.size(); i++) {
    const rel = api.GetLine(modeloId, relsMat.get(i), true) as Record<string, unknown>;
    const material = rel.RelatingMaterial as Record<string, unknown> | undefined;
    if (!material) continue;

    // `LayerSetUsage` traz o conjunto E o deslocamento; `LayerSet` puro, só o
    // conjunto — e aí a linha de referência é o próprio eixo.
    const usoDireto = material.type === raiz.IFCMATERIALLAYERSETUSAGE;
    const conjunto = (usoDireto ? material.ForLayerSet : material) as
      | Record<string, unknown>
      | undefined;
    const listaBruta = (conjunto?.MaterialLayers ?? []) as Record<string, unknown>[];
    if (listaBruta.length === 0) continue;

    const camadas: CamadaIfc[] = listaBruta.map((c) => ({
      espessura: Number((c.LayerThickness as { value?: number } | undefined)?.value ?? 0),
      material: texto((c.Material as Record<string, unknown> | undefined)?.Name),
    }));
    const sentido: 1 | -1 = texto(material.DirectionSense) === 'NEGATIVE' ? -1 : 1;
    // Sem `LayerSetUsage` não há linha de referência declarada, e o padrão
    // razoável é a parede centrada no eixo — que é o que `offset = −t/2` com
    // sentido positivo produz. Ver `deslocamentoDoCentro`.
    const total = camadas.reduce((s, c) => s + c.espessura, 0);
    const offset = usoDireto
      ? Number((material.OffsetFromReferenceLine as { value?: number } | undefined)?.value ?? 0)
      : -total / 2;

    for (const o of (rel.RelatedObjects ?? []) as { value?: number; expressID?: number }[]) {
      const id = o?.value ?? o?.expressID;
      if (id !== undefined) camadasDe.set(id, { camadas, offset, sentido });
    }
  }

  const paredes: ParedeParametrica[] = [];
  for (const classe of ['IFCWALL', 'IFCWALLSTANDARDCASE']) {
    const codigo = raiz[classe] as number | undefined;
    if (typeof codigo !== 'number') continue;
    const ids = api.GetLineIDsWithType(modeloId, codigo);

    for (let i = 0; i < ids.size(); i++) {
      const eid = ids.get(i);
      const el = api.GetLine(modeloId, eid, true) as Record<string, unknown>;
      const nome = texto(el.Name);
      const recusar = (motivo: string) => recusas.push({ expressID: eid, classe, nome, motivo });

      const representacoes = ((el.Representation as Record<string, unknown> | undefined)
        ?.Representations ?? []) as Record<string, unknown>[];

      const eixoRep = representacoes.find((r) => texto(r.RepresentationIdentifier) === 'Axis');
      const itensDoEixo = (eixoRep?.Items ?? []) as Record<string, unknown>[];
      const pontos = ((itensDoEixo[0]?.Points ?? []) as { Coordinates?: { value: number }[] }[]);
      if (pontos.length !== 2) {
        recusar(
          pontos.length === 0
            ? 'a parede não tem eixo no arquivo, e deduzi-lo do corpo seria estimar'
            : `o eixo tem ${pontos.length} pontos; a parede do desenho é um trecho reto`,
        );
        continue;
      }

      const matriz = matrizDoPlacement(el.ObjectPlacement);
      if (!matriz) {
        recusar('a parede não tem posição no arquivo');
        continue;
      }
      const noMundo = (p: { Coordinates?: { value: number }[] }) => {
        const x = Number(p.Coordinates?.[0]?.value ?? 0);
        const y = Number(p.Coordinates?.[1]?.value ?? 0);
        return { x: matriz[0] * x + matriz[4] * y + matriz[12], y: matriz[1] * x + matriz[5] * y + matriz[13] };
      };
      const a = noMundo(pontos[0]);
      const b = noMundo(pontos[1]);
      if (!(Math.hypot(b.x - a.x, b.y - a.y) > 0)) {
        recusar('o eixo da parede tem comprimento zero depois de posicionado');
        continue;
      }

      const comp = camadasDe.get(eid);
      if (!comp || comp.camadas.length === 0) {
        recusar('a parede não declara composição, e a espessura sairia de estimativa');
        continue;
      }
      const espessuraTotal = comp.camadas.reduce((s, c) => s + c.espessura, 0);
      if (!(espessuraTotal > 0)) {
        recusar('a composição da parede soma espessura zero');
        continue;
      }

      // A altura só existe quando o corpo é extrusão simples. Recortado pelo
      // telhado, ela vem do pavimento — e a tela declara isso.
      const corpo = representacoes
        .filter((r) => texto(r.RepresentationIdentifier) === 'Body')
        .flatMap(itensDe);
      const extrusao = corpo.length === 1 && corpo[0].type === raiz.IFCEXTRUDEDAREASOLID ? corpo[0] : null;

      paredes.push({
        expressID: eid,
        globalId: texto(el.GlobalId),
        nome,
        eixo: [a, b],
        base: matriz[14],
        camadas: comp.camadas,
        espessuraTotal,
        // O material vai de `offset` a `offset + sentido × espessura`; o centro
        // é o meio disso. Os dois arquivos reais discordam em offset e em
        // sentido, e esta única fórmula acerta os dois.
        deslocamentoDoCentro: comp.offset + (comp.sentido * espessuraTotal) / 2,
        sentidoDasCamadas: comp.sentido,
        alturaExtrusao: extrusao
          ? Number((extrusao.Depth as { value?: number } | undefined)?.value ?? 0) || null
          : null,
        pavimento: pavimentoDe.get(eid) ?? null,
      });
    }
  }

  // ─── VÃOS ─────────────────────────────────────────────────────────────────
  //
  // ⚠️ O caminho das peças estruturais NÃO serve aqui. Ele tira a matriz de
  // `StreamAllMeshes`, e medido em 07/09/2026 **nenhum** dos 265 vãos dos dois
  // arquivos reais tem malha: o parser não gera geometria para
  // `IfcOpeningElement`. A matriz tem de ser composta — placement do objeto,
  // `Position` da extrusão e `Position` do perfil, os três.
  const paredesPorId = new Set(paredes.map((p) => p.expressID));

  const hospedeiraDe = new Map<number, number>();
  const relsVoid = api.GetLineIDsWithType(modeloId, raiz.IFCRELVOIDSELEMENT as number);
  for (let i = 0; i < relsVoid.size(); i++) {
    const r = api.GetLine(modeloId, relsVoid.get(i), true) as Record<string, unknown>;
    // ⚠️ `GetLine(..., true)` ACHATA a referência: ela chega como o objeto
    // inteiro, com `expressID`, e não como `{ value }`. Ler só `value` fazia os
    // 265 vãos serem recusados com "não diz que parede ele fura".
    const vao = referencia(r.RelatedOpeningElement);
    const parede = referencia(r.RelatingBuildingElement);
    if (vao !== undefined && parede !== undefined) hospedeiraDe.set(vao, parede);
  }

  const esquadriaDe = new Map<number, EsquadriaIfc>();
  const relsFill = api.GetLineIDsWithType(modeloId, raiz.IFCRELFILLSELEMENT as number);
  for (let i = 0; i < relsFill.size(); i++) {
    const r = api.GetLine(modeloId, relsFill.get(i), true) as Record<string, unknown>;
    const vao = referencia(r.RelatingOpeningElement);
    const eid = referencia(r.RelatedBuildingElement);
    if (vao === undefined || eid === undefined) continue;
    const e = api.GetLine(modeloId, eid, true) as Record<string, unknown>;
    const numero = (v: unknown) => {
      const n = (v as { value?: number } | undefined)?.value;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    };
    esquadriaDe.set(vao, {
      classe: e.type === raiz.IFCDOOR ? 'IFCDOOR' : e.type === raiz.IFCWINDOW ? 'IFCWINDOW' : 'OUTRA',
      globalId: texto(e.GlobalId),
      nome: texto(e.Name),
      larguraDeclarada: numero(e.OverallWidth),
      alturaDeclarada: numero(e.OverallHeight),
    });
  }

  const vaos: VaoParametrico[] = [];
  const idsVao = api.GetLineIDsWithType(modeloId, raiz.IFCOPENINGELEMENT as number);
  for (let i = 0; i < idsVao.size(); i++) {
    const eid = idsVao.get(i);
    const el = api.GetLine(modeloId, eid, true) as Record<string, unknown>;
    const nome = texto(el.Name);
    const recusar = (motivo: string) =>
      recusas.push({ expressID: eid, classe: 'IFCOPENINGELEMENT', nome, motivo });

    const parede = hospedeiraDe.get(eid);
    if (parede === undefined) {
      recusar('o vão não diz que parede ele fura');
      continue;
    }
    if (!paredesPorId.has(parede)) {
      // Furo em laje ou em peça que não é parede: o kernel só tem abertura em
      // parede, e pendurá-la na parede errada seria pior que não importar.
      recusar('o vão fura uma peça que não é parede');
      continue;
    }

    const itens = ((el.Representation as Record<string, unknown> | undefined)?.Representations ??
      []) as Record<string, unknown>[];
    const corpo = itens
      .filter((r) => texto(r.RepresentationIdentifier) === 'Body')
      .flatMap(itensDe);
    // ⚠️ MAIS DE UM SÓLIDO É NORMAL AQUI. Medido: os 17 vãos do FZK-Haus têm
    // DOIS itens de extrusão no mesmo `Body` — o furo é a união deles. Exigir
    // um só (como se faz para peça estrutural, onde dois sólidos significam que
    // não dá para saber qual é o perfil) recusava 16 dos 17 chamando-os de
    // malha. Aqui a união é a resposta certa: o vazio é tudo o que foi tirado.
    if (corpo.length === 0) {
      recusar('o vão não tem representação de corpo no arquivo');
      continue;
    }
    if (corpo.some((c) => c.type !== raiz.IFCEXTRUDEDAREASOLID)) {
      // `IfcAdvancedBrep` — 102 dos 248 vãos do DigitalHub. Tirar largura e
      // peitoril de uma malha seria estimar, que é o que este módulo recusa.
      recusar('a forma do vão é uma malha, não a extrusão de um perfil');
      continue;
    }

    const doObjeto = matrizDoPlacement(el.ObjectPlacement);
    if (!doObjeto) {
      recusar('o vão não tem posição no arquivo');
      continue;
    }

    const cantos: { x: number; y: number; z: number }[] = [];
    let algumPerfil = false;
    for (const solido of corpo) {
    const daExtrusao = matrizDeEixo(solido.Position);
    const M = daExtrusao ? multiplicar(doObjeto, daExtrusao) : doObjeto;

    const area = solido.SweptArea as Record<string, unknown>;
    let perfil: { x: number; y: number }[] | null = null;
    if (area.type === raiz.IFCRECTANGLEPROFILEDEF) {
      const hx = Number((area.XDim as { value?: number } | undefined)?.value ?? 0) / 2;
      const hy = Number((area.YDim as { value?: number } | undefined)?.value ?? 0) / 2;
      perfil = [
        { x: -hx, y: -hy },
        { x: hx, y: -hy },
        { x: hx, y: hy },
        { x: -hx, y: hy },
      ];
    } else if (area.type === raiz.IFCARBITRARYCLOSEDPROFILEDEF) {
      const pts = ((area.OuterCurve as Record<string, unknown> | undefined)?.Points ??
        []) as { Coordinates?: { value: number }[] }[];
      const lidos = pts
        .map((q) => ({
          x: Number(q.Coordinates?.[0]?.value ?? NaN),
          y: Number(q.Coordinates?.[1]?.value ?? NaN),
        }))
        .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
      if (lidos.length >= 3) perfil = lidos;
    }
    if (!perfil) continue;
    algumPerfil = true;

    // A `Position` do PERFIL também desloca — esquecê-la põe o vão deslocado
    // com a medida certa, que é o defeito preferido deste módulo.
    const doPerfil = matrizDeEixo(area.Position);
    if (doPerfil) {
      perfil = perfil.map((q) => ({
        x: doPerfil[0] * q.x + doPerfil[4] * q.y + doPerfil[12],
        y: doPerfil[1] * q.x + doPerfil[5] * q.y + doPerfil[13],
      }));
    }

    const dir = ((solido.ExtrudedDirection as Record<string, unknown> | undefined)
      ?.DirectionRatios ?? []) as { value?: number }[];
    const d = [Number(dir[0]?.value ?? 0), Number(dir[1]?.value ?? 0), Number(dir[2]?.value ?? 1)];
    const prof = Number((solido.Depth as { value?: number } | undefined)?.value ?? 0);

    const noMundo3 = (x: number, y: number, z: number) => ({
      x: M[0] * x + M[4] * y + M[8] * z + M[12],
      y: M[1] * x + M[5] * y + M[9] * z + M[13],
      z: M[2] * x + M[6] * y + M[10] * z + M[14],
    });
    for (const q of perfil) {
      cantos.push(noMundo3(q.x, q.y, 0));
      cantos.push(noMundo3(q.x + d[0] * prof, q.y + d[1] * prof, d[2] * prof));
    }
    }

    if (!algumPerfil) {
      recusar('o perfil do vão não é retângulo nem polígono fechado');
      continue;
    }

    vaos.push({
      expressID: eid,
      globalId: texto(el.GlobalId),
      nome,
      paredeExpressID: parede,
      cantos,
      esquadria: esquadriaDe.get(eid) ?? null,
    });
  }

  const fatorParaMm = medirFatorParaMm(
    pecas,
    paredes
      .map((w) => matrizes.get(w.expressID))
      .filter((m): m is number[] => m !== undefined),
  );
  for (const pav of pavimentos) {
    pav.elevacaoMm = fatorParaMm === null ? null : pav.elevacao * fatorParaMm;
  }

  return { pecas, paredes, vaos, pavimentos, recusas, fatorParaMm };
}
