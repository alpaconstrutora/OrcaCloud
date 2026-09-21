/**
 * SUB-REGIÕES DO TERRENO (21/09/2026, backlog P2 — P2.19): as áreas externas
 * do lote com material — grama, jardim, brita, piso drenante (permeáveis);
 * intertravado, concreto, deck, asfalto, espelho d'água (impermeáveis).
 *
 * ─── PARA QUE SERVEM ────────────────────────────────────────────────────────
 *
 * Três coisas que o desenho não sabia responder: (1) a TAXA DE PERMEABILIDADE
 * desenhada, que a zona exige (`permeabilidade_min` já existia como número da
 * lei sem nada do desenho para comparar); (2) as ÁREAS de paisagismo e de
 * pavimentação externa, para o orçamento; (3) a planta de implantação com o
 * chão diferenciado. É a "subregion" da toposuperfície do Revit, sem
 * toposuperfície: um polígono com material sobre o pavimento do lote.
 *
 * Tudo aqui é derivação pura sobre o modelo; a sub-região vive no kernel
 * (payload) porque é desenho do projetista, como a divisa e a faixa restrita.
 */
import { polygonArea, type BlueprintModel, type MaterialDeSubRegiao, type SubRegiao } from './blueprintKernel';
import { MATERIAIS_DE_SUB_REGIAO, FICHA_DO_MATERIAL_DE_SUB_REGIAO } from './blueprintKernel';

export interface MedidaDeSubRegiao {
  id: string;
  uid: string;
  nome: string;
  material: MaterialDeSubRegiao;
  rotuloDoMaterial: string;
  permeavel: boolean;
  areaM2: number;
}

export interface QuadroDeSubRegioes {
  linhas: MedidaDeSubRegiao[];
  porMaterial: { material: MaterialDeSubRegiao; rotulo: string; permeavel: boolean; areaM2: number; quantidade: number }[];
  areaPermeavelM2: number;
  areaImpermeavelM2: number;
  /** % do lote coberta por sub-regiões permeáveis; null sem lote. */
  taxaPermeabilidadePct: number | null;
  /** % do lote coberta por alguma sub-região; null sem lote. */
  coberturaPct: number | null;
}

const m2 = (mm2: number) => Math.round(mm2 / 1e4) / 100;

/** A área de uma sub-região, em m² (sem descontar sobreposições — ver `avisosDeSobreposicao`). */
export function areaDaSubRegiaoM2(s: Pick<SubRegiao, 'pontos'>): number {
  return m2(Math.abs(polygonArea(s.pontos)));
}

export function medirSubRegioes(model: BlueprintModel, levelId?: string | null): MedidaDeSubRegiao[] {
  return (model.subRegioes ?? [])
    .filter((s) => !levelId || s.levelId === levelId)
    .map((s) => {
      const ficha = FICHA_DO_MATERIAL_DE_SUB_REGIAO[s.material];
      return { id: s.id, uid: s.uid, nome: s.nome || ficha.rotulo, material: s.material, rotuloDoMaterial: ficha.rotulo, permeavel: ficha.permeavel, areaM2: areaDaSubRegiaoM2(s) };
    });
}

/** O quadro do painel/orçamento: por material, permeável × impermeável e a taxa contra a área do lote. */
export function quadroDeSubRegioes(model: BlueprintModel, loteAreaMm2: number | null, levelId?: string | null): QuadroDeSubRegioes {
  const linhas = medirSubRegioes(model, levelId);
  const porMaterial = MATERIAIS_DE_SUB_REGIAO.map((material) => {
    const ficha = FICHA_DO_MATERIAL_DE_SUB_REGIAO[material];
    const minhas = linhas.filter((l) => l.material === material);
    return { material, rotulo: ficha.rotulo, permeavel: ficha.permeavel, areaM2: Math.round(minhas.reduce((s, l) => s + l.areaM2, 0) * 100) / 100, quantidade: minhas.length };
  }).filter((x) => x.quantidade > 0);
  const areaPermeavelM2 = Math.round(linhas.filter((l) => l.permeavel).reduce((s, l) => s + l.areaM2, 0) * 100) / 100;
  const areaImpermeavelM2 = Math.round(linhas.filter((l) => !l.permeavel).reduce((s, l) => s + l.areaM2, 0) * 100) / 100;
  const lote = loteAreaMm2 && loteAreaMm2 > 0 ? loteAreaMm2 / 1e6 : null;
  return {
    linhas,
    porMaterial,
    areaPermeavelM2,
    areaImpermeavelM2,
    taxaPermeabilidadePct: lote ? Math.round((areaPermeavelM2 / lote) * 1000) / 10 : null,
    coberturaPct: lote ? Math.round(((areaPermeavelM2 + areaImpermeavelM2) / lote) * 1000) / 10 : null,
  };
}

/** As variáveis que o LOTE ganha nas regras: só quando há sub-região (sem ela, não se afirma permeabilidade zero). */
export function variaveisDePermeabilidade(model: BlueprintModel, loteAreaM2: number | null | undefined): { area_permeavel?: number; area_impermeavel?: number; taxa_permeabilidade?: number } {
  const q = quadroDeSubRegioes(model, loteAreaM2 ? loteAreaM2 * 1e6 : null);
  if (q.linhas.length === 0) return {};
  return { area_permeavel: q.areaPermeavelM2, area_impermeavel: q.areaImpermeavelM2, ...(q.taxaPermeabilidadePct != null ? { taxa_permeabilidade: q.taxaPermeabilidadePct } : {}) };
}

/** Pares de sub-regiões cujas caixas se cruzam — aviso, não erro (a área não é descontada). */
export function avisosDeSobreposicao(model: BlueprintModel): string[] {
  const subs = model.subRegioes ?? [];
  const caixa = (s: SubRegiao) => {
    const xs = s.pontos.map((p) => p.x);
    const ys = s.pontos.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const avisos: string[] = [];
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      if (subs[i].levelId !== subs[j].levelId) continue;
      const a = caixa(subs[i]);
      const b = caixa(subs[j]);
      const cruzam = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      if (cruzam) avisos.push(`"${subs[i].nome || FICHA_DO_MATERIAL_DE_SUB_REGIAO[subs[i].material].rotulo}" e "${subs[j].nome || FICHA_DO_MATERIAL_DE_SUB_REGIAO[subs[j].material].rotulo}" se sobrepõem — a área é contada nas duas.`);
    }
  }
  return avisos;
}
