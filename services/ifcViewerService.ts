// services/ifcViewerService.ts
//
// Abrir um IFC de terceiro e transformá-lo em malhas do Three — a parte sem
// React, para poder ser lida e corrigida sem abrir um componente de canvas.
//
// ─── ESTE MÓDULO NÃO É O KERNEL ────────────────────────────────────────────────
//
// O que entra aqui é o modelo de OUTRA pessoa: o IFC do calculista, do
// arquiteto, do instalador. Ele não vira `BlueprintModel`, não ganha `uid` do
// kernel e não entra em payload canônico nenhum. É referência para OLHAR — e a
// separação é o que impede que geometria importada, com todas as ambiguidades
// de um arquivo de terceiro, contamine um modelo cujo determinismo o projeto
// inteiro depende.
//
// Importar de verdade (IFC → `BlueprintModel`, preservando `GlobalId`) é outra
// coisa, e está no roadmap como item próprio.
//
// ─── POR QUE `web-ifc` DIRETO, E NÃO UMA BIBLIOTECA DE ALTO NÍVEL ──────────────
//
// A API do @thatopen/components muda muito entre versões menores; `web-ifc` é o
// parser WASM que elas usam por baixo e tem API estável. A decisão vem do spike
// (`bim-spike/README.md`) e se mantém.

import type * as THREE_NS from 'three';

/** Onde o `.wasm` é servido. Ver o plugin `webIfcWasm` em `vite.config.ts`. */
const CAMINHO_WASM = '/wasm/';

let caminhoDoWasm = CAMINHO_WASM;

/**
 * Aponta o `.wasm` para outro lugar. GANCHO DE TESTE, como `usarGeradorDeUid`
 * no kernel.
 *
 * O caminho de produção é ABSOLUTO a partir da raiz do site, e em Node isso vira
 * `C:\wasm\` — que não existe. Sem esta costura, o serviço só seria
 * verificável abrindo o navegador, e a conversão de geometria (a parte que mais
 * erra) ficaria sem prova nenhuma fora dele.
 */
export function usarCaminhoDoWasm(caminho: string | null): void {
  caminhoDoWasm = caminho ?? CAMINHO_WASM;
  apiPromessa = null;
}

/** Um produto do IFC, já como malha, com o que identifica o elemento. */
export interface ElementoIfc {
  expressID: number;
  /** Malha pronta para a cena. Uma por produto — ver o cabeçalho de `carregarIfc`. */
  mesh: THREE_NS.Mesh;
}

export interface ModeloIfcCarregado {
  /** O id do modelo aberto no WASM. É o que `lerElemento` precisa. */
  modeloId: number;
  /** Tudo o que se vê, num grupo só. */
  grupo: THREE_NS.Group;
  elementos: ElementoIfc[];
  /** Quanto tempo, em ms, do byte ao navegável. É o número do veredito. */
  msAteNavegavel: number;
  /** Para o enquadramento inicial da câmera. */
  caixa: THREE_NS.Box3;
  triangulos: number;
  /** `IFC4`, `IFC2X3`… — o que o arquivo declara. */
  schema: string;
  /** Fecha o modelo no WASM. Chamar ao trocar de arquivo ou sair da tela. */
  liberar: () => void;
}

/** Uma propriedade lida de um `IfcPropertySet` ou `IfcElementQuantity`. */
export interface PropriedadeIfc {
  nome: string;
  valor: string;
}

export interface ConjuntoDePropriedades {
  nome: string;
  /** `true` quando é `IfcElementQuantity` — quantidade, não propriedade. */
  quantidades: boolean;
  propriedades: PropriedadeIfc[];
}

export interface DadosDoElemento {
  expressID: number;
  tipo: string;
  globalId: string;
  nome: string;
  conjuntos: ConjuntoDePropriedades[];
}

/**
 * A instância do parser, carregada UMA vez e sob demanda.
 *
 * `import()` dinâmico de propósito: `web-ifc` traz um `.wasm` de 1,16 MB mais o
 * JS que o embrulha, e quem nunca abre um IFC não pode pagar por isso no bundle
 * inicial. O módulo inteiro já é `React.lazy`; isto garante que nem o chunk dele
 * carregue o parser antes do primeiro arquivo.
 */
let apiPromessa: Promise<IfcApi> | null = null;

/** O recorte do `IfcAPI` que este serviço usa. Tipado à mão para não depender
 *  dos tipos do pacote num `import` estático — que anularia o dinâmico. */
