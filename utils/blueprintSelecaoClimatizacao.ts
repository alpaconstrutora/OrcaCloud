/**
 * SELEÇÃO DO EQUIPAMENTO DE CLIMATIZAÇÃO (04/10/2026, E4.1 do roadmap de
 * climatização — "vai além": o AltoQi não seleciona nem confere).
 *
 * A carga térmica (E2) diz quantos BTU/h cada ambiente pede; o CATÁLOGO da
 * organização (tipos salvos de evaporadora com `capacidadeBtuH` — as sementes
 * de 9.000 a 60.000 são hipótese de pré-projeto) diz o que existe para comprar;
 * este módulo liga os dois: o menor modelo que alcança carga × (1 + folga), e a
 * CONFERÊNCIA do que já está desenhado (atende / subdimensionado /
 * superdimensionado / sem capacidade declarada / sem equipamento).
 *
 * Tudo DERIVADO: nada aqui grava. O declarado (a capacidade da peça) vence a
 * sugestão e é o que se confere.
 */
import type { BlueprintModel, ObjectId, Terminal, TipoDePontoHidraulico } from './blueprintKernel';
import { TIPOS_COM_CAPACIDADE, TIPOS_DE_EVAPORADORA } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel/geom';
import type { CargaTermicaDoNivel } from './blueprintCargaTermica';
import { W_PARA_BTUH } from './blueprintCargaTermica';
import type { HipotesesDeSelecao } from './blueprintClimatizacao';
import type { ItemConferido } from './blueprintConferenciaClimatizacao';

/** Um modelo comercial: um tipo salvo com capacidade. */
export interface ModeloDoCatalogo {
  id: string;
  nome: string;
  tipoHidraulico: TipoDePontoHidraulico;
  capacidadeBtuH: number;
  /** A potência elétrica de placa, VA — `null` sem placa (estima-se pelo EER). */
  potenciaVA: number | null;
  cotaMm: number;
  larguraMm: number | null;
  profundidadeMm: number | null;
  alturaMm: number | null;
}

/** O mínimo de um tipo salvo que este módulo lê. */
export interface TipoSalvoMinimo {
  id: string;
  nome: string;
  familia: string;
  active: boolean;
  propriedades: unknown;
}

/** Os modelos do catálogo: tipos ativos de TERMINAL com `tipoHidraulico` que troca calor e capacidade > 0, da menor capacidade à maior. */
export function modelosDoCatalogo(tipos: readonly TipoSalvoMinimo[]): ModeloDoCatalogo[] {
  const saida: ModeloDoCatalogo[] = [];
  for (const t of tipos) {
    if (!t.active || t.familia !== 'TERMINAL') continue;
    const p = (t.propriedades ?? {}) as { tipoHidraulico?: string; capacidadeBtuH?: number; potenciaW?: number | null; cotaMm?: number; larguraMm?: number | null; profundidadeMm?: number | null; alturaMm?: number | null };
    if (!p.tipoHidraulico || !(TIPOS_COM_CAPACIDADE as readonly string[]).includes(p.tipoHidraulico)) continue;
    if (!(typeof p.capacidadeBtuH === 'number' && p.capacidadeBtuH > 0)) continue;
    saida.push({
      id: t.id,
      nome: t.nome,
      tipoHidraulico: p.tipoHidraulico as TipoDePontoHidraulico,
      capacidadeBtuH: Math.round(p.capacidadeBtuH),
      potenciaVA: typeof p.potenciaW === 'number' && p.potenciaW > 0 ? Math.round(p.potenciaW) : null,
      cotaMm: typeof p.cotaMm === 'number' ? p.cotaMm : 2200,
      larguraMm: p.larguraMm ?? null,
      profundidadeMm: p.profundidadeMm ?? null,
      alturaMm: p.alturaMm ?? null,
    });
  }
  return saida.sort((a, b) => a.capacidadeBtuH - b.capacidadeBtuH || a.nome.localeCompare(b.nome));
}

/** A capacidade NECESSÁRIA: a carga com a folga, inteira. */
export const necessarioBtuH = (cargaBtuH: number, folgaPct: number): number => Math.ceil(Number((cargaBtuH * (1 + folgaPct / 100)).toFixed(6)));

/** A potência elétrica estimada pelo EER (BTU/h → W de frio ÷ EER), VA. HIPÓTESE — a placa do fabricante vence. */
export const potenciaEletricaVA = (capacidadeBtuH: number, eerWW: number): number => Math.round(capacidadeBtuH / W_PARA_BTUH / eerWW);

export interface SugestaoDeModelo {
  necessarioBtuH: number;
  /** O menor modelo do tipo preferido que alcança o necessário (ou, sem nenhum do tipo, de qualquer evaporadora). */
  escolhido: ModeloDoCatalogo | null;
  /** Os outros que também alcançam, do menor ao maior. */
  alternativas: ModeloDoCatalogo[];
  /** Por que não há escolha. */
  motivo: string | null;
}

