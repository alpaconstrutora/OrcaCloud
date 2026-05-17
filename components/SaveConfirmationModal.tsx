import React from 'react';

// Ícones Inline para garantir estabilidade
const SaveIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
);

const FileTextIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
);

const DatabaseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
        <path d="M3 5v14c0 1.66 4 3 9 3s 9-1.34 9-3V5"></path>
    </svg>
);

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
);

const AlertCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0 mt-0.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
);

interface SaveConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (target: 'budget' | 'origin' | 'new_copy') => void;
    isSaving: boolean;
    hasBudget: boolean;
    isCustomItem: boolean;
}

const SaveConfirmationModal: React.FC<SaveConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isSaving,
    hasBudget,
    isCustomItem
}) => {
    // Inicializa o estado já com a lógica simplificada (sem useEffect)
    const [target, setTarget] = React.useState<'budget' | 'origin' | 'new_copy'>(() => {
        if (hasBudget) return 'budget';
        if (isCustomItem) return 'origin';
        return 'new_copy';
    });

    if (!isOpen) return null;

    return (
        // Removido animate-in e backdrop-blur para simplificar renderização
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
                    <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                        <SaveIcon />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Salvar Alterações</h3>
                        <p className="text-sm text-gray-500">Escolha onde deseja aplicar as modificações.</p>
                    </div>
                </div>

                <div className="p-6 space-y-3">
                    {/* Opção 1: Salvar no Orçamento Atual */}
                    <div
                        onClick={() => hasBudget && setTarget('budget')}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer ${target === 'budget' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                            } ${!hasBudget ? 'opacity-50' : ''}`}
                    >
                        <div className="mt-1">
                            <input
                                type="radio"
                                checked={target === 'budget'}
                                readOnly
                                className="w-4 h-4"
                            />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 font-bold text-gray-900">
                                <FileTextIcon />
                                Atualizar no Orçamento Atual
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Aplica as alterações apenas para as instâncias deste item no projeto atual.
                            </p>
                        </div>
                    </div>

                    {/* Opção 2: Salvar na Base de Origem */}
                    <div
                        onClick={() => isCustomItem && setTarget('origin')}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer ${target === 'origin' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                            } ${!isCustomItem ? 'opacity-50' : ''}`}
                    >
                        <div className="mt-1">
                            <input
                                type="radio"
                                checked={target === 'origin'}
                                readOnly
                                className="w-4 h-4"
                            />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 font-bold text-gray-900">
                                <DatabaseIcon />
                                Atualizar na Base de Dados (Original)
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Atualiza o item na sua Base Própria.
                            </p>
                        </div>
                    </div>

                    {/* Opção 3: Salvar como Novo Item */}
                    <div
                        onClick={() => setTarget('new_copy')}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer ${target === 'new_copy' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                            }`}
                    >
                        <div className="mt-1">
                            <input
                                type="radio"
                                checked={target === 'new_copy'}
                                readOnly
                                className="w-4 h-4"
                            />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2 font-bold text-gray-900">
                                <CopyIcon />
                                Salvar como Novo Item (Cópia)
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Cria uma cópia deste item na sua Base Própria.
                            </p>
                        </div>
                    </div>

                    {/* Alerta */}
                    {target === 'origin' && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-xs border border-amber-100">
                            <AlertCircleIcon />
                            <p>Atenção: Esta ação atualizará a definição do item na base de dados.</p>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded-lg text-sm"
                        disabled={isSaving}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(target)}
                        className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                        disabled={isSaving}
                    >
                        {isSaving ? 'Salvando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SaveConfirmationModal;