export interface IfcApi {
  SetWasmPath: (caminho: string, absoluto?: boolean) => void;
  Init: () => Promise<void>;
  OpenModel: (dados: Uint8Array) => number;
  CloseModel: (id: number) => void;
  GetModelSchema: (id: number) => string;
  GetCoordinationMatrix: (id: number) => number[];
  StreamAllMeshes: (id: number, cb: (m: FlatMeshIfc) => void) => void;
  GetGeometry: (id: number, expressID: number) => GeometriaIfc;
  GetVertexArray: (ptr: number, tamanho: number) => Float32Array;
  GetIndexArray: (ptr: number, tamanho: number) => Uint32Array;
  GetLine: (id: number, expressID: number, flatten?: boolean) => Record<string, unknown>;
  GetLineIDsWithType: (id: number, tipo: number) => { size: () => number; get: (i: number) => number };
  GetNameFromTypeCode?: (tipo: number) => string;
}

interface GeometriaIfc {
  GetVertexData: () => number;
  GetVertexDataSize: () => number;
  GetIndexData: () => number;
  GetIndexDataSize: () => number;
  delete?: () => void;
}

export interface FlatMeshIfc {
  expressID: number;
  geometries: {
    size: () => number;
    get: (i: number) => { geometryExpressID: number; flatTransformation: number[]; color: { x: number; y: number; z: number; w: number } };
  };
}

export async function obterApi(): Promise<IfcApi> {
  if (!apiPromessa) {
    apiPromessa = (async () => {
      const mod = (await import('web-ifc')) as unknown as Record<string, unknown> & {
        default?: Record<string, unknown>;
      };
      const raiz = (mod.IfcAPI ? mod : mod.default) as Record<string, unknown>;
      const IfcAPI = raiz.IfcAPI as new () => IfcApi;
      const api = new IfcAPI();
      // `absolute = true`: o caminho é servido a partir da raiz do site, e não
      // relativo ao script — que num bundle com hash não é previsível.
      api.SetWasmPath(caminhoDoWasm, caminhoDoWasm.startsWith('/'));
      await api.Init();
      return api;
    })();
  }
  return apiPromessa;
}

/** Códigos de tipo IFC, para traduzir o `expressID` em nome legível. */
let tiposPorCodigo: Map<number, string> | null = null;

async function nomeDoTipo(codigo: number): Promise<string> {
  if (!tiposPorCodigo) {
    const mod = (await import('web-ifc')) as unknown as Record<string, unknown> & {
      default?: Record<string, unknown>;
    };
    const raiz = (mod.IfcAPI ? mod : mod.default) as Record<string, unknown>;
    tiposPorCodigo = new Map();
    for (const [nome, valor] of Object.entries(raiz)) {
      if (typeof valor === 'number' && nome.startsWith('IFC')) tiposPorCodigo.set(valor, nome);
    }
  }
  return tiposPorCodigo.get(codigo) ?? `TIPO_${codigo}`;
}

/**
 * Abre o IFC e devolve a cena.
 *
 * ─── UMA MALHA POR PRODUTO, e não duas mescladas ────────────────────────────
 *
 * O spike mesclava tudo em dois meshes (opaco e transparente) com vertex
 * colors: ótimo para FPS, e impossível de clicar — a seleção precisa saber QUAL
 * elemento foi atingido, e num mesh mesclado o raycast devolve um triângulo sem
 * dono. Aqui cada produto é uma malha com o `expressID` no `userData`, que é o
 * que torna a Fase 2 (clicar e ver GUID e PSets) possível.
 *
 * O preço é o número de draw calls. Medido no modelo estrutural real do usuário
 * (05/09/2026): 449 produtos, 10.375 triângulos, 54 ms do byte ao navegável —
 * folgadíssimo. Se um modelo grande de arquitetura mudar esse quadro, o caminho
 * é `InstancedMesh` por tipo ou BVH, e aí haverá o número que hoje não há.
 *
 * ─── A MATRIZ DE COORDENAÇÃO ────────────────────────────────────────────────
 *
 * `GetCoordinationMatrix` traz a origem do projeto declarada no arquivo. Sem
 * aplicá-la, modelos georreferenciados nascem a centenas de milhares de
 * unidades da origem, e o `float` da GPU começa a tremer visivelmente.
 */
/**
 * F9 (10/10/2026): o CORTE horizontal do IFC de referência para a planta 2D —
 * a mesma malha do 3D (flatTransformation → matriz de coordenação → matriz da
 * referência), cortada no plano Y = `alturaM`. Devolve os segmentos em mm de
 * planta. Sem THREE na conta: as matrizes são aplicadas à mão (column-major).
 */
