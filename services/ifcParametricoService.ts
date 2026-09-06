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

/** Uma peça que o arquivo tem e a importação não sabe ler, com o motivo. */
export interface RecusaGeometrica {
  expressID: number;
  classe: string;
  nome: string;
  motivo: string;
}

export interface LeituraParametrica {
  pecas: PecaParametrica[];
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
export function medirFatorParaMm(pecas: PecaParametrica[]): number | null {
  const escalas = pecas
    .map((p) => Math.hypot(p.matriz[0], p.matriz[1], p.matriz[2]))
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
function limparContorno(pontos: { x: number; y: number }[]): { x: number; y: number }[] {
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

const CLASSES_ESTRUTURAIS = ['IFCCOLUMN', 'IFCBEAM', 'IFCPILE', 'IFCSLAB', 'IFCFOOTING'];

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

  const fatorParaMm = medirFatorParaMm(pecas);
  for (const pav of pavimentos) {
    pav.elevacaoMm = fatorParaMm === null ? null : pav.elevacao * fatorParaMm;
  }

  return { pecas, pavimentos, recusas, fatorParaMm };
}