/** O menor modelo que alcança carga × (1 + folga). */
export function selecionarModelo(cargaBtuH: number, modelos: readonly ModeloDoCatalogo[], hip: HipotesesDeSelecao): SugestaoDeModelo {
  const necessario = necessarioBtuH(cargaBtuH, hip.folgaPct);
  const evaporadoras = modelos.filter((m) => (TIPOS_DE_EVAPORADORA as readonly string[]).includes(m.tipoHidraulico));
  if (evaporadoras.length === 0) return { necessarioBtuH: necessario, escolhido: null, alternativas: [], motivo: 'catálogo sem modelo de evaporadora — salve um tipo com capacidade ou semeie o catálogo' };
  const doTipo = evaporadoras.filter((m) => m.tipoHidraulico === hip.tipoPreferido);
  const candidatas = (doTipo.length > 0 ? doTipo : evaporadoras).filter((m) => m.capacidadeBtuH >= necessario);
  if (candidatas.length === 0) {
    const maior = Math.max(...(doTipo.length > 0 ? doTipo : evaporadoras).map((m) => m.capacidadeBtuH));
    return { necessarioBtuH: necessario, escolhido: null, alternativas: [], motivo: `nenhum modelo alcança ${necessario.toLocaleString('pt-BR')} BTU/h (o maior do catálogo tem ${maior.toLocaleString('pt-BR')}) — divida o ambiente em dois aparelhos ou cadastre um modelo maior` };
  }
  return { necessarioBtuH: necessario, escolhido: candidatas[0], alternativas: candidatas.slice(1), motivo: null };
}

export type EstadoDaCapacidade = 'ATENDE' | 'SUBDIMENSIONADO' | 'SUPERDIMENSIONADO' | 'SEM_CAPACIDADE' | 'SEM_EQUIPAMENTO';

export const ROTULO_DO_ESTADO: Record<EstadoDaCapacidade, string> = {
  ATENDE: 'atende',
  SUBDIMENSIONADO: 'subdimensionado',
  SUPERDIMENSIONADO: 'superdimensionado',
  SEM_CAPACIDADE: 'sem capacidade declarada',
  SEM_EQUIPAMENTO: 'sem equipamento',
};

/** O instalado contra a carga: abaixo do necessário é SUB; acima de carga × (1 + super) é SUPER. */
export function avaliarCapacidade(instaladaBtuH: number | null, cargaBtuH: number, hip: HipotesesDeSelecao): EstadoDaCapacidade {
  if (instaladaBtuH == null) return 'SEM_CAPACIDADE';
  if (instaladaBtuH < necessarioBtuH(cargaBtuH, hip.folgaPct)) return 'SUBDIMENSIONADO';
  if (instaladaBtuH > cargaBtuH * (1 + hip.superPct / 100)) return 'SUPERDIMENSIONADO';
  return 'ATENDE';
}

export interface EvaporadoraDoAmbiente {
  id: ObjectId;
  tipoHidraulico: TipoDePontoHidraulico;
  capacidadeBtuH: number | null;
  condensadoraId: ObjectId | null;
  sugerida: boolean;
}

export interface SelecaoDoAmbiente {
  spaceId: ObjectId;
  levelId: ObjectId;
  labelUid: string | null;
  nome: string;
  cargaBtuH: number;
  necessarioBtuH: number;
  evaporadoras: EvaporadoraDoAmbiente[];
  /** Soma das capacidades DECLARADAS; `null` quando há evaporadora sem capacidade (não dá para somar o que não se sabe). */
  instaladaBtuH: number | null;
  estado: EstadoDaCapacidade;
  sugestao: SugestaoDeModelo;
  pendencias: string[];
}

export interface SelecaoDoNivel {
  levelId: ObjectId;
  ambientes: SelecaoDoAmbiente[];
  modelos: number;
  conferencia: ItemConferido[];
}

/** As evaporadoras (tipadas) dentro do contorno do ambiente, no pavimento dele. */
export function evaporadorasDoAmbiente(model: BlueprintModel, spaceId: ObjectId): Terminal[] {
  const space = model.spaces.find((s) => s.id === spaceId);
  if (!space) return [];
  return (model.terminais ?? []).filter(
    (t) =>
      t.levelId === space.levelId &&
      !!t.tipoHidraulico &&
      (TIPOS_DE_EVAPORADORA as readonly string[]).includes(t.tipoHidraulico) &&
      pointInPolygon(space.ring, t.at) &&
      !space.holes.some((h) => pointInPolygon(h, t.at)),
  );
}

