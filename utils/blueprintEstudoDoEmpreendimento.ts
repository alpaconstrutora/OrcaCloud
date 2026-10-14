/**
 * ESTUDO SEM DESENHO A PARTIR DO EMPREENDIMENTO (13/10/2026, Fase 5 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * Projeto que veio de fora (DWG/PDF) também precisa dos Quadros NBR 12721.
 * Em vez de um segundo caminho, ele vira um estudo da Planta com ambientes
 * DECLARADOS (área digitada, kernel 0.100.0): o mesmo adaptador e o mesmo
 * motor dos estudos desenhados.
 *
 * Porta o mapeamento do Motor antigo (`areaEngineService.importFromEmpreendimento`,
 * F1/F2): torre → pavimentos (template de `empreendimento_floors` expandindo
 * `repeat_count`, senão os andares das unidades), unidade → `Unidade` com um
 * ambiente privativo declarado de `private_area` — SÓ a privativa: a comum
 * quem rateia é o motor (somar `common_area` contaria duas vezes) — e área
 * comum do Empreendimento → ambiente declarado comum proporcional.
 *
 * Puro: devolve o modelo e os avisos; quem grava é
 * `services/blueprintEstudoDoEmpreendimento.ts`.
 */
import {
  applyBatch,
  emptyModel,
  MAX_NOME_DE_AMBIENTE_DECLARADO,
  MAX_NUMERO_DE_UNIDADE,
  MAX_TIPOLOGIA_DE_UNIDADE,
  type BlueprintModel,
  type Command,
} from './blueprintKernel';
import type { EmpreendimentoFloor, EmpreendimentoWithChildren } from '../types/empreendimento';

/** Pé-direito usado para ordenar os pavimentos declarados (só ordem; não há geometria). */
export const PE_DIREITO_DO_ESTUDO_DECLARADO_MM = 3000;

export interface EstudoDoEmpreendimento {
  model: BlueprintModel;
  avisos: string[];
  contagem: { pavimentos: number; unidades: number; ambientes: number; privativaM2: number };
}

/** O mesmo rótulo do Motor antigo. */
export function rotuloDoAndar(n: number): string {
  if (n < 0) return `Subsolo ${Math.abs(n)}`;
  if (n === 0) return 'Térreo';
  return `Pavimento ${n}`;
}

const cortar = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);

