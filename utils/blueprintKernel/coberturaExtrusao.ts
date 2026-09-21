/**
 * COBERTURA POR EXTRUSÃO (20/09/2026, backlog P2 — P2.13): um PERFIL em corte
 * extrudado ao longo de um eixo em planta.
 *
 * ─── A DECISÃO ──────────────────────────────────────────────────────────────
 *
 * O Revit tem "telhado por extrusão": desenha-se o perfil de frente (duas
 * águas, shed, abóbada, dente de serra) e ele corre ao longo de um comprimento.
 * Aqui a cobertura continua sendo o que sempre foi — ÁGUAS planas (`Agua`) —
 * e a extrusão é um GERADOR: cada trecho reto do perfil vira uma água
 * retangular com o beiral no lado baixo, a inclinação do trecho e a base na
 * cota baixa. Abóbada é o arco do perfil discretizado (`arco.ts`), como a
 * parede curva. Quantitativo, IFC, 3D, painel: nada precisa saber que houve
 * extrusão. O metadado `Agua.extrusao` = {a, b} (o eixo) só agrupa as águas
 * nascidas do mesmo gesto — "selecionar a cobertura".
 *
 * ─── FACE VERTICAL NÃO É ÁGUA ───────────────────────────────────────────────
 *
 * O trecho vertical do dente de serra (o "vidro do shed") é PULADO: água de
 * inclinação infinita não existe, e fechá-lo é parede ou cortina, que o
 * usuário desenha. Trecho que volta (s decrescente) é erro de perfil.
 *
 * Sistema de coordenadas do perfil: `s` corre ATRAVÉS do eixo (0 no bordo
 * esquerdo, olhando de A para B, até o vão), `z` é a altura sobre o piso do
 * pavimento. O perfil é centrado no eixo: s = vão/2 cai sobre a linha A→B.
 */
import type { Point } from './geom';
import { roundToMm } from './units';
import { facetasDoArco } from './arco';
import { AGUA_INCLINACAO_MAX_PCT } from './telhado';

/** Um vértice do perfil em corte: `s` através do eixo, `z` altura — mm inteiros. */
export interface PontoDoPerfil {
  s: number;
  z: number;
}

export const TIPOS_DE_PERFIL_DE_COBERTURA = ['DUAS_AGUAS', 'UMA_AGUA', 'ABOBADA', 'DENTE_DE_SERRA'] as const;
export type TipoDePerfilDeCobertura = (typeof TIPOS_DE_PERFIL_DE_COBERTURA)[number];

export const ROTULO_DO_PERFIL_DE_COBERTURA: Record<TipoDePerfilDeCobertura, string> = {
  DUAS_AGUAS: 'Duas águas',
  UMA_AGUA: 'Uma água (shed)',
  ABOBADA: 'Abóbada',
  DENTE_DE_SERRA: 'Dente de serra',
};

/** Parâmetros do perfil pronto. Alturas em mm sobre o piso do pavimento. */
export interface ParametrosDoPerfil {
  tipo: TipoDePerfilDeCobertura;
  vaoMm: number;
  /** Altura do beiral (lado baixo). */
  alturaBeiralMm: number;
  /** Altura da cumeeira / do lado alto (DUAS_AGUAS, UMA_AGUA, DENTE_DE_SERRA). */
  alturaCumeeiraMm: number;
  /** Flecha da abóbada acima do beiral (ABOBADA). */
  flechaMm: number;
  /** Número de dentes (DENTE_DE_SERRA). */
  dentes: number;
}

/** O perfil de cada tipo, em mm inteiros. */
export function perfilDeCobertura(p: ParametrosDoPerfil): PontoDoPerfil[] {
  const vao = Math.max(1, Math.round(p.vaoMm));
  const hb = Math.round(p.alturaBeiralMm);
  const hc = Math.round(p.alturaCumeeiraMm);
  switch (p.tipo) {
    case 'DUAS_AGUAS':
      return [{ s: 0, z: hb }, { s: Math.round(vao / 2), z: hc }, { s: vao, z: hb }];
    case 'UMA_AGUA':
      return [{ s: 0, z: hb }, { s: vao, z: hc }];
    case 'ABOBADA': {
      // Arco de círculo pelo beiral e pela flecha, em número PAR de facetas —
      // assim o topo (a flecha pedida) é um vértice, não fica entre dois.
      const flecha = Math.max(1, Math.round(p.flechaMm));
      const meio = vao / 2;
      const R = (meio * meio + flecha * flecha) / (2 * flecha);
      const theta = Math.atan2(meio, R - flecha); // meia varredura
      let n = facetasDoArco(R, 2 * theta);
      if (n % 2 === 1) n += 1;
      const centroZ = hb + flecha - R;
      const pontos: PontoDoPerfil[] = [];
      for (let i = 0; i <= n; i++) {
        const phi = -theta + (2 * theta * i) / n;
        pontos.push({ s: i === 0 ? 0 : i === n ? vao : roundToMm(meio + R * Math.sin(phi)), z: i === 0 || i === n ? hb : roundToMm(centroZ + R * Math.cos(phi)) });
      }
      return pontos;
    }
    case 'DENTE_DE_SERRA': {
      const dentes = Math.max(1, Math.round(p.dentes));
      const passo = vao / dentes;
      const pontos: PontoDoPerfil[] = [];
      for (let i = 0; i < dentes; i++) {
        const s0 = Math.round(i * passo);
        const s1 = Math.round((i + 1) * passo);
        if (i === 0) pontos.push({ s: s0, z: hb });
        pontos.push({ s: s1, z: hc });
        if (i < dentes - 1) pontos.push({ s: s1, z: hb }); // a face vertical do dente (pulada na extrusão)
      }
      return pontos;
    }
  }
}

