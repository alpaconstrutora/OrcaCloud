// components/ImovibPreferenciasSheet.tsx
//
// Preferências do estudo de viabilidade (botão "Preferências" no cabeçalho do estudo) — plano
// docs/planos/2026-11-20-imovib-preferencias-estudo.md. São do USUÁRIO (valem em todos os estudos), no banco,
// como as da Planta Inteligente. Cada preferência grava na hora (sem "Salvar").
import React from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';
import TableSwitch from './ui/TableSwitch';
import { useImovibPreferencias } from '../hooks/useImovibPreferencias';

interface Props {
    open: boolean;
    onClose: () => void;
}

const ImovibPreferenciasSheet: React.FC<Props> = ({ open, onClose }) => {
    const { exibirNaoVendaveis, setExibirNaoVendaveis } = useImovibPreferencias();
    const rotulo = 'Exibir unidades não vendáveis no empreendimento';
    return (
        <Sheet open={open} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Preferências do estudo de viabilidade</SheetTitle>
                <SheetDescription>Valem para você, em todos os estudos. Cada mudança grava na hora.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-4">
                <section aria-labelledby="imovib-pref-receitas" className="space-y-3">
                    <h3 id="imovib-pref-receitas" className="text-sm font-semibold text-gray-900 pb-3 border-b border-gray-100">Receitas</h3>
                    <ul>
                        <li className="flex items-start justify-between gap-4 py-2.5">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">{rotulo}</p>
                                <p className="mt-0.5 text-xs text-gray-600">
                                    Garagem, área comum e estacionamento ficam fora do VGV. Desligado, saem da lista do espelho de
                                    vendas — o aviso do topo continua contando quantas são.
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <TableSwitch checked={exibirNaoVendaveis} onChange={() => setExibirNaoVendaveis(!exibirNaoVendaveis)} ariaLabel={rotulo} />
                                <span className="w-[4.5rem] text-sm font-normal text-gray-900">{exibirNaoVendaveis ? 'Ligado' : 'Desligado'}</span>
                            </div>
                        </li>
                    </ul>
                </section>
            </SheetPanel>
        </Sheet>
    );
};

export default ImovibPreferenciasSheet;
