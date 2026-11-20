// components/ImovibEspelhoForaDoVgvSheet.tsx
//
// Painel do triângulo "Unidades fora do VGV" do Espelho de vendas do estudo (plano
// docs/planos/2026-11-20-imovib-espelho-aba-tabela-padrao.md; guia §5.3 — aviso persistente vira botão-ícone com
// contador, e o clique abre o painel com as ações). Substitui o banner âmbar.
import React from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from './ui/sheet';

interface Props {
    open: boolean;
    onClose: () => void;
    mensagem: string;
    naoVendaveis: number;
    semUnidade: number;
    /** Abre as Preferências do estudo (exibir/ocultar as não vendáveis). */
    onAbrirPreferencias?: () => void;
    onRemoverSemUnidade: () => void;
    podeRemover: boolean;
    motivo?: string;
}

const BASE = 'flex items-center gap-1.5 h-9 px-3.5 text-[13px] font-medium rounded-[6px] transition-all disabled:opacity-50 disabled:cursor-not-allowed';

const ImovibEspelhoForaDoVgvSheet: React.FC<Props> = ({ open, onClose, mensagem, naoVendaveis, semUnidade, onAbrirPreferencias, onRemoverSemUnidade, podeRemover, motivo }) => (
    <Sheet open={open} onClose={onClose} size="md">
        <SheetHeader onClose={onClose}>
            <SheetTitle>Unidades fora do VGV</SheetTitle>
            <SheetDescription>Estão no espelho de vendas do estudo, mas não somam no VGV.</SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-6 py-6 space-y-6">
            <p className="text-sm text-gray-900">{mensagem}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt className="text-gray-600">Não vendável no empreendimento</dt>
                <dd className="text-gray-900 text-right tabular-nums">{naoVendaveis}</dd>
                <dt className="text-gray-600">Sem unidade no empreendimento</dt>
                <dd className="text-gray-900 text-right tabular-nums">{semUnidade}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
                {onAbrirPreferencias && (
                    <button type="button" onClick={onAbrirPreferencias} className={`${BASE} border border-gray-200 bg-white text-slate-700 hover:bg-gray-50`}>
                        Abrir Preferências
                    </button>
                )}
                {semUnidade > 0 && (
                    <span className="inline-flex" title={!podeRemover ? motivo : undefined}>
                        <button type="button" onClick={onRemoverSemUnidade} disabled={!podeRemover}
                            className={`${BASE} border border-amber-300 bg-white text-amber-900 hover:bg-amber-50`}>
                            {`Remover as sem unidade no empreendimento (${semUnidade})`}
                        </button>
                    </span>
                )}
            </div>
        </SheetPanel>
    </Sheet>
);

export default ImovibEspelhoForaDoVgvSheet;
