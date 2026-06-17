import React, { useEffect, useState } from 'react';
import { X, Building2, Share2, Loader2, Check } from 'lucide-react';
import { Employee, laborService } from '../services/laborService';

interface LaborEmployeeSharingProps {
    employee: Employee;
    organizations: { id: string; name: string }[];
    currentUserEmail?: string;
    onClose: () => void;
    onSaved: () => void;
}

const LaborEmployeeSharing: React.FC<LaborEmployeeSharingProps> = ({
    employee,
    organizations,
    currentUserEmail,
    onClose,
    onSaved,
}) => {
    const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filtra a própria org do colaborador (não faz sentido compartilhar consigo)
    const targetOrgs = organizations.filter(o => o.id !== employee.org_id);

    useEffect(() => {
        laborService.getEmployeeShares(employee.id)
            .then(shares => {
                setSelectedOrgIds(new Set(shares.map(s => s.target_org_id)));
            })
            .catch(err => setError(err.message || 'Erro ao carregar compartilhamentos'))
            .finally(() => setLoading(false));
    }, [employee.id]);

    const toggle = (orgId: string) => {
        setSelectedOrgIds(prev => {
            const next = new Set(prev);
            if (next.has(orgId)) next.delete(orgId);
            else next.add(orgId);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await laborService.setEmployeeShares(
                employee.id,
                Array.from(selectedOrgIds),
                currentUserEmail,
            );
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar compartilhamentos');
        } finally {
            setSaving(false);
        }
    };

    const ownerOrg = organizations.find(o => o.id === employee.org_id);

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                            <Share2 className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900">Disponibilizar Colaborador</h2>
                            <p className="text-xs text-slate-400 mt-0.5">{employee.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* Org dona */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Organização de origem</p>
                            <p className="text-sm font-bold text-slate-700 truncate">{ownerOrg?.name || employee.org_id}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-full">DONA</span>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Carregando...</span>
                        </div>
                    ) : targetOrgs.length === 0 ? (
                        <div className="py-8 text-center text-slate-400">
                            <Building2 className="w-10 h-10 mx-auto opacity-20 mb-2" />
                            <p className="text-sm font-medium">Nenhuma outra organização disponível</p>
                            <p className="text-xs mt-1">Cadastre mais organizações para compartilhar colaboradores entre elas.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider px-1">
                                Disponibilizar também para:
                            </p>
                            {targetOrgs.map(org => {
                                const active = selectedOrgIds.has(org.id);
                                return (
                                    <button
                                        key={org.id}
                                        onClick={() => toggle(org.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left
                                            ${active
                                                ? 'border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-100'
                                                : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                                            }`}
                                    >
                                        <Building2 className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                                        <span className={`flex-1 text-sm font-bold truncate ${active ? 'text-indigo-900' : 'text-slate-700'}`}>
                                            {org.name}
                                        </span>
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                                            ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>
                                            {active && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {error && (
                        <p className="text-xs text-red-600 font-bold px-1">{error}</p>
                    )}
                </div>

                {/* Footer */}
                {!loading && targetOrgs.length > 0 && (
                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                        <p className="text-[11px] text-slate-400 font-medium">
                            {selectedOrgIds.size === 0
                                ? 'Colaborador disponível apenas na org de origem'
                                : `Disponível em mais ${selectedOrgIds.size} organização${selectedOrgIds.size > 1 ? 'ões' : ''}`}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20 active:scale-95 disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Salvar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LaborEmployeeSharing;
