/**
 * TIPOS DE ELEMENTO — tipo × instância para estrutura, ponto de instalação,
 * escada e telhado (18/09/2026, roadmap E1.1: *"Tipo × instância — P0"*).
 *
 * ─── A DECISÃO QUE JÁ EXISTIA, GENERALIZADA ─────────────────────────────────
 *
 * Parede (`CamadaParede`) e esquadria (`Esquadria`) decidiram, e o kernel
 * documenta nos dois cabeçalhos: o tipo é MOLDE no catálogo da organização, a
 * peça carrega o VALOR COPIADO no payload canônico, e "duas peças são do mesmo
 * tipo" é uma pergunta de ASSINATURA — nunca um `tipoId` no snapshot, que
 * faria "o pilar P3 da revisão 2" mudar de seção quando alguém editasse o
 * catálogo hoje. Este módulo estende exatamente isso às outras famílias, sem
 * campo novo no kernel e sem bump: só define **quais propriedades de cada
 * família são "o tipo"**, como extraí-las de uma peça, como aplicá-las de volta
 * e como assiná-las.
 *
 * O que entra no tipo é o que se repete de peça para peça e não depende de onde
 * ela está: seção, altura, base, classificação, potência, cota, largura da
 * escada, inclinação do telhado. Posição, rotação, pavimento, rótulo e vínculo
 * (circuito, parede) ficam de fora — são da instância.
 */
import type { AcabamentosDoAmbiente, Agua, CamadaParede, Componente, Escada, Rodape, Structural, Terminal } from './blueprintKernel';
import { CATALOGO_DE_COMPONENTES, nomeDoTipoEstrutural } from './blueprintKernel';

export type FamiliaDeTipo = 'ESTRUTURA' | 'TERMINAL' | 'ESCADA' | 'TELHADO' | 'COMPONENTE' | 'PISO' | 'FORRO';

export const ROTULO_DA_FAMILIA_DE_TIPO: Record<FamiliaDeTipo, string> = {
  ESTRUTURA: 'estrutura',
  TERMINAL: 'ponto de instalação',
  ESCADA: 'escada / rampa',
  TELHADO: 'água de telhado',
  COMPONENTE: 'componente (mobiliário, louça…)',
  PISO: 'piso (camadas + rodapé)',
  FORRO: 'forro (camadas + rebaixo)',
};

export interface PropriedadesDeEstrutura {
  familia: 'ESTRUTURA';
  kind: Structural['kind'];
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
  baseMm: number;
  circular: boolean;
}
export interface PropriedadesDeTerminal {
  familia: 'TERMINAL';
  disciplina: Terminal['disciplina'];
  tipo: string;
  cotaMm: number;
  tipoEletrico?: Terminal['tipoEletrico'];
  tipoHidraulico?: Terminal['tipoHidraulico'];
  potenciaW?: number | null;
  interruptor?: Terminal['interruptor'];
  larguraMm?: number | null;
  alturaMm?: number | null;
  profundidadeMm?: number | null;
  volumeL?: number | null;
}
export interface PropriedadesDeEscada {
  familia: 'ESCADA';
  tipo: Escada['tipo'];
  larguraMm: number;
  alvoEspelhoMm: number;
}
export interface PropriedadesDeTelhado {
  familia: 'TELHADO';
  inclinacaoPct: number;
  baseMm: number;
  espessuraMm: number;
}
export interface PropriedadesDeComponente {
  familia: 'COMPONENTE';
  tipoId: Componente['tipoId'];
  familiaDoComponente: Componente['familia'];
  larguraMm: number;
  profundidadeMm: number;
  alturaMm: number;
}
/**
 * PISO e FORRO (E7.2): a composição do ambiente como tipo da organização —
 * "porcelanato 10 mm sobre contrapiso 50 + rodapé 7 cm" salvo uma vez e
 * aplicado ambiente a ambiente. O rodapé anda com o piso (é o mesmo material
 * que sobe a parede); `null` = o tipo declara "sem rodapé"; ausente = pela
 * política. O forro leva o rebaixo, que é o que muda o pé-direito útil.
 */
export interface PropriedadesDePiso {
  familia: 'PISO';
  camadas: CamadaParede[];
  rodape?: Rodape | null;
}
export interface PropriedadesDeForro {
  familia: 'FORRO';
  camadas: CamadaParede[];
  rebaixoMm: number;
}
export type PropriedadesDoTipo = PropriedadesDeEstrutura | PropriedadesDeTerminal | PropriedadesDeEscada | PropriedadesDeTelhado | PropriedadesDeComponente | PropriedadesDePiso | PropriedadesDeForro;

// ─── Extrair da instância ────────────────────────────────────────────────────

