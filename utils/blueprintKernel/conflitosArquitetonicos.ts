/**
 * CONFLITOS ARQUITETÔNICOS — estrutura ocupando o lugar de um vão ou de uma
 * escada (18/09/2026, roadmap E0.4: *"Pilar × porta · Pilar × janela · Escada ×
 * estrutura — P0"*).
 *
 * ─── POR QUE NÃO É `conflitos.ts` NEM `sobreposicao.ts` ────────────────────
 *
 * `sobreposicao.ts` mede parede × pilar para DESCONTAR volume: o pilar dentro
 * da parede é normal, e a conta só decide quem paga o concreto. `conflitos.ts`
 * é instalação × estrutura e instalação × instalação, e o tipo dele carrega um
 * `trechoId` — reaproveitá-lo para uma porta seria um campo mentindo o nome.
 *
 * Aqui a pergunta é outra: **a peça arquitetônica ainda funciona?** Um pilar
 * dentro de uma parede é rotina; um pilar dentro do VÃO da porta é uma porta
 * que não abre. Uma viga sobre a laje é rotina; uma viga a 1,80 m sobre o
 * degrau é uma cabeçada. Nenhum dos dois vira desconto — viram PENDÊNCIA de
 * projeto, como o clash MEP, na mesma lista e no mesmo BCF.
 *
 * O que ENTRA:
 * - **vão × estrutura** (porta, janela, correr, vão livre × pilar/viga/laje da
 *   mesma parede): a faixa que a estrutura ocupa ao longo do eixo da parede
 *   (`faixaDaEstruturaNaParede`, a MESMA conta do desconto) cruza o intervalo
 *   do vão em planta E em altura. Cruzar só em planta não basta: uma viga no
 *   teto por cima da janela é a verga funcionando.
 * - **escada × pilar**: qualquer pilar do pavimento com pegada dentro do
 *   contorno da escada — não há degrau que atravesse concreto.
 * - **escada × viga/laje**: a peça passa POR CIMA do percurso com menos de
 *   `ALTURA_LIVRE_MIN_MM` (2,10 m — NBR 9077, 4.6.2) entre o degrau e a face
 *   inferior dela, em alguma fatia do percurso.
 *
 * - **reserva de equipamento × o que a ocupa** (E11.1, HVAC mínimo): a peça de
 *   CLIMATIZAÇÃO (condensadora, evaporadora, casa de máquinas, exaustor) é uma
 *   RESERVA DE ESPAÇO com folga de manutenção (`folgaMm` da ficha). Pilar ou
 *   viga dentro da caixa, na mesma faixa de altura (`RESERVA_X_ESTRUTURA`);
 *   parede atravessando a caixa (`RESERVA_X_PAREDE`) — a condensadora encostada
 *   na parede é normal, a parede passando por dentro dela não; e outro
 *   componente dentro da caixa + folga (`RESERVA_X_COMPONENTE`) — o armário
 *   colado na condensadora não deixa trocar calor nem consertar. Só as peças de
 *   climatização acusam: mobiliário encostado em mobiliário é a vida.
 *
 * - **E9.4 (incêndio, 01/10/2026) — peça × peça e peça × porta:**
 *   - `SPRINKLER_X_OBSTRUCAO`: sprinkler a menos de `AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM`
 *     (em planta) de uma luminária (comum ou de emergência), os dois junto ao
 *     teto (diferença de cota ≤ `FAIXA_DO_TETO_MM`) — a luminária faz sombra no
 *     jato. Valor CONFERIR NA NBR 10897 (a regra completa de obstrução depende da
 *     altura e da largura do obstáculo).
 *   - `PECA_X_PORTA`: hidrante, mangotinho ou extintor dentro da FAIXA DE
 *     PASSAGEM de uma porta — o vão mais o giro da folha para os dois lados, da
 *     soleira à verga. O abrigo aberto bloqueia a saída; o extintor no vão some
 *     atrás da folha.
 *   Peça × peça GENÉRICA não entra: o kit do banheiro põe água fria, quente e
 *   esgoto no MESMO ponto de propósito, e a lista viraria ruído.
 *
 * Determinístico: ordenado por id da peça e do outro, como `conflitosDoModelo`.
 */
