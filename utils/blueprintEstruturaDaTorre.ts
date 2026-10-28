// utils/blueprintEstruturaDaTorre.ts
//
// A ESTRUTURA DE CADA TORRE do Empreendimento para a massa da Planta (27/10/2026): *"ao conectar com
// empreendimento deve-se trazer tudo conforme está no empreendimento da aba torres e unidades … Torre A e Torre B,
// quantidade de pavimentos, nome dos pavimentos"*. Plano: docs/planos/2026-10-27-massa-segue-torres-do-empreendimento.md.
//
// Os pavimentos de uma torre, com nome, separados em ACIMA do solo (térreo para cima) e GARAGENS (andar negativo).
// A fonte, nesta ordem: o cadastro de pavimentos (`empreendimento_floors`, repetição expandida — o mesmo critério
// do estudo declarado, `blueprintEstudoDoEmpreendimento`); senão os andares das unidades; senão `floors_count`.
// O Garden Cambuhy (27/10/2026) não tinha cadastro de pavimentos: tudo saía das unidades. Puro.
//
// Pé-direito (27/10/2026, "crie pé-direito por pavimento em empreendimento"): o do pavimento cadastrado, senão o
// padrão da torre, senão `null` — e aí quem monta a massa usa o do bloco.
//
// Elevação (27/10/2026, *"sugiro incluir elevação, assim não teremos dúvida da posição do pavimento"*; decisão: as
// duas formas): CALCULADA — a do térreo da torre (`elevacao_terreo_m`, 0 sem ela) mais os pés-direitos de baixo, e os
// subsolos para baixo — ou DIGITADA no pavimento (`elevacao_m`), que vale no lugar do cálculo e manda nos de cima. A
// digitada que não bate com o pé-direito do vizinho vira aviso, e a ALTURA do piso na massa passa a ser a distância
// entre as elevações. Plano: docs/planos/2026-10-27-elevacao-do-pavimento.md.

import { compararNaOrdemDoEmpreendimento } from './empreendimentoOrdemDasUnidades';
import type { EmpreendimentoFloor, EmpreendimentoTower, EmpreendimentoUnit, FloorTipo } from '../types/empreendimento';

export type TorreParaEstrutura = Pick<EmpreendimentoTower, 'id' | 'name'> &
  Partial<Pick<EmpreendimentoTower, 'floors_count' | 'blueprint_quadra_uid' | 'sort_order' | 'pe_direito_padrao_m' | 'elevacao_terreo_m'>> & {
    units?: (Pick<EmpreendimentoUnit, 'floor' | 'floor_tipo'> &
      Partial<Pick<EmpreendimentoUnit, 'id' | 'name' | 'typology' | 'private_area' | 'bedrooms' | 'parking_spaces' | 'sun_orientation' | 'position_type' | 'status' | 'sort_order'>>)[];
  };

export interface PisoDaTorre {
  /** Andar do Empreendimento: 0 = térreo, negativo = abaixo do solo. */
  numero: number;
  nome: string;
  tipo: FloorTipo | null;
  /** Piso a piso em mm; null = nem o pavimento nem a torre dizem. */
  peDireitoMm: number | null;
  /** A elevação do piso em mm, na referência da torre (o térreo em `elevacao_terreo_m`, 0 sem ela). */
  elevacaoMm: number;
  /** A elevação foi digitada no pavimento; senão, calculada pelos pés-direitos (3,00 m onde não há). */
  elevacaoDigitada: boolean;
  /**
   * A altura do piso na massa, em mm: a distância até o vizinho quando uma elevação digitada a define (o de cima,
   * ou o próprio subsolo); senão o pé-direito. null = nada diz — a massa usa o do bloco.
   */
  alturaMm: number | null;
  /** As unidades do Empreendimento neste andar (27/10/2026), na ordem da aba — a massa divide o andar nelas. */
  unidades: UnidadeDoPiso[];
}

/** Uma unidade do Empreendimento como a massa da Planta a identifica. */
export interface UnidadeDoPiso {
  id: string | null;
  nome: string;
  tipologia: string | null;
  areaPrivativaM2: number | null;
  dormitorios: number | null;
  vagas: number | null;
  orientacao: string | null;
  posicao: string | null;
  status: string | null;
}

