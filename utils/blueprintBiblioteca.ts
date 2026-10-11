/**
 * BIBLIOTECA DE COMPONENTES ARRASTÁVEL (11/10/2026 — F9 do plano
 * `2026-10-11-planta-recursos-video-synaps.md`): a grade com miniatura por tipo e
 * conjunto, a busca, e o arraste da miniatura para o ponto da planta.
 *
 * Tudo aqui é puro (sem DOM), para o teste conferir as três contas que decidem se o
 * gesto funciona: o que a busca acha, onde o soltar cai em mm (o Y da tela desce e o
 * do modelo sobe) e o desenho da miniatura (o MESMO símbolo da planta, encaixado).
 */
import {
  CATALOGO_DE_COMPONENTES,
  CONJUNTOS_DE_COMPONENTES,
  FAMILIAS_DE_COMPONENTE,
  ROTULO_DA_FAMILIA_DE_COMPONENTE,
  TIPOS_DE_COMPONENTE,
  ehConjunto,
  extensaoDoConjunto,
  type FamiliaDeComponente,
  type Point,
  type TipoDeComponente,
} from './blueprintKernel';
import { simboloNoMundo } from './blueprintHumanizada';

/** O tipo do arraste — próprio, para o canvas não aceitar texto solto de outra janela. */
export const MIME_DO_COMPONENTE = 'application/x-opura-componente';

export interface ItemDaBiblioteca {
  tipoId: TipoDeComponente;
  rotulo: string;
  familia: FamiliaDeComponente;
  conjunto: boolean;
  larguraMm: number;
  profundidadeMm: number;
}

/** O catálogo inteiro, na ordem dele (a ordem do menu Componentes). */
export const ITENS_DA_BIBLIOTECA: readonly ItemDaBiblioteca[] = TIPOS_DE_COMPONENTE.map((tipoId) => {
  const f = CATALOGO_DE_COMPONENTES[tipoId];
  const ext = ehConjunto(tipoId) ? extensaoDoConjunto(tipoId) : null;
  return {
    tipoId,
    rotulo: f.rotulo,
    familia: f.familia,
    conjunto: ehConjunto(tipoId),
    larguraMm: ext ? ext.larguraMm : f.larguraMm,
    profundidadeMm: ext ? ext.profundidadeMm : f.profundidadeMm,
  };
});

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Filtra pela busca (rótulo ou família, sem acento nem caixa, todas as palavras) e pela
 * família (`null` = todas). "Conjuntos" é uma família de mentira da grade: só os conjuntos.
 */
export function filtrarBiblioteca(busca: string, familia: FamiliaDeComponente | 'CONJUNTOS' | null): ItemDaBiblioteca[] {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  return ITENS_DA_BIBLIOTECA.filter((it) => {
    if (familia === 'CONJUNTOS' ? !it.conjunto : familia && it.familia !== familia) return false;
    const texto = semAcento(`${it.rotulo} ${ROTULO_DA_FAMILIA_DE_COMPONENTE[it.familia]}${it.conjunto ? ' conjunto' : ''}`);
    return palavras.every((p) => texto.includes(p));
  });
}

/** As famílias que aparecem como filtro, com a contagem — família vazia não vira botão. */
export function familiasDaBiblioteca(): { id: FamiliaDeComponente | 'CONJUNTOS'; rotulo: string; quantidade: number }[] {
  const saida: { id: FamiliaDeComponente | 'CONJUNTOS'; rotulo: string; quantidade: number }[] = FAMILIAS_DE_COMPONENTE.map((f) => ({
    id: f,
    rotulo: ROTULO_DA_FAMILIA_DE_COMPONENTE[f],
    quantidade: ITENS_DA_BIBLIOTECA.filter((it) => it.familia === f).length,
  })).filter((x) => x.quantidade > 0);
  saida.push({ id: 'CONJUNTOS', rotulo: 'Conjuntos', quantidade: ITENS_DA_BIBLIOTECA.filter((it) => it.conjunto).length });
  return saida;
}

/** O valor do arraste de volta a um tipo do catálogo; qualquer outra coisa → `null` (o canvas ignora). */
export function tipoDoArraste(valor: string | null | undefined): TipoDeComponente | null {
  const v = (valor ?? '').trim();
  return (TIPOS_DE_COMPONENTE as readonly string[]).includes(v) ? (v as TipoDeComponente) : null;
}

/**
 * Onde o SOLTAR cai, em mm do modelo: a posição do ponteiro relativa ao canvas, desfeita a
 * vista (`paraTela` faz x·escala + dx e −y·escala + dy — o Y do modelo SOBE). Arredondado
 * ao `passoMm` (10 mm: a mesma ordem de grandeza do encaixe à grade, sem prender a peça nela).
 */
export function pontoDoSoltar(
  cliente: { clientX: number; clientY: number },
  caixa: { left: number; top: number },
  vista: { escala: number; dx: number; dy: number },
  passoMm = 10,
): Point {
  const px = cliente.clientX - caixa.left;
  const py = cliente.clientY - caixa.top;
  const x = (px - vista.dx) / vista.escala;
  const y = -(py - vista.dy) / vista.escala;
  const r = (v: number) => Math.round(v / passoMm) * passoMm + 0; // `+ 0` tira o −0
  return { x: r(x), y: r(y) } as Point;
}

/**
 * A MINIATURA: o símbolo da planta (`simboloNoMundo`, o mesmo do canvas e do PDF) da peça
 * na origem, ou dos filhos do conjunto, encaixado num quadrado de `ladoPx` com margem, em
 * coordenadas de SVG (Y para baixo). Contornos e traços como polilinhas.
 */
export function miniaturaDoComponente(tipoId: TipoDeComponente, ladoPx = 56, margemPx = 4): { contornos: [number, number][][]; tracos: [number, number][][] } {
  const pecas = (CONJUNTOS_DE_COMPONENTES[tipoId] ?? [{ tipoId, dxMm: 0, dyMm: 0, rotacaoGraus: 0 }]).map((f) => {
    const fi = CATALOGO_DE_COMPONENTES[f.tipoId];
    return simboloNoMundo({
      id: 'mini',
      uid: 'mini',
      levelId: 'mini',
      tipoId: f.tipoId,
      familia: fi.familia,
      rotulo: '',
      at: { x: f.dxMm, y: f.dyMm },
      rotacaoGraus: f.rotacaoGraus,
      larguraMm: fi.larguraMm,
      profundidadeMm: fi.profundidadeMm,
      alturaMm: fi.alturaMm,
    } as unknown as Parameters<typeof simboloNoMundo>[0]);
  });
  const todos = pecas.flatMap((p) => p.contorno);
  const minX = Math.min(...todos.map((p) => p.x));
  const maxX = Math.max(...todos.map((p) => p.x));
  const minY = Math.min(...todos.map((p) => p.y));
  const maxY = Math.max(...todos.map((p) => p.y));
  const util = ladoPx - 2 * margemPx;
  const escala = util / Math.max(maxX - minX, maxY - minY, 1);
  const ox = margemPx + (util - (maxX - minX) * escala) / 2;
  const oy = margemPx + (util - (maxY - minY) * escala) / 2;
  const P = (p: { x: number; y: number }): [number, number] => [ox + (p.x - minX) * escala, oy + (maxY - p.y) * escala];
  return {
    contornos: pecas.map((p) => [...p.contorno.map(P), P(p.contorno[0])]),
    tracos: pecas.flatMap((p) => p.tracos.map((t) => t.map(P))),
  };
}
