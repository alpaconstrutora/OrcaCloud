// components/reconciliation/PreferenciasPendentesSheet.tsx
//
// Preferências da aba Pendentes da Conciliação Bancária (botão "Preferências" na barra de
// cima, pedido de 23/11/2026). O modo de visualização saiu da tela para cá. Fica neste
// navegador (localStorage, como antes) e cada escolha vale na hora — sem "Salvar".
import React from 'react';
import { LayoutGrid, List, Rows3 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';

export type ModoPendentes = 'linha' | 'compacto' | 'grade';

const MODOS: { value: ModoPendentes; rotulo: string; descricao: string; Icone: React.ElementType }[] = [
    { value: 'linha', rotulo: 'Linha', descricao: 'Tabelas com cabeçalho, colunas e Agrupar.', Icone: List },
    { value: 'compacto', rotulo: 'Compacto', descricao: 'As mesmas tabelas, com linhas mais baixas.', Icone: Rows3 },
    { value: 'grade', rotulo: 'Grade', descricao: 'Um cartão por lançamento.', Icone: LayoutGrid },
];

interface Props {
    open: boolean;
    onClose: () => void;
    modo: ModoPendentes;
    onModo: (m: ModoPendentes) => void;
}

const PreferenciasPendentesSheet: React.FC<Props> = ({ open, onClose, modo, onModo }) => (
    <Sheet open={open} onClose={onClose} size="lg">
        <SheetHeader onClose={onClose}>
            <SheetTitle>Preferências dos pendentes</SheetTitle>
            <SheetDescription>Valem neste navegador. Cada mudança vale na hora.</SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-6 py-6 space-y-4">
            <section aria-labelledby="pendentes-pref-visualizacao" className="space-y-3">
                <h3 id="pendentes-pref-visualizacao" className="text-sm font-semibold text-gray-900 pb-3 border-b border-gray-100">Modo de visualização</h3>
                <div role="radiogroup" aria-labelledby="pendentes-pref-visualizacao" className="space-y-2">
                    {MODOS.map(({ value, rotulo, descricao, Icone }) => {
                        const ativo = modo === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={ativo}
                                onClick={() => onModo(value)}
                                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-[6px] border text-left transition-all ${
                                    ativo ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${ativo ? 'text-blue-600' : 'text-gray-500'}`} />
                                <span className="min-w-0">
                                    <span className={`block text-sm font-medium ${ativo ? 'text-blue-700' : 'text-gray-900'}`}>{rotulo}</span>
                                    <span className="block mt-0.5 text-xs text-gray-600">{descricao}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>
        </SheetPanel>
    </Sheet>
);

export default PreferenciasPendentesSheet;
