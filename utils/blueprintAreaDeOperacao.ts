/**
 * ÁREA DE OPERAÇÃO DOS SPRINKLERS (01/10/2026, E5.2 do roadmap de incêndio).
 *
 * O kernel guarda só o contorno (`AreaDeOperacao`, 0.83.0). Daqui saem:
 *  - os sprinklers dela — DERIVADOS: os do mesmo pavimento com o ponto dentro;
 *  - o critério dela — o risco próprio vence o do estudo;
 *  - a proposta automática na região hidraulicamente mais desfavorável.
 *
 * ⚠️ NORMA (CONFERIR NA NBR 10897): a forma é um retângulo com o lado maior
 * PARALELO aos ramais e igual a 1,2 × √área — a regra do método hidráulico
 * (NFPA 13, em que a NBR se baseia). Quando o ambiente corta o retângulo, a área
 * cresce até a parte DENTRO do ambiente fechar a área exigida; ambiente menor
 * que a área exigida = a área é o ambiente inteiro.
 */
import { pointInPolygon, polygonArea, signedArea, type BlueprintModel, type Command, type ObjectId, type Point, type Terminal } from './blueprintKernel';
import { calcularCenario, redeDeIncendio, type HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';
import type { CriterioDeSprinklers } from './blueprintSprinklersIncendio';

// Os sprinklers da área e o critério dela moram em `blueprintSprinklersIncendio` (o cálculo usa os dois).
export { areaDoContornoM2, criterioDaArea, sprinklersDaArea } from './blueprintSprinklersIncendio';

const ehSprinkler = (t: Terminal) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'SPRINKLER';

// ─── A proposta automática ───────────────────────────────────────────────────

/** Sutherland-Hodgman: o polígono `sujeito` (pode ser côncavo) recortado pelo `corte` CONVEXO anti-horário. */
export function recortar(sujeito: Point[], corte: Point[]): Point[] {
  let saida = sujeito;
  for (let i = 0; i < corte.length && saida.length; i++) {
    const a = corte[i];
    const b = corte[(i + 1) % corte.length];
    const dentro = (p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-9;
    const corta = (p: Point, q: Point): Point => {
      const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      const t = d1 / (d1 - d2);
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    };
    const entrada = saida;
    saida = [];
    for (let j = 0; j < entrada.length; j++) {
      const p = entrada[j];
      const q = entrada[(j + 1) % entrada.length];
      if (dentro(q)) {
        if (!dentro(p)) saida.push(corta(p, q));
        saida.push(q);
      } else if (dentro(p)) saida.push(corta(p, q));
    }
  }
  return saida;
}

/** Arredonda ao mm e tira vértice repetido e vértice no meio de lado reto. */
function limpar(anel: Point[]): Point[] {
  let r = anel.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })).filter((p, i, v) => i === 0 || p.x !== v[i - 1].x || p.y !== v[i - 1].y);
  if (r.length > 1 && r[0].x === r[r.length - 1].x && r[0].y === r[r.length - 1].y) r.pop();
  for (let mudou = true; mudou && r.length > 3; ) {
    mudou = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) === 0) {
        r = r.filter((_, k) => k !== i);
        mudou = true;
        break;
      }
    }
  }
  return r;
}

export interface PropostaDeAreaDeOperacao {
  comandos: Command[];
  motivo: string | null;
  /** O sprinkler mais desfavorável, de onde a área parte. */
  ancoraId: ObjectId | null;
  pontos: Point[];
  areaM2: number;
  /** O ambiente era menor que a área exigida: a área é ele inteiro. */
  ambienteInteiro: boolean;
}

/** A carga com que cada sprinkler, aberto sozinho, é comparado aos outros (a mesma do cálculo). */
const CARGA_DE_ORDENACAO_M = 100;

/**
 * A área de operação na região mais desfavorável: parte do sprinkler de menor
 * pressão (aberto sozinho, mesma carga), retângulo 1,2√A × A/(1,2√A) com o lado
 * maior na direção do ramal dele, nas quatro posições em volta dele; cresce até
 * a parte dentro do ambiente fechar a área. Vence a mais COMPACTA (área ÷
 * retângulo envolvente) e, no empate, a que cresceu menos. Um comando (um Ctrl+Z).
 *
 * ⚠️ Por que compacta antes de "cresceu menos": num salão em L as quatro
 * posições fecham a área com crescimento quase igual, e a de menor crescimento
 * era uma tira estreita na perna do L virando uma faixa fina de 28 m ao longo
 * da outra perna — fechava os m² mas não é uma área de operação. O harness
 * `docs/spikes/area-operacao` pegou.
 */
