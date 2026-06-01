/**
 * Hooks de consulta — módulo Estrutural / Ferragem Armada.
 * Componentes não chamam structuralService diretamente; importam estes hooks.
 */
import { useQuery } from '@tanstack/react-query'
import { structuralService } from '../services/structuralService'
import { structuralKeys } from '../lib/queryKeys'
import { STALE } from '../lib/queryClient'

export function useSteelCatalog(orgId?: string) {
    return useQuery({
        queryKey: structuralKeys.catalog(orgId ?? 'global'),
        queryFn: () => structuralService.listSteelCatalog(orgId),
        staleTime: STALE.normal,
    })
}

export function useAssemblies(projectId?: string) {
    return useQuery({
        queryKey: structuralKeys.assemblies(projectId ?? 'none'),
        queryFn: () => structuralService.listAssemblies(projectId as string),
        enabled: !!projectId,
        staleTime: STALE.normal,
    })
}

export function useElements(assemblyId?: string) {
    return useQuery({
        queryKey: structuralKeys.elements(assemblyId ?? 'none'),
        queryFn: () => structuralService.listElements(assemblyId as string),
        enabled: !!assemblyId,
        staleTime: STALE.normal,
    })
}

export function useRebars(elementId?: string) {
    return useQuery({
        queryKey: structuralKeys.rebars(elementId ?? 'none'),
        queryFn: () => structuralService.listRebars(elementId as string),
        enabled: !!elementId,
        staleTime: STALE.normal,
    })
}

/** Carga completa obra: assemblies → elements → rebars (uma query com joins). */
export function useProjectStructure(projectId?: string) {
    return useQuery({
        queryKey: structuralKeys.structure(projectId ?? 'none'),
        queryFn: () => structuralService.loadProjectStructure(projectId as string),
        enabled: !!projectId,
        staleTime: STALE.normal,
    })
}