type PisoSemUnidades = Omit<PisoDaTorre, 'unidades' | 'elevacaoMm' | 'elevacaoDigitada' | 'alturaMm'> & { elevacaoDigitadaMm: number | null };

/** A chave de uma unidade na Planta (o 3D e o painel combinam por ela): o id, ou o nome quando não há id. */
export function chaveDaUnidade(u: Pick<UnidadeDoPiso, 'id' | 'nome'>): string {
  return u.id ?? u.nome;
}

export type FonteDaEstrutura = 'CADASTRO' | 'UNIDADES' | 'FLOORS_COUNT' | 'NENHUMA';

export interface EstruturaDaTorre {
  torreId: string;
  nome: string;
  /** Térreo para cima, de baixo para cima. */
  acima: PisoDaTorre[];
  /** Abaixo do solo, da mais funda para a mais rasa — a ordem dos pisos de um bloco de subsolo. */
  garagens: PisoDaTorre[];
  fonte: FonteDaEstrutura;
  avisos: string[];
}

/** O nome do andar sem cadastro: o do estudo declarado ("Térreo", "Pavimento N"), e "Garagem N" na garagem. */
export function nomeDoAndar(n: number, tipo: FloorTipo | null | undefined): string {
  if (n < 0) return `${tipo === 'GARAGEM' ? 'Garagem' : 'Subsolo'} ${Math.abs(n)}`;
  if (n === 0) return 'Térreo';
  return `Pavimento ${n}`;
}

/** O nome do bloco de subsolo de uma torre — é por ele que a planta liga o subsolo à torre. */
export function nomeDaGaragem(torre: string): string {
  return `${torre} · Garagem`;
}

const emMm = (m: number | null | undefined) => (m == null || !Number.isFinite(Number(m)) ? null : Math.round(Number(m) * 1000));

/** Um andar do cadastro de pavimentos, com a linha (`floorId`) de onde veio. */
export interface AndarDoCadastro {
  numero: number;
  nome: string;
  tipo: FloorTipo;
  floorId: string;
  /** O 1º andar da linha (a elevação digitada vale para ele). */
  primeiroDaLinha: boolean;
  floor: EmpreendimentoFloor;
}

/**
 * O cadastro de pavimentos expandido em andares (a repetição vira "Tipo 1", "Tipo 2"…), de baixo para cima e sem
 * andar repetido. Fonte única da estrutura da massa e do campo "Pavimento" da Nova unidade (27/10/2026).
 */
export function andaresDoCadastro(pavimentos: readonly EmpreendimentoFloor[]): AndarDoCadastro[] {
  const out: AndarDoCadastro[] = [];
  const visto = new Set<number>();
  for (const fl of [...pavimentos].sort((a, b) => a.sort_order - b.sort_order || a.floor_number - b.floor_number)) {
    const reps = Math.max(1, fl.repeat_count || 1);
    for (let r = 0; r < reps; r++) {
      const n = fl.floor_number + r;
      if (visto.has(n)) continue;
      visto.add(n);
      const base = fl.name?.trim();
      out.push({ numero: n, nome: base ? (reps > 1 ? `${base} ${r + 1}` : base) : nomeDoAndar(n, fl.tipo), tipo: fl.tipo, floorId: fl.id, primeiroDaLinha: r === 0, floor: fl });
    }
  }
  return out.sort((a, b) => a.numero - b.numero);
}

function doCadastro(pavimentos: EmpreendimentoFloor[], padraoMm: number | null): PisoSemUnidades[] {
  return andaresDoCadastro(pavimentos).map((a) => ({
    numero: a.numero,
    nome: a.nome,
    tipo: a.tipo,
    peDireitoMm: emMm(a.floor.pe_direito_m) ?? padraoMm,
    // A digitada é a do 1º andar da linha; os repetidos seguem pelo pé-direito.
    elevacaoDigitadaMm: a.primeiroDaLinha ? emMm(a.floor.elevacao_m) : null,
  }));
}

