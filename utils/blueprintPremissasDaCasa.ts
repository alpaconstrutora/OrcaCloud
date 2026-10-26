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
import { HIPOTESES_DO_GERADOR_PADRAO } from './blueprintGerador';
import { HIPOTESES_PILARES_PADRAO } from './blueprintPilaresAutomaticos';
import { HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO } from './blueprintPlatoDaCasa';
import { HIPOTESES_DO_MURO_DA_CASA_PADRAO } from './blueprintMuroDaCasa';
import type { TipoDeMuro } from './blueprintKernel';

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
  /**
   * F12d: 1 = térrea; 2 = sobrado. F22: 'AUTOMATICO' (o padrão) = a térrea, ou o sobrado quando ela não comporta. F27-D4:
   * 3 = o 2º recuado com terraço (no Automático, só quando o sobrado não comporta e o gabarito deixa).
   */
  pavimentos: 1 | 2 | 3 | 'AUTOMATICO';
  /** F12d: as hipóteses do sobrado que a tela expõe (o núcleo e a escada seguem o padrão do motor). */
  sobrado: { lajeEntrePavimentosMm: number; shaftMm: number };
  /**
   * F23: a estrutura vista da arquitetura — o montante entre as folhas da janela acima do máximo (onde o pilar
   * intermediário cabe) e até onde o pilar do superior escorrega para fugir de uma porta ou janela do térreo.
   */
  estrutura: { montanteEntreJanelasMm: number; deslizeSobreAberturaMm: number };
  /**
   * F25: o platô no terreno inclinado (só com a topografia do estudo) — ligar/desligar, a margem dele em volta da casa,
   * o piso do térreo acima dele e a altura acima da qual a borda leva muro de arrimo em vez de talude.
   */
  terraplenagem: { lancar: boolean; margemDoPlatoMm: number; pisoAcimaDoPlatoMm: number; alturaMaximaDoTaludeM: number; rampaDeVeiculosMaxPct: number };
  /**
   * F26: o muro do lote — ligar/desligar, o tipo e a altura da frente, a altura das divisas e as calçadas. Portões,
   * espessura e materiais seguem o padrão do motor (`HIPOTESES_DO_MURO_DA_CASA_PADRAO`); o painel do muro ajusta cada um.
   */
  muro: { lancar: boolean; tipoDaFrente: TipoDeMuro; alturaDaFrenteMm: number; alturaDasDivisasMm: number; calcadas: boolean };
  /** F13: a pressão por caso — até quanto a caixa sobe; acima disso, o pressurizador (e a potência dele). */
  pressao: { caixaElevadaAteMm: number; potenciaDoPressurizadorW: number };
  /**
   * F14b: o forro dos cômodos, com as redes nas faixas do plenum (desligado = as redes 10 cm sob a viga), e o pé-direito
   * livre mínimo que ele respeita. As faixas de cada rede seguem o padrão do motor (`HIPOTESES_DO_FORRO_DA_CASA_PADRAO`).
   */
  forro: { lancar: boolean; peDireitoLivrePermanenciaMm: number; peDireitoLivreDemaisMm: number; pisoAcabadoMm: number };
  /**
   * F15: a unidade do Empreendimento que esta casa É (decisão do usuário, 16/10/2026: "a escolhida na tela") — o
   * sincronismo atualiza ela. `null` = nenhuma: o sincronismo cria a torre "Casa" com 1 unidade.
   */
  unidadeId: string | null;
  /**
   * 26/10/2026 (casas do loteamento): a planta desta casa nasceu de um lote do loteamento — o estudo e o `uid` do lote.
   * É o que a tela "Casas dos lotes" usa para saber que o lote já tem planta. `null` = casa comum.
   */
  loteDeOrigem: { estudoId: string; loteUid: string } | null;
}

export const PREMISSAS_DA_CASA_PADRAO: PremissasDaCasa = {
  curto: PROGRAMA_CURTO_PADRAO,
  disciplinas: { estrutura: true, telhado: true, ancoras: true, mobiliario: true, hidraulica: true, eletrica: true, climatizacao: true },
  telhado: { tipo: 'DUAS_AGUAS', inclinacaoPct: 30, beiralMm: 600 },
  implantacao: { folgaDaTOPct: 5, encostarNaDivisa: 'ESQUERDA' },
  ancoras: { aguaQuente: 'PELO_PADRAO', caixaDeGordura: true },
  eletrica: { chuveiroEletricoVA: 5500, medidor: true },
  sementes: 8,
  pavimentos: 'AUTOMATICO',
  sobrado: { lajeEntrePavimentosMm: 100, shaftMm: 400 },
  estrutura: { montanteEntreJanelasMm: 400, deslizeSobreAberturaMm: 1200 },
  terraplenagem: { lancar: true, margemDoPlatoMm: 1000, pisoAcimaDoPlatoMm: 150, alturaMaximaDoTaludeM: 1.5, rampaDeVeiculosMaxPct: 20 },
  muro: { lancar: true, tipoDaFrente: 'MURETA_COM_GRADE', alturaDaFrenteMm: 1800, alturaDasDivisasMm: 1800, calcadas: true },
  pressao: { caixaElevadaAteMm: 2000, potenciaDoPressurizadorW: 370 },
  forro: { lancar: true, peDireitoLivrePermanenciaMm: 2500, peDireitoLivreDemaisMm: 2300, pisoAcabadoMm: 50 },
  unidadeId: null,
  loteDeOrigem: null,
};

