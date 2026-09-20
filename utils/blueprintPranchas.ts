/**
 * PRANCHAS (20/09/2026, roadmap E8.3) — a parte PURA: o TEMPLATE DE PRANCHA da
 * organização (formato, escalas, carimbo com campos), o PLANO DO CONJUNTO
 * (índice + planta por pavimento + cortes + elevações + ampliações + tabelas,
 * numeradas), o recorte do modelo por pavimento e a AMPLIAÇÃO (callout: um
 * retângulo do modelo a escala maior).
 *
 * ─── O QUE É DERIVADO E O QUE É DECLARADO ───────────────────────────────────
 *
 * O conjunto é DERIVADO do modelo publicado + template: um pavimento a mais é
 * uma prancha a mais, um corte novo é uma folha nova, um banheiro nomeado vira
 * ampliação. Nada disto entra no payload — prancha é saída, não desenho. O
 * template é da ORGANIZAÇÃO (JSONB sanitizado em `templateDePranchaDaColuna`),
 * como o template de vista (E8.2) e o tipo de parede.
 */
import type { BlueprintModel, ObjectId, Point, TipoDeAmbiente } from './blueprintKernel';
import { ESCALAS, PAPEIS, type Papel } from './blueprintExport';

export type PapelId = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';

export interface CampoDoCarimbo {
  rotulo: string;
  valor: string;
}
export interface CarimboDoTemplate {
  empresa: string;
  responsavel: string;
  /** CAU/CREA. */
  registro: string;
  cliente: string;
  endereco: string;
  /** Prefixo da numeração: "A" → A-01, A-02… */
  prefixo: string;
  /** Campos livres, na ordem (ex.: "Fase: Executivo"). Máximo 6. */
  camposExtras: CampoDoCarimbo[];
}
export interface InclusaoNoConjunto {
  indice: boolean;
  plantas: boolean;
  cortes: boolean;
  elevacoes: boolean;
  ampliacoes: boolean;
  tabelas: boolean;
  eletrica: boolean;
}
export interface TemplateDePrancha {
  papel: PapelId;
  paisagem: boolean;
  denominadorPlanta: number;
  denominadorCortes: number;
  /** A escala da AMPLIAÇÃO (callout) dos ambientes molhados. */
  denominadorAmpliacao: number;
  cotas: boolean;
  carimbo: CarimboDoTemplate;
  incluir: InclusaoNoConjunto;
}

export const TEMPLATE_DE_PRANCHA_PADRAO: TemplateDePrancha = {
  papel: 'A1',
  paisagem: true,
  denominadorPlanta: 50,
  denominadorCortes: 50,
  denominadorAmpliacao: 25,
  cotas: true,
  carimbo: { empresa: '', responsavel: '', registro: '', cliente: '', endereco: '', prefixo: 'A', camposExtras: [] },
  incluir: { indice: true, plantas: true, cortes: true, elevacoes: true, ampliacoes: true, tabelas: true, eletrica: false },
};

export interface TemplateDePranchaSalvo {
  id: string;
  organizationId: string;
  nome: string;
  template: TemplateDePrancha;
  active: boolean;
  deFabrica?: boolean;
}

