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
        if (pontos.length >= 3) perfil = { forma: 'POLIGONO', pontos };
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