import { pointInPolygon, polygonArea, type Point } from './geom';
import { fatiasDaEscada } from './escada';
import type { BlueprintModel, Componente, ObjectId, Structural } from './model';
import { CATALOGO_DE_COMPONENTES, FORMA_ESTRUTURAL, contornoDoComponente, pavimentosDoNucleo } from './model';
import { faixaDaEstruturaNaParede, pegadaEmPlanta, recorteComum } from './sobreposicao';

/** Altura livre mínima sobre o degrau — NBR 9077, 4.6.2. */
export const ALTURA_LIVRE_MIN_MM = 2100;
/** E9.4: afastamento mínimo em planta entre o sprinkler e uma luminária — CONFERIR NA NBR 10897. */
export const AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM = 300;
/** E9.4: "os dois junto ao teto" — diferença de cota até isto. */
export const FAIXA_DO_TETO_MM = 500;
/** E9.4: as peças de incêndio que não podem ficar na passagem da porta. */
const PECAS_FORA_DA_PORTA = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'EXTINTOR']);

export interface ConflitoArquitetonico {
  /** A peça arquitetônica atingida. */
  pecaId: ObjectId;
  pecaUid: string;
  /** E7.2: `terminal` e `quadro` — o ponto elétrico/hidráulico e o quadro dentro da estrutura. */
  familia: 'opening' | 'stair' | 'nucleo' | 'componente' | 'terminal' | 'quadro';
  /** A outra peça: estrutura (nas classes de estrutura), parede ou componente (E11.1). */
  outroId: ObjectId;
  outroUid: string;
  outroFamilia?: 'structural' | 'wall' | 'componente' | 'terminal' | 'opening';
  classe: 'VAO_X_ESTRUTURA' | 'ESCADA_X_PILAR' | 'ESCADA_X_ALTURA_LIVRE' | 'NUCLEO_X_ESTRUTURA' | 'RESERVA_X_ESTRUTURA' | 'RESERVA_X_PAREDE' | 'RESERVA_X_COMPONENTE' | 'PONTO_X_ESTRUTURA' | 'SPRINKLER_X_OBSTRUCAO' | 'PECA_X_PORTA';
  levelId: ObjectId;
  /**
   * O tamanho do problema, em mm: no vão, quanto do vão está tomado ao longo
   * da parede; no pilar na escada, o lado da área comum (√área); na altura
   * livre, quanto FALTA para os 2,10 m.
   */
  medidaMm: number;
  /** Onde apontar (planta, mm) — o centro do encontro. */
  em: Point;
}

const areaDe = (anel: Point[]) => Math.abs(polygonArea(anel));

function centro(anel: Point[]): Point {
  const n = anel.length || 1;
  return {
    x: Math.round(anel.reduce((s, p) => s + p.x, 0) / n),
    y: Math.round(anel.reduce((s, p) => s + p.y, 0) / n),
  };
}

