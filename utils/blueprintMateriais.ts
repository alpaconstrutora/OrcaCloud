/**
 * BIBLIOTECA DE MATERIAIS (19/09/2026, roadmap E7.4) — a parte PURA.
 *
 * ─── O QUE É UM MATERIAL, E O QUE ELE NÃO É ─────────────────────────────────
 *
 * Um material é uma LINHA da organização: código, nome, unidade, custo,
 * fabricante, densidade, condutividade, cor, função e espessura usuais. O
 * CÓDIGO é a ponte: é o mesmo `itemCode` opaco que a camada da parede, o piso,
 * o forro, o rodapé e o guarda-corpo carregam no payload canônico desde
 * sempre — SINAPI ("87879") ou interno ("INT-PORC-60"). Nada no kernel mudou
 * e nada muda de hash: a biblioteca resolve o código na hora de mostrar e de
 * orçar, e apagar um material deixa a planta intacta (o código fica, e passa a
 * aparecer "sem material na biblioteca").
 *
 * Isso é o que a fase pediu — "camadas e tipos apontam por id; orçamento lê o
 * custo" — lido com a decisão que `CamadaParede` já documenta: o kernel nunca
 * resolve código, então o "id" que a camada aponta É o código, e é a
 * biblioteca que o torna id de alguma coisa.
 *
 * ─── PROPRIEDADES FÍSICAS (P2) ─────────────────────────────────────────────
 *
 * Densidade dá MASSA (kg = m³ × kg/m³) para o que se compra por volume e para
 * a carga da laje; condutividade dá a RESISTÊNCIA TÉRMICA de uma composição
 * (R = Σ e/λ, m²·K/W) e a transmitância U = 1/(Rsi + R + Rse) — NBR 15220,
 * com Rsi 0,13 e Rse 0,04 para parede. É pré-dimensionamento: sem câmara de
 * ar ventilada, sem ponte térmica, sem umidade.
 */
import type { BlueprintMaterialRow } from '../types/blueprint';
import type { CamadaParede, FuncaoCamada } from './blueprintKernel';

export type FonteDoMaterial = 'SINAPI' | 'INTERNA';

