import React from 'react';
import { LayoutTemplate, Search } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import type { DocGenModelo } from '../../types/docGen';
import { CATEGORIA_GED_LABEL } from './rotulos';

/**
 * "Novo ofício" → escolher o modelo (fluxo do pedido: "Escolher modelo" é o
 * primeiro passo). Só modelos ATIVOS — rascunho de modelo ainda não está pronto
 * para uso, e inativo saiu de circulação. Busca transitória (guia §3.1).
 */
interface Props {
    open: boolean;
    onClose: () => void;
    modelos: DocGenModelo[];
    nomeOrganizacao: (id: string) => string;
    multiplasOrgs: boolean;
    onEscolher: (m: DocGenModelo) => void;
    onIrParaModelos: () => void;
}

export default function EscolherModeloSheet({ open, onClose, modelos, nomeOrganizacao, multiplasOrgs, onEscolher, onIrParaModelos }: Props) {
    const [busca, setBusca] = React.useState('');
    React.useEffect(() => { if (open) setBusca(''); }, [open]);

    const ativos = modelos.filter(m => m.status === 'ativo');
    const naoAtivos = modelos.length - ativos.length;
    const t = busca.trim().toLowerCase();
    const filtrados = t ? ativos.filter(m => `${m.nome} ${m.descricao ?? ''}`.toLowerCase().includes(t)) : ativos;

    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Novo ofício</SheetTitle>
                <SheetDescription>Escolha o modelo. O texto-base, o cabeçalho e os campos obrigatórios vêm dele.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {ativos.length > 0 && (
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo..."
                            className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
                    </div>
                )}
                {filtrados.length === 0 ? (
                    <div className="text-center py-12">
                        <LayoutTemplate className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{ativos.length ? 'Nenhum modelo com essa busca' : 'Nenhum modelo ativo'}</h3>
                        <p className="text-sm text-gray-500 max-w-sm mx-auto">
                            {ativos.length
                                ? 'Ajuste a busca.'
                                : naoAtivos
                                    ? `Há ${naoAtivos} modelo(s) em rascunho ou inativo. Ative um na aba Modelos para usá-lo.`
                                    : 'Crie e ative um modelo na aba Modelos.'}
                        </p>
                        {!ativos.length && (
                            <button type="button" onClick={() => { onClose(); onIrParaModelos(); }}
                                className="mt-4 h-9 px-3.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-[6px] hover:bg-blue-100">
                                Ir para Modelos
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100 rounded-[10px] border border-gray-100">
                        {filtrados.map(m => (
                            <li key={m.id}>
                                <button type="button" onClick={() => { onEscolher(m); onClose(); }} className="w-full text-left px-4 py-3 hover:bg-blue-50/50">
                                    <span className="block text-sm text-gray-800">{m.nome}</span>
                                    <span className="block text-xs text-gray-500">
                                        {[CATEGORIA_GED_LABEL[m.categoria_ged], `v${m.versao}`, multiplasOrgs ? nomeOrganizacao(m.organization_id) : null, m.descricao].filter(Boolean).join(' · ')}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </SheetPanel>
        </Sheet>
    );
}
