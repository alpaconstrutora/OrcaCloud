/**
 * VISTA DA JANELA (Espelho de Vendas 3D, F6 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * A foto do que se vê da janela é cadastrada por TORRE, para uma faixa de andares e, se quiser, uma face (orientação
 * solar) — ou para UMA UNIDADE específica (a de canto, a que dá para o vizinho). A ficha da unidade mostra a vista
 * dela quando há; senão, a da faixa que contém o andar dela. Puro.
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
  /**
   * A vista é de UMA unidade (`empreendimento_units.id`), e não de uma faixa: só ela a recebe, e ela vence qualquer
   * faixa. null/ausente = vista de faixa. `unit_name` vem junto para o imóvel do estoque sem unidade ligada, que só
   * tem o nome para se achar.
   */
  unit_id?: string | null;
  unit_name?: string | null;
}

/** Quem pede a vista: a unidade do Empreendimento (id) ou, para o imóvel sem unidade ligada, só o nome. */
export interface UnidadeQuePedeAVista {
  id?: string | null;
  nome?: string | null;
}

const chaveDoNome = (nome: string | null | undefined) => String(nome ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** A vista cadastrada para ESTA unidade: pelo id; sem id (imóvel sem unidade ligada), pelo nome. */
function vistaSoDaUnidade(vistas: readonly VistaDaTorre[], unidade: UnidadeQuePedeAVista | null | undefined): VistaDaTorre | null {
  if (!unidade) return null;
  const nome = chaveDoNome(unidade.nome);
  for (const v of vistas) {
    if (!v.unit_id || !v.imagem_url) continue;
    if (unidade.id ? v.unit_id === unidade.id : !!nome && chaveDoNome(v.unit_name) === nome) return v;
  }
  return null;
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
 * A vista da unidade. A cadastrada para ELA vence tudo. Senão, das faixas que contêm o andar, a da MESMA face vence
 * a de qualquer face; depois, a mais estreita; no empate, a primeira da lista. Vista de outra face nunca serve, e
 * vista de outra unidade também não. Sem andar ou sem faixa = null.
 */
export function vistaDaUnidade(
  vistas: readonly VistaDaTorre[] | null | undefined,
  andar: number | null | undefined,
  orientacao: UnitSunOrientation | null | undefined,
  unidade?: UnidadeQuePedeAVista | null,
): VistaDaTorre | null {
  const soDela = vistaSoDaUnidade(vistas ?? [], unidade);
  if (soDela) return soDela;
  if (!inteiro(andar)) return null;
  let melhor: VistaDaTorre | null = null;
  let notaDaMelhor: [number, number] | null = null;
  for (const v of vistas ?? []) {
    // A vista de uma unidade não é faixa: não serve para as vizinhas do andar.
    if (v.unit_id) continue;
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
export function rotuloDaVista(v: Pick<VistaDaTorre, 'andar_de' | 'andar_ate' | 'orientacao' | 'unit_id' | 'unit_name'>): string {
  if (v.unit_id) return `Unidade ${v.unit_name?.trim() || 'específica'}`;
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
