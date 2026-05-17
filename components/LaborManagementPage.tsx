import React, { useState, useEffect } from 'react';
import { ResourceManagement } from './ResourceManagement';
import { organizationService } from '../services/organizationService';
import { Organization, ResourceRole, ResourceWorker, ResourceTeam, LaborCompany } from '../types';
import { Loader2, Building2, AlertCircle } from 'lucide-react';

interface LaborManagementPageProps {
    activeOrganizationId?: string;
}

const LaborManagementPage: React.FC<LaborManagementPageProps> = ({ activeOrganizationId }) => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(activeOrganizationId || null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSelectedOrgId(activeOrganizationId || null);
    }, [activeOrganizationId]);

    useEffect(() => {
        fetchOrganizations();
    }, []);

    const fetchOrganizations = async () => {
        setLoading(true);
        try {
            const list = await organizationService.listOrganizations();
            setOrganizations(list);
        } catch (err) {
            console.error("Error listing organizations:", err);
            setError("Não foi possível carregar as organizações.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateResources = async (updatedResources: {
        roles: ResourceRole[];
        workers: ResourceWorker[];
        teams: ResourceTeam[];
        companies?: LaborCompany[];
    }) => {
        try {
            const defaultOrgId = organizations[0]?.id;
            if (!defaultOrgId) return;

            if (selectedOrgId) {
                const org = organizations.find(o => o.id === selectedOrgId);
                if (!org) return;

                const updatedOrg = { ...org, resources: updatedResources };
                await organizationService.updateOrganization(selectedOrgId, updatedOrg);
                setOrganizations(prev => prev.map(o => o.id === selectedOrgId ? updatedOrg : o));
            } else {
                // Global update mode (All organizations)
                const orgMap = new Map<string, any>();
                organizations.forEach(org => {
                    orgMap.set(org.id, { roles: [], workers: [], teams: [], companies: org.resources?.companies || [] });
                });

                updatedResources.roles.forEach(r => {
                    const orgId = r.organizationId || defaultOrgId;
                    if (orgMap.has(orgId)) orgMap.get(orgId).roles.push(r);
                });
                updatedResources.workers.forEach(w => {
                    const orgId = w.organizationId || defaultOrgId;
                    if (orgMap.has(orgId)) orgMap.get(orgId).workers.push(w);
                });
                updatedResources.teams.forEach(t => {
                    const orgId = t.organizationId || defaultOrgId;
                    if (orgMap.has(orgId)) orgMap.get(orgId).teams.push(t);
                });

                const updaters = Array.from(orgMap.entries()).map(async ([orgId, newRes]) => {
                    const org = organizations.find(o => o.id === orgId);
                    if (org) {
                        const updatedOrg = { ...org, resources: newRes };
                        await organizationService.updateOrganization(orgId, updatedOrg);
                        return updatedOrg;
                    }
                    return null;
                });

                const updatedOrgs = (await Promise.all(updaters)).filter(Boolean) as Organization[];
                setOrganizations(updatedOrgs);
            }
        } catch (err) {
            console.error("Error updating organization resources:", err);
            alert("Erro ao salvar as alterações.");
        }
    };

    const aggregatedResources = React.useMemo(() => {
        if (selectedOrgId) {
            return organizations.find(o => o.id === selectedOrgId)?.resources || { roles: [], workers: [], teams: [], companies: [] };
        } else {
            const allRoles: ResourceRole[] = [];
            const allWorkers: ResourceWorker[] = [];
            const allTeams: ResourceTeam[] = [];
            const allCompanies: LaborCompany[] = [];
            
            organizations.forEach(org => {
                const res = org.resources;
                if (!res) return;
                (res.roles || []).forEach(r => allRoles.push({ ...r, organizationId: org.id }));
                (res.workers || []).forEach(w => allWorkers.push({ ...w, organizationId: org.id }));
                (res.teams || []).forEach(t => allTeams.push({ ...t, organizationId: org.id }));
                (res.companies || []).forEach(c => allCompanies.push(c));
            });
            return { roles: allRoles, workers: allWorkers, teams: allTeams, companies: allCompanies };
        }
    }, [organizations, selectedOrgId]);

    if (loading) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center p-12">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Carregando recursos da organização...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center p-12 text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                <h3 className="text-lg font-bold text-gray-900">Erro no Carregamento</h3>
                <p className="text-gray-500 max-w-sm mt-2">{error}</p>
                <button
                    onClick={fetchOrganizations}
                    className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold"
                >
                    Tentar Novamente
                </button>
            </div>
        );
    }

    if (organizations.length === 0) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
                <Building2 className="w-16 h-16 mb-4 opacity-20" />
                <p>Nenhuma organização encontrada. Crie uma organização primeiro.</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
                <ResourceManagement
                    resources={aggregatedResources}
                    onUpdateResources={handleUpdateResources}
                    organizations={organizations}
                    title="Banco de Talentos Centralizado"
                    description="Gestão unificada de funções, trabalhadores e equipes"
                    localLabel="Sistema"
                />
            </div>
        </div>
    );
};

export default LaborManagementPage;