export function conflitosArquitetonicos(model: BlueprintModel): ConflitoArquitetonico[] {
  const saida: ConflitoArquitetonico[] = [];
  const estruturasPorNivel = new Map<ObjectId, Structural[]>();
  for (const s of model.structures) {
    const lista = estruturasPorNivel.get(s.levelId) ?? [];
    lista.push(s);
    estruturasPorNivel.set(s.levelId, lista);
  }

  // ── Vão × estrutura ──────────────────────────────────────────────────────
  const paredePorId = new Map(model.walls.map((w) => [w.id, w]));
  for (const o of model.openings) {
    const w = paredePorId.get(o.wallId);
    if (!w) continue;
    const vaoA = o.offsetMm;
    const vaoB = o.offsetMm + o.widthMm;
    const vaoBaixo = o.sillMm;
    const vaoAlto = o.sillMm + o.heightMm;
    for (const s of estruturasPorNivel.get(w.levelId) ?? []) {
      const faixa = faixaDaEstruturaNaParede(w, s);
      if (!faixa) continue;
      const x0 = Math.max(faixa.x0, vaoA);
      const x1 = Math.min(faixa.x1, vaoB);
      const y0 = Math.max(faixa.y0, vaoBaixo);
      const y1 = Math.min(faixa.y1, vaoAlto);
      // Encostar não é invadir: tem de sobrar comprimento E altura.
      if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
      const comp = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
      const meio = (x0 + x1) / 2;
      saida.push({
        pecaId: o.id,
        pecaUid: o.uid,
        familia: 'opening',
        outroId: s.id,
        outroUid: s.uid,
        classe: 'VAO_X_ESTRUTURA',
        levelId: w.levelId,
        medidaMm: Math.round(x1 - x0),
        em: {
          x: Math.round(w.a.x + ((w.b.x - w.a.x) * meio) / comp),
          y: Math.round(w.a.y + ((w.b.y - w.a.y) * meio) / comp),
        },
      });
    }
  }

  // ── Escada × estrutura ───────────────────────────────────────────────────
  for (const e of model.stairs ?? []) {
    const fatias = fatiasDaEscada(model, e);
    if (fatias.length === 0) continue;
    for (const s of estruturasPorNivel.get(e.levelId) ?? []) {
      const pegada = pegadaEmPlanta(s);
      if (pegada.length < 3) continue;
      if (FORMA_ESTRUTURAL[s.kind] === 'PONTO') {
        // Pilar (ou estaca/bloco): a área comum com QUALQUER fatia é conflito.
        let areaComumMm2 = 0;
        const comuns: Point[][] = [];
        for (const f of fatias) {
          const comum = recorteComum(f.cantos, pegada);
          if (comum.length >= 3) {
            areaComumMm2 += areaDe(comum);
            comuns.push(comum);
          }
        }
        if (areaComumMm2 <= 0) continue;
        saida.push({
          pecaId: e.id,
          pecaUid: e.uid,
          familia: 'stair',
          outroId: s.id,
          outroUid: s.uid,
          classe: 'ESCADA_X_PILAR',
          levelId: e.levelId,
          medidaMm: Math.round(Math.sqrt(areaComumMm2)),
          em: centro(comuns.flat()),
        });
        continue;
      }
      // Viga / laje / viga de fundação: só se passa POR CIMA do percurso baixo
      // demais. `baseMm` é a face inferior da peça, relativa ao piso.
      let faltaMaxMm = 0;
      let onde: Point | null = null;
      for (const f of fatias) {
        const comum = recorteComum(f.cantos, pegada);
        if (comum.length < 3 || areaDe(comum) <= 0) continue;
        const topoDoDegrau = Math.max(...f.cotasMm);
        const livre = s.baseMm - topoDoDegrau;
        // Peça abaixo do degrau (fundação, viga do piso) não é cabeçada.
        if (s.baseMm + s.alturaMm <= topoDoDegrau) continue;
        const falta = ALTURA_LIVRE_MIN_MM - livre;
        if (falta > faltaMaxMm) {
          faltaMaxMm = falta;
          onde = centro(comum);
        }
      }
      if (faltaMaxMm <= 0 || !onde) continue;
      saida.push({
        pecaId: e.id,
        pecaUid: e.uid,
        familia: 'stair',
        outroId: s.id,
        outroUid: s.uid,
        classe: 'ESCADA_X_ALTURA_LIVRE',
        levelId: e.levelId,
        medidaMm: Math.round(faltaMaxMm),
        em: onde,
      });
    }
  }

  // ── Núcleo vertical × estrutura (E2.4) ─────────────────────────────────
  // Pilar ou viga dentro do shaft/elevador em QUALQUER pavimento atravessado.
  // A laje fica de fora: ela é furada (`furosDoNucleo`), não é conflito.
  for (const n of model.nucleos ?? []) {
    if (n.ring.length < 3) continue;
    for (const nivel of pavimentosDoNucleo(model, n)) {
      for (const s of estruturasPorNivel.get(nivel.id) ?? []) {
        if (s.kind === 'LAJE') continue;
        const pegada = pegadaEmPlanta(s);
        if (pegada.length < 3) continue;
        const comum = recorteComum(n.ring, pegada);
        if (comum.length < 3) continue;
        const areaComumMm2 = areaDe(comum);
        if (areaComumMm2 <= 0) continue;
        saida.push({
          pecaId: n.id,
          pecaUid: n.uid,
          familia: 'nucleo',
          outroId: s.id,
          outroUid: s.uid,
          classe: 'NUCLEO_X_ESTRUTURA',
          levelId: nivel.id,
          medidaMm: Math.round(Math.sqrt(areaComumMm2)),
          em: centro(comum),
        });
      }
    }
  }

  // ── Reserva de equipamento (E11.1) ─────────────────────────────────────
  saida.push(...conflitosDeReserva(model));

  // ── E7.2: PONTO e QUADRO × ESTRUTURA ────────────────────────────────────
  // O CENTRO da peça (planta e cota) dentro do prisma de um pilar/viga/laje —
  // a tomada que caiu dentro do pilar, o quadro embutido na viga. Adiado da E0.4
  // ("pontos/quadros no clash → E7.2"). A medida é quanto o centro está DENTRO
  // (distância até a face mais próxima): encostar na face não é conflito.
  const elevacaoDe = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const pecasPontuais: { id: ObjectId; uid: string; familia: 'terminal' | 'quadro'; levelId: ObjectId; at: Point; cotaMm: number }[] = [
    ...(model.terminais ?? []).map((t) => ({ id: t.id, uid: t.uid, familia: 'terminal' as const, levelId: t.levelId, at: t.at, cotaMm: t.cotaMm })),
    ...(model.quadros ?? []).map((q) => ({ id: q.id, uid: q.uid, familia: 'quadro' as const, levelId: q.levelId, at: q.at, cotaMm: q.cotaMm })),
  ];
  for (const p of pecasPontuais) {
    const z = (elevacaoDe.get(p.levelId) ?? 0) + p.cotaMm;
    for (const s of model.structures) {
      const es = (elevacaoDe.get(s.levelId) ?? 0) + s.baseMm;
      if (z <= es || z >= es + s.alturaMm) continue;
      const pegada = pegadaEmPlanta(s);
      if (pegada.length < 3 || !pointInPolygon(pegada, p.at)) continue;
      const fundo = distanciaAoContorno(pegada, p.at);
      if (fundo < 1) continue;
      saida.push({
        pecaId: p.id,
        pecaUid: p.uid,
        familia: p.familia,
        outroId: s.id,
        outroUid: s.uid,
        outroFamilia: 'structural',
        classe: 'PONTO_X_ESTRUTURA',
        levelId: p.levelId,
        medidaMm: Math.round(fundo),
        em: { x: p.at.x, y: p.at.y },
      });
    }
  }

  // ── E9.4: SPRINKLER × LUMINÁRIA (obstrução do jato) ─────────────────────
  const terminais = model.terminais ?? [];
  const ehLuminaria = (t: (typeof terminais)[number]) =>
    (t.disciplina === 'ELETRICA' && !!t.tipoEletrico && t.tipoEletrico.startsWith('ILUMINACAO')) || t.tipoHidraulico === 'LUMINARIA_EMERGENCIA';
  const luminarias = terminais.filter(ehLuminaria);
  for (const spk of terminais.filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'SPRINKLER')) {
    const zs = (elevacaoDe.get(spk.levelId) ?? 0) + spk.cotaMm;
    for (const l of luminarias) {
      if (l.levelId !== spk.levelId) continue;
      const zl = (elevacaoDe.get(l.levelId) ?? 0) + l.cotaMm;
      if (Math.abs(zs - zl) > FAIXA_DO_TETO_MM) continue;
      const d = Math.hypot(spk.at.x - l.at.x, spk.at.y - l.at.y);
      if (d >= AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM) continue;
      saida.push({
        pecaId: spk.id,
        pecaUid: spk.uid,
        familia: 'terminal',
        outroId: l.id,
        outroUid: l.uid,
        outroFamilia: 'terminal',
        classe: 'SPRINKLER_X_OBSTRUCAO',
        levelId: spk.levelId,
        // O tamanho do problema: quanto FALTA para o afastamento mínimo.
        medidaMm: Math.round(AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM - d),
        em: { x: Math.round((spk.at.x + l.at.x) / 2), y: Math.round((spk.at.y + l.at.y) / 2) },
      });
    }
  }

  // ── E9.4: HIDRANTE / MANGOTINHO / EXTINTOR × PORTA ──────────────────────
  for (const t of terminais.filter((x) => x.disciplina === 'INCENDIO' && x.tipoHidraulico && PECAS_FORA_DA_PORTA.has(x.tipoHidraulico))) {
    for (const o of model.openings) {
      if (o.kind !== 'door' && o.kind !== 'sliding' && o.kind !== 'passage') continue;
      const w = paredePorId.get(o.wallId);
      if (!w || w.levelId !== t.levelId) continue;
      if (t.cotaMm < o.sillMm || t.cotaMm > o.sillMm + o.heightMm) continue;
      const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      if (!(L > 0)) continue;
      const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      // Coordenadas da peça no referencial da parede: ao longo (s) e através (n) do eixo.
      const s = (t.at.x - w.a.x) * u.x + (t.at.y - w.a.y) * u.y;
      const n = Math.abs(-(t.at.x - w.a.x) * u.y + (t.at.y - w.a.y) * u.x);
      // A faixa: o vão ao longo do eixo; através, a espessura e o giro da folha (a largura do vão) — a de correr não gira.
      const giro = o.kind === 'door' ? o.widthMm : 0;
      const dentroAoLongo = Math.min(s - o.offsetMm, o.offsetMm + o.widthMm - s);
      const dentroAtraves = w.thicknessMm / 2 + giro - n;
      if (dentroAoLongo <= 0 || dentroAtraves <= 0) continue;
      saida.push({
        pecaId: t.id,
        pecaUid: t.uid,
        familia: 'terminal',
        outroId: o.id,
        outroUid: o.uid,
        outroFamilia: 'opening',
        classe: 'PECA_X_PORTA',
        levelId: t.levelId,
        medidaMm: Math.round(Math.min(dentroAoLongo, dentroAtraves)),
        em: { x: Math.round(t.at.x), y: Math.round(t.at.y) },
      });
    }
  }

  return saida.sort(
    (a, b) =>
      (a.pecaId < b.pecaId ? -1 : a.pecaId > b.pecaId ? 1 : 0) ||
      (a.outroId < b.outroId ? -1 : a.outroId > b.outroId ? 1 : 0),
  );
}

