/**
 * O BOMBEAMENTO DE INCÊNDIO (01/10/2026, E4.2 do roadmap de incêndio): a curva
 * da bomba contra a do sistema.
 *
 *  - CURVA DA BOMBA: a declarada (`Terminal.curvaBomba`), interpolada em linha
 *    reta entre os pontos; fora da faixa de vazão do catálogo, `null` (a bomba
 *    não foi ensaiada ali — não se extrapola).
 *  - CURVA DO SISTEMA: a carga que a rede pede para cada vazão, tirada do
 *    MESMO solver da E2 (o cenário dos N mais desfavoráveis abertos, com a
 *    carga da fonte variando): H_sis(Q).
 *  - PONTO DE OPERAÇÃO: onde as duas se cruzam — a carga c em que a bomba dá
 *    exatamente c para a vazão que a rede puxa com c (bisseção; a bomba cai e
 *    o sistema sobe, então o cruzamento é único).
 *  - PONTO DE PROJETO: a vazão e a carga NECESSÁRIAS (a E2). A bomba atende se
 *    a curva passa por cima dele.
 *  - Análise (valores da NFPA 20, CONFERIR NA NBR 13714/IT): a 150 % da vazão
 *    de projeto a bomba ainda dá ≥ 65 % da carga de projeto; a carga de
 *    SHUTOFF (vazão zero) não leva a estática além da pressão máxima.
 *  - NPSH disponível = Patm − pv + (nível da água na sucção − eixo da bomba) −
 *    perda na sucção, contra o requerido. A água na sucção é o fundo da caixa de
 *    RTI mais baixa (a favor da segurança: caixa quase vazia).
 *
 * Tudo DERIVADO. A escolha da bomba entre as cadastradas é uma SUGESTÃO: quem
 * grava é aplicar o tipo à bomba.
 */