export function propriedadesDaEstrutura(s: Structural): PropriedadesDeEstrutura {
  return {
    familia: 'ESTRUTURA',
    kind: s.kind,
    larguraMm: s.larguraMm,
    profundidadeMm: s.profundidadeMm,
    alturaMm: s.alturaMm,
    baseMm: s.baseMm,
    circular: !!s.circular,
  };
}
export function propriedadesDoTerminal(t: Terminal): PropriedadesDeTerminal {
  return {
    familia: 'TERMINAL',
    disciplina: t.disciplina,
    tipo: t.tipo,
    cotaMm: t.cotaMm,
    tipoEletrico: t.tipoEletrico ?? undefined,
    tipoHidraulico: t.tipoHidraulico ?? undefined,
    potenciaW: t.potenciaW ?? null,
    interruptor: t.interruptor ?? undefined,
    larguraMm: t.larguraMm ?? null,
    alturaMm: t.alturaMm ?? null,
    profundidadeMm: t.profundidadeMm ?? null,
    volumeL: t.volumeL ?? null,
  };
}
export function propriedadesDaEscada(e: Escada): PropriedadesDeEscada {
  return { familia: 'ESCADA', tipo: e.tipo, larguraMm: e.larguraMm, alvoEspelhoMm: e.alvoEspelhoMm };
}
export function propriedadesDoTelhado(a: Agua): PropriedadesDeTelhado {
  return { familia: 'TELHADO', inclinacaoPct: a.inclinacaoPct, baseMm: a.baseMm, espessuraMm: a.espessuraMm };
}

// ─── Assinatura e rótulo ─────────────────────────────────────────────────────

/**
 * A assinatura é o JSON com as chaves em ordem fixa e `null`/`undefined`
 * normalizados — duas peças com as mesmas propriedades têm a mesma string, e é
 * isso que responde "quantas peças são deste tipo" sem id nenhum.
 */