/** E7.2: a menor distância de `p` até as arestas do contorno, mm. */
function distanciaAoContorno(anel: readonly Point[], p: Point): number {
  let d = Infinity;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const den = dx * dx + dy * dy;
    const t = den === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den));
    d = Math.min(d, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return d;
}

/** A caixa da reserva crescida da folga em todo o contorno. */
export function contornoComFolga(c: Pick<Componente, 'at' | 'larguraMm' | 'profundidadeMm' | 'rotacaoGraus'>, folgaMm: number): Point[] {
  return contornoDoComponente({ at: c.at, larguraMm: c.larguraMm + 2 * folgaMm, profundidadeMm: c.profundidadeMm + 2 * folgaMm, rotacaoGraus: c.rotacaoGraus });
}

/** A peça é reserva de espaço de equipamento (climatização)? */
export function ehReservaDeEquipamento(c: Pick<Componente, 'familia'>): boolean {
  return c.familia === 'CLIMATIZACAO';
}

/**
 * Reserva de equipamento × estrutura, parede e componente. Só o que está no
 * MESMO pavimento; a altura entra na estrutura (viga acima da caixa não é
 * conflito) e a folga só vale para componente (parede e pilar encostados são
 * o caso normal de uma condensadora no beiral).
 */
export function conflitosDeReserva(model: BlueprintModel): ConflitoArquitetonico[] {
  const saida: ConflitoArquitetonico[] = [];
  const reservas = (model.componentes ?? []).filter(ehReservaDeEquipamento);
  if (reservas.length === 0) return saida;
  for (const r of reservas) {
    const caixa = contornoDoComponente(r);
    const folga = CATALOGO_DE_COMPONENTES[r.tipoId]?.folgaMm ?? 0;
    const caixaComFolga = folga > 0 ? contornoComFolga(r, folga) : caixa;
    const base = r.cotaMm ?? 0;
    const topo = base + r.alturaMm;
    // Estrutura: pilar sempre; viga/laje só se a faixa de altura cruza a da caixa.
    for (const s of model.structures) {
      if (s.levelId !== r.levelId || s.kind === 'LAJE') continue;
      if (FORMA_ESTRUTURAL[s.kind] !== 'PONTO' && (s.baseMm >= topo || s.baseMm + s.alturaMm <= base)) continue;
      const comum = recorteComum(caixa, pegadaEmPlanta(s));
      if (comum.length < 3) continue;
      const a = areaDe(comum);
      if (a <= 0) continue;
      saida.push({ pecaId: r.id, pecaUid: r.uid, familia: 'componente', outroId: s.id, outroUid: s.uid, outroFamilia: 'structural', classe: 'RESERVA_X_ESTRUTURA', levelId: r.levelId, medidaMm: Math.round(Math.sqrt(a)), em: centro(comum) });
    }
    // Parede: só o corpo DENTRO da caixa (encostar não é atravessar) — pelo menos 50 mm de lado em comum.
    for (const w of model.walls) {
      if (w.levelId !== r.levelId) continue;
      const comum = recorteComum(caixa, pegadaEmPlanta(w));
      if (comum.length < 3) continue;
      const lado = Math.sqrt(areaDe(comum));
      if (lado < 50) continue;
      saida.push({ pecaId: r.id, pecaUid: r.uid, familia: 'componente', outroId: w.id, outroUid: w.uid, outroFamilia: 'wall', classe: 'RESERVA_X_PAREDE', levelId: r.levelId, medidaMm: Math.round(lado), em: centro(comum) });
    }
    // Outro componente dentro da caixa + folga (na mesma faixa de altura).
    for (const o of model.componentes ?? []) {
      if (o.id === r.id || o.levelId !== r.levelId) continue;
      const baseO = o.cotaMm ?? 0;
      if (baseO >= topo || baseO + o.alturaMm <= base) continue;
      const comum = recorteComum(caixaComFolga, contornoDoComponente(o));
      if (comum.length < 3) continue;
      const a = areaDe(comum);
      if (a <= 0) continue;
      saida.push({ pecaId: r.id, pecaUid: r.uid, familia: 'componente', outroId: o.id, outroUid: o.uid, outroFamilia: 'componente', classe: 'RESERVA_X_COMPONENTE', levelId: r.levelId, medidaMm: Math.round(Math.sqrt(a)), em: centro(comum) });
    }
  }
  return saida;
}