export async function secaoDoIfc(bytes: ArrayBuffer, matrizDaReferencia: readonly number[], alturaM: number): Promise<{ segmentos: { a: { x: number; y: number }; b: { x: number; y: number } }[] }> {
  const { secaoHorizontalDaMalha } = await import('../utils/blueprintReferenciaExterna');
  const api = await obterApi();
  const modeloId = api.OpenModel(new Uint8Array(bytes));
  const segmentos: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  try {
    const coordInversa = inverter4x4(api.GetCoordinationMatrix(modeloId));
    api.StreamAllMeshes(modeloId, (malha) => {
      const geos = malha.geometries;
      for (let i = 0; i < geos.size(); i++) {
        const posta = geos.get(i);
        const g = api.GetGeometry(modeloId, posta.geometryExpressID);
        const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        const m = multiplicar4x4(matrizDaReferencia, multiplicar4x4(coordInversa, posta.flatTransformation));
        const pos = new Float32Array(verts.length / 2);
        for (let v = 0, p = 0; v < verts.length; v += 6, p += 3) {
          const x = verts[v];
          const y = verts[v + 1];
          const z = verts[v + 2];
          pos[p] = m[0] * x + m[4] * y + m[8] * z + m[12];
          pos[p + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          pos[p + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        segmentos.push(...secaoHorizontalDaMalha(pos, idx, alturaM));
        g.delete?.();
      }
    });
  } finally {
    api.CloseModel?.(modeloId);
  }
  return { segmentos };
}

/** Produto de matrizes 4×4 column-major (a · b). */
function multiplicar4x4(a: readonly number[], b: readonly number[]): number[] {
  const r = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) r[c * 4 + l] += a[k * 4 + l] * b[c * 4 + k];
  return r;
}

/** A inversa da matriz de coordenação (rotação + translação, column-major). */
function inverter4x4(m: readonly number[]): number[] {
  // A matriz de coordenação do IFC é rígida: a inversa é Rᵀ e −Rᵀ·t.
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  const t = [m[12], m[13], m[14]];
  r[12] = -(r[0] * t[0] + r[4] * t[1] + r[8] * t[2]);
  r[13] = -(r[1] * t[0] + r[5] * t[1] + r[9] * t[2]);
  r[14] = -(r[2] * t[0] + r[6] * t[1] + r[10] * t[2]);
  return r;
}

export async function carregarIfc(
  bytes: ArrayBuffer,
  THREE: typeof THREE_NS,
): Promise<ModeloIfcCarregado> {
  const api = await obterApi();
  const t0 = performance.now();
  const modeloId = api.OpenModel(new Uint8Array(bytes));

  const grupo = new THREE.Group();
  const elementos: ElementoIfc[] = [];
  let triangulos = 0;

  const coord = new THREE.Matrix4().fromArray(api.GetCoordinationMatrix(modeloId));
  const coordInversa = coord.clone().invert();

  api.StreamAllMeshes(modeloId, (malha) => {
    const geos = malha.geometries;
    const partes: THREE_NS.BufferGeometry[] = [];

    for (let i = 0; i < geos.size(); i++) {
      const posta = geos.get(i);
      const g = api.GetGeometry(modeloId, posta.geometryExpressID);
      const verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());

      // O buffer do web-ifc é intercalado: 3 de posição + 3 de normal.
      const posicoes = new Float32Array(verts.length / 2);
      const normais = new Float32Array(verts.length / 2);
      for (let v = 0, p = 0; v < verts.length; v += 6, p += 3) {
        posicoes[p] = verts[v];
        posicoes[p + 1] = verts[v + 1];
        posicoes[p + 2] = verts[v + 2];
        normais[p] = verts[v + 3];
        normais[p + 1] = verts[v + 4];
        normais[p + 2] = verts[v + 5];
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normais, 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      geo.applyMatrix4(new THREE.Matrix4().fromArray(posta.flatTransformation));
      // Traz para perto da origem: ver o cabeçalho.
      geo.applyMatrix4(coordInversa);
      partes.push(geo);
      triangulos += idx.length / 3;
      g.delete?.();
    }

    if (partes.length === 0) return;

    // A cor vem do IFC; o primeiro material do produto serve ao produto todo —
    // um material por parte multiplicaria draw calls por uma diferença que
    // quase nunca existe dentro do mesmo elemento.
    const c = geos.get(0).color;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(c.x, c.y, c.z),
      transparent: c.w < 1,
      opacity: c.w,
      side: THREE.DoubleSide,
    });

    // Uma malha por produto: as partes viram grupos de índice na mesma
    // geometria só se houver mais de uma, e aí a primeira basta como forma.
    const geometria = partes.length === 1 ? partes[0] : mesclar(partes, THREE);
    const mesh = new THREE.Mesh(geometria, material);
    mesh.userData.expressID = malha.expressID;
    grupo.add(mesh);
    elementos.push({ expressID: malha.expressID, mesh });
  });

  const caixa = new THREE.Box3().setFromObject(grupo);
  const msAteNavegavel = performance.now() - t0;

  return {
    modeloId,
    grupo,
    elementos,
    msAteNavegavel,
    caixa,
    triangulos,
    schema: api.GetModelSchema(modeloId),
    liberar: () => {
      api.CloseModel(modeloId);
      grupo.traverse((o) => {
        const m = o as THREE_NS.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE_NS.Material | undefined;
        mat?.dispose?.();
      });
    },
  };
}