import type { BlueprintModel, ObjectId, PontoDaCurvaDaBomba } from './blueprintKernel';
import { calcularCenario, redeDeIncendio, type CalculoDeIncendio, type HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';

/** A altura da bomba (m) na vazão (L/min) — interpolada; `null` fora da faixa do catálogo. */
export function alturaDaBombaM(curva: readonly PontoDaCurvaDaBomba[], vazaoLmin: number): number | null {
  if (curva.length < 2) return null;
  if (vazaoLmin < curva[0].vazaoLmin - 1e-9 || vazaoLmin > curva[curva.length - 1].vazaoLmin + 1e-9) return null;
  for (let i = 1; i < curva.length; i++) {
    const a = curva[i - 1];
    const b = curva[i];
    if (vazaoLmin <= b.vazaoLmin + 1e-9) {
      const t = b.vazaoLmin === a.vazaoLmin ? 0 : (vazaoLmin - a.vazaoLmin) / (b.vazaoLmin - a.vazaoLmin);
      return (a.alturaMm + t * (b.alturaMm - a.alturaMm)) / 1000;
    }
  }
  return null;
}

/** A carga de SHUTOFF (vazão zero), m — a do primeiro ponto se ele é Q = 0; senão `null`. */
export function shutoffM(curva: readonly PontoDaCurvaDaBomba[]): number | null {
  return curva.length && curva[0].vazaoLmin === 0 ? curva[0].alturaMm / 1000 : null;
}

export interface PontoQH {
  vazaoLmin: number;
  alturaM: number;
}

/** A curva do sistema: para cargas de 0 a `ateM`, a vazão que a rede puxa com os `abertos`. */
export function curvaDoSistema(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, abertos: readonly ObjectId[], ateM: number, passos = 16): PontoQH[] {
  const rede = redeDeIncendio(model);
  const pts: PontoQH[] = [];
  for (let i = 0; i <= passos; i++) {
    const c = (ateM * i) / passos;
    const cen = calcularCenario(model, hip, abertos, c, rede);
    if (cen.convergiu) pts.push({ vazaoLmin: cen.vazaoNaFonteLmin, alturaM: c });
  }
  return pts;
}

export interface PontoDeOperacao {
  vazaoLmin: number;
  alturaM: number;
  /** Os abertos atendem no ponto de operação? (é o que a bomba entrega de fato) */
  atende: boolean;
}

/** O cruzamento das curvas, ou `null` se a bomba não alcança a vazão que a rede puxa. */
export function pontoDeOperacao(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, abertos: readonly ObjectId[], curva: readonly PontoDaCurvaDaBomba[]): PontoDeOperacao | null {
  const rede = redeDeIncendio(model);
  const topo = shutoffM(curva) ?? curva[0].alturaMm / 1000;
  const f = (c: number) => {
    const cen = calcularCenario(model, hip, abertos, c, rede);
    // O resíduo numérico da retenção (centésimos de L/min para trás) é vazão zero.
    const h = alturaDaBombaM(curva, Math.max(0, cen.vazaoNaFonteLmin));
    return { cen, d: h == null ? -Infinity : h - c };
  };
  // f(0) > 0 se a bomba dá alguma carga na vazão que a rede puxa sem carga; f(topo) ≤ 0.
  if (f(0).d <= 0) return null;
  let lo = 0;
  let hi = topo;
  for (let i = 0; i < 60 && hi - lo > 0.005; i++) {
    const m = (lo + hi) / 2;
    if (f(m).d > 0) lo = m;
    else hi = m;
  }
  const { cen } = f(lo);
  return { vazaoLmin: cen.vazaoNaFonteLmin, alturaM: lo, atende: cen.terminais.length > 0 && cen.terminais.every((t) => t.atende) };
}

export interface HipotesesDoBombeamento {
  /** Altitude do local, m — a pressão atmosférica cai com ela (BH ≈ 850 m). CONFERIR. */
  altitudeM: number;
  /** Perda na tubulação de sucção, m — sem a sucção desenhada, é premissa. CONFERIR. */
  perdaNaSuccaoM: number;
  /** E4.3: o diferencial dos pressostatos, kPa — parada → partida da jockey, e jockey → principal (NFPA 20: 70 e 35). CONFERIR. */
  diferencialJockeyKpa: number;
  diferencialPrincipalKpa: number;
}
export const HIPOTESES_BOMBEAMENTO_PADRAO: HipotesesDoBombeamento = { altitudeM: 0, perdaNaSuccaoM: 1, diferencialJockeyKpa: 70, diferencialPrincipalKpa: 35 };

export function hipotesesDoBombeamentoDaColuna(raw: unknown): HipotesesDoBombeamento {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const p = HIPOTESES_BOMBEAMENTO_PADRAO;
  return {
    altitudeM: ok(r.altitudeM) ? r.altitudeM : p.altitudeM,
    perdaNaSuccaoM: ok(r.perdaNaSuccaoM) ? r.perdaNaSuccaoM : p.perdaNaSuccaoM,
    diferencialJockeyKpa: ok(r.diferencialJockeyKpa) && r.diferencialJockeyKpa > 0 ? r.diferencialJockeyKpa : p.diferencialJockeyKpa,
    diferencialPrincipalKpa: ok(r.diferencialPrincipalKpa) && r.diferencialPrincipalKpa > 0 ? r.diferencialPrincipalKpa : p.diferencialPrincipalKpa,
  };
}

/** Pressão atmosférica em mca pela altitude (aproximação usual: −1,2 m a cada 1000 m … ≈ 10,33 − 0,0012·alt). */
export const patmMca = (altitudeM: number) => 10.33 - 0.0012 * altitudeM;
/** Pressão de vapor da água a 20 °C, mca. */
export const PV_MCA = 0.24;

export interface AnaliseDaBomba {
  terminalId: ObjectId;
  temCurva: boolean;
  projeto: PontoQH | null;
  /** A altura da curva na vazão de projeto; `null` fora da faixa. */
  alturaNaVazaoDeProjetoM: number | null;
  atendeProjeto: boolean | null;
  operacao: PontoDeOperacao | null;
  /** A 150 % da vazão de projeto, a bomba dá ≥ 65 % da carga de projeto? `null` = fora da faixa da curva. */
  cento50: { alturaM: number | null; minimoM: number; atende: boolean | null } | null;
  /** A estática com a bomba em SHUTOFF no hidrante mais baixo, kPa, contra a máxima. */
  shutoff: { alturaM: number; estaticaMaximaKpa: number; atende: boolean } | null;
  npsh: { disponivelM: number; requeridoM: number | null; atende: boolean | null; nivelDaSuccao: 'CAIXA' | 'COTA_DA_BOMBA' } | null;
  curvaDoSistema: PontoQH[];
}

/** A análise da bomba principal da rede (a fonte do cálculo). */
export function analisarBomba(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, hb: HipotesesDoBombeamento, c: CalculoDeIncendio): AnaliseDaBomba | null {
  const rede = redeDeIncendio(model);
  if (rede.tipoDaFonte !== 'BOMBA' || !rede.fonte) return null;
  const bomba = rede.fonte;
  const curva = bomba.curvaBomba ?? null;
  const projeto = c.cenario && c.cargaNecessariaM != null ? { vazaoLmin: c.cenario.vazaoNaFonteLmin, alturaM: c.cargaNecessariaM } : null;
  const alturaNaVazaoDeProjetoM = curva && projeto ? alturaDaBombaM(curva, projeto.vazaoLmin) : null;
  const ateM = Math.max(curva ? (shutoffM(curva) ?? curva[0].alturaMm / 1000) : 0, (projeto?.alturaM ?? 0) * 1.6, 10);
  const sistema = c.abertos.length ? curvaDoSistema(model, c.hip, c.abertos, ateM) : [];
  const zBomba = rede.cota.get(rede.noDaFonte!)!;
  // Sucção: o fundo da caixa de RTI mais baixa; sem caixa, a cota da bomba (afogamento zero).
  const caixas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && (t.disciplina === 'INCENDIO' || (t.volumeRtiL ?? 0) > 0));
  const elev = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const zCaixa = caixas.length ? Math.min(...caixas.map((t) => ((elev.get(t.levelId) ?? 0) + t.cotaMm) / 1000)) : null;
  const disponivelM = patmMca(hb.altitudeM) - PV_MCA + ((zCaixa ?? zBomba) - zBomba) - hb.perdaNaSuccaoM;
  const requeridoM = bomba.npshrMm != null ? bomba.npshrMm / 1000 : null;
  const hidrantes = [...c.estaticaKpa.keys()];
  const zMaisBaixo = hidrantes.length ? Math.min(...hidrantes.map((id) => rede.cota.get(rede.noDoTerminal.get(id)!)!)) : null;
  const so = curva ? shutoffM(curva) : null;
  return {
    terminalId: bomba.id,
    temCurva: !!curva,
    projeto,
    alturaNaVazaoDeProjetoM,
    atendeProjeto: curva && projeto ? alturaNaVazaoDeProjetoM != null && alturaNaVazaoDeProjetoM + 1e-9 >= projeto.alturaM : null,
    operacao: curva && c.abertos.length ? pontoDeOperacao(model, c.hip, c.abertos, curva) : null,
    cento50: curva && projeto ? (() => {
      const h = alturaDaBombaM(curva, projeto.vazaoLmin * 1.5);
      const minimoM = projeto.alturaM * 0.65;
      return { alturaM: h, minimoM, atende: h == null ? null : h + 1e-9 >= minimoM };
    })() : null,
    shutoff: so != null && zMaisBaixo != null ? (() => {
      const estaticaMaximaKpa = (zBomba + so - zMaisBaixo) * 9.80665;
      return { alturaM: so, estaticaMaximaKpa, atende: estaticaMaximaKpa <= hip.pressaoMaximaKpa };
    })() : null,
    npsh: { disponivelM, requeridoM, atende: requeridoM == null ? null : disponivelM + 1e-9 >= requeridoM, nivelDaSuccao: zCaixa != null ? 'CAIXA' : 'COTA_DA_BOMBA' },
    curvaDoSistema: sistema,
  };
}

