/**
 * DEPARTAMENTO DO AMBIENTE (21/09/2026, backlog P2 — P2.22): o setor a que cada
 * ambiente pertence — social, íntimo, serviço, circulação, técnico… — gravado
 * na ETIQUETA (`SpaceLabel.departamento`, kernel 0.56.0), como o tipo e os
 * acabamentos: o ambiente é derivado das paredes, a etiqueta é o que persiste.
 *
 * ─── O QUE SE FAZ COM ELE ───────────────────────────────────────────────────
 *
 * - **Quadro por departamento**: quantos ambientes, quantos m² úteis e que % do
 *   pavimento (ou do estudo) cada setor ocupa — é o índice que o programa de
 *   necessidades pede ("30 % social, 40 % íntimo, 15 % serviço, 15 % circulação").
 * - **Planta de departamentos**: a vista que pinta cada ambiente com a cor do
 *   setor e põe a legenda — a prancha de setorização.
 * - **Sugestão**: pelo tipo (NBR 5410) e pelo nome do ambiente; heurística
 *   declarada, nunca grava sozinha — vira comandos que o usuário lança.
 *
 * ─── CORES ──────────────────────────────────────────────────────────────────
 *
 * Cor é da PALETA por ordem alfabética dos departamentos presentes: mesmo
 * modelo, mesmas cores, em qualquer máquina. Os sugeridos têm cor fixa (o
 * social é sempre o amarelo) para a prancha ficar reconhecível entre estudos.
 */
import type { BlueprintModel, Command, ObjectId, Space, SpaceLabel, TipoDeAmbiente } from './blueprintKernel';
import { areaRecuada, departamentoNormalizado } from './blueprintKernel';
import { etiquetaDoAmbiente } from './blueprintDistribuicao';

/** Os departamentos que uma residência/edifício comum tem — sugestão, não lista fechada. */
export const DEPARTAMENTOS_SUGERIDOS = ['Social', 'Íntimo', 'Serviço', 'Circulação', 'Técnico', 'Comercial', 'Comum'] as const;

/** Cor fixa dos sugeridos (pastéis, como as demais paletas de `blueprintPaletas`); os demais entram na paleta rotativa. */
const COR_FIXA: Record<(typeof DEPARTAMENTOS_SUGERIDOS)[number], string> = {
  Social: '#fde68a',
  Íntimo: '#bfdbfe',
  Serviço: '#bbf7d0',
  Circulação: '#e5e7eb',
  Técnico: '#ddd6fe',
  Comercial: '#fbcfe8',
  Comum: '#99f6e4',
};
const PALETA = ['#fecaca', '#fed7aa', '#d9f99d', '#a5f3fc', '#c7d2fe', '#f5d0fe', '#e7e5e4', '#bae6fd'] as const;

/** Departamento da etiqueta do ambiente, ou `null`. */
export function departamentoDoAmbiente(s: Pick<Space, 'labelUid'>, labels: readonly SpaceLabel[]): string | null {
  return etiquetaDoAmbiente(s, labels)?.departamento ?? null;
}

