/**
 * PEÇAS-ÂNCORA da casa (casa automática F6, 15/10/2026 — plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * As peças que os lançamentos automáticos de instalações EXIGEM no desenho e que até aqui eram postas à mão:
 *  - a CAIXA D'ÁGUA (`RESERVATORIO` superior): sem ela, `planejarAguaCompleta` para em "Sem origem de água no
 *    desenho". Volume pela reservação do estudo (`dimensionarReservacao`, NBR 5626 — população dos
 *    dormitórios × per capita × dias), sobre o banheiro (ou a área de serviço), acima da laje;
 *  - o AQUECEDOR de passagem (dois terminais no mesmo ponto — o consumo na água FRIA e a origem da rede QUENTE,
 *    a convenção da fixture `sobradoHidro`), na parede EXTERNA da área de serviço (o aquecedor a gás pede
 *    ventilação). No padrão R1-B a água quente é o CHUVEIRO ELÉTRICO: sem aquecedor, e a elétrica (F9) põe a TUE;
 *  - a CAIXA DE GORDURA: o esgoto liga a pia a ela quando existe e, sem ela, só avisa ("pia de cozinha sem caixa
 *    de gordura — ligada direto à caixa de inspeção"). Fica do lado de FORA da parede externa da cozinha;
 *  - as VAGAS: dentro da garagem (coberta) ou no recuo de frente (descobertas), o comprimento da rua para dentro.
 *
 * O destino do esgoto (rede pública × tratamento) NÃO é daqui: `HipotesesDeEsgoto.destino` já existe
 * (`dee77095`, 14/10/2026) e o `planejarEsgotoCompleto` lança tanque/filtro/sumidouro sozinho (F8).
 *
 * Tudo nasce `sugerida` — mover confirma, como os outros automáticos. Puro: lê o modelo, devolve comandos.
 */
import { pointInPolygon, polygonArea, type BlueprintModel, type Command, type ObjectId, type Point, type Space } from './blueprintKernel';
import { DIMENSAO_DA_VAGA } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { dimensionarReservacao, HIPOTESES_RESERVATORIO_PADRAO, type HipotesesDeReservatorio } from './blueprintReservacao';
import { usoDoNome, type PadraoDaCasa, type UsoDoAmbiente } from './blueprintPrograma';
import type { Retangulo } from './blueprintGerador';

export type AguaQuenteDaCasa = 'PELO_PADRAO' | 'AQUECEDOR_PASSAGEM' | 'CHUVEIRO_ELETRICO' | 'NENHUM';

export interface HipotesesDasAncoras {
  lancar: boolean;
  /** `PELO_PADRAO`: R1-B → chuveiro elétrico; R1-N e R1-A → aquecedor de passagem. */
  aguaQuente: AguaQuenteDaCasa;
  /** Onde a caixa d'água fica (a projeção dela cai no centro do ambiente; o mais perto do meio da casa). */
  caixaDaguaSobre: 'BANHEIRO' | 'AREA_DE_SERVICO' | 'COZINHA';
  /** Quanto o fundo da caixa fica acima do topo da laje, mm (base/estrado). */
  caixaAcimaDaLajeMm: number;
  /** Cota do aquecedor sobre o piso, mm. */
  cotaDoAquecedorMm: number;
  /** Quanto o aquecedor se afasta da face interna da parede externa, mm. */
  aquecedorDaFaceMm: number;
  caixaDeGordura: boolean;
  /** Distância do centro da caixa de gordura à face EXTERNA da parede da cozinha, mm. */
  caixaDeGorduraDaFaceMm: number;
}

export const HIPOTESES_DAS_ANCORAS_PADRAO: HipotesesDasAncoras = {
  lancar: true,
  aguaQuente: 'PELO_PADRAO',
  caixaDaguaSobre: 'BANHEIRO',
  caixaAcimaDaLajeMm: 300,
  cotaDoAquecedorMm: 1600,
  aquecedorDaFaceMm: 150,
  caixaDeGordura: true,
  caixaDeGorduraDaFaceMm: 600,
};

export interface ContextoDasAncoras {
  levelId: ObjectId;
  padrao: PadraoDaCasa;
  /** Topo da laje (ou da parede, sem laje) sobre o piso, mm. */
  topoMm: number;
  espessuraExternaMm: number;
  vagas: number;
  garagemCoberta: boolean;
  /** O quadro da frente e o retângulo da casa nele (as vagas descobertas vão no recuo de frente). */
  quadro: { ex: Point; ey: Point };
  retanguloLocal: Retangulo;
  /** O anel do lote (a caixa de gordura e as vagas descobertas têm de cair dentro). */
  anelDoLote: Point[] | null;
  reservatorio?: HipotesesDeReservatorio;
}

