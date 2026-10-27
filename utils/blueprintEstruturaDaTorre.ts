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

import type { EmpreendimentoFloor, EmpreendimentoTower, EmpreendimentoUnit, FloorTipo } from '../types/empreendimento';

export type TorreParaEstrutura = Pick<EmpreendimentoTower, 'id' | 'name'> &
  Partial<Pick<EmpreendimentoTower, 'floors_count' | 'blueprint_quadra_uid' | 'sort_order' | 'pe_direito_padrao_m'>> & {
    units?: Pick<EmpreendimentoUnit, 'floor' | 'floor_tipo'>[];
  };

export interface PisoDaTorre {
  /** Andar do Empreendimento: 0 = térreo, negativo = abaixo do solo. */
  numero: number;
  nome: string;
  tipo: FloorTipo | null;
  /** Piso a piso em mm; null = nem o pavimento nem a torre dizem. */
  peDireitoMm: number | null;
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

function doCadastro(pavimentos: EmpreendimentoFloor[], padraoMm: number | null): PisoDaTorre[] {
  const out: PisoDaTorre[] = [];
  const visto = new Set<number>();
  for (const fl of [...pavimentos].sort((a, b) => a.sort_order - b.sort_order || a.floor_number - b.floor_number)) {
    const reps = Math.max(1, fl.repeat_count || 1);
    for (let r = 0; r < reps; r++) {
      const n = fl.floor_number + r;
      if (visto.has(n)) continue;
      visto.add(n);
      const base = fl.name?.trim();
      out.push({ numero: n, nome: base ? (reps > 1 ? `${base} ${r + 1}` : base) : nomeDoAndar(n, fl.tipo), tipo: fl.tipo, peDireitoMm: emMm(fl.pe_direito_m) ?? padraoMm });
    }
  }
  return out;
}

function dasUnidades(t: TorreParaEstrutura, avisos: string[], padraoMm: number | null): PisoDaTorre[] {
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
  const out: PisoDaTorre[] = [];
  for (let n = min; n <= max; n++) {
    const m = tipos.get(n);
    if (!m) avisos.push(`Torre "${t.name}": andar ${n} sem unidade — entra na torre mesmo assim.`);
    const tipo = m && m.size > 0 ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    out.push({ numero: n, nome: nomeDoAndar(n, tipo), tipo, peDireitoMm: padraoMm });
  }
  return out;
}

export function estruturaDaTorre(t: TorreParaEstrutura, pavimentos: EmpreendimentoFloor[]): EstruturaDaTorre {
  const avisos: string[] = [];
  let fonte: FonteDaEstrutura = 'NENHUMA';
  let pisos: PisoDaTorre[] = [];
  const padraoMm = emMm(t.pe_direito_padrao_m);
  if (pavimentos.length > 0) {
    fonte = 'CADASTRO';
    pisos = doCadastro(pavimentos, padraoMm);
  } else {
    pisos = dasUnidades(t, avisos, padraoMm);
    if (pisos.length > 0) fonte = 'UNIDADES';
    else if (typeof t.floors_count === 'number' && t.floors_count >= 1) {
      fonte = 'FLOORS_COUNT';
      pisos = Array.from({ length: Math.round(t.floors_count) }, (_, n) => ({ numero: n, nome: nomeDoAndar(n, null), tipo: null, peDireitoMm: padraoMm }));
    }
  }
  pisos.sort((a, b) => a.numero - b.numero);
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