export interface BombaCandidata {
  id: string;
  nome: string;
  curva: PontoDaCurvaDaBomba[];
}

/**
 * As bombas cadastradas que ATENDEM o ponto de projeto, da que tem menos folga
 * à que tem mais (a menor que serve primeiro). Fora da faixa da curva = não atende.
 */
export function bombasQueAtendem(candidatas: readonly BombaCandidata[], projeto: PontoQH): { candidata: BombaCandidata; folgaM: number }[] {
  return candidatas
    .map((c) => ({ candidata: c, h: alturaDaBombaM(c.curva, projeto.vazaoLmin) }))
    .filter((x): x is { candidata: BombaCandidata; h: number } => x.h != null && x.h + 1e-9 >= projeto.alturaM)
    .map((x) => ({ candidata: x.candidata, folgaM: x.h - projeto.alturaM }))
    .sort((a, b) => a.folgaM - b.folgaM || a.candidata.nome.localeCompare(b.candidata.nome));
}

// ─── E4.3: a jockey e os pressostatos ────────────────────────────────────────

export interface PressurizacaoDaRede {
  /** A jockey ligada à principal, se há. */
  jockeyId: ObjectId | null;
  /** Pressostatos de incêndio na rede (um por bomba, no mínimo). */
  pressostatos: number;
  /** Os ajustes, no recalque da bomba, kPa — derivados do shutoff da principal. `null` sem a curva dela. */
  ajustes: { paradaJockeyKpa: number; partidaJockeyKpa: number; partidaPrincipalKpa: number } | null;
  /** A jockey alcança a pressão de parada? (o shutoff dela ≥ a parada) `null` sem curva. */
  jockeyAlcancaParada: boolean | null;
  /**
   * Com a rede parada na pressão de partida da principal, o ponto mais ALTO
   * (hidrante ou sprinkler) ainda tem pressão? (senão a rede esvazia lá em cima antes de a bomba partir)
   */
  topoPressurizado: { pressaoKpa: number; atende: boolean } | null;
}

