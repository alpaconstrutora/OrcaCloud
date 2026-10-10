/**
 * REFERÊNCIA EXTERNA NO 3D (E10.4b do roadmap de climatização, 08/10/2026).
 *
 * Um IFC de OUTRA disciplina ou de outro escritório — o estrutural do calculista,
 * a arquitetura do cliente — desenhado no 3D da Planta para coordenar, e nada
 * mais. Ele NÃO vira `BlueprintModel`: não ganha `uid`, não entra no payload
 * canônico e por isso não mexe no hash da versão (a mesma separação do
 * `ifcViewerService`). Importar de verdade é o `PainelImportarIfc`.
 *
 * Regra pura, sem THREE: aqui moram a forma da referência, a leitura defensiva
 * do que foi guardado e a MATRIZ que leva a malha do web-ifc ao mundo do viewer.
 *
 * ─── OS DOIS MUNDOS ────────────────────────────────────────────────────────────
 *
 * - web-ifc devolve a malha em metros com Y para cima e o plano do IFC deitado
 *   em X e −Z (o y do IFC vira −Z).
 * - O viewer da Planta põe o y da planta em +Z (`shapeDoAnel` usa −y e gira −90°
 *   em X; o trecho a +y sai a +Z — ver `blueprint3dEditor.test.ts`).
 *
 * Então a malha precisa de um espelho em Z para cair onde o mesmo desenho
 * cairia. É reflexão (determinante −1): o material da referência é DoubleSide,
 * e a normal passa pela matriz normal, que cuida do sinal.
 */

export interface ReferenciaExterna {
  /** Id do arquivo na biblioteca de IFC da organização (`digital_files`). */
  arquivoId: string;
  nome: string;
  /** Caminho no bucket privado `bim_files` — o que o download pede. */
  storagePath: string;
  visivel: boolean;
  /** Onde a origem do IFC cai na planta, em mm (x, y da planta). */
  deslocamentoXMm: number;
  deslocamentoYMm: number;
  /** Subir ou descer o modelo inteiro, em mm. */
  cotaMm: number;
  /** Giro em planta, anti-horário, em graus (o mesmo sentido do girar do 2D). */
  rotacaoDeg: number;
  /** 0–1. Nasce meio transparente: é fundo para coordenar, não o desenho. */
  opacidade: number;
}

export function referenciaNova(arquivo: { id: string; nome: string; storagePath: string }): ReferenciaExterna {
  return {
    arquivoId: arquivo.id,
    nome: arquivo.nome,
    storagePath: arquivo.storagePath,
    visivel: true,
    deslocamentoXMm: 0,
    deslocamentoYMm: 0,
    cotaMm: 0,
    rotacaoDeg: 0,
    opacidade: 0.6,
  };
}

const numero = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);

/**
 * Lê o que veio do armazenamento do navegador sem confiar nele: um item que não
 * tem arquivo some, um número estragado volta ao padrão, e a opacidade fica em
 * 0,05–1 (zero esconderia sem o olho dizer que está escondido).
 */
export function lerReferencias(guardado: unknown): ReferenciaExterna[] {
  if (!Array.isArray(guardado)) return [];
  const vistos = new Set<string>();
  const saida: ReferenciaExterna[] = [];
  for (const x of guardado) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    if (typeof r.arquivoId !== 'string' || !r.arquivoId || typeof r.storagePath !== 'string' || !r.storagePath) continue;
    if (vistos.has(r.arquivoId)) continue;
    vistos.add(r.arquivoId);
    saida.push({
      arquivoId: r.arquivoId,
      nome: typeof r.nome === 'string' && r.nome ? r.nome : 'Modelo IFC',
      storagePath: r.storagePath,
      visivel: r.visivel !== false,
      deslocamentoXMm: Math.round(numero(r.deslocamentoXMm, 0)),
      deslocamentoYMm: Math.round(numero(r.deslocamentoYMm, 0)),
      cotaMm: Math.round(numero(r.cotaMm, 0)),
      rotacaoDeg: numero(r.rotacaoDeg, 0),
      opacidade: Math.min(1, Math.max(0.05, numero(r.opacidade, 0.6))),
    });
  }
  return saida;
}

/** A chave do navegador onde as referências de um estudo moram. */
export function chaveDasReferencias(studyId: string): string {
  return `blueprint:referenciasExternas:${studyId}`;
}

/**
 * A matriz 4×4 (column-major, o formato do `Matrix4.fromArray`) que leva a malha
 * do web-ifc ao mundo do viewer: espelho em Z → giro em planta → deslocamento.
 *
 * O giro anti-horário da planta (x → y) é, no viewer, X → +Z — um giro de −θ em
 * torno de Y. Deslocamento e cota saem de mm para metro.
 */
export function matrizDaReferencia(r: Pick<ReferenciaExterna, 'deslocamentoXMm' | 'deslocamentoYMm' | 'cotaMm' | 'rotacaoDeg'>): number[] {
  const t = (-r.rotacaoDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // Ry(t) · diag(1, 1, −1):
  //   [ c  0  −s ]     colunas: X → (c, 0, −s); Y → (0, 1, 0); Z → −(s, 0, c)
  //   [ 0  1   0 ]
  //   [−s  0  −c ]
  const tx = r.deslocamentoXMm / 1000;
  const ty = r.cotaMm / 1000;
  const tz = r.deslocamentoYMm / 1000;
  return [c, 0, -s, 0, 0, 1, 0, 0, -s, 0, -c, 0, tx, ty, tz, 1];
}

/** Aplica a matriz a um ponto — para conferir sem THREE (testes, enquadramento). */
export function aplicarMatriz(m: readonly number[], p: readonly [number, number, number]): [number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
