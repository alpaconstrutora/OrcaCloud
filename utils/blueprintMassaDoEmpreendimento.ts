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
import type { EstruturaDaTorre } from './blueprintEstruturaDaTorre';
import { distanciaDoPar, type DistanciaEntreTorres } from './empreendimentoDistanciasEntreTorres';

export type TorreParaAMassa = Pick<EmpreendimentoTower, 'name'> & Partial<Pick<EmpreendimentoTower, 'id' | 'floors_count' | 'blueprint_bloco_uid' | 'blueprint_quadra_uid'>>;

export interface MassaDoEmpreendimento {
  /** A restrição pronta para `RestricoesDaMassa.doEmpreendimento`; `null` = nada a seguir (o `motivo` diz). */
  restricao: { torres: number; pavimentosMin: number | null; pavimentosMax: number | null; afastamentoEntreBlocosM?: number | null } | null;
  motivo: string | null;
  avisos: string[];
  /** "2 torres × 12 pavimentos", para a tela. */
  resumo: string | null;
}

/**
 * 27/10/2026: com as `estruturas` (pavimentos lidos do cadastro ou das unidades — `blueprintEstruturaDaTorre`), os
 * pavimentos de cada torre são os acima do solo dela, e não só `floors_count`: o Garden Cambuhy tinha a Torre A sem
 * `floors_count` e a faixa saía só da Torre B (a A nascia com 6 em vez de 4).
 */
export function massaDoEmpreendimento(
  torres: TorreParaAMassa[],
  estruturas: readonly EstruturaDaTorre[] = [],
  /** 28/10/2026: as distâncias entre torres (Torres e Unidades); o gerador usa a maior entre os blocos. */
  distancias: readonly DistanciaEntreTorres[] = [],
): MassaDoEmpreendimento {
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
  const estruturaDe = (t: TorreParaAMassa) => estruturas.find((e) => e.nome === t.name && e.acima.length > 0);
  const pav = proprias.map((t) => estruturaDe(t)?.acima.length ?? t.floors_count).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1).map((n) => Math.round(n));
  const semPav = proprias.length - pav.length;
  if (semPav > 0) avisos.push(`${semPav} torre(s) sem pavimentos cadastrados — ${pav.length > 0 ? 'a faixa sai das outras' : 'os pavimentos ficam livres'}.`);
  const min = pav.length > 0 ? Math.min(...pav) : null;
  const max = pav.length > 0 ? Math.max(...pav) : null;
  if (min != null && max != null && min !== max) avisos.push(`As torres têm de ${min} a ${max} pavimentos — o gerador testa essa faixa para todas (ele dá a mesma altura aos blocos).`);
  const n = proprias.length;
  const porTorre = proprias.map((t) => estruturaDe(t)).filter((e): e is EstruturaDaTorre => !!e);
  const resumo =
    porTorre.length === n
      ? porTorre.map((e) => `${e.nome}: ${e.acima.length}${e.garagens.length ? ` + ${e.garagens.length} ${e.garagens.length === 1 ? 'garagem' : 'garagens'}` : ''}`).join(' · ')
      : `${n} ${n === 1 ? 'torre' : 'torres'} × ${min == null ? 'pavimentos livres' : min === max ? `${min} pavimentos` : `${min} a ${max} pavimentos`}`;
  // Distância entre torres (28/10/2026): o gerador põe a MESMA folga entre todos os blocos — vale a maior pedida.
  let afastamentoEntreBlocosM: number | null = null;
  if (n >= 2) {
    const pedidas: number[] = [];
    let semDistancia = 0;
    for (let i = 0; i < proprias.length; i++)
      for (let j = i + 1; j < proprias.length; j++) {
        const a = proprias[i].id;
        const b = proprias[j].id;
        const m = a && b ? distanciaDoPar(distancias, a, b) : null;
        if (m == null) semDistancia++;
        else pedidas.push(m);
      }
    if (pedidas.length > 0) {
      afastamentoEntreBlocosM = Math.max(...pedidas);
      if (Math.min(...pedidas) !== afastamentoEntreBlocosM) {
        avisos.push(`As distâncias entre torres vão de ${Math.min(...pedidas).toLocaleString('pt-BR')} a ${afastamentoEntreBlocosM.toLocaleString('pt-BR')} m — o gerador usa a maior entre todos os blocos.`);
      }
    }
    // Só quando parte dos pares foi informada: o empreendimento que nunca usou o campo não recebe aviso.
    if (semDistancia > 0 && pedidas.length > 0) {
      avisos.push(`${semDistancia} par(es) de torres sem distância em Torres e Unidades — vale a maior informada.`);
    }
  }
  const resumoComDistancia = afastamentoEntreBlocosM != null ? `${resumo} · entre torres ${afastamentoEntreBlocosM.toLocaleString('pt-BR')} m` : resumo;
  return {
    restricao: { torres: n, pavimentosMin: min, pavimentosMax: max, ...(afastamentoEntreBlocosM != null ? { afastamentoEntreBlocosM } : {}) },
    motivo: null,
    avisos,
    resumo: resumoComDistancia,
  };
}
