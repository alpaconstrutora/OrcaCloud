import { supabase } from '../lib/supabase';
import { CrewClassificationConfig, DEFAULT_CREW_CLASSIFICATION } from '../utils/schedulingEngine';

/**
 * Per-org persistence for the crew classification keyword lists used by "Auto Equipe".
 *
 * Stored as `organizations.resources.crewClassification` (JSONB), mirroring the
 * pattern used by supplierCategoryService. The stored value is the FULL effective
 * config (all 4 lists), so the editor can present and tune the complete lists.
 */

type OrgResources = { crewClassification?: CrewClassificationConfig } & Record<string, unknown>;

const normalizeList = (list: unknown): string[] =>
    Array.isArray(list)
        ? Array.from(new Set(list.map(v => String(v).trim().toLowerCase()).filter(Boolean)))
        : [];

/** Merge a stored (possibly partial) config over the defaults to get the effective config. */
export function effectiveCrewClassification(stored?: Partial<CrewClassificationConfig> | null): CrewClassificationConfig {
    return {
        laborRoles: stored?.laborRoles ?? DEFAULT_CREW_CLASSIFICATION.laborRoles,
        equipmentKeywords: stored?.equipmentKeywords ?? DEFAULT_CREW_CLASSIFICATION.equipmentKeywords,
        helperRoles: stored?.helperRoles ?? DEFAULT_CREW_CLASSIFICATION.helperRoles,
        mainWorkerRoles: stored?.mainWorkerRoles ?? DEFAULT_CREW_CLASSIFICATION.mainWorkerRoles,
    };
}

export const crewClassificationService = {
    /** Returns the org's stored override, or null if none. */
    async get(organizationId: string): Promise<CrewClassificationConfig | null> {
        if (!organizationId) return null;
        const { data, error } = await supabase
            .from('organizations')
            .select('resources')
            .eq('id', organizationId)
            .maybeSingle();

        if (error) {
            console.error('[CREW CLASSIFICATION] Error loading config:', error);
            return null;
        }
        const resources = (data?.resources as OrgResources | null) ?? null;
        return resources?.crewClassification ?? null;
    },

    /** Returns the effective config (defaults merged with the org override). */
    async getEffective(organizationId: string): Promise<CrewClassificationConfig> {
        const stored = await this.get(organizationId);
        return effectiveCrewClassification(stored);
    },

    /** Persists the full config into organizations.resources.crewClassification. */
    async save(organizationId: string, config: CrewClassificationConfig): Promise<void> {
        if (!organizationId) throw new Error('Selecione uma organização ativa para configurar cargos.');

        const { data, error: readErr } = await supabase
            .from('organizations')
            .select('resources')
            .eq('id', organizationId)
            .single();
        if (readErr) throw readErr;

        const resources = (data?.resources as OrgResources | null) ?? {};
        const sanitized: CrewClassificationConfig = {
            laborRoles: normalizeList(config.laborRoles),
            equipmentKeywords: normalizeList(config.equipmentKeywords),
            helperRoles: normalizeList(config.helperRoles),
            mainWorkerRoles: normalizeList(config.mainWorkerRoles),
        };

        const { error } = await supabase
            .from('organizations')
            .update({ resources: { ...resources, crewClassification: sanitized } })
            .eq('id', organizationId);
        if (error) throw error;
    },

    /** Removes the org override, reverting to defaults. */
    async reset(organizationId: string): Promise<void> {
        if (!organizationId) return;
        const { data, error: readErr } = await supabase
            .from('organizations')
            .select('resources')
            .eq('id', organizationId)
            .single();
        if (readErr) throw readErr;

        const resources = (data?.resources as OrgResources | null) ?? {};
        const { crewClassification: _omit, ...rest } = resources;
        void _omit;

        const { error } = await supabase
            .from('organizations')
            .update({ resources: rest })
            .eq('id', organizationId);
        if (error) throw error;
    },
};