function dasUnidades(t: TorreParaEstrutura, avisos: string[], padraoMm: number | null): PisoSemUnidades[] {
  const tipos = new Map<number, Map<FloorTipo, number>>();
  for (const u of t.units ?? []) {
    if (typeof u.floor !== 'number' || !Number.isFinite(u.floor)) continue;
    const m = tipos.get(u.floor) ?? new Map<FloorTipo, number>();
    if (u.floor_tipo) m.set(u.floor_tipo, (m.get(u.floor_tipo) ?? 0) + 1);
    tipos.set(u.floor, m);
  }
  if (tipos.size === 0) return [];
  const andares = [...tipos.keys()];
  const min = Math.min(...andares);
  const max = Math.max(...andares);
  const out: PisoSemUnidades[] = [];
  for (let n = min; n <= max; n++) {
    const m = tipos.get(n);
    if (!m) avisos.push(`Torre "${t.name}": andar ${n} sem unidade — entra na torre mesmo assim.`);
    const tipo = m && m.size > 0 ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    out.push({ numero: n, nome: nomeDoAndar(n, tipo), tipo, peDireitoMm: padraoMm, elevacaoDigitadaMm: null });
  }
  return out;
}

/** As unidades do andar, na ordem da aba (sort_order, depois o nome com número). */
function unidadesDoAndar(t: TorreParaEstrutura, andar: number): UnidadeDoPiso[] {
  return (t.units ?? [])
    .filter((u) => u.floor === andar)
    .sort(compararNaOrdemDoEmpreendimento)
    .map((u, k) => ({
      id: u.id ?? null,
      nome: u.name?.trim() || `Unidade ${k + 1}`,
      tipologia: u.typology ?? null,
      areaPrivativaM2: typeof u.private_area === 'number' && u.private_area > 0 ? u.private_area : null,
      dormitorios: u.bedrooms ?? null,
      vagas: u.parking_spaces ?? null,
      orientacao: u.sun_orientation ?? null,
      posicao: u.position_type ?? null,
      status: u.status ?? null,
    }));
}

const ALTURA_MIN_MM = 2000;
const ALTURA_MAX_MM = 15000;
/** Para CALCULAR a elevação onde nada diz o pé-direito: o padrão do bloco de massa. */
const PE_DIREITO_DO_CALCULO_MM = 3000;
const fmtElev = (mm: number) => `${mm < 0 ? '-' : '+'}${(Math.abs(mm) / 1000).toFixed(2).replace('.', ',')}`;
const fmtM = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

/**
 * Elevação e altura de cada piso (de baixo para cima). A referência é o térreo (andar 0; sem ele, o mais baixo acima
 * do solo; sem nenhum, o mais alto): a digitada dele, senão `terreoMm`. Para cima, cada piso = o de baixo + o
 * pé-direito do de baixo; para baixo, o de cima − o próprio pé-direito. A digitada vale no lugar do cálculo.
 */