export interface AguaExtrudada {
  pontos: Point[];
  beiralIndex: number;
  inclinacaoPct: number;
  baseMm: number;
}

export type ErroDoPerfil = 'PERFIL_CURTO' | 'PERFIL_VOLTA' | 'PERFIL_INGREME' | 'EIXO_DEGENERADO' | 'PERFIL_SEM_AGUA';

/**
 * As águas de um perfil extrudado ao longo de A→B. Lança `Error` com a
 * mensagem do erro de perfil — o comando traduz para `KernelError`.
 */
export function aguasDaExtrusao(eixoA: Point, eixoB: Point, perfil: PontoDoPerfil[]): { aguas: AguaExtrudada[]; puladas: number } {
  const L = Math.hypot(eixoB.x - eixoA.x, eixoB.y - eixoA.y);
  if (L < 1) throw new Error('EIXO_DEGENERADO');
  if (perfil.length < 2) throw new Error('PERFIL_CURTO');
  const u = { x: (eixoB.x - eixoA.x) / L, y: (eixoB.y - eixoA.y) / L };
  // Normal à ESQUERDA de A→B: s cresce da esquerda para a direita de quem olha de A para B.
  const n = { x: u.y, y: -u.x };
  const vao = perfil[perfil.length - 1].s - perfil[0].s;
  if (vao < 0) throw new Error('PERFIL_VOLTA');
  if (vao === 0) throw new Error('PERFIL_SEM_AGUA');
  const meio = perfil[0].s + vao / 2;
  const P = (s: number, t: number): Point => ({
    x: roundToMm(eixoA.x + n.x * (s - meio) + u.x * t),
    y: roundToMm(eixoA.y + n.y * (s - meio) + u.y * t),
  });
  const aguas: AguaExtrudada[] = [];
  let puladas = 0;
  for (let i = 1; i < perfil.length; i++) {
    const p0 = perfil[i - 1];
    const p1 = perfil[i];
    const ds = p1.s - p0.s;
    if (ds < 0) throw new Error('PERFIL_VOLTA');
    if (ds === 0) {
      puladas++;
      continue;
    }
    const inclinacaoPct = Math.round((Math.abs(p1.z - p0.z) / ds) * 1000) / 10;
    if (inclinacaoPct > AGUA_INCLINACAO_MAX_PCT) throw new Error('PERFIL_INGREME');
    // Anel: lado 0 = s0→s1 em t=0; lado 1 = t 0→L em s1; lado 2 = s1→s0 em t=L; lado 3 = t L→0 em s0.
    const pontos = [P(p0.s, 0), P(p1.s, 0), P(p1.s, L), P(p0.s, L)];
    aguas.push({ pontos, beiralIndex: p0.z <= p1.z ? 3 : 1, inclinacaoPct, baseMm: Math.min(p0.z, p1.z) });
  }
  if (aguas.length === 0) throw new Error('PERFIL_SEM_AGUA');
  return { aguas, puladas };
}

export const MENSAGEM_DO_ERRO_DE_PERFIL: Record<ErroDoPerfil, string> = {
  PERFIL_CURTO: 'O perfil precisa de pelo menos dois pontos',
  PERFIL_VOLTA: 'O perfil volta sobre si mesmo (s decrescente)',
  PERFIL_INGREME: `Trecho do perfil mais íngreme que ${AGUA_INCLINACAO_MAX_PCT} % — não é água, é parede`,
  EIXO_DEGENERADO: 'O eixo da extrusão tem comprimento zero',
  PERFIL_SEM_AGUA: 'O perfil só tem trechos verticais — nenhuma água',
};

/** As águas nascidas do MESMO gesto de extrusão que esta (mesmo pavimento e eixo). */
export function aguasDaMesmaExtrusao<A extends { levelId: string; extrusao?: { a: Point; b: Point } }>(roofs: readonly A[], agua: A): A[] {
  const e = agua.extrusao;
  if (!e) return [agua];
  return roofs.filter((r) => r.levelId === agua.levelId && r.extrusao && r.extrusao.a.x === e.a.x && r.extrusao.a.y === e.a.y && r.extrusao.b.x === e.b.x && r.extrusao.b.y === e.b.y);
}
