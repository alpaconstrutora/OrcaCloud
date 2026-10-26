// utils/blueprintMassaDoEmpreendimento.ts
//
// As TORRES do Empreendimento como restrição do Gerar massa (26/10/2026, etapa 1 de
// docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): quantas torres e quantos pavimentos. Puro.
//
// Ficam fora as torres que não são edifício do Empreendimento: as que nasceram da própria massa
// (`blueprint_bloco_uid` — seguir a si mesma prenderia o gerador ao último resultado) e as quadras do loteamento
// (`blueprint_quadra_uid`). Torres com pavimentos diferentes: o menor é o piso e o maior o teto (decisão de
// 26/10/2026, dita no aviso).

import type { EmpreendimentoTower } from '../types/empreendimento';

export type TorreParaAMassa = Pick<EmpreendimentoTower, 'name'> & Partial<Pick<EmpreendimentoTower, 'floors_count' | 'blueprint_bloco_uid' | 'blueprint_quadra_uid'>>;

export interface MassaDoEmpreendimento {
  /** A restrição pronta para `RestricoesDaMassa.doEmpreendimento`; `null` = nada a seguir (o `motivo` diz). */
  restricao: { torres: number; pavimentosMin: number | null; pavimentosMax: number | null } | null;
  motivo: string | null;
  avisos: string[];
  /** "2 torres × 12 pavimentos", para a tela. */
  resumo: string | null;
}

export function massaDoEmpreendimento(torres: TorreParaAMassa[]): MassaDoEmpreendimento {
  const avisos: string[] = [];
  const daMassa = torres.filter((t) => t.blueprint_bloco_uid).length;
  const quadras = torres.filter((t) => !t.blueprint_bloco_uid && t.blueprint_quadra_uid).length;
  const proprias = torres.filter((t) => !t.blueprint_bloco_uid && !t.blueprint_quadra_uid);
  if (daMassa > 0) avisos.push(`${daMassa} torre(s) vieram do próprio Estudo de massa — não contam (seguir a si mesma prenderia o gerador ao resultado anterior).`);
  if (quadras > 0) avisos.push(`${quadras} quadra(s) do loteamento — não são torres.`);
  if (proprias.length === 0) {
    return {
      restricao: null,
      motivo: daMassa > 0 ? 'As torres do Empreendimento vieram do próprio Estudo de massa.' : 'O Empreendimento não tem torres em Torres & Unidades.',
      avisos,
      resumo: null,
    };
  }
  const pav = proprias.map((t) => t.floors_count).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1).map((n) => Math.round(n));
  const semPav = proprias.length - pav.length;
  if (semPav > 0) avisos.push(`${semPav} torre(s) sem pavimentos cadastrados — ${pav.length > 0 ? 'a faixa sai das outras' : 'os pavimentos ficam livres'}.`);
  const min = pav.length > 0 ? Math.min(...pav) : null;
  const max = pav.length > 0 ? Math.max(...pav) : null;
  if (min != null && max != null && min !== max) avisos.push(`As torres têm de ${min} a ${max} pavimentos — o gerador testa essa faixa para todas (ele dá a mesma altura aos blocos).`);
  const n = proprias.length;
  const resumo = `${n} ${n === 1 ? 'torre' : 'torres'} × ${min == null ? 'pavimentos livres' : min === max ? `${min} pavimentos` : `${min} a ${max} pavimentos`}`;
  return { restricao: { torres: n, pavimentosMin: min, pavimentosMax: max }, motivo: null, avisos, resumo };
}
