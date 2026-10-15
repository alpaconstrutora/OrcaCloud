/**
 * AS PREMISSAS DA CASA AUTOMÁTICA DO ESTUDO (F10, 15/10/2026) — o que a tela edita e o estudo guarda
 * (`blueprint_study_casa.hipoteses`): o programa curto, as disciplinas ligadas e as poucas hipóteses que a tela
 * expõe. O resto das `HipotesesDaCasa` segue no padrão do motor (as premissas de cada disciplina — hidro,
 * elétrica, climatização — moram nas tabelas delas e entram pela `EntradaDaCasa`).
 *
 * A coluna é JSON PARCIAL: `premissasDaCasaDaColuna` completa com o padrão, grupo a grupo, e só aceita a chave que
 * o padrão tem, com o mesmo tipo (e o enumerado com valor conhecido) — uma premissa velha ou digitada errada cai no
 * padrão em vez de quebrar o gerador.
 */
import type { HipotesesDaCasa } from './blueprintCasaAutomatica';
import type { DivisaDeEncosto } from './blueprintCasaAutomatica';
import type { AguaQuenteDaCasa } from './blueprintAncorasDaCasa';
import { PADROES_DA_CASA, PROGRAMA_CURTO_PADRAO, type ProgramaCurtoDaCasa } from './blueprintPrograma';

export interface PremissasDaCasa {
  curto: ProgramaCurtoDaCasa;
  /** Quais disciplinas o botão lança (a arquitetura sempre). */
  disciplinas: {
    estrutura: boolean;
    telhado: boolean;
    ancoras: boolean;
    mobiliario: boolean;
    hidraulica: boolean;
    eletrica: boolean;
    climatizacao: boolean;
  };
  telhado: { tipo: 'DUAS_AGUAS' | 'UMA_AGUA'; inclinacaoPct: number; beiralMm: number };
  implantacao: { folgaDaTOPct: number; encostarNaDivisa: DivisaDeEncosto };
  ancoras: { aguaQuente: AguaQuenteDaCasa; caixaDeGordura: boolean };
  eletrica: { chuveiroEletricoVA: number; medidor: boolean };
  /** Quantas alternativas do gerador E6.2 a casa tenta (fica a de menos problemas graves). */
  sementes: number;
  /** F12d: 1 = térrea; 2 = sobrado. */
  pavimentos: 1 | 2;
  /** F12d: as hipóteses do sobrado que a tela expõe (o núcleo e a escada seguem o padrão do motor). */
  sobrado: { lajeEntrePavimentosMm: number; shaftMm: number };
  /** F13: a pressão por caso — até quanto a caixa sobe; acima disso, o pressurizador (e a potência dele). */
  pressao: { caixaElevadaAteMm: number; potenciaDoPressurizadorW: number };
}

export const PREMISSAS_DA_CASA_PADRAO: PremissasDaCasa = {
  curto: PROGRAMA_CURTO_PADRAO,
  disciplinas: { estrutura: true, telhado: true, ancoras: true, mobiliario: true, hidraulica: true, eletrica: true, climatizacao: true },
  telhado: { tipo: 'DUAS_AGUAS', inclinacaoPct: 30, beiralMm: 600 },
  implantacao: { folgaDaTOPct: 5, encostarNaDivisa: 'ESQUERDA' },
  ancoras: { aguaQuente: 'PELO_PADRAO', caixaDeGordura: true },
  eletrica: { chuveiroEletricoVA: 5500, medidor: true },
  sementes: 8,
  pavimentos: 1,
  sobrado: { lajeEntrePavimentosMm: 100, shaftMm: 400 },
  pressao: { caixaElevadaAteMm: 2000, potenciaDoPressurizadorW: 370 },
};

/** Os valores aceitos de cada enumerado (o resto cai no padrão). */
const ENUMERADOS: Record<string, readonly string[]> = {
  padrao: PADROES_DA_CASA,
  tipo: ['DUAS_AGUAS', 'UMA_AGUA'],
  encostarNaDivisa: ['ESQUERDA', 'DIREITA', 'CENTRO'],
  aguaQuente: ['PELO_PADRAO', 'AQUECEDOR_PASSAGEM', 'CHUVEIRO_ELETRICO', 'NENHUM'],
};
/** As chaves que aceitam `null` (o "deixe o motor decidir"). */
const ANULAVEIS = new Set(['areaAlvoM2']);