/** Os departamentos presentes no modelo (ou no pavimento), únicos, em ordem alfabética. */
export function departamentosDoModelo(model: BlueprintModel, levelId?: ObjectId | null): string[] {
  const vistos = new Set<string>();
  for (const s of model.spaces) {
    if (levelId && s.levelId !== levelId) continue;
    const d = departamentoDoAmbiente(s, model.labels);
    if (d) vistos.add(d);
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * A cor de um departamento dado o conjunto presente (`todos`, alfabético):
 * fixa para os sugeridos, senão a paleta pela posição entre os não-fixos.
 */
export function corDoDepartamento(nome: string, todos: readonly string[]): string {
  const fixa = (COR_FIXA as Record<string, string>)[nome];
  if (fixa) return fixa;
  const livres = todos.filter((d) => !(d in COR_FIXA));
  const i = Math.max(0, livres.indexOf(nome));
  return PALETA[i % PALETA.length];
}

/**
 * Sugestão pelo TIPO e pelo NOME. Ordem: nome específico primeiro (um
 * "Dormitório" é íntimo mesmo que o tipo diga só SALA_DORMITORIO), depois o
 * tipo. `null` = não arrisca.
 */
export function sugerirDepartamento(nome: string | null | undefined, tipo: TipoDeAmbiente | null | undefined): string | null {
  const n = (nome ?? '').toLowerCase();
  if (/dorm|quarto|su[ií]te|closet|banh|lavabo|wc|sanit/.test(n)) return 'Íntimo';
  if (/sala|estar|jantar|varanda|sacada|terra[çc]o|gourmet|churrasq|piscina|home|escrit[óo]rio|biblioteca/.test(n)) return 'Social';
  if (/cozinha|copa|servi[çc]o|lavand|despensa|garag|dep[óo]sito|dml|lixo/.test(n)) return 'Serviço';
  if (/circ|hall|corredor|escada|elevador|vest[íi]bulo|acesso|antec[âa]mara/.test(n)) return 'Circulação';
  if (/t[ée]cnic|casa de m[áa]q|medidor|gerador|reservat|shaft|barrilete|cabine|ar-?cond/.test(n)) return 'Técnico';
  if (/loja|comerc|sal[ãa]o|recep|atend|consult/.test(n)) return 'Comercial';
  if (tipo === 'BANHEIRO') return 'Íntimo';
  if (tipo === 'COZINHA_SERVICO') return 'Serviço';
  if (tipo === 'VARANDA') return 'Social';
  return null;
}

export interface LinhaDoQuadroDeDepartamentos {
  /** `null` = sem departamento. */
  departamento: string | null;
  ambientes: number;
  areaM2: number;
  /** % da área somada de todos os ambientes considerados (0–100). */
  pct: number;
  cor: string | null;
}

/**
 * O quadro por departamento do pavimento (ou do estudo). Área ÚTIL (pela face
 * interna, `areaRecuada`), a mesma do navegador de ambientes — para o quadro
 * bater com a lista.
 */
export function quadroDeDepartamentos(model: BlueprintModel, levelId?: ObjectId | null): LinhaDoQuadroDeDepartamentos[] {
  const todos = departamentosDoModelo(model, levelId);
  const acc = new Map<string | null, { ambientes: number; areaM2: number }>();
  let total = 0;
  for (const s of model.spaces) {
    if (levelId && s.levelId !== levelId) continue;
    if (s.ring.length < 3) continue;
    const d = departamentoDoAmbiente(s, model.labels);
    const area = areaRecuada(s.ring, model.walls.filter((w) => w.levelId === s.levelId)).areaMm2 / 1_000_000;
    const atual = acc.get(d) ?? { ambientes: 0, areaM2: 0 };
    atual.ambientes += 1;
    atual.areaM2 += area;
    acc.set(d, atual);
    total += area;
  }
  const linha = (d: string | null, a: { ambientes: number; areaM2: number }): LinhaDoQuadroDeDepartamentos => ({
    departamento: d,
    ambientes: a.ambientes,
    areaM2: Math.round(a.areaM2 * 100) / 100,
    pct: total > 0 ? Math.round((a.areaM2 / total) * 1000) / 10 : 0,
    cor: d ? corDoDepartamento(d, todos) : null,
  });
  const linhas: LinhaDoQuadroDeDepartamentos[] = [];
  for (const d of todos) {
    const a = acc.get(d);
    if (a) linhas.push(linha(d, a));
  }
  const sem = acc.get(null);
  if (sem) linhas.push(linha(null, sem));
  return linhas;
}

export interface SugestaoDeDepartamento {
  spaceId: ObjectId;
  nome: string;
  departamento: string;
  comando: Command;
}

/**
 * Um comando por ambiente SEM departamento cuja heurística arrisca um — pela
 * etiqueta se existe, criando-a pelo nome exibido se não. Idempotente: quem já
 * tem departamento não entra.
 */
export function sugestoesDeDepartamento(model: BlueprintModel, levelId?: ObjectId | null): SugestaoDeDepartamento[] {
  const saida: SugestaoDeDepartamento[] = [];
  model.spaces.forEach((s, i) => {
    if (levelId && s.levelId !== levelId) return;
    if (s.ring.length < 3) return;
    const et = etiquetaDoAmbiente(s, model.labels);
    if (et?.departamento) return;
    const nome = s.name?.trim() || `Ambiente ${i + 1}`;
    const d = departamentoNormalizado(sugerirDepartamento(s.name, et?.tipoDeAmbiente));
    if (!d) return;
    saida.push({
      spaceId: s.id,
      nome,
      departamento: d,
      comando: et ? { type: 'SetSpaceLabelProps', labelId: et.id, departamento: d } : { type: 'NameSpace', spaceId: s.id, name: nome, departamento: d },
    });
  });
  return saida;
}