/** Os valores aceitos de cada enumerado (o resto cai no padrão). */
const ENUMERADOS: Record<string, readonly string[]> = {
  padrao: PADROES_DA_CASA,
  tipo: ['DUAS_AGUAS', 'UMA_AGUA'],
  encostarNaDivisa: ['ESQUERDA', 'DIREITA', 'CENTRO'],
  aguaQuente: ['PELO_PADRAO', 'AQUECEDOR_PASSAGEM', 'CHUVEIRO_ELETRICO', 'NENHUM'],
  tipoDaFrente: ['ALVENARIA', 'GRADE', 'MURETA_COM_GRADE'],
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
    // A premissa gravada vale (1 = a térrea escolhida); ausente, o padrão (Automático).
    pavimentos: r.pavimentos === 3 ? 3 : r.pavimentos === 2 ? 2 : r.pavimentos === 1 ? 1 : 'AUTOMATICO',
    sobrado: completar(r.sobrado, PREMISSAS_DA_CASA_PADRAO.sobrado),
    estrutura: completar(r.estrutura, PREMISSAS_DA_CASA_PADRAO.estrutura),
    terraplenagem: completar(r.terraplenagem, PREMISSAS_DA_CASA_PADRAO.terraplenagem),
    muro: completar(r.muro, PREMISSAS_DA_CASA_PADRAO.muro),
    pressao: completar(r.pressao, PREMISSAS_DA_CASA_PADRAO.pressao),
    forro: completar(r.forro, PREMISSAS_DA_CASA_PADRAO.forro),
    unidadeId: typeof r.unidadeId === 'string' && r.unidadeId.trim() ? r.unidadeId : null,
    loteDeOrigem: loteDeOrigemDaColuna(r.loteDeOrigem),
  };
}

function loteDeOrigemDaColuna(v: unknown): PremissasDaCasa['loteDeOrigem'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  return typeof o.estudoId === 'string' && o.estudoId && typeof o.loteUid === 'string' && o.loteUid ? { estudoId: o.estudoId, loteUid: o.loteUid } : null;
}

/** As premissas → as hipóteses PARCIAIS que o motor completa (`planejarCasa(…, hipParcial)`). */
export function hipotesesDasPremissas(p: PremissasDaCasa): Partial<HipotesesDaCasa> {
  const d = p.disciplinas;
  return {
    implantacao: { folgaDaTOPct: p.implantacao.folgaDaTOPct, encostarNaDivisa: p.implantacao.encostarNaDivisa },
    sementes: Array.from({ length: p.sementes }, (_, i) => i + 1),
    // F23: as duas premissas da estrutura entram completas (o motor junta o grupo raso).
    gerador: { janela: { ...HIPOTESES_DO_GERADOR_PADRAO.janela, montanteMm: p.estrutura.montanteEntreJanelasMm } },
    estrutura: { lancar: d.estrutura, pilares: { ...HIPOTESES_PILARES_PADRAO, deslizeSobreAberturaMm: p.estrutura.deslizeSobreAberturaMm } } as HipotesesDaCasa['estrutura'],
    telhado: { lancar: d.telhado, tipo: p.telhado.tipo, inclinacaoPct: p.telhado.inclinacaoPct, beiralMm: p.telhado.beiralMm } as HipotesesDaCasa['telhado'],
    ancoras: { lancar: d.ancoras, aguaQuente: p.ancoras.aguaQuente, caixaDeGordura: p.ancoras.caixaDeGordura } as HipotesesDaCasa['ancoras'],
    mobiliario: { lancar: d.mobiliario } as HipotesesDaCasa['mobiliario'],
    hidraulica: { lancar: d.hidraulica },
    eletrica: { lancar: d.eletrica, chuveiroEletricoVA: p.eletrica.chuveiroEletricoVA, medidor: p.eletrica.medidor } as HipotesesDaCasa['eletrica'],
    climatizacao: { lancar: d.climatizacao } as HipotesesDaCasa['climatizacao'],
    pavimentos: p.pavimentos,
    terraplenagem: { ...HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO, ...p.terraplenagem },
    muro: { ...HIPOTESES_DO_MURO_DA_CASA_PADRAO, ...p.muro },
    sobrado: { lajeEntrePavimentosMm: p.sobrado.lajeEntrePavimentosMm, shaftMm: p.sobrado.shaftMm } as HipotesesDaCasa['sobrado'],
    pressao: { resolver: true, caixaElevadaAteMm: p.pressao.caixaElevadaAteMm, potenciaDoPressurizadorW: p.pressao.potenciaDoPressurizadorW },
    // O motor completa o resto do grupo (as faixas) com o padrão dele.
    forro: { lancar: p.forro.lancar, peDireitoLivrePermanenciaMm: p.forro.peDireitoLivrePermanenciaMm, peDireitoLivreDemaisMm: p.forro.peDireitoLivreDemaisMm, pisoAcabadoMm: p.forro.pisoAcabadoMm } as HipotesesDaCasa['forro'],
  };
}
