import React from 'react';
import { X, User, Mail, Phone, FileText, Building2 } from 'lucide-react';
import { Investor } from '../services/investorService';
import { projectService } from '../services/projectService';

interface InvestorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: Partial<Investor>) => Promise<Investor | void>;
    initialData?: Investor;
}

const InvestorModal: React.FC<InvestorModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [formData, setFormData] = React.useState<Partial<Investor>>({
        name: '',
        email: '',
        phone: '',
        document: ''
    });

    // State for projects linkage
    const [projects, setProjects] = React.useState<any[]>([]);
    const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set());
    const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            loadProjects();
        }
    }, [isOpen]);

    const loadProjects = async () => {
        setIsLoadingProjects(true);
        try {
            const allProjects = await projectService.listProjects();
            // Filter only OBRAS
            const obras = allProjects.filter((p: any) => p.settings?.classification === 'OBRA');
            setProjects(obras);

            // If editing, check which projects are linked to this investor
            if (initialData?.id) {
                const linked = obras
                    .filter((p: any) => p.settings?.investorId === initialData.id)
                    .map((p: any) => p.id);
                setSelectedProjectIds(new Set(linked));
            } else {
                setSelectedProjectIds(new Set());
            }
        } catch (error) {
            console.error("Erro ao carregar obras:", error);
        } finally {
            setIsLoadingProjects(false);
        }
    };

    React.useEffect(() => {
        if (initialData && isOpen) {
            setFormData(initialData);
        } else if (isOpen) {
            setFormData({
                name: '',
                email: '',
                phone: '',
                document: ''
            });
            setSelectedProjectIds(new Set());
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.email) {
            alert("Nome e E-mail são obrigatórios.");
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
        } catch (error) {
            console.error("Error in modal submit:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateProjectLinks = async (investorId: string) => {
        const promises = projects.map(async (p) => {
            const isSelected = selectedProjectIds.has(p.id);
            const currentInvestorId = p.settings?.investorId;

            // If selected but not linked -> Link
            if (isSelected && currentInvestorId !== investorId) {
                return projectService.saveProject({
                    ...p,
                    settings: { ...p.settings, investorId: investorId, investorName: formData.name }
                });
            }
            // If NOT selected but WAS linked -> Unlink
            else if (!isSelected && currentInvestorId === investorId) {
                return projectService.saveProject({
                    ...p,
                    settings: { ...p.settings, investorId: undefined, investorName: undefined }
                });
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
        // We might need to refresh the parent list to show new links? 
        // The parent reloads on submit, so it should be fine IF we await this.
        // But we are not awaiting `onSubmit`. Race condition?
        // Yes.

        // I'll leave this logic here but I really need to update the parent to wait for this.
    };

    const toggleProject = (id: string) => {
        const newSet = new Set(selectedProjectIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedProjectIds(newSet);
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-12">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
            <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden border border-gray-200">
                <div className="bg-gray-50 px-12 py-8 border-b border-gray-100 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <User className="w-5 h-5 text-purple-600" />
                            {initialData ? 'Editar Investidor' : 'Novo Investidor'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto p-12 space-y-6">
                    <form id="investor-form" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                                        onChange={(e) => setFormData({ ...formData, document: e.target.value })}
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
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
                                                    {project.settings?.investorId && project.settings?.investorId !== initialData?.id && (
                                                        <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] ml-1">
                                                            Já vinculado a outro
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </form>
                </div>

                <div className="pt-6 px-12 pb-8 flex gap-3 border-t border-gray-100 bg-gray-50 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="investor-form"
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Salvando...' : 'Salvar Investidor'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InvestorModal;