/** O grupo `padrao` com o que `raw` tem de válido por cima. */
function completar<T extends object>(raw: unknown, padrao: T): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...padrao };
  const fonte = raw as Record<string, unknown>;
  const saida: Record<string, unknown> = { ...(padrao as Record<string, unknown>) };
  for (const [k, base] of Object.entries(padrao as Record<string, unknown>)) {
    const v = fonte[k];
    if (v === undefined) continue;
    if (v === null) {
      if (ANULAVEIS.has(k)) saida[k] = null;
      continue;
    }
    if (ENUMERADOS[k]) {
      if (typeof v === 'string' && ENUMERADOS[k].includes(v)) saida[k] = v;
      continue;
    }
    if (base === null ? typeof v === 'number' : typeof v === typeof base) {
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      saida[k] = v;
    }
  }
  return saida as T;
}

/** A coluna `hipoteses` (JSON parcial, de qualquer versão) → as premissas completas. */
export function premissasDaCasaDaColuna(raw: unknown): PremissasDaCasa {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sementes = typeof r.sementes === 'number' && Number.isFinite(r.sementes) ? Math.max(1, Math.min(8, Math.round(r.sementes))) : PREMISSAS_DA_CASA_PADRAO.sementes;
  return {
    curto: completar(r.curto, PREMISSAS_DA_CASA_PADRAO.curto),
    disciplinas: completar(r.disciplinas, PREMISSAS_DA_CASA_PADRAO.disciplinas),
    telhado: completar(r.telhado, PREMISSAS_DA_CASA_PADRAO.telhado),
    implantacao: completar(r.implantacao, PREMISSAS_DA_CASA_PADRAO.implantacao),
    ancoras: completar(r.ancoras, PREMISSAS_DA_CASA_PADRAO.ancoras),
    eletrica: completar(r.eletrica, PREMISSAS_DA_CASA_PADRAO.eletrica),
    sementes,
    pavimentos: r.pavimentos === 2 ? 2 : 1,
    sobrado: completar(r.sobrado, PREMISSAS_DA_CASA_PADRAO.sobrado),
    pressao: completar(r.pressao, PREMISSAS_DA_CASA_PADRAO.pressao),
  };
}

/** As premissas → as hipóteses PARCIAIS que o motor completa (`planejarCasa(…, hipParcial)`). */
export function hipotesesDasPremissas(p: PremissasDaCasa): Partial<HipotesesDaCasa> {
  const d = p.disciplinas;
  return {
    implantacao: { folgaDaTOPct: p.implantacao.folgaDaTOPct, encostarNaDivisa: p.implantacao.encostarNaDivisa },
    sementes: Array.from({ length: p.sementes }, (_, i) => i + 1),
    estrutura: { lancar: d.estrutura } as HipotesesDaCasa['estrutura'],
    telhado: { lancar: d.telhado, tipo: p.telhado.tipo, inclinacaoPct: p.telhado.inclinacaoPct, beiralMm: p.telhado.beiralMm } as HipotesesDaCasa['telhado'],
    ancoras: { lancar: d.ancoras, aguaQuente: p.ancoras.aguaQuente, caixaDeGordura: p.ancoras.caixaDeGordura } as HipotesesDaCasa['ancoras'],
    mobiliario: { lancar: d.mobiliario } as HipotesesDaCasa['mobiliario'],
    hidraulica: { lancar: d.hidraulica },
    eletrica: { lancar: d.eletrica, chuveiroEletricoVA: p.eletrica.chuveiroEletricoVA, medidor: p.eletrica.medidor } as HipotesesDaCasa['eletrica'],
    climatizacao: { lancar: d.climatizacao },
    pavimentos: p.pavimentos,
    sobrado: { lajeEntrePavimentosMm: p.sobrado.lajeEntrePavimentosMm, shaftMm: p.sobrado.shaftMm } as HipotesesDaCasa['sobrado'],
    pressao: { resolver: true, caixaElevadaAteMm: p.pressao.caixaElevadaAteMm, potenciaDoPressurizadorW: p.pressao.potenciaDoPressurizadorW },
  };
}