function comElevacoes(torre: string, pisos: PisoSemUnidades[], terreoMm: number, avisos: string[]): Omit<PisoDaTorre, 'unidades'>[] {
  if (pisos.length === 0) return [];
  let ref = pisos.findIndex((p) => p.numero === 0);
  if (ref < 0) ref = pisos.findIndex((p) => p.numero > 0);
  if (ref < 0) ref = pisos.length - 1;
  const elev: number[] = new Array(pisos.length);
  const altura: (number | null)[] = pisos.map((p) => p.peDireitoMm);
  elev[ref] = pisos[ref].elevacaoDigitadaMm ?? terreoMm;

  /** A digitada em `i` dá ao piso `afetado` a altura `h`: dentro da faixa, vale; fora, aviso e fica o pé-direito. */
  const alturaPelaElevacao = (i: number, afetado: number, h: number) => {
    if (h >= ALTURA_MIN_MM && h <= ALTURA_MAX_MM) {
      altura[afetado] = h;
      return true;
    }
    avisos.push(
      `Torre "${torre}": ${pisos[i].nome} está em ${fmtElev(elev[i])} m (digitada) — o ${pisos[afetado].nome} ficaria com ${fmtM(h)} m de altura, fora de 2 a 15 m; a massa usa o pé-direito.`,
    );
    return false;
  };

  for (let i = ref + 1; i < pisos.length; i++) {
    const abaixo = pisos[i - 1];
    const calc = elev[i - 1] + (abaixo.peDireitoMm ?? PE_DIREITO_DO_CALCULO_MM);
    const dig = pisos[i].elevacaoDigitadaMm;
    elev[i] = dig ?? calc;
    if (dig == null || dig === calc) continue;
    // Digitada ABAIXO do de baixo: não é altura negativa, é o andar trocado (o Garden de 27/10/2026 tinha as
    // garagens nos andares 1 e 2, e o Estacionamento 1 caía logo acima do térreo).
    if (dig <= elev[i - 1]) {
      avisos.push(
        `Torre "${torre}": ${pisos[i].nome} está em ${fmtElev(dig)} m (digitada), abaixo do ${abaixo.nome} (${fmtElev(elev[i - 1])} m), mas o andar dele (${pisos[i].numero}) o põe acima — confira o Nº inicial.`,
      );
      continue;
    }
    if (!alturaPelaElevacao(i, i - 1, dig - elev[i - 1])) continue;
    if (abaixo.peDireitoMm != null) {
      avisos.push(
        `Torre "${torre}": ${pisos[i].nome} está em ${fmtElev(dig)} m (digitada), mas o ${abaixo.nome} (${fmtElev(elev[i - 1])} m, pé-direito ${fmtM(abaixo.peDireitoMm)} m) termina em ${fmtElev(calc)} m — vale a elevação digitada.`,
      );
    }
  }
  for (let i = ref - 1; i >= 0; i--) {
    const p = pisos[i];
    const calc = elev[i + 1] - (p.peDireitoMm ?? PE_DIREITO_DO_CALCULO_MM);
    const dig = p.elevacaoDigitadaMm;
    elev[i] = dig ?? calc;
    if (dig == null || dig === calc) continue;
    if (dig >= elev[i + 1]) {
      avisos.push(
        `Torre "${torre}": ${p.nome} está em ${fmtElev(dig)} m (digitada), acima do ${pisos[i + 1].nome} (${fmtElev(elev[i + 1])} m), mas o andar dele (${p.numero}) o põe abaixo — confira o Nº inicial.`,
      );
      continue;
    }
    if (!alturaPelaElevacao(i, i, elev[i + 1] - dig)) continue;
    if (p.peDireitoMm != null) {
      avisos.push(`Torre "${torre}": ${p.nome} está em ${fmtElev(dig)} m (digitada), mas com o pé-direito de ${fmtM(p.peDireitoMm)} m ficaria em ${fmtElev(calc)} m — vale a elevação digitada.`);
    }
  }
  return pisos.map(({ elevacaoDigitadaMm, ...p }, i) => ({ ...p, elevacaoMm: elev[i], elevacaoDigitada: elevacaoDigitadaMm != null, alturaMm: altura[i] }));
}