/** A seleção de cada ambiente CLIMATIZADO do pavimento, a partir da carga térmica já calculada. */
export function selecaoDoNivel(model: BlueprintModel, nivel: CargaTermicaDoNivel, hip: HipotesesDeSelecao, modelos: readonly ModeloDoCatalogo[]): SelecaoDoNivel {
  const ambientes: SelecaoDoAmbiente[] = [];
  for (const a of nivel.ambientes) {
    if (!a.climatizado) continue;
    const evaporadoras = evaporadorasDoAmbiente(model, a.spaceId).map((t) => ({
      id: t.id,
      tipoHidraulico: t.tipoHidraulico!,
      capacidadeBtuH: t.capacidadeBtuH ?? null,
      condensadoraId: t.condensadoraId ?? null,
      sugerida: !!t.sugerida,
    }));
    const semCapacidade = evaporadoras.some((e) => e.capacidadeBtuH == null);
    const instalada = evaporadoras.length === 0 || semCapacidade ? null : evaporadoras.reduce((s, e) => s + (e.capacidadeBtuH ?? 0), 0);
    const estado: EstadoDaCapacidade = evaporadoras.length === 0 ? 'SEM_EQUIPAMENTO' : avaliarCapacidade(instalada, a.totalBtuH, hip);
    const sugestao = selecionarModelo(a.totalBtuH, modelos, hip);
    const pendencias: string[] = [];
    if (a.conferir) pendencias.push('carga térmica com hipóteses — CONFERIR antes de comprar');
    if (evaporadoras.some((e) => !e.condensadoraId)) pendencias.push(`${evaporadoras.filter((e) => !e.condensadoraId).length} evaporadora(s) sem condensadora (sistema)`);
    ambientes.push({
      spaceId: a.spaceId,
      levelId: a.levelId,
      labelUid: a.labelUid,
      nome: a.nome,
      cargaBtuH: a.totalBtuH,
      necessarioBtuH: sugestao.necessarioBtuH,
      evaporadoras,
      instaladaBtuH: instalada,
      estado,
      sugestao,
      pendencias,
    });
  }
  return { levelId: nivel.levelId, ambientes, modelos: modelos.length, conferencia: conferenciaDeSelecao(ambientes, modelos.length) };
}

/** A conferência da seleção, em 3 estados — no mesmo molde da conferência da carga. */
export function conferenciaDeSelecao(ambientes: readonly SelecaoDoAmbiente[], modelos: number): ItemConferido[] {
  const dos = (estado: EstadoDaCapacidade) => ambientes.filter((a) => a.estado === estado);
  const nomes = (lista: readonly SelecaoDoAmbiente[]) => lista.map((a) => a.nome).join(', ');
  const itens: ItemConferido[] = [];
  itens.push({
    codigo: 'CATALOGO',
    item: 'Catálogo de equipamentos (tipos salvos com capacidade)',
    estado: modelos > 0 ? 'OK' : 'FALTA',
    obtido: modelos > 0 ? `${modelos} modelo(s)` : 'nenhum modelo — semeie o catálogo ou salve um tipo com capacidade',
    spaceIds: [],
  });
  if (ambientes.length === 0) {
    itens.push({ codigo: 'EQUIPAMENTO', item: 'Equipamento em todo ambiente climatizado', estado: 'NAO_AVALIADO', obtido: 'nenhum ambiente climatizado no pavimento', spaceIds: [] });
    return itens;
  }
  const sem = dos('SEM_EQUIPAMENTO');
  itens.push({ codigo: 'EQUIPAMENTO', item: 'Equipamento em todo ambiente climatizado', estado: sem.length ? 'FALTA' : 'OK', obtido: sem.length ? `${sem.length} sem equipamento: ${nomes(sem)}` : `${ambientes.length} ambiente(s) com equipamento`, spaceIds: sem.map((a) => a.spaceId) });
  const semCap = dos('SEM_CAPACIDADE');
  const sub = dos('SUBDIMENSIONADO');
  const sup = dos('SUPERDIMENSIONADO');
  const comEquipamento = ambientes.filter((a) => a.estado !== 'SEM_EQUIPAMENTO');
  itens.push({
    codigo: 'CAPACIDADE',
    item: 'Capacidade instalada ≥ carga × (1 + folga), sem passar do superdimensionamento',
    estado: comEquipamento.length === 0 ? 'NAO_AVALIADO' : sub.length || semCap.length ? 'FALTA' : sup.length ? 'AVISO' : 'OK',
    obtido:
      comEquipamento.length === 0
        ? 'nenhum equipamento a conferir'
        : [sub.length ? `${sub.length} subdimensionado(s): ${nomes(sub)}` : '', semCap.length ? `${semCap.length} sem capacidade declarada: ${nomes(semCap)}` : '', sup.length ? `${sup.length} superdimensionado(s): ${nomes(sup)}` : '']
            .filter(Boolean)
            .join('; ') || `${comEquipamento.length} atende(m)`,
    spaceIds: [...sub, ...semCap, ...sup].map((a) => a.spaceId),
  });
  const semSistema = ambientes.filter((a) => a.evaporadoras.some((e) => !e.condensadoraId));
  itens.push({
    codigo: 'SISTEMA',
    item: 'Toda evaporadora ligada a uma condensadora',
    estado: comEquipamento.length === 0 ? 'NAO_AVALIADO' : semSistema.length ? 'FALTA' : 'OK',
    obtido: comEquipamento.length === 0 ? 'nenhuma evaporadora' : semSistema.length ? `sem sistema em: ${nomes(semSistema)}` : 'todas com condensadora',
    spaceIds: semSistema.map((a) => a.spaceId),
  });
  return itens;
}
