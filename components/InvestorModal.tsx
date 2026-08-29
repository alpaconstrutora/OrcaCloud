import React from 'react';
import { User, Mail, Phone, FileText, Building2 } from 'lucide-react';
import { Investor } from '../services/investorService';
import { projectService } from '../services/projectService';
import { investorContributionsService } from '../services/investorContributionsService';
import ContributionsManager from './investor/ContributionsManager';
import { Sheet, SheetHeader, SheetTitle, SheetPanel, SheetFooter } from './ui/sheet';

interface InvestorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Investor>) => Promise<Investor | void>;
    initialData?: Investor;
    organizationId?: string;
}

const InvestorModal: React.FC<InvestorModalProps> = ({ isOpen, onClose, onSubmit, initialData, organizationId }) => {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [formData, setFormData] = React.useState<Partial<Investor>>({
        name: '',
        email: '',
        phone: '',
        document: ''
    });

    const update = (patch: Partial<Investor>) => {
        setFormData(prev => ({ ...prev, ...patch }));
        setDirty(true);
    };

    // State for projects linkage
    const [projects, setProjects] = React.useState<any[]>([]);
    const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set());
    const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);
    // Participação por projeto: projectId -> { ownership_pct, committed_amount }
    const [participations, setParticipations] = React.useState<Record<string, { ownership_pct: number; committed_amount: number }>>({});
    // Projeto cujos aportes estão sendo geridos no modal de contribuições
    const [managingProject, setManagingProject] = React.useState<{ id: string; name: string; orgId: string } | null>(null);

    React.useEffect(() => {
        if (isOpen) {
            loadProjects();
        }
    }, [isOpen]);

    const loadProjects = async () => {
        setIsLoadingProjects(true);
        try {
            // Só obras — agora é o default do service (regra #3).
            const obras = await projectService.listProjects();
            setProjects(obras);

            // If editing, check which projects are linked to this investor
            if (initialData?.id) {
                const linkedProjects = obras
                    .filter((p: any) => (p.investor_id ?? p.settings?.investorId) === initialData.id);
                setSelectedProjectIds(new Set(linkedProjects.map((p: any) => p.id)));

                // Carrega participações existentes desses projetos
                const parts: Record<string, { ownership_pct: number; committed_amount: number }> = {};
                await Promise.all(linkedProjects.map(async (p: any) => {
                    try {
                        const part = await investorContributionsService.getParticipation(p.id, initialData.id!);
                        if (part) parts[p.id] = { ownership_pct: part.ownership_pct, committed_amount: part.committed_amount };
                    } catch { /* tabela pode não existir ainda */ }
                }));
                setParticipations(parts);
            } else {
                setSelectedProjectIds(new Set());
                setParticipations({});
            }
        } catch (error) {
            console.error("Erro ao carregar obras:", error);
        } finally {
            setIsLoadingProjects(false);
        }
    };

    React.useEffect(() => {
        if (!isOpen) return;
        setDirty(false);
        if (initialData) {
            // Ensure organization_id is always set (fixes legacy investors with null org_id)
            setFormData({ ...initialData, organization_id: initialData.organization_id ?? organizationId });
        } else {
            setFormData({
                name: '',
                email: '',
                phone: '',
                document: '',
                organization_id: organizationId,
            });
            setSelectedProjectIds(new Set());
        }
    }, [initialData, isOpen, organizationId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            alert("Nome é obrigatório.");
            return;
        }

        // We need to handle the submit slightly differently to include project updates
        // Since onSubmit prop implies just saving the investor, we might need to intercept it 
        // OR rely on the parent to handle it? 
        // The prompt implies doing it here ("On Submit... Update Projects"). 
        // However, we don't know the new ID if we are creating.
        // BUT, looking at InvestorList.tsx: onSubmit calls `await investorService.saveInvestor(data)`.
        // If I change `onSubmit` to return that promise, I can await it here.

        // For now, let's implement the UI and the logic for EXISTING investors (Edit mode).
        // For NEW investors, I'll update InvestorList to return the result, then I can use it.

        // Let's assume I can update InvestorList.tsx independently. I'll do that in a next step.
        // For now, render the UI.

        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const savedInvestor = await onSubmit(formData);
            const investorId = (savedInvestor as Investor)?.id || initialData?.id;
            if (investorId) {
                await updateProjectLinks(investorId);
            }
            setDirty(false);
        } catch (error) {
            console.error("Error in modal submit:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateProjectLinks = async (investorId: string) => {
        const promises = projects.map(async (p) => {
            const isSelected = selectedProjectIds.has(p.id);
            const currentInvestorId = p.investor_id ?? p.settings?.investorId;

            if (isSelected && currentInvestorId !== investorId) {
                await projectService.linkInvestor(p.id!, investorId);
            } else if (!isSelected && currentInvestorId === investorId) {
                await projectService.linkInvestor(p.id!, null);
            }

            // Upsert participação para projetos selecionados que tenham dados preenchidos
            const part = participations[p.id];
            const orgId = p.settings?.organizationId;
            if (isSelected && orgId && part && (part.ownership_pct > 0 || part.committed_amount > 0)) {
                try {
                    const existing = await investorContributionsService.getParticipation(p.id, investorId);
                    await investorContributionsService.saveParticipation({
                        id: existing?.id,
                        organization_id: orgId,
                        project_id: p.id,
                        investor_id: investorId,
                        ownership_pct: part.ownership_pct,
                        committed_amount: part.committed_amount,
                        quota_count: existing?.quota_count ?? 1,
                    });
                } catch (err) {
                    console.error('Erro ao salvar participação', err);
                }
            }
        });
        await Promise.all(promises);
    };

    const setParticipationField = (projectId: string, field: 'ownership_pct' | 'committed_amount', value: number) => {
        setParticipations(prev => ({
            ...prev,
            [projectId]: { ...{ ownership_pct: 0, committed_amount: 0 }, ...prev[projectId], [field]: value },
        }));
        setDirty(true);
    };

    const toggleProject = (id: string) => {
        const newSet = new Set(selectedProjectIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedProjectIds(newSet);
        setDirty(true);
    };

    return (
        <>
        <Sheet open={isOpen} onClose={onClose} size="xl" dirty={dirty}>
                <SheetHeader onClose={onClose}>
                    <SheetTitle className="flex items-center gap-2">
                        <User className="w-5 h-5 text-purple-600" />
                        {initialData ? 'Editar Investidor' : 'Novo Investidor'}
                    </SheetTitle>
                </SheetHeader>

                <SheetPanel className="p-6 space-y-6">
                    <form id="investor-form" onSubmit={handleSubmit} className="space-y-4">
                        {initialData && (
                            <div className="w-32">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
                                    value={formData.code ?? ''}
                                    onChange={(e) => update({ code: e.target.value })}
                                    placeholder="001"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
                                    value={formData.name}
                                    onChange={(e) => update({ name: e.target.value })}
                                    placeholder="Ex: João da Silva"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (Acesso ao Portal)</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input
                                    type="email"
                                    className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
                                    value={formData.email}
                                    onChange={(e) => update({ email: e.target.value })}
                                    placeholder="investidor@exemplo.com"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">Este e-mail será usado para validar o login no Portal do Investidor.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">CPF / CNPJ</label>
                                <div className="relative">
                                    <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
                                        value={formData.document}
                                        onChange={(e) => update({ document: e.target.value })}
                                        placeholder="000.000.000-00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
                                        value={formData.phone}
                                        onChange={(e) => update({ phone: e.target.value })}
                                        placeholder="(00) 00000-0000"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Project Linking Section */}
                        <div className="pt-4 border-t border-gray-100">
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-purple-600" />
                                Vincular Obras
                            </h3>

                            {isLoadingProjects ? (
                                <div className="text-sm text-gray-500 italic">Carregando obras...</div>
                            ) : projects.length === 0 ? (
                                <div className="text-sm text-gray-500 italic bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    Nenhuma obra encontrada para vincular.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                    {projects.map(project => (
                                        <label key={project.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200 transition-all">
                                            <input
                                                type="checkbox"
                                                className="mt-1 w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                checked={selectedProjectIds.has(project.id)}
                                                onChange={() => toggleProject(project.id)}
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-gray-800">{project.name}</div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                                    <span className="truncate max-w-[200px]">{project.settings?.location || 'Local não informado'}</span>
                                                    {(project.investor_id ?? project.settings?.investorId) && (project.investor_id ?? project.settings?.investorId) !== initialData?.id && (
                                                        <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-xs ml-1">
                                                            Já vinculado a outro
                                                        </span>
                                                    )}
                                                </div>
                                                {selectedProjectIds.has(project.id) && (
                                                    <div className="flex gap-3 mt-2" onClick={(e) => e.preventDefault()}>
                                                        <label className="flex flex-col gap-1">
                                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Participação (%)</span>
                                                            <input
                                                                type="number" min="0" max="100" step="0.01"
                                                                value={participations[project.id]?.ownership_pct ?? ''}
                                                                onChange={(e) => setParticipationField(project.id, 'ownership_pct', parseFloat(e.target.value) || 0)}
                                                                className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                                placeholder="0"
                                                            />
                                                        </label>
                                                        <label className="flex flex-col gap-1">
                                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Capital Comprometido (R$)</span>
                                                            <input
                                                                type="number" min="0" step="0.01"
                                                                value={participations[project.id]?.committed_amount ?? ''}
                                                                onChange={(e) => setParticipationField(project.id, 'committed_amount', parseFloat(e.target.value) || 0)}
                                                                className="w-40 px-2 py-1 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                                placeholder="0,00"
                                                            />
                                                        </label>
                                                        {initialData?.id && project.settings?.organizationId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setManagingProject({ id: project.id, name: project.name, orgId: project.settings.organizationId })}
                                                                className="self-end px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-purple-100 transition-colors"
                                                            >
                                                                Gerir Aportes
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </form>
                </SheetPanel>

                <SheetFooter>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="investor-form"
                        disabled={isSubmitting}
                        className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Salvando...' : 'Salvar Investidor'}
                    </button>
                </SheetFooter>
        </Sheet>

        {managingProject && initialData?.id && (
            <ContributionsManager
                organizationId={managingProject.orgId}
                projectId={managingProject.id}
                projectName={managingProject.name}
                investorId={initialData.id}
                onClose={() => setManagingProject(null)}
            />
        )}
        </>
    );
};

export default InvestorModal;