export function estruturaDaTorre(t: TorreParaEstrutura, pavimentos: EmpreendimentoFloor[]): EstruturaDaTorre {
  const avisos: string[] = [];
  let fonte: FonteDaEstrutura = 'NENHUMA';
  let semUnidades: PisoSemUnidades[] = [];
  const padraoMm = emMm(t.pe_direito_padrao_m);
  if (pavimentos.length > 0) {
    fonte = 'CADASTRO';
    semUnidades = doCadastro(pavimentos, padraoMm);
  } else {
    semUnidades = dasUnidades(t, avisos, padraoMm);
    if (semUnidades.length > 0) fonte = 'UNIDADES';
    else if (typeof t.floors_count === 'number' && t.floors_count >= 1) {
      fonte = 'FLOORS_COUNT';
      semUnidades = Array.from({ length: Math.round(t.floors_count) }, (_, n) => ({ numero: n, nome: nomeDoAndar(n, null), tipo: null, peDireitoMm: padraoMm, elevacaoDigitadaMm: null }));
    }
  }
  const pisos: PisoDaTorre[] = comElevacoes(t.name, semUnidades.sort((a, b) => a.numero - b.numero), emMm(t.elevacao_terreo_m) ?? 0, avisos).map((p) => ({
    ...p,
    unidades: unidadesDoAndar(t, p.numero),
  }));
  const acima = pisos.filter((p) => p.numero >= 0);
  const garagens = pisos.filter((p) => p.numero < 0);

  if (fonte === 'NENHUMA') avisos.push(`Torre "${t.name}": sem pavimentos — cadastre os pavimentos ou as unidades em Torres e Unidades.`);
  const pelo = fonte === 'CADASTRO' ? 'pelo cadastro de pavimentos' : 'pelas unidades';
  const dizem = fonte === 'CADASTRO' ? 'o cadastro de pavimentos diz' : 'as unidades dizem';
  const resumo = `${acima.length} acima do solo${garagens.length ? ` + ${garagens.length} abaixo` : ''}`;
  if (fonte === 'CADASTRO' || fonte === 'UNIDADES') {
    if (t.floors_count == null) avisos.push(`Torre "${t.name}": sem número de pavimentos no cadastro da torre — contados ${pelo} (${resumo}).`);
    else if (t.floors_count !== acima.length && t.floors_count !== pisos.length) {
      avisos.push(`Torre "${t.name}": o cadastro da torre diz ${t.floors_count} pavimentos e ${dizem} ${resumo} — vale o que ${dizem}.`);
    }
  }
  if (fonte === 'CADASTRO') {
    // O andar do cadastro (27/10/2026): garagem com andar positivo e andares que não casam com os das unidades (o
    // Garden tinha 100/200/300 — o número da unidade, não o do andar) desalinham tudo o que é por andar.
    for (const p of pisos) {
      if ((p.tipo === 'GARAGEM' || p.tipo === 'SUBSOLO') && p.numero >= 0) {
        avisos.push(
          `Torre "${t.name}": ${p.nome} é ${p.tipo === 'GARAGEM' ? 'garagem' : 'subsolo'}, mas está no andar ${p.numero} — garagem e subsolo ficam abaixo do térreo, com andar negativo (-1, -2…).`,
        );
      }
    }
    const dasUnidades = [...new Set((t.units ?? []).map((u) => u.floor).filter((n): n is number => typeof n === 'number' && Number.isFinite(n)))].sort((a, b) => a - b);
    if (dasUnidades.length > 0) {
      const doCadastro = new Set(pisos.map((p) => p.numero));
      const faltam = dasUnidades.filter((n) => !doCadastro.has(n));
      const sobram = pisos.map((p) => p.numero).filter((n) => !dasUnidades.includes(n));
      // Só quando há andar de unidade sem pavimento: andar sem unidade (cobertura, técnico) é normal.
      if (faltam.length > 0 && sobram.length > 0) {
        avisos.push(
          `Torre "${t.name}": as unidades estão nos andares ${dasUnidades.join(', ')}, mas o cadastro de pavimentos não tem ${faltam.join(', ')} e tem ${sobram.join(', ')} — o andar é o número do pavimento (1, 2, 3…), não o da unidade (101).`,
        );
      }
    }
  }
  for (const u of t.units ?? []) {
    if (u.floor_tipo === 'TERREO' && typeof u.floor === 'number' && u.floor !== 0) {
      avisos.push(`Torre "${t.name}": o andar ${u.floor} está marcado como Térreo nas unidades — o térreo é o andar 0.`);
      break;
    }
  }
  return { torreId: t.id, nome: t.name, acima, garagens, fonte, avisos };
}

/**
 * As torres que são edifício, na ordem da aba: as quadras do loteamento ficam fora (o mesmo corte de
 * `massaDoEmpreendimento`). As que nasceram da massa (`blueprint_bloco_uid`) ENTRAM: o nome delas já é o do bloco.
 */
export function estruturasDoEmpreendimento(torres: TorreParaEstrutura[], pavimentosPorTorre: ReadonlyMap<string, EmpreendimentoFloor[]>): EstruturaDaTorre[] {
  return torres
    .filter((t) => !t.blueprint_quadra_uid)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
    .map((t) => estruturaDaTorre(t, pavimentosPorTorre.get(t.id) ?? []));
}
