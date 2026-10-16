/**
 * F15 da casa automática (16/10/2026): a CASA desenhada → os campos da unidade do Empreendimento — o caminho inverso
 * de `programaCurtoDaUnidade` (F10), medido no desenho PUBLICADO (é dele que o sincronismo lê).
 *
 *  - área privativa = área CONSTRUÍDA, pela face externa das paredes, somada nos pavimentos (`areaConstruidaMm2`):
 *    a casa vendida é a edificação inteira, paredes incluídas;
 *  - dormitórios contam as suítes (como o formulário curto: "3 dormitórios, 1 suíte");
 *  - banheiros sem o lavabo (o formulário curto também não o pede);
 *  - vagas = as vagas desenhadas (`AddVaga`);
 *  - a tipologia diz térrea ou sobrado e o padrão CUB — `programaCurtoDaUnidade` lê o padrão de volta dela.
 *
 * O uso de cada cômodo é o da etiqueta (declarado, senão pelo nome, senão pelo tipo — `usoDoAmbiente`).
 */
import { areaConstruidaMm2, pointInPolygon, type BlueprintModel, type Space, type UsoDoAmbiente } from './blueprintKernel';
import { usoDoAmbiente, type PadraoDaCasa } from './blueprintPrograma';

export interface CasaNaUnidade {
  /** m², 2 casas. */
  privativaM2: number;
  dormitorios: number;
  suites: number;
  banheiros: number;
  vagas: number;
  /** Pavimentos com parede. */
  pavimentos: number;
  /** "Casa térrea R1-N" · "Sobrado R1-N". */
  tipologia: string;
}

const m2 = (v: number): number => Math.round(v * 100) / 100;

/** O uso do cômodo pela etiqueta dentro dele (a mesma regra da carga térmica e do kit). */
function usoDoComodo(model: BlueprintModel, s: Space): UsoDoAmbiente | null {
  const etiqueta = model.labels.find((l) => l.levelId === s.levelId && pointInPolygon(s.ring, l.at));
  return usoDoAmbiente(s.name ?? etiqueta?.name, etiqueta?.tipoDeAmbiente, etiqueta?.uso);
}

/** `null` = o desenho não é uma casa (nenhum dormitório nem suíte). */
export function unidadeDaCasa(model: BlueprintModel, padrao: PadraoDaCasa | null): CasaNaUnidade | null {
  const usos = model.spaces.map((s) => usoDoComodo(model, s));
  const conta = (u: UsoDoAmbiente) => usos.filter((x) => x === u).length;
  const suites = conta('SUITE');
  const dormitorios = conta('DORMITORIO') + suites;
  if (dormitorios === 0) return null;
  const niveis = model.levels.filter((l) => model.walls.some((w) => w.levelId === l.id));
  const areaMm2 = niveis.reduce((soma, l) => soma + areaConstruidaMm2(model, l), 0);
  const pavimentos = niveis.length;
  return {
    privativaM2: m2(areaMm2 / 1e6),
    dormitorios,
    suites,
    banheiros: conta('BANHEIRO'),
    vagas: (model.vagas ?? []).length,
    pavimentos,
    tipologia: `${pavimentos >= 2 ? 'Sobrado' : 'Casa térrea'}${padrao ? ` ${padrao}` : ''}`,
  };
}
