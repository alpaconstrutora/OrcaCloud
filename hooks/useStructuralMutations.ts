/**
 * Hooks de mutação — módulo Estrutural / Ferragem Armada.
 * Cada mutação invalida a query key correspondente após sucesso.
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
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.assemblies(projectId) }),
    })
}

export function useDeleteAssembly(projectId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteAssembly(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.assemblies(projectId) }),
    })
}

// ── Elementos ─────────────────────────────────────────────────
export function useUpsertElement(assemblyId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpsertElementInput) => structuralService.upsertElement(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.elements(assemblyId) }),
    })
}

export function useDeleteElement(assemblyId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteElement(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.elements(assemblyId) }),
    })
}

// ── Armaduras ─────────────────────────────────────────────────
export function useUpsertRebar(elementId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpsertRebarInput) => structuralService.upsertRebar(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.rebars(elementId) }),
    })
}

export function useDeleteRebar(elementId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => structuralService.deleteRebar(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: structuralKeys.rebars(elementId) }),
    })
}