export interface ResultadoDasAncoras {
  comandos: Command[];
  resumo: { caixaDaguaL: number | null; aquecedor: boolean; chuveiroEletrico: boolean; caixaDeGordura: boolean; vagas: number };
  notas: string[];
  /** O que não foi posto, e por quê — vira pendência no plano da casa. */
  pendencias: string[];
}

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const centroide = (ring: Point[]): Point => {
  const a = polygonArea(ring);
  if (Math.abs(a) < 1) return { x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length };
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
};
const inteiro = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/**
 * O lado do ambiente que dá para FORA da casa (nenhum outro ambiente do pavimento do outro lado), o mais
 * longo; com a normal EXTERNA unitária. `null` = ambiente interno.
 */
function ladoExterno(s: Space, espacos: readonly Space[], sonda: number): { a: Point; b: Point; n: Point; comprimento: number } | null {
  const c = centroide(s.ring);
  const lados: { a: Point; b: Point; n: Point; comprimento: number }[] = [];
  for (let i = 0; i < s.ring.length; i++) {
    const a = s.ring[i];
    const b = s.ring[(i + 1) % s.ring.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 600) continue;
    let n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((c.x - meio.x) * n.x + (c.y - meio.y) * n.y > 0) n = { x: -n.x, y: -n.y };
    const fora = { x: meio.x + n.x * sonda, y: meio.y + n.y * sonda };
    if (espacos.some((o) => o.id !== s.id && pointInPolygon(o.ring, fora))) continue;
    lados.push({ a, b, n, comprimento: L });
  }
  return lados.sort((p, q) => q.comprimento - p.comprimento)[0] ?? null;
}