export interface Material {
  id: string;
  organizationId: string;
  codigo: string;
  nome: string;
  fonte: FonteDoMaterial;
  unidade: string;
  custo: number;
  fabricante: string | null;
  densidadeKgM3: number | null;
  condutividadeWmK: number | null;
  /** `#rrggbb` ou null (a cor da função). */
  cor: string | null;
  funcao: FuncaoCamada | null;
  espessuraPadraoMm: number | null;
  propriedades: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const UNIDADES_DE_MATERIAL: readonly string[] = ['m²', 'm³', 'm', 'un', 'kg'];

export function materialDaLinha(r: BlueprintMaterialRow): Material {
  return {
    id: r.id,
    organizationId: r.organization_id,
    codigo: r.codigo,
    nome: r.nome,
    fonte: r.fonte,
    unidade: r.unidade,
    custo: Number(r.custo ?? 0),
    fabricante: r.fabricante ?? null,
    densidadeKgM3: r.densidade_kg_m3 == null ? null : Number(r.densidade_kg_m3),
    condutividadeWmK: r.condutividade_w_mk == null ? null : Number(r.condutividade_w_mk),
    cor: r.cor ?? null,
    funcao: (r.funcao as FuncaoCamada | null) ?? null,
    espessuraPadraoMm: r.espessura_padrao_mm ?? null,
    propriedades: (r.propriedades ?? {}) as Record<string, unknown>,
    active: r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Erros legíveis antes de gravar; vazio = pode gravar. */
export function validarMaterial(m: { codigo: string; nome: string; unidade: string; custo: number; densidadeKgM3?: number | null; condutividadeWmK?: number | null; cor?: string | null; espessuraPadraoMm?: number | null }): string[] {
  const erros: string[] = [];
  if (!m.codigo.trim()) erros.push('código é obrigatório (SINAPI ou interno)');
  else if (/\s/.test(m.codigo.trim())) erros.push('código não pode ter espaço');
  if (!m.nome.trim()) erros.push('nome é obrigatório');
  if (!m.unidade.trim()) erros.push('unidade é obrigatória');
  if (!Number.isFinite(m.custo) || m.custo < 0) erros.push('custo tem de ser zero ou positivo');
  if (m.densidadeKgM3 != null && !(m.densidadeKgM3 > 0)) erros.push('densidade tem de ser positiva');
  if (m.condutividadeWmK != null && !(m.condutividadeWmK > 0)) erros.push('condutividade tem de ser positiva');
  if (m.cor && !/^#[0-9a-fA-F]{6}$/.test(m.cor)) erros.push('cor tem de ser #rrggbb');
  if (m.espessuraPadraoMm != null && !(Number.isInteger(m.espessuraPadraoMm) && m.espessuraPadraoMm > 0)) erros.push('espessura padrão tem de ser inteira e positiva');
  return erros;
}

/** Índice por código — o que as telas usam para resolver `itemCode`. */
export function indicePorCodigo(materiais: readonly Material[]): Map<string, Material> {
  return new Map(materiais.map((m) => [m.codigo, m]));
}

/** A camada pronta a partir do material: função e espessura usuais, descrição = nome. */
export function camadaDoMaterial(m: Material, espessuraMm?: number): CamadaParede {
  return {
    espessuraMm: espessuraMm ?? m.espessuraPadraoMm ?? 25,
    itemCode: m.codigo,
    descricao: m.nome,
    funcao: m.funcao ?? 'REVESTIMENTO',
  };
}

/** Massa de um volume, quando a densidade é conhecida. */
export function massaKg(volumeM3: number, m: Material | undefined): number | null {
  if (!m?.densidadeKgM3) return null;
  return volumeM3 * m.densidadeKgM3;
}

export interface DesempenhoTermico {
  /** Σ e/λ das camadas com condutividade conhecida, m²·K/W. */
  resistenciaM2KW: number;
  /** U = 1/(Rsi + R + Rse), W/m²·K. `null` quando alguma camada não tem λ. */
  transmitanciaWm2K: number | null;
  camadasSemLambda: string[];
}

/** NBR 15220: Rsi 0,13 + Rse 0,04 (parede). Câmara de ar sem material vale R = 0,17 (não ventilada, 2–5 cm). */
export function desempenhoTermico(camadas: readonly CamadaParede[], porCodigo: Map<string, Material>, rsi = 0.13, rse = 0.04): DesempenhoTermico {
  let r = 0;
  const semLambda: string[] = [];
  for (const c of camadas) {
    if (c.funcao === 'CAMARA_AR' && !c.itemCode) {
      r += 0.17;
      continue;
    }
    const m = porCodigo.get(c.itemCode);
    if (!m?.condutividadeWmK) {
      semLambda.push(c.descricao || c.itemCode || c.funcao);
      continue;
    }
    r += c.espessuraMm / 1000 / m.condutividadeWmK;
  }
  return { resistenciaM2KW: r, transmitanciaWm2K: semLambda.length ? null : 1 / (rsi + r + rse), camadasSemLambda: semLambda };
}

/** Custo de uma quantidade na unidade do material; `null` quando a grandeza não casa com a unidade. */
export function custoDe(m: Material, grandezas: { areaM2?: number; volumeM3?: number; comprimentoM?: number; unidades?: number; kg?: number }): number | null {
  const u = m.unidade.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s.]/g, '');
  const q =
    u === 'm2' || u === 'm²' ? grandezas.areaM2
      : u === 'm3' || u === 'm³' ? grandezas.volumeM3
        : u === 'm' || u === 'ml' ? grandezas.comprimentoM
          : u === 'un' || u === 'und' || u === 'pc' ? grandezas.unidades
            : u === 'kg' ? grandezas.kg
              : undefined;
  return q == null ? null : q * m.custo;
}

/** Sementes para a biblioteca nascer útil — código INTERNO, custo zero (a org preenche). */
export const MATERIAIS_SEMENTE: ReadonlyArray<Omit<Material, 'id' | 'organizationId' | 'active' | 'createdAt' | 'updatedAt'>> = [
  { codigo: 'INT-BLOCO-CER-14', nome: 'Bloco cerâmico 14 cm', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 1300, condutividadeWmK: 0.9, cor: '#c4a484', funcao: 'VEDACAO', espessuraPadraoMm: 140, propriedades: {} },
  { codigo: 'INT-CONCRETO', nome: 'Concreto armado', fonte: 'INTERNA', unidade: 'm³', custo: 0, fabricante: null, densidadeKgM3: 2500, condutividadeWmK: 1.75, cor: '#94a3b8', funcao: 'ESTRUTURAL', espessuraPadraoMm: 150, propriedades: {} },
  { codigo: 'INT-REBOCO', nome: 'Reboco / emboço', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 1900, condutividadeWmK: 1.15, cor: '#e2e8f0', funcao: 'REVESTIMENTO', espessuraPadraoMm: 25, propriedades: {} },
  { codigo: 'INT-CONTRAPISO', nome: 'Contrapiso', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 2000, condutividadeWmK: 1.15, cor: '#cbd5e1', funcao: 'REVESTIMENTO', espessuraPadraoMm: 40, propriedades: {} },
  { codigo: 'INT-PORCELANATO', nome: 'Porcelanato', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 2300, condutividadeWmK: 1.05, cor: '#f1f5f9', funcao: 'ACABAMENTO', espessuraPadraoMm: 10, propriedades: {} },
  { codigo: 'INT-CERAMICA', nome: 'Cerâmica', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 2000, condutividadeWmK: 0.9, cor: '#fde68a', funcao: 'ACABAMENTO', espessuraPadraoMm: 8, propriedades: {} },
  { codigo: 'INT-GESSO', nome: 'Placa de gesso acartonado', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 750, condutividadeWmK: 0.35, cor: '#f8fafc', funcao: 'ACABAMENTO', espessuraPadraoMm: 13, propriedades: {} },
  { codigo: 'INT-EPS', nome: 'EPS (isopor)', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 20, condutividadeWmK: 0.04, cor: '#fef3c7', funcao: 'ISOLAMENTO', espessuraPadraoMm: 50, propriedades: {} },
  { codigo: 'INT-LA-ROCHA', nome: 'Lã de rocha', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 32, condutividadeWmK: 0.045, cor: '#fde68a', funcao: 'ISOLAMENTO', espessuraPadraoMm: 50, propriedades: {} },
  { codigo: 'INT-RODAPE-PORC', nome: 'Rodapé de porcelanato', fonte: 'INTERNA', unidade: 'm', custo: 0, fabricante: null, densidadeKgM3: null, condutividadeWmK: null, cor: null, funcao: 'ACABAMENTO', espessuraPadraoMm: null, propriedades: {} },
  { codigo: 'INT-GC-VIDRO', nome: 'Guarda-corpo de vidro laminado', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: 2500, condutividadeWmK: null, cor: '#bae6fd', funcao: null, espessuraPadraoMm: null, propriedades: {} },
  { codigo: 'INT-GC-INOX', nome: 'Corrimão de aço inox', fonte: 'INTERNA', unidade: 'm', custo: 0, fabricante: null, densidadeKgM3: null, condutividadeWmK: null, cor: null, funcao: null, espessuraPadraoMm: null, propriedades: {} },
];

export interface UsoDeMaterial {
  codigo: string;
  descricao: string;
  origem: 'PAREDE' | 'PISO' | 'FORRO' | 'RODAPE' | 'GUARDA_CORPO';
  areaM2: number;
  volumeM3: number;
  comprimentoM: number;
}

/** Resumo de UM código no desenho, com massa e custo quando a biblioteca sabe. */
export function resumirUso(usos: readonly UsoDeMaterial[], m: Material | undefined): { areaM2: number; volumeM3: number; comprimentoM: number; massaKg: number | null; custo: number | null } {
  const areaM2 = usos.reduce((s, u) => s + u.areaM2, 0);
  const volumeM3 = usos.reduce((s, u) => s + u.volumeM3, 0);
  const comprimentoM = usos.reduce((s, u) => s + u.comprimentoM, 0);
  return { areaM2, volumeM3, comprimentoM, massaKg: massaKg(volumeM3, m), custo: m ? custoDe(m, { areaM2, volumeM3, comprimentoM }) : null };
}

/**
 * O material como ITEM de orçamento (`SinapiItem`): é assim que
 * `gerarLancamentos*` o consome. `type` vem de fora porque o enum mora em
 * `types/budget.ts` e este módulo não importa tipos de orçamento.
 */
export function itemDoMaterial<T extends string>(m: Material, type: T): { code: string; description: string; unit: string; price: number; type: T; category: string; source: 'SINAPI' | 'Própria'; isOverride: boolean } {
  return {
    code: m.codigo,
    description: m.nome,
    unit: m.unidade,
    price: m.custo,
    type,
    category: m.funcao ?? 'Material',
    // `source` só conhece os dois valores do orçamento: o material interno é
    // "Própria" (é da casa); o importado do SINAPI continua "SINAPI".
    source: m.fonte === 'SINAPI' ? 'SINAPI' : 'Própria',
    isOverride: true,
  };
}
