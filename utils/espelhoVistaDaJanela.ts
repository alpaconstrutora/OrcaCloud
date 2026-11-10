/**
 * VISTA DA JANELA (Espelho de Vendas 3D, F6 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * A foto do que se vê da janela é cadastrada por TORRE, para uma faixa de andares e, se quiser, uma face (orientação
 * solar). A ficha da unidade mostra a vista da faixa que contém o andar dela. Puro.
 */
import type { UnitSunOrientation } from '../types/empreendimento';

/** A vista gravada (`empreendimento_tower_vistas`), como o banco e as RPCs dos portais a devolvem. */
export interface VistaDaTorre {
  id?: string;
  tower_id?: string;
  /** Andar inicial e final da faixa, inclusive. 0 = térreo; negativo = subsolo. */
  andar_de: number;
  andar_ate: number;
  /** A face da torre de onde a foto foi tirada; null = vale para qualquer face. */
  orientacao: UnitSunOrientation | null;
  imagem_url: string;
  imagem_path?: string;
  legenda?: string | null;
}

const ORIENTACOES: readonly UnitSunOrientation[] = ['NORTE', 'SUL', 'LESTE', 'OESTE'];
const DO_INGLES: Record<string, UnitSunOrientation> = { NORTH: 'NORTE', SOUTH: 'SUL', EAST: 'LESTE', WEST: 'OESTE' };

/** A orientação do imóvel do estoque (`NORTH`…) ou da unidade (`NORTE`…) no vocabulário do Empreendimento. */
export function orientacaoDoImovel(valor: string | null | undefined): UnitSunOrientation | null {
  const v = String(valor ?? '').trim().toUpperCase();
  if ((ORIENTACOES as readonly string[]).includes(v)) return v as UnitSunOrientation;
  return DO_INGLES[v] ?? null;
}

const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * A vista da unidade: das faixas que contêm o andar, a da MESMA face vence a de qualquer face; depois, a mais
 * estreita; no empate, a primeira da lista. Vista de outra face nunca serve. Sem andar ou sem faixa = null.
 */
export function vistaDaUnidade(
  vistas: readonly VistaDaTorre[] | null | undefined,
  andar: number | null | undefined,
  orientacao: UnitSunOrientation | null | undefined,
): VistaDaTorre | null {
  if (!inteiro(andar)) return null;
  let melhor: VistaDaTorre | null = null;
  let notaDaMelhor: [number, number] | null = null;
  for (const v of vistas ?? []) {
    if (!v.imagem_url || !inteiro(v.andar_de) || !inteiro(v.andar_ate) || v.andar_de > v.andar_ate) continue;
    if (andar < v.andar_de || andar > v.andar_ate) continue;
    if (v.orientacao && v.orientacao !== orientacao) continue;
    // Menor é melhor: [0 = mesma face, 1 = qualquer face], depois a largura da faixa.
    const nota: [number, number] = [v.orientacao ? 0 : 1, v.andar_ate - v.andar_de];
    if (!notaDaMelhor || nota[0] < notaDaMelhor[0] || (nota[0] === notaDaMelhor[0] && nota[1] < notaDaMelhor[1])) {
      melhor = v;
      notaDaMelhor = nota;
    }
  }
  return melhor;
}

const nomeDoAndar = (n: number) => (n === 0 ? 'Térreo' : n < 0 ? `${-n}º subsolo` : `${n}º pavimento`);
const FACE: Record<UnitSunOrientation, string> = { NORTE: 'Norte', SUL: 'Sul', LESTE: 'Leste', OESTE: 'Oeste' };

/** "4º ao 12º pavimento · face Norte" — o que a vista cobre, para a lista do cadastro e a legenda do diálogo. */
export function rotuloDaVista(v: Pick<VistaDaTorre, 'andar_de' | 'andar_ate' | 'orientacao'>): string {
  const faixa =
    v.andar_de === v.andar_ate
      ? nomeDoAndar(v.andar_de)
      : v.andar_de > 0 && v.andar_ate > 0
        ? `${v.andar_de}º ao ${v.andar_ate}º pavimento`
        : `${nomeDoAndar(v.andar_de)} ao ${nomeDoAndar(v.andar_ate).replace(/^T/, 't')}`;
  return `${faixa} · ${v.orientacao ? `face ${FACE[v.orientacao]}` : 'qualquer face'}`;
}

/** Por que a faixa não pode ser gravada; null = pode. */
export function problemaDaVista(v: { andar_de: number | null | undefined; andar_ate: number | null | undefined }): string | null {
  if (v.andar_de === null || v.andar_de === undefined || Number.isNaN(v.andar_de)) return 'Informe o andar inicial da faixa (0 = térreo).';
  if (v.andar_ate === null || v.andar_ate === undefined || Number.isNaN(v.andar_ate)) return 'Informe o andar final da faixa.';
  if (!Number.isInteger(v.andar_de) || !Number.isInteger(v.andar_ate)) return 'O andar é um número inteiro (0 = térreo; negativo = subsolo).';
  if (v.andar_ate < v.andar_de) return 'O andar final não pode ser menor que o inicial.';
  return null;
}
