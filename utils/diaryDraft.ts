import type { DiaryEntry } from '../types/diary';

/**
 * Rascunho do registro do diário guardado NO APARELHO (localStorage).
 *
 * Em campo o sinal cai e o celular descarrega a aba quando a câmera abre e
 * falta memória — sem isto, tudo o que foi digitado se perdia. É conveniência
 * de quem está digitando, não dado do sistema: o registro só existe depois do
 * "Salvar registro" (RPC `diary_upsert_entry`).
 *
 * Prefixo `orca_`: o logout (`useStore.logout`) apaga — num tablet de obra
 * compartilhado, o rascunho de uma pessoa não fica para a próxima.
 * Registro novo usa a chave `novo` (o id dele ainda não existe no banco).
 */

export const PREFIXO_RASCUNHO = 'orca_diario_rascunho:';
const NOVO = 'novo';

export interface RascunhoDiario {
    entry: DiaryEntry;
    /** ISO do momento em que foi guardado. */
    salvoEm: string;
}

/** O que precisamos do storage — injetável para teste. */
export interface ArmazenamentoRascunho {
    getItem(k: string): string | null;
    setItem(k: string, v: string): void;
    removeItem(k: string): void;
    key(i: number): string | null;
    readonly length: number;
}

function padrao(): ArmazenamentoRascunho | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null; // navegação privada / site data bloqueado
    }
}

export function chaveRascunho(projectId: string, entryId: string | null): string {
    return `${PREFIXO_RASCUNHO}${projectId}:${entryId || NOVO}`;
}

export function salvarRascunho(
    projectId: string, entryId: string | null, entry: DiaryEntry,
    agora: Date = new Date(), st: ArmazenamentoRascunho | null = padrao(),
): void {
    if (!st || !projectId) return;
    try {
        const r: RascunhoDiario = { entry, salvoEm: agora.toISOString() };
        st.setItem(chaveRascunho(projectId, entryId), JSON.stringify(r));
    } catch {
        // cota cheia / bloqueado: o rascunho é conveniência, nunca derruba a tela
    }
}

export function lerRascunho(
    projectId: string, entryId: string | null, st: ArmazenamentoRascunho | null = padrao(),
): RascunhoDiario | null {
    if (!st || !projectId) return null;
    try {
        const raw = st.getItem(chaveRascunho(projectId, entryId));
        if (!raw) return null;
        const r = JSON.parse(raw) as RascunhoDiario;
        return r && r.entry && typeof r.entry.id === 'string' && typeof r.salvoEm === 'string' ? r : null;
    } catch {
        return null;
    }
}

export function apagarRascunho(projectId: string, entryId: string | null, st: ArmazenamentoRascunho | null = padrao()): void {
    if (!st || !projectId) return;
    try { st.removeItem(chaveRascunho(projectId, entryId)); } catch { /* idem */ }
}

/** Rascunhos deste diário: `entryId` null = registro novo. */
export function listarRascunhos(
    projectId: string, st: ArmazenamentoRascunho | null = padrao(),
): { entryId: string | null; rascunho: RascunhoDiario }[] {
    if (!st || !projectId) return [];
    const base = `${PREFIXO_RASCUNHO}${projectId}:`;
    const out: { entryId: string | null; rascunho: RascunhoDiario }[] = [];
    try {
        for (let i = 0; i < st.length; i++) {
            const k = st.key(i);
            if (!k || !k.startsWith(base)) continue;
            const id = k.slice(base.length);
            const entryId = id === NOVO ? null : id;
            const r = lerRascunho(projectId, entryId, st);
            if (r) out.push({ entryId, rascunho: r });
        }
    } catch {
        return out;
    }
    return out;
}

/** O formulário mudou em relação ao que abriu? (o que vale guardar como rascunho) */
export function rascunhoDifere(a: DiaryEntry, b: DiaryEntry): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
}

/** "14/10 às 22:31" — quando o rascunho foi guardado. */
export function quandoFoiGuardado(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}