export function comandosDasAncoras(model: BlueprintModel, cx: ContextoDasAncoras, hip: HipotesesDasAncoras = HIPOTESES_DAS_ANCORAS_PADRAO): ResultadoDasAncoras {
  const comandos: Command[] = [];
  const notas: string[] = [];
  const pendencias: string[] = [];
  const resumo: ResultadoDasAncoras['resumo'] = { caixaDaguaL: null, aquecedor: false, chuveiroEletrico: false, caixaDeGordura: false, vagas: 0 };
  const espacos = model.spaces.filter((s) => s.levelId === cx.levelId && s.ring.length >= 3);
  const doUso = (uso: UsoDoAmbiente) => espacos.filter((s) => usoDoNome(s.name) === uso);
  const meioDaCasa = centroide(espacos.flatMap((s) => s.ring));
  const maisPerto = (xs: Space[]) => [...xs].sort((p, q) => Math.hypot(centroide(p.ring).x - meioDaCasa.x, centroide(p.ring).y - meioDaCasa.y) - Math.hypot(centroide(q.ring).x - meioDaCasa.x, centroide(q.ring).y - meioDaCasa.y))[0] ?? null;
  const tem = (t: string) => (model.terminais ?? []).some((x) => x.levelId === cx.levelId && x.tipoHidraulico === t);
  const sonda = cx.espessuraExternaMm + 300;

  // ── Caixa d'água ────────────────────────────────────────────────────────
  if (tem('RESERVATORIO')) notas.push("Caixa d'água já desenhada — mantida.");
  else {
    const ordem: UsoDoAmbiente[] = [hip.caixaDaguaSobre, 'BANHEIRO', 'AREA_DE_SERVICO', 'COZINHA'];
    const alvo = ordem.map((u) => maisPerto(doUso(u))).find(Boolean) ?? null;
    if (!alvo) pendencias.push("Caixa d'água: nenhum banheiro, serviço ou cozinha nomeado para pôr a caixa em cima.");
    else {
      const reserva = dimensionarReservacao(model, cx.reservatorio ?? HIPOTESES_RESERVATORIO_PADRAO);
      const volumeL = reserva.volumeSugeridoL;
      comandos.push({
        type: 'AddTerminal', levelId: cx.levelId, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: inteiro(centroide(alvo.ring)),
        cotaMm: Math.round(cx.topoMm + hip.caixaAcimaDaLajeMm), tipoHidraulico: 'RESERVATORIO', papelReservatorio: 'SUPERIOR', volumeL, sugerida: true,
      });
      resumo.caixaDaguaL = volumeL;
      notas.push(`Caixa d'água de ${volumeL.toLocaleString('pt-BR')} L sobre ${alvo.name}, a ${f2((cx.topoMm + hip.caixaAcimaDaLajeMm) / 1000)} m do piso.`);
    }
  }

  // ── Água quente ─────────────────────────────────────────────────────────
  const aguaQuente = hip.aguaQuente === 'PELO_PADRAO' ? (cx.padrao === 'R1-B' ? 'CHUVEIRO_ELETRICO' : 'AQUECEDOR_PASSAGEM') : hip.aguaQuente;
  if (aguaQuente === 'CHUVEIRO_ELETRICO') {
    resumo.chuveiroEletrico = true;
    notas.push('Água quente por chuveiro elétrico: sem aquecedor; a tomada do chuveiro (TUE) entra na elétrica.');
  } else if (aguaQuente === 'AQUECEDOR_PASSAGEM') {
    if (tem('AQUECEDOR')) notas.push('Aquecedor já desenhado — mantido.');
    else {
      // Na parede externa da área de serviço; sem ela, na da cozinha (dito, para conferir a ventilação).
      const candidatos = [maisPerto(doUso('AREA_DE_SERVICO')), maisPerto(doUso('COZINHA'))].filter((x): x is Space => !!x);
      const comLado = candidatos.map((sp) => ({ sp, lado: ladoExterno(sp, espacos, sonda) })).find((x) => x.lado);
      const serv = comLado?.sp ?? null;
      const lado = comLado?.lado ?? null;
      if (!serv || !lado) pendencias.push(`Aquecedor: ${candidatos.length ? `${candidatos.map((x) => x.name).join(' e ')} sem parede externa` : 'sem área de serviço nem cozinha'} — o aquecedor a gás pede ventilação; ponha à mão.`);
      else {
        if (serv !== candidatos[0]) pendencias.push(`Aquecedor na ${serv.name}: ${candidatos[0].name} não tem parede externa — confira a ventilação permanente (NBR 13103).`);
        const meio = { x: (lado.a.x + lado.b.x) / 2, y: (lado.a.y + lado.b.y) / 2 };
        const recuo = cx.espessuraExternaMm / 2 + hip.aquecedorDaFaceMm;
        const at = inteiro({ x: meio.x - lado.n.x * recuo, y: meio.y - lado.n.y * recuo });
        for (const disciplina of ['AGUA_FRIA', 'AGUA_QUENTE'] as const) {
          comandos.push({ type: 'AddTerminal', levelId: cx.levelId, disciplina, tipo: 'Aquecedor', at, cotaMm: hip.cotaDoAquecedorMm, tipoHidraulico: 'AQUECEDOR', sugerida: true });
        }
        resumo.aquecedor = true;
        notas.push(`Aquecedor de passagem na parede externa de ${serv.name}.`);
      }
    }
  }

  // ── Caixa de gordura ────────────────────────────────────────────────────
  if (hip.caixaDeGordura) {
    if (tem('CAIXA_GORDURA')) notas.push('Caixa de gordura já desenhada — mantida.');
    else {
      const coz = maisPerto(doUso('COZINHA'));
      // Na parede externa da cozinha; sem ela, do lado de fora da parede externa MAIS PERTO da cozinha (o tubo da
      // pia atravessa o vizinho) — dito na nota.
      let lado = coz ? ladoExterno(coz, espacos, sonda) : null;
      let deOutro: Space | null = null;
      if (coz && !lado) {
        const cc = centroide(coz.ring);
        const candidatos = espacos
          .filter((x) => x.id !== coz.id)
          .map((x) => ({ x, lado: ladoExterno(x, espacos, sonda) }))
          .filter((c): c is { x: Space; lado: NonNullable<ReturnType<typeof ladoExterno>> } => !!c.lado)
          .sort((p, q) => Math.hypot((p.lado.a.x + p.lado.b.x) / 2 - cc.x, (p.lado.a.y + p.lado.b.y) / 2 - cc.y) - Math.hypot((q.lado.a.x + q.lado.b.x) / 2 - cc.x, (q.lado.a.y + q.lado.b.y) / 2 - cc.y));
        if (candidatos[0]) {
          lado = candidatos[0].lado;
          deOutro = candidatos[0].x;
        }
      }
      if (!coz) pendencias.push('Caixa de gordura: a casa não tem cozinha nomeada.');
      else if (!lado) pendencias.push(`Caixa de gordura: ${coz.name} não tem parede externa — ponha a caixa à mão, do lado de fora mais perto.`);
      else {
        const meio = { x: (lado.a.x + lado.b.x) / 2, y: (lado.a.y + lado.b.y) / 2 };
        const afasta = cx.espessuraExternaMm / 2 + hip.caixaDeGorduraDaFaceMm;
        const at = inteiro({ x: meio.x + lado.n.x * afasta, y: meio.y + lado.n.y * afasta });
        if (cx.anelDoLote && !pointInPolygon(cx.anelDoLote, at)) pendencias.push(`Caixa de gordura: o lado de fora de ${coz.name} já é fora do lote — ponha à mão.`);
        else {
          const ficha = FICHA_DO_PONTO_HIDRAULICO.CAIXA_GORDURA;
          comandos.push({ type: 'AddTerminal', levelId: cx.levelId, disciplina: 'ESGOTO', tipo: ficha.rotulo, at, cotaMm: ficha.cotaMm.ESGOTO ?? -400, tipoHidraulico: 'CAIXA_GORDURA', sugerida: true });
          resumo.caixaDeGordura = true;
          notas.push(deOutro ? `Caixa de gordura do lado de fora de ${deOutro.name} (${coz.name} não tem parede externa).` : `Caixa de gordura do lado de fora de ${coz.name}.`);
        }
      }
    }
  }

  // ── Vagas ───────────────────────────────────────────────────────────────
  const jaTem = (model.vagas ?? []).filter((v) => v.levelId === cx.levelId).length;
  const faltam = Math.max(0, cx.vagas - jaTem);
  if (faltam > 0) {
    const { larguraMm, comprimentoMm } = DIMENSAO_DA_VAGA.COMUM;
    const q = cx.quadro;
    const paraLocal = (p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ex.y, y: p.x * q.ey.x + p.y * q.ey.y });
    const paraMundo = (p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ey.x, y: p.x * q.ex.y + p.y * q.ey.y });
    // Comprimento da rua para dentro: a vaga gira com o quadro da frente.
    const rotacaoGraus = Math.round(((Math.atan2(q.ex.y, q.ex.x) * 180) / Math.PI) * 100) / 100;
    let caixa: { x0: number; y0: number; x1: number; y1: number } | null = null;
    let onde = '';
    if (cx.garagemCoberta) {
      const gar = maisPerto(doUso('GARAGEM'));
      if (gar) {
        const loc = gar.ring.map(paraLocal);
        const e = cx.espessuraExternaMm / 2;
        caixa = { x0: Math.min(...loc.map((p) => p.x)) + e, x1: Math.max(...loc.map((p) => p.x)) - e, y0: Math.min(...loc.map((p) => p.y)) + e, y1: Math.max(...loc.map((p) => p.y)) - e };
        onde = gar.name ?? 'garagem';
      } else pendencias.push('Vagas: a casa não tem garagem nomeada.');
    } else {
      // Recuo de frente: entre a frente do lote e a casa, na largura da casa.
      const loteLocal = cx.anelDoLote?.map(paraLocal) ?? null;
      const yFrente = loteLocal ? Math.min(...loteLocal.map((p) => p.y)) : cx.retanguloLocal.y0 - comprimentoMm;
      caixa = { x0: cx.retanguloLocal.x0, x1: cx.retanguloLocal.x1, y0: yFrente, y1: cx.retanguloLocal.y0 - cx.espessuraExternaMm / 2 };
      onde = 'o recuo de frente';
    }
    if (caixa) {
      // Em GRADE, sempre com o comprimento da RUA PARA DENTRO — lado a lado e em fila. (Deitada, paralela à rua,
      // cabia num recuo de 2,90 m, mas o carro entra da rua: não é vaga.)
      const W = caixa.x1 - caixa.x0;
      const D = caixa.y1 - caixa.y0;
      const colunas = Math.floor(W / larguraMm);
      const linhas = Math.floor(D / comprimentoMm);
      const n = Math.min(faltam, colunas * linhas);
      for (let k = 0; k < n; k++) {
        const col = k % Math.max(1, colunas);
        const lin = Math.floor(k / Math.max(1, colunas));
        const centro = { x: caixa.x0 + larguraMm / 2 + col * larguraMm, y: caixa.y0 + comprimentoMm / 2 + lin * comprimentoMm };
        comandos.push({ type: 'AddVaga', levelId: cx.levelId, at: inteiro(paraMundo(centro)), tipo: 'COMUM', rotacaoGraus, sugerida: true });
      }
      resumo.vagas = n;
      if (n) notas.push(`${n} vaga(s) de ${f2(larguraMm / 1000)} × ${f2(comprimentoMm / 1000)} m em ${onde}.`);
      if (n < faltam)
        pendencias.push(
          `Vagas: ${faltam - n} de ${faltam} não couberam em ${onde} (${f2((caixa.x1 - caixa.x0) / 1000)} × ${f2((caixa.y1 - caixa.y0) / 1000)} m livres; a vaga é ${f2(larguraMm / 1000)} × ${f2(comprimentoMm / 1000)} m).`,
        );
    }
  }

  return { comandos, resumo, notas, pendencias };
}