export function montarEstudoDoEmpreendimento(
  emp: Pick<EmpreendimentoWithChildren, 'name' | 'towers' | 'common_areas'>,
  pavimentosPorTorre: Map<string, EmpreendimentoFloor[]> = new Map(),
): EstudoDoEmpreendimento {
  const avisos: string[] = [];
  const torres = [...(emp.towers ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (torres.length === 0) {
    // 10 dos 18 empreendimentos reais não tinham torre em 13/10/2026: recusar deixaria a maioria sem caminho.
    const model = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: PE_DIREITO_DO_ESTUDO_DECLARADO_MM }]).model;
    return {
      model,
      avisos: ['O Empreendimento não tem torres nem unidades cadastradas: o estudo nasceu com um pavimento vazio — crie as unidades e declare as áreas na tabela.'],
      contagem: { pavimentos: 1, unidades: 0, ambientes: 0, privativaM2: 0 },
    };
  }
  const variasTorres = torres.length > 1;
  if (variasTorres) {
    avisos.push('Empreendimento com mais de uma torre: os pavimentos levam o nome da torre, e o rateio por torre ainda não é separado (os comuns são rateados no prédio todo).');
  }

  // ── pavimentos: (torre, andar) → nome; cota = andar × pé-direito (só ordem).
  const andares: { torreId: string; andar: number; nome: string }[] = [];
  const chave = (torreId: string, andar: number) => `${torreId}:${andar}`;
  const visto = new Set<string>();
  for (const t of torres) {
    const templates = pavimentosPorTorre.get(t.id) ?? [];
    const prefixo = variasTorres ? `${t.name || 'Torre'} · ` : '';
    const add = (andar: number, nome: string) => {
      if (visto.has(chave(t.id, andar))) return;
      visto.add(chave(t.id, andar));
      andares.push({ torreId: t.id, andar, nome: `${prefixo}${nome}` });
    };
    if (templates.length) {
      for (const fl of templates) {
        const reps = Math.max(1, fl.repeat_count || 1);
        for (let r = 0; r < reps; r++) {
          const n = fl.floor_number + r;
          const base = fl.name?.trim() || rotuloDoAndar(n);
          add(n, reps > 1 ? `${base} ${n}` : base);
        }
      }
    } else {
      for (const u of t.units ?? []) if (u.floor !== undefined && u.floor !== null) add(u.floor, rotuloDoAndar(u.floor));
      if ((t.units ?? []).length) avisos.push(`Torre "${t.name}": pavimentos tirados dos andares das unidades (sem cadastro de pavimentos) — andar sem unidade não aparece.`);
    }
  }
  andares.sort((a, b) => a.andar - b.andar || a.nome.localeCompare(b.nome, 'pt-BR'));

  let model = applyBatch(
    emptyModel(),
    andares.map((a) => ({ type: 'AddLevel', name: a.nome, elevationMm: a.andar * PE_DIREITO_DO_ESTUDO_DECLARADO_MM, defaultHeightMm: PE_DIREITO_DO_ESTUDO_DECLARADO_MM }) as Command),
  ).model;
  const levelIdDe = new Map(andares.map((a, i) => [chave(a.torreId, a.andar), model.levels[i].id] as const));

  // ── unidades: número único de até 16 caracteres; tipologia até 40.
  const usados = new Set<string>();
  const unidades: { numero: string; nivel: string | null; privativa: number; tipologia: string | null }[] = [];
  let semNome = 0;
  for (const t of torres) {
    for (const u of t.units ?? []) {
      const original = (u.name ?? '').trim() || `Unidade ${++semNome}`;
      let numero = cortar(original, MAX_NUMERO_DE_UNIDADE);
      for (let n = 2; usados.has(numero); n++) numero = cortar(original, MAX_NUMERO_DE_UNIDADE - String(n).length - 1) + `-${n}`;
      if (numero !== original) avisos.push(`Unidade "${original}" entrou como "${numero}" (o número tem até ${MAX_NUMERO_DE_UNIDADE} caracteres e é único).`);
      usados.add(numero);
      const nivel = u.floor !== undefined && u.floor !== null ? levelIdDe.get(chave(t.id, u.floor)) ?? null : null;
      unidades.push({ numero, nivel, privativa: Number(u.private_area ?? 0), tipologia: u.typology ? cortar(u.typology.trim(), MAX_TIPOLOGIA_DE_UNIDADE) : null });
    }
  }
  // Um lote só: o kernel roda a cauda inteira por comando, não por chamada.
  if (unidades.length) model = applyBatch(model, unidades.map((u) => ({ type: 'AddUnidade', numero: u.numero, tipologia: u.tipologia }) as Command)).model;

  // ── ambientes declarados: a privativa de cada unidade e os comuns do Empreendimento.
  const comandos: Command[] = [];
  let privativaM2 = 0;
  const semArea: string[] = [];
  const nivelPadrao = model.levels[0]?.id ?? null;
  for (const u of unidades) {
    if (!(Number.isFinite(u.privativa) && u.privativa > 0)) {
      semArea.push(u.numero);
      continue;
    }
    const nivel = u.nivel ?? nivelPadrao;
    if (!nivel) continue;
    privativaM2 += u.privativa;
    comandos.push({
      type: 'AddAmbienteDeclarado',
      levelId: nivel,
      nome: cortar(`Área privativa ${u.numero}`, MAX_NOME_DE_AMBIENTE_DECLARADO),
      areaMm2: Math.round(u.privativa * 1_000_000),
      unidadeId: model.unidades.find((x) => x.numero === u.numero)!.id,
      nbr12721: { cobertura: 'PADRAO' },
    });
  }
  if (semArea.length) avisos.push(`${semArea.length} unidade(s) sem área privativa entraram sem ambiente: ${semArea.join(', ')}. Informe a área na tabela.`);

  let comunsSemArea = 0;
  for (const ca of emp.common_areas ?? []) {
    const area = Number(ca.area ?? 0);
    if (!(Number.isFinite(area) && area > 0)) {
      comunsSemArea++;
      continue;
    }
    const nivel = (ca.tower_id && ca.floor !== undefined && ca.floor !== null ? levelIdDe.get(chave(ca.tower_id, ca.floor)) : undefined) ?? nivelPadrao;
    if (!nivel) continue;
    comandos.push({
      type: 'AddAmbienteDeclarado',
      levelId: nivel,
      nome: cortar(ca.name?.trim() || 'Área comum', MAX_NOME_DE_AMBIENTE_DECLARADO),
      areaMm2: Math.round(area * 1_000_000),
      nbr12721: { cobertura: 'PADRAO', divisao: 'PROPORCIONAL' },
    });
  }
  if (comunsSemArea) avisos.push(`${comunsSemArea} área(s) comum(ns) sem metragem não entraram.`);
  if (!(emp.common_areas ?? []).length) avisos.push('O Empreendimento não tem áreas comuns cadastradas: declare-as na tabela (hall, circulação, garagem…) antes de tirar o quadro.');
  avisos.push('Coberturas e coeficientes entraram como "coberta de padrão": revise varandas, terraços e garagem na tabela.');

  if (comandos.length) model = applyBatch(model, comandos).model;
  return {
    model,
    avisos,
    contagem: { pavimentos: model.levels.length, unidades: model.unidades.length, ambientes: (model.ambientesDeclarados ?? []).length, privativaM2 },
  };
}