/** Junta as partes de um produto numa geometria só, concatenando os índices. */
function mesclar(partes: THREE_NS.BufferGeometry[], THREE: typeof THREE_NS): THREE_NS.BufferGeometry {
  let totalV = 0;
  let totalI = 0;
  for (const p of partes) {
    totalV += p.getAttribute('position').count;
    totalI += p.getIndex()!.count;
  }
  const pos = new Float32Array(totalV * 3);
  const nor = new Float32Array(totalV * 3);
  const idx = new Uint32Array(totalI);
  let ov = 0;
  let oi = 0;
  for (const p of partes) {
    const pp = p.getAttribute('position');
    const pn = p.getAttribute('normal');
    const pi = p.getIndex()!;
    pos.set(pp.array as Float32Array, ov * 3);
    nor.set(pn.array as Float32Array, ov * 3);
    for (let i = 0; i < pi.count; i++) idx[oi + i] = (pi.array as Uint32Array)[i] + ov;
    ov += pp.count;
    oi += pi.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Texto legível de um valor do IFC, que chega embrulhado em `{ value }`. */
export function texto(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return texto((v as Record<string, unknown>).value);
  }
  if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
  return String(v);
}

/**
 * Tipo, GUID, nome e os conjuntos de propriedades de UM elemento.
 *
 * Varre `IfcRelDefinesByProperties` a cada consulta em vez de indexar na
 * abertura: no modelo real são 2.132 property sets, e indexar tudo custaria
 * tempo na abertura para servir a um clique que pode não vir. Se um modelo
 * grande tornar o clique lento, aí o índice se paga — e haverá o número.
 */
export async function lerElemento(
  modeloId: number,
  expressID: number,
): Promise<DadosDoElemento> {
  const api = await obterApi();
  const linha = api.GetLine(modeloId, expressID, true) as Record<string, unknown> & { type?: number };

  const conjuntos: ConjuntoDePropriedades[] = [];
  const modImport = (await import('web-ifc')) as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const raiz = (modImport.IfcAPI ? modImport : modImport.default) as Record<string, unknown>;
  const rels = api.GetLineIDsWithType(modeloId, raiz.IFCRELDEFINESBYPROPERTIES as number);

  for (let i = 0; i < rels.size(); i++) {
    const rel = api.GetLine(modeloId, rels.get(i), true) as Record<string, unknown>;
    const objetos = rel.RelatedObjects as { value?: number; expressID?: number }[] | undefined;
    if (!objetos?.some((o) => o?.value === expressID || o?.expressID === expressID)) continue;

    const def = rel.RelatingPropertyDefinition as Record<string, unknown> | undefined;
    if (!def) continue;
    const props = (def.HasProperties ?? def.Quantities) as Record<string, unknown>[] | undefined;
    if (!props) continue;

    conjuntos.push({
      nome: texto(def.Name),
      quantidades: Boolean(def.Quantities),
      propriedades: props.map((p) => ({
        nome: texto(p.Name),
        // O valor de uma propriedade e o de uma quantidade moram em chaves
        // diferentes, e a quantidade ainda varia com a grandeza.
        valor: texto(
          p.NominalValue ??
            p.LengthValue ??
            p.AreaValue ??
            p.VolumeValue ??
            p.CountValue ??
            p.WeightValue ??
            p.TimeValue,
        ),
      })),
    });
  }

  return {
    expressID,
    tipo: await nomeDoTipo(linha.type ?? 0),
    globalId: texto(linha.GlobalId),
    nome: texto(linha.Name),
    conjuntos,
  };
}