/**
 * Os ajustes dos pressostatos e a jockey (esquema da NFPA 20, CONFERIR NA IT):
 * a jockey para no shutoff da principal; parte `diferencialJockeyKpa` abaixo; a
 * principal parte `diferencialPrincipalKpa` abaixo da partida da jockey.
 */
export function pressurizacaoDaRede(model: BlueprintModel, hb: HipotesesDoBombeamento, c: CalculoDeIncendio): PressurizacaoDaRede | null {
  const rede = redeDeIncendio(model);
  if (rede.tipoDaFonte !== 'BOMBA' || !rede.fonte) return null;
  const principal = rede.fonte;
  const jockey = (model.terminais ?? []).find((t) => t.tipoHidraulico === 'BOMBA_JOCKEY' && t.bombaPrincipalId === principal.id) ?? null;
  const pressostatos = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'PRESSOSTATO').length;
  const so = principal.curvaBomba ? shutoffM(principal.curvaBomba) : null;
  const ajustes = so != null
    ? (() => {
        const paradaJockeyKpa = so * 9.80665;
        const partidaJockeyKpa = paradaJockeyKpa - hb.diferencialJockeyKpa;
        return { paradaJockeyKpa, partidaJockeyKpa, partidaPrincipalKpa: partidaJockeyKpa - hb.diferencialPrincipalKpa };
      })()
    : null;
  const soJockey = jockey?.curvaBomba ? shutoffM(jockey.curvaBomba) : null;
  const zBomba = rede.cota.get(rede.noDaFonte!)!;
  const hidrantes = [...c.estaticaKpa.keys()];
  const zTopo = hidrantes.length ? Math.max(...hidrantes.map((id) => rede.cota.get(rede.noDoTerminal.get(id)!)!)) : null;
  return {
    jockeyId: jockey?.id ?? null,
    pressostatos,
    ajustes,
    jockeyAlcancaParada: ajustes && soJockey != null ? soJockey * 9.80665 + 1e-6 >= ajustes.paradaJockeyKpa : null,
    topoPressurizado: ajustes && zTopo != null ? (() => {
      const pressaoKpa = ajustes.partidaPrincipalKpa - (zTopo - zBomba) * 9.80665;
      return { pressaoKpa, atende: pressaoKpa > 0 };
    })() : null,
  };
}