export const TEMPLATES_DE_PRANCHA_DE_FABRICA: readonly TemplateDePranchaSalvo[] = [
  { id: 'fab:a1-50', organizationId: '', nome: 'A1 · 1:50 (padrão)', template: TEMPLATE_DE_PRANCHA_PADRAO, active: true, deFabrica: true },
  { id: 'fab:a3-100', organizationId: '', nome: 'A3 · 1:100 (estudo)', template: { ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A3', denominadorPlanta: 100, denominadorCortes: 100, denominadorAmpliacao: 50, cotas: false, incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, ampliacoes: false, tabelas: false } }, active: true, deFabrica: true },
  { id: 'fab:a0-50-exec', organizationId: '', nome: 'A0 · 1:50 (executivo + elétrica)', template: { ...TEMPLATE_DE_PRANCHA_PADRAO, papel: 'A0', incluir: { ...TEMPLATE_DE_PRANCHA_PADRAO.incluir, eletrica: true } }, active: true, deFabrica: true },
];

const bool = (v: unknown, p: boolean) => (typeof v === 'boolean' ? v : p);
const texto = (v: unknown, p: string, max = 120) => (typeof v === 'string' ? v.slice(0, max) : p);
const escala = (v: unknown, p: number) => (typeof v === 'number' && ESCALAS.includes(v) ? v : p);

/** Sanitiza o JSONB: chave estranha cai, ausente ganha o padrão, escala fora da lista volta ao padrão. */
export function templateDePranchaDaColuna(raw: unknown): TemplateDePrancha {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const c = (o.carimbo && typeof o.carimbo === 'object' ? o.carimbo : {}) as Record<string, unknown>;
  const i = (o.incluir && typeof o.incluir === 'object' ? o.incluir : {}) as Record<string, unknown>;
  const P = TEMPLATE_DE_PRANCHA_PADRAO;
  const extras = Array.isArray(c.camposExtras)
    ? c.camposExtras
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => ({ rotulo: texto(x.rotulo, '', 40), valor: texto(x.valor, '', 80) }))
        .filter((x) => x.rotulo)
        .slice(0, 6)
    : [];
  return {
    papel: (['A4', 'A3', 'A2', 'A1', 'A0'] as PapelId[]).includes(o.papel as PapelId) ? (o.papel as PapelId) : P.papel,
    paisagem: bool(o.paisagem, P.paisagem),
    denominadorPlanta: escala(o.denominadorPlanta, P.denominadorPlanta),
    denominadorCortes: escala(o.denominadorCortes, P.denominadorCortes),
    denominadorAmpliacao: escala(o.denominadorAmpliacao, P.denominadorAmpliacao),
    cotas: bool(o.cotas, P.cotas),
    carimbo: {
      empresa: texto(c.empresa, ''),
      responsavel: texto(c.responsavel, ''),
      registro: texto(c.registro, '', 40),
      cliente: texto(c.cliente, ''),
      endereco: texto(c.endereco, '', 160),
      prefixo: texto(c.prefixo, 'A', 4).trim() || 'A',
      camposExtras: extras,
    },
    incluir: Object.fromEntries((Object.keys(P.incluir) as (keyof InclusaoNoConjunto)[]).map((k) => [k, bool(i[k], P.incluir[k])])) as unknown as InclusaoNoConjunto,
  };
}

export function papelDoTemplate(t: TemplateDePrancha): Papel {
  const base = PAPEIS.find((p) => p.id === t.papel) ?? PAPEIS[3];
  // Os PAPEIS são retrato; paisagem troca os lados.
  return t.paisagem ? { id: base.id, larguraMm: base.alturaMm, alturaMm: base.larguraMm } : base;
}

export interface Recorte {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type TipoDePrancha = 'INDICE' | 'PLANTA' | 'ELETRICA' | 'QUADRO_DE_CARGAS' | 'UNIFILAR' | 'CORTE' | 'ELEVACAO' | 'AMPLIACAO' | 'TABELAS';

export interface PranchaPlanejada {
  /** "A-01". */
  numero: string;
  tipo: TipoDePrancha;
  titulo: string;
  denominador: number;
  levelId?: ObjectId;
  corteId?: ObjectId;
  direcao?: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA';
  /** Só na AMPLIAÇÃO: o retângulo do modelo, em mm. */
  recorte?: Recorte;
  /** Só na AMPLIAÇÃO: o ambiente ampliado. */
  spaceId?: ObjectId;
}

const TIPOS_QUE_AMPLIAM: TipoDeAmbiente[] = ['BANHEIRO', 'COZINHA_SERVICO'];
const FOLGA_DA_AMPLIACAO_MM = 600;

function bboxDoAnel(anel: readonly Point[], folga: number): Recorte {
  const xs = anel.map((p) => p.x);
  const ys = anel.map((p) => p.y);
  return { minX: Math.min(...xs) - folga, minY: Math.min(...ys) - folga, maxX: Math.max(...xs) + folga, maxY: Math.max(...ys) + folga };
}

/**
 * O CONJUNTO derivado do modelo + template: índice, planta por pavimento
 * (numeradas de baixo para cima), planta elétrica por pavimento (opcional),
 * cortes na ordem do modelo, as quatro elevações, ampliações dos ambientes
 * molhados (tipo BANHEIRO / COZINHA_SERVICO, com folga de 60 cm) e as tabelas.
 */
export function planejarConjunto(model: BlueprintModel, t: TemplateDePrancha): PranchaPlanejada[] {
  const out: PranchaPlanejada[] = [];
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const numerar = (p: Omit<PranchaPlanejada, 'numero'>) => {
    out.push({ ...p, numero: `${t.carimbo.prefixo}-${String(out.length + 1).padStart(2, '0')}` });
  };
  if (t.incluir.indice) numerar({ tipo: 'INDICE', titulo: 'Índice de pranchas', denominador: 0 });
  if (t.incluir.plantas) {
    for (const n of niveis) {
      if (!model.walls.some((w) => w.levelId === n.id)) continue;
      numerar({ tipo: 'PLANTA', titulo: `Planta — ${n.name}`, denominador: t.denominadorPlanta, levelId: n.id });
    }
  }
  if (t.incluir.eletrica) {
    let alguma = false;
    for (const n of niveis) {
      if (!(model.terminais ?? []).some((x) => x.levelId === n.id) && !(model.quadros ?? []).some((q) => q.levelId === n.id)) continue;
      numerar({ tipo: 'ELETRICA', titulo: `Elétrica — ${n.name}`, denominador: t.denominadorPlanta, levelId: n.id });
      alguma = true;
    }
    // O quadro de cargas e o unifilar são do DESENHO inteiro: uma folha cada, depois das plantas elétricas.
    if (alguma && (model.circuitos ?? []).length > 0) {
      numerar({ tipo: 'QUADRO_DE_CARGAS', titulo: 'Quadro de cargas', denominador: 0 });
      numerar({ tipo: 'UNIFILAR', titulo: 'Diagrama unifilar', denominador: 0 });
    }
  }
  if (t.incluir.cortes) {
    for (const c of model.sections ?? []) numerar({ tipo: 'CORTE', titulo: `Corte ${c.rotulo}`, denominador: t.denominadorCortes, corteId: c.id });
  }
  if (t.incluir.elevacoes && model.walls.length > 0) {
    const nomes: Record<NonNullable<PranchaPlanejada['direcao']>, string> = { FRENTE: 'Fachada frontal', FUNDOS: 'Fachada de fundos', LATERAL_ESQUERDA: 'Fachada lateral esquerda', LATERAL_DIREITA: 'Fachada lateral direita' };
    for (const d of ['FRENTE', 'FUNDOS', 'LATERAL_ESQUERDA', 'LATERAL_DIREITA'] as const) numerar({ tipo: 'ELEVACAO', titulo: nomes[d], denominador: t.denominadorCortes, direcao: d });
  }
  if (t.incluir.ampliacoes) {
    const etiquetaDe = (uid?: string) => (uid ? (model.labels ?? []).find((l) => l.uid === uid) : undefined);
    for (const n of niveis) {
      for (const s of model.spaces.filter((x) => x.levelId === n.id)) {
        const tipo = etiquetaDe(s.labelUid)?.tipoDeAmbiente ?? null;
        if (!tipo || !TIPOS_QUE_AMPLIAM.includes(tipo)) continue;
        numerar({ tipo: 'AMPLIACAO', titulo: `Ampliação — ${s.name ?? 'Ambiente'} (${n.name})`, denominador: t.denominadorAmpliacao, levelId: n.id, spaceId: s.id, recorte: bboxDoAnel(s.ring, FOLGA_DA_AMPLIACAO_MM) });
      }
    }
  }
  if (t.incluir.tabelas && model.spaces.length > 0) numerar({ tipo: 'TABELAS', titulo: 'Quadro de áreas e de esquadrias', denominador: 0 });
  return out;
}

export function rotuloDaEscala(denominador: number): string {
  return denominador > 0 ? `1:${denominador}` : '—';
}

/**
 * O MODELO SÓ DESTE PAVIMENTO — para a planta por pavimento sair sem as
 * paredes do andar de cima por cima. Cópia rasa com as listas filtradas;
 * `levels`, `boundaries` e `sections` ficam inteiros (a divisa e o corte
 * atravessam pavimentos). É desenho, não modelo válido para o kernel.
 */
export function modeloDoPavimento(model: BlueprintModel, levelId: ObjectId): BlueprintModel {
  const paredes = model.walls.filter((w) => w.levelId === levelId);
  const idsDeParede = new Set(paredes.map((w) => w.id));
  const doNivel = <T extends { levelId: ObjectId }>(lista: T[] | undefined): T[] => (lista ?? []).filter((x) => x.levelId === levelId);
  return {
    ...model,
    walls: paredes,
    openings: model.openings.filter((o) => idsDeParede.has(o.wallId)),
    spaces: model.spaces.filter((s) => s.levelId === levelId),
    labels: doNivel(model.labels),
    structures: doNivel(model.structures),
    roofs: doNivel(model.roofs),
    stairs: doNivel(model.stairs),
    nucleos: (model.nucleos ?? []).filter((n) => n.levelId === levelId),
    vagas: doNivel(model.vagas),
    componentes: doNivel(model.componentes),
    guardaCorpos: doNivel(model.guardaCorpos),
    anotacoes: (model.anotacoes ?? []).filter((a) => a.vista.tipo !== 'PLANTA' || a.vista.levelId === levelId),
    trechos: doNivel(model.trechos),
    terminais: doNivel(model.terminais),
    quadros: doNivel(model.quadros),
    eixos: model.eixos ?? [],
  };
}

/** Quantos pavimentos têm parede — decide se a planta é "por pavimento" ou uma só. */
export function pavimentosComParede(model: BlueprintModel): number {
  return new Set(model.walls.map((w) => w.levelId)).size;
}

/** Validação do nome ao salvar um template na organização. */
export function validarNomeDoTemplateDePrancha(nome: string, existentes: readonly TemplateDePranchaSalvo[], idAtual?: string): string[] {
  const n = nome.trim();
  if (!n) return ['nome é obrigatório'];
  if (n.length > 60) return ['nome maior que 60 caracteres'];
  if (existentes.some((t) => t.id !== idAtual && t.nome.trim().toLowerCase() === n.toLowerCase())) return [`já existe um template chamado "${n}"`];
  return [];
}
