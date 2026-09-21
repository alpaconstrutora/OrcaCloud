import React from 'react';
import { Search, Users, UserPlus } from 'lucide-react';
import { Sheet, SheetHeader, SheetPanel, SheetFooter } from './ui/sheet';
import { laborService, Employee } from '../services/laborService';
import { useOrgContext } from '../hooks/useOrgContext';

interface DiaryLaborFromRhSheetProps {
    open: boolean;
    onClose: () => void;
    /** Nomes que já estão no efetivo do registro — aparecem marcados e não entram de novo. */
    jaNoEfetivo: string[];
    onAdd: (colaboradores: Employee[]) => void;
}

const CONTRACT_LABEL: Record<string, string> = {
    CLT: 'CLT', PJ: 'PJ', DIARISTA: 'Diarista', EMPREITEIRO: 'Empreiteiro', ESTAGIARIO: 'Estagiário',
};

/**
 * Efetivo do diário a partir de Recursos Humanos › Colaboradores. Lista os
 * colaboradores ATIVOS da organização do topo (REGRA #5: "Todas" = consolidado
 * pela RLS), com busca e seleção múltipla; cada selecionado vira uma linha do
 * efetivo (nome, quantidade 1, cargo em observações).
 */
const DiaryLaborFromRhSheet: React.FC<DiaryLaborFromRhSheetProps> = ({ open, onClose, jaNoEfetivo, onAdd }) => {
    const { orgId } = useOrgContext();
    const [colaboradores, setColaboradores] = React.useState<Employee[]>([]);
    const [carregando, setCarregando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [busca, setBusca] = React.useState('');
    const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());

    React.useEffect(() => {
        if (!open) return;
        let ativo = true;
        setCarregando(true);
        setErro(null);
        setSelecionados(new Set());
        setBusca('');
        laborService.listEmployees(orgId)
            .then(lista => { if (ativo) setColaboradores(lista.filter(e => e.status === 'ATIVO')); })
            .catch((e: unknown) => { if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao listar colaboradores.'); })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [open, orgId]);

    const jaIncluidos = React.useMemo(() => new Set(jaNoEfetivo.map(n => n.trim().toLowerCase())), [jaNoEfetivo]);

    const visiveis = React.useMemo(() => {
        const termo = busca.trim().toLowerCase();
        if (!termo) return colaboradores;
        return colaboradores.filter(e =>
            e.name.toLowerCase().includes(termo) || (e.role || '').toLowerCase().includes(termo));
    }, [colaboradores, busca]);

    const disponiveis = visiveis.filter(e => !jaIncluidos.has(e.name.trim().toLowerCase()));
    const todosVisiveisMarcados = disponiveis.length > 0 && disponiveis.every(e => selecionados.has(e.id));

    const alternar = (id: string) => setSelecionados(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const alternarTodos = () => setSelecionados(prev => {
        const next = new Set(prev);
        if (todosVisiveisMarcados) disponiveis.forEach(e => next.delete(e.id));
        else disponiveis.forEach(e => next.add(e.id));
        return next;
    });

    const confirmar = () => {
        const escolhidos = colaboradores.filter(e => selecionados.has(e.id));
        if (escolhidos.length === 0) return;
        onAdd(escolhidos);
        onClose();
    };

    return (
        <Sheet open={open} onClose={onClose} size="md" zIndex={80}>
            <SheetHeader onClose={onClose}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                        <Users className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-900 tracking-tight">Adicionar do RH</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Colaboradores ativos de Recursos Humanos › Colaboradores</p>
                    </div>
                </div>
            </SheetHeader>

            <SheetPanel className="p-0 flex flex-col min-h-0">
                <div className="p-2 border-b border-gray-100 flex items-center gap-2.5">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Buscar por nome ou cargo..."
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <label className="flex items-center gap-2 h-9 px-3 text-sm font-medium text-gray-700 whitespace-nowrap cursor-pointer select-none">
                        <input type="checkbox" checked={todosVisiveisMarcados} onChange={alternarTodos} disabled={disponiveis.length === 0} className="rounded border-gray-300" />
                        Todos
                    </label>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {carregando ? (
                        /* §11 */
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                            <p className="mt-2 text-gray-500">Carregando...</p>
                        </div>
                    ) : erro ? (
                        <div className="m-4 p-3 bg-red-50 border border-red-100 rounded-[6px] text-sm text-red-700">{erro}</div>
                    ) : visiveis.length === 0 ? (
                        /* §12 — dentro do painel, sem moldura própria */
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum colaborador encontrado</h3>
                            <p className="text-sm text-gray-500">
                                {busca ? 'Tente outro nome ou cargo.' : 'Cadastre colaboradores ativos em Recursos Humanos › Colaboradores.'}
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {visiveis.map(e => {
                                const incluido = jaIncluidos.has(e.name.trim().toLowerCase());
                                const marcado = incluido || selecionados.has(e.id);
                                return (
                                    <li key={e.id}>
                                        <label className={`flex items-center gap-3 px-4 py-2.5 ${incluido ? 'opacity-60 cursor-default' : 'hover:bg-gray-50 cursor-pointer'}`}>
                                            <input
                                                type="checkbox"
                                                checked={marcado}
                                                disabled={incluido}
                                                onChange={() => alternar(e.id)}
                                                className="rounded border-gray-300"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-normal text-gray-900 truncate">{e.name}</p>
                                                <p className="text-xs text-gray-500 truncate">
                                                    {[e.role, CONTRACT_LABEL[e.contract_type] || e.contract_type].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            {incluido && <span className="text-xs font-normal text-gray-400 whitespace-nowrap">já no efetivo</span>}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </SheetPanel>

            <SheetFooter>
                <div className="flex items-center justify-between gap-3 w-full">
                    <span className="text-sm text-gray-500">{selecionados.size} selecionado(s)</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-3.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all"
                        >
                            Cancelar
                        </button>
                        {/* §17 — variante compacta */}
                        <button
                            type="button"
                            onClick={confirmar}
                            disabled={selecionados.size === 0}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <UserPlus className="w-[15px] h-[15px]" />
                            Adicionar ao efetivo
                        </button>
                    </div>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default DiaryLaborFromRhSheet;
