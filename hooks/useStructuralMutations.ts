/**
 * Hooks de mutação — módulo Estrutural / Ferragem Armada.
 *
 * Regra de invalidação:
 *  - Catálogo de aço → invalida só o catálogo (não afeta a árvore)
 *  - Assemblies/elements/rebars → invalida a query granular (para a aba "Obra")
 *    + invalida ['structural','structure'] (prefixo broad) para que as abas
 *    "Corte & Dobra" e "Quantitativo" (useProjectStructure) reflitam a mudança.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { structuralService } from '../services/structuralService'
import { structuralKeys } from '../lib/queryKeys'
import type {
    UpsertSteelInput,
    UpsertAssemblyInput,
    UpsertElementInput,
    UpsertRebarInput,
} from '../types/structural'

// Prefixo que cobre todas as queries de estrutura aninhada (useProjectStructure)
const STRUCTURE_PREFIX = ['structural', 'structure'] as const

// ── Catálogo de aço ───────────────────────────────────────────
export function useUpsertSteel(orgId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpsertSteelInput) => structuralService.upsertSteel(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.catalog(orgId) }),
    })
}

export function useDeleteSteel(orgId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteSteel(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.catalog(orgId) }),
    })
}

// ── Estruturas (assemblies) ───────────────────────────────────
export function useUpsertAssembly(projectId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpsertAssemblyInput) => structuralService.upsertAssembly(input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: structuralKeys.assemblies(projectId) })
            qc.invalidateQueries({ queryKey: structuralKeys.structure(projectId) })
        },
    })
}

export function useDeleteAssembly(projectId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteAssembly(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: structuralKeys.assemblies(projectId) })
            qc.invalidateQueries({ queryKey: structuralKeys.structure(projectId) })
        },
    })
}

// ── Elementos ─────────────────────────────────────────────────
export function useUpsertElement(assemblyId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpsertElementInput) => structuralService.upsertElement(input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: structuralKeys.elements(assemblyId) })
            qc.invalidateQueries({ queryKey: STRUCTURE_PREFIX })
        },
    })
}

export function useDeleteElement(assemblyId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteElement(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: structuralKeys.elements(assemblyId) })
            qc.invalidateQueries({ queryKey: STRUCTURE_PREFIX })
        },
    })
}

// ── Armaduras ─────────────────────────────────────────────────
export function useUpsertRebar(elementId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpsertRebarInput) => structuralService.upsertRebar(input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: structuralKeys.rebars(elementId) })
            qc.invalidateQueries({ queryKey: STRUCTURE_PREFIX })
        },
    })
}

export function useDeleteRebar(elementId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteRebar(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: structuralKeys.rebars(elementId) })
            qc.invalidateQueries({ queryKey: STRUCTURE_PREFIX })
        },
    })
}