export function proporAreaDeOperacao(model: BlueprintModel, hip: HipotesesHidraulicasDeIncendio, criterio: CriterioDeSprinklers): PropostaDeAreaDeOperacao {
  const nada = (motivo: string): PropostaDeAreaDeOperacao => ({ comandos: [], motivo, ancoraId: null, pontos: [], areaM2: 0, ambienteInteiro: false });
  if (!criterio.areaDeOperacao || !criterio.areaPorSprinkler) return nada('sem o risco dos sprinklers — declare-o nas premissas');
  const rede = redeDeIncendio(model);
  if (!rede.fonte) return nada('sem bomba de incêndio nem caixa de incêndio ligada à rede');
  const naRede = (model.terminais ?? []).filter((t) => ehSprinkler(t) && rede.noDoTerminal.has(t.id));
  if (naRede.length === 0) return nada('nenhum sprinkler ligado à rede');
  const pior = naRede
    .map((t) => {
      const cen = calcularCenario(model, hip, [t.id], CARGA_DE_ORDENACAO_M, rede);
      return { t, p: cen.convergiu && cen.terminais.length ? cen.terminais[0].pressaoNoBicoKpa : -Infinity };
    })
    .sort((a, b) => a.p - b.p || a.t.id.localeCompare(b.t.id))[0].t;

  // A direção do ramal: o trecho horizontal que chega no sprinkler.
  const ramal = (model.trechos ?? []).find(
    (x) => x.disciplina === 'INCENDIO' && x.levelId === pior.levelId && (x.a.x !== x.b.x || x.a.y !== x.b.y) && [x.a, x.b].some((p) => p.x === pior.at.x && p.y === pior.at.y),
  );
  const dx = ramal ? ramal.b.x - ramal.a.x : 1;
  const dy = ramal ? ramal.b.y - ramal.a.y : 0;
  const n = Math.hypot(dx, dy);
  const u = { x: dx / n, y: dy / n };
  const v = { x: -u.y, y: u.x };

  const A = criterio.areaDeOperacao.valorM2 * 1e6;
  const L = 1.2 * Math.sqrt(A);
  const W = A / L;
  const meio = Math.sqrt(criterio.areaPorSprinkler.valorM2 * 1e6) / 2;
  const ambiente = model.spaces.find((s) => s.levelId === pior.levelId && pointInPolygon(s.ring, pior.at)) ?? null;
  const dentroM2 = (anel: Point[]) => (ambiente ? polygonArea(recortar(ambiente.ring, anel)) : polygonArea(anel));

  if (ambiente && ambiente.areaMm2 <= A * (1 + 1e-9)) {
    const pontos = limpar(ambiente.ring);
    return { comandos: [{ type: 'AddAreaDeOperacao', levelId: pior.levelId, pontos } as Command], motivo: null, ancoraId: pior.id, pontos, areaM2: polygonArea(pontos) / 1e6, ambienteInteiro: true };
  }

  const compacidade = (anel: Point[]) => {
    const p = limpar(ambiente ? recortar(ambiente.ring, anel) : anel);
    const xs = p.map((q) => q.x);
    const ys = p.map((q) => q.y);
    const caixa = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    return caixa > 0 ? Math.round((polygonArea(p) / caixa) * 100) / 100 : 0;
  };
  let melhor: { f: number; c: number; anel: Point[] } | null = null;
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      // O canto fica meio espaçamento ATRÁS do sprinkler: ele cai dentro, não na quina.
      const canto = { x: pior.at.x - (u.x * su + v.x * sv) * meio, y: pior.at.y - (u.y * su + v.y * sv) * meio };
      const retangulo = (f: number): Point[] => {
        const a = { x: u.x * su * L * f, y: u.y * su * L * f };
        const b = { x: v.x * sv * W * f, y: v.y * sv * W * f };
        const r = [canto, { x: canto.x + a.x, y: canto.y + a.y }, { x: canto.x + a.x + b.x, y: canto.y + a.y + b.y }, { x: canto.x + b.x, y: canto.y + b.y }];
        // O recorte quer o retângulo anti-horário.
        return signedArea(r) < 0 ? r.reverse() : r;
      };
      if (dentroM2(retangulo(3)) < A * (1 - 1e-9)) continue;
      let lo = 1;
      let hi = 3;
      if (dentroM2(retangulo(1)) >= A * (1 - 1e-9)) hi = 1;
      else for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
        const m = (lo + hi) / 2;
        if (dentroM2(retangulo(m)) >= A * (1 - 1e-9)) hi = m;
        else lo = m;
      }
      const anel = retangulo(hi);
      const c = compacidade(anel);
      if (!melhor || c > melhor.c || (c === melhor.c && hi < melhor.f - 1e-9)) melhor = { f: hi, c, anel };
    }
  }
  if (!melhor) return nada('nenhuma posição em volta do sprinkler mais desfavorável cabe a área exigida no ambiente');
  const pontos = limpar(ambiente ? recortar(ambiente.ring, melhor.anel) : melhor.anel);
  return { comandos: [{ type: 'AddAreaDeOperacao', levelId: pior.levelId, pontos } as Command], motivo: null, ancoraId: pior.id, pontos, areaM2: polygonArea(pontos) / 1e6, ambienteInteiro: false };
}