export function assinaturaDoTipo(p: PropriedadesDoTipo): string {
  const plano = p as unknown as Record<string, unknown>;
  // Vazio (null/undefined) NÃO entra: o catálogo devolve JSON, que perde as
  // chaves undefined, e a assinatura de ida tem de ser a de volta.
  return Object.keys(plano)
    .filter((k) => plano[k] !== undefined)
    .sort()
    // Composições (piso/forro) são arrays de objetos: `String()` daria
    // "[object Object]" e todo piso teria a mesma assinatura. JSON com as
    // chaves ordenadas é estável na ida e na volta do banco. `null` fica
    // explícito onde tem significado (rodapé "sem").
    .map((k) => `${k}=${plano[k] === null ? 'null' : typeof plano[k] === 'object' ? JSON.stringify(plano[k], (_c, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object).sort().reduce<Record<string, unknown>>((o, kk) => ((o[kk] = (v as Record<string, unknown>)[kk]), o), {}) : v)) : String(plano[k])}`)
    .join('|');
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');
const cm = (mm: number) => String(Math.round(mm / 10));

/** O que o seletor mostra ao lado do nome — as medidas que distinguem o tipo. */
export function resumoDoTipo(p: PropriedadesDoTipo): string {
  switch (p.familia) {
    case 'ESTRUTURA':
      return p.circular
        ? `${nomeDoTipoEstrutural(p.kind)} Ø${cm(p.larguraMm)} · ${m(p.alturaMm)} m`
        : `${nomeDoTipoEstrutural(p.kind)} ${cm(p.larguraMm)}×${cm(p.profundidadeMm || p.alturaMm)} · ${m(p.alturaMm)} m`;
    case 'TERMINAL':
      return `${p.tipo}${p.potenciaW ? ` ${p.potenciaW} VA` : ''} · ${cm(p.cotaMm)} cm`;
    case 'ESCADA':
      return `${p.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${m(p.larguraMm)} m${p.tipo === 'ESCADA' ? ` · espelho ${p.alvoEspelhoMm} mm` : ''}`;
    case 'TELHADO':
      return `${p.inclinacaoPct} % · base ${m(p.baseMm)} m`;
    case 'COMPONENTE':
      return `${CATALOGO_DE_COMPONENTES[p.tipoId]?.rotulo ?? p.tipoId} ${cm(p.larguraMm)}×${cm(p.profundidadeMm)} · ${m(p.alturaMm)} m`;
    case 'PISO':
      return `${resumoDasCamadas(p.camadas)}${p.rodape === null ? ' · sem rodapé' : p.rodape ? ` · rodapé ${cm(p.rodape.alturaMm)} cm` : ''}`;
    case 'FORRO':
      return `${resumoDasCamadas(p.camadas)} · rebaixo ${cm(p.rebaixoMm)} cm`;
  }
}

/** "Porcelanato 10 + argamassa 5 + contrapiso 50 (65 mm)". */
export function resumoDasCamadas(camadas: CamadaParede[]): string {
  const total = camadas.reduce((s, c) => s + c.espessuraMm, 0);
  return `${camadas.map((c) => `${c.descricao || c.funcao.toLowerCase()} ${c.espessuraMm}`).join(' + ')} (${total} mm)`;
}

/** Nome sugerido ao salvar — o usuário edita antes de gravar. */
export function nomeSugeridoDoTipo(p: PropriedadesDoTipo): string {
  return resumoDoTipo(p);
}

// ─── Aplicar de volta: os campos que os comandos `Set*Props` aceitam ─────────

export function camposDaEstrutura(p: PropriedadesDeEstrutura) {
  return {
    larguraMm: p.larguraMm,
    profundidadeMm: p.profundidadeMm,
    alturaMm: p.alturaMm,
    baseMm: p.baseMm,
    circular: p.circular,
  };
}
export function camposDoTerminal(p: PropriedadesDeTerminal) {
  return {
    tipo: p.tipo,
    cotaMm: p.cotaMm,
    tipoEletrico: p.tipoEletrico ?? null,
    tipoHidraulico: p.tipoHidraulico ?? null,
    potenciaW: p.potenciaW ?? null,
    interruptor: p.interruptor ?? null,
    larguraMm: p.larguraMm ?? null,
    alturaMm: p.alturaMm ?? null,
    profundidadeMm: p.profundidadeMm ?? null,
    volumeL: p.volumeL ?? null,
  };
}

export function camposDaEscada(p: PropriedadesDeEscada) {
  return { tipo: p.tipo, larguraMm: p.larguraMm, alvoEspelhoMm: p.alvoEspelhoMm };
}
export function camposDoTelhado(p: PropriedadesDeTelhado) {
  return { inclinacaoPct: p.inclinacaoPct, baseMm: p.baseMm, espessuraMm: p.espessuraMm };
}
export function propriedadesDoComponente(c: Componente): PropriedadesDeComponente {
  return { familia: 'COMPONENTE', tipoId: c.tipoId, familiaDoComponente: c.familia, larguraMm: c.larguraMm, profundidadeMm: c.profundidadeMm, alturaMm: c.alturaMm };
}
export function camposDoComponente(p: PropriedadesDeComponente) {
  return { tipoId: p.tipoId, familia: p.familiaDoComponente, larguraMm: p.larguraMm, profundidadeMm: p.profundidadeMm, alturaMm: p.alturaMm };
}

// ─── Piso e forro (E7.2): tipo ↔ acabamentos da etiqueta ─────────────────────

export function propriedadesDoPiso(a: AcabamentosDoAmbiente | undefined): PropriedadesDePiso {
  return { familia: 'PISO', camadas: (a?.piso ?? []).map((c) => ({ ...c })), ...(a && a.rodape !== undefined ? { rodape: a.rodape ? { ...a.rodape } : null } : {}) };
}
export function propriedadesDoForro(a: AcabamentosDoAmbiente | undefined): PropriedadesDeForro {
  return { familia: 'FORRO', camadas: (a?.forro?.camadas ?? []).map((c) => ({ ...c })), rebaixoMm: a?.forro?.rebaixoMm ?? 0 };
}
/** Aplica o tipo de PISO por cima dos acabamentos atuais — forro fica como está. */
export function aplicarTipoDePiso(atual: AcabamentosDoAmbiente | undefined, p: PropriedadesDePiso): AcabamentosDoAmbiente {
  const out: AcabamentosDoAmbiente = { ...(atual?.forro ? { forro: atual.forro } : {}) };
  if (p.camadas.length > 0) out.piso = p.camadas.map((c) => ({ ...c }));
  if (p.rodape !== undefined) out.rodape = p.rodape ? { ...p.rodape } : null;
  else if (atual && atual.rodape !== undefined) out.rodape = atual.rodape;
  return out;
}
/** Aplica o tipo de FORRO por cima dos acabamentos atuais — piso e rodapé ficam. */
export function aplicarTipoDeForro(atual: AcabamentosDoAmbiente | undefined, p: PropriedadesDeForro): AcabamentosDoAmbiente {
  const out: AcabamentosDoAmbiente = { ...(atual?.piso ? { piso: atual.piso } : {}), ...(atual && atual.rodape !== undefined ? { rodape: atual.rodape } : {}) };
  if (p.camadas.length > 0) out.forro = { camadas: p.camadas.map((c) => ({ ...c })), rebaixoMm: p.rebaixoMm };
  return out;
}
