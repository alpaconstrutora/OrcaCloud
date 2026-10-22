import React from 'react';
import { AlertCircle, FileText, Printer, RefreshCw } from 'lucide-react';

// Peças comuns às relações impressas de RH › Encargos Sociais (Encargos de INSS e
// Relação por Empregado): estados de carga/erro/vazio, barra de escopo com
// "Imprimir" e o cabeçalho de cada organização.

export const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const PCT = (fracao: number) =>
    `${(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const rotuloDaCompetencia = (period: string) => {
    const [y, m] = period.split('-');
    return y && m ? `${m}/${y}` : period;
};

/** Loading §11, erro (banner §5.2) e vazio §12. Devolve null quando há o que mostrar. */
export function EstadoDaRelacao({ loading, error, vazio, period, todas, totalOrganizacoes, onTentarDeNovo }: {
    loading: boolean;
    error: string | null;
    vazio: boolean;
    period: string;
    todas: boolean;
    totalOrganizacoes: number;
    onTentarDeNovo: () => void;
}) {
    if (loading) return (
        <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando as folhas de {rotuloDaCompetencia(period)}...</p>
        </div>
    );
    if (error) return (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-[10px]">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
                <p className="text-sm font-medium text-red-800">{error}</p>
                <button onClick={onTentarDeNovo} className="mt-2 h-8 px-3 flex items-center gap-1.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-[6px] hover:bg-red-50">
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                </button>
            </div>
        </div>
    );
    if (vazio) return (
        <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma folha fechada em {rotuloDaCompetencia(period)}</h3>
            <p className="text-sm text-gray-500">
                {todas
                    ? `Nenhuma das ${totalOrganizacoes} organizações tem folha fechada nesta competência.`
                    : 'A relação sai das folhas FECHADAS. Feche a folha do mês em RH › Folha de Pagamento.'}
            </p>
        </div>
    );
    return null;
}

/** Barra de escopo §5.3: o que entrou na relação à esquerda, "Imprimir" à direita. */
export function BarraDaRelacao({ children, semFolha }: { children: React.ReactNode; semFolha: string[] }) {
    return (
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3 print:hidden">
            <div className="px-2 text-sm text-gray-600">
                {children}
                {semFolha.length > 0 && (
                    <span className="text-gray-500"> · Sem folha fechada: {semFolha.join(', ')}</span>
                )}
            </div>
            <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95 shrink-0"
            >
                <Printer className="w-[15px] h-[15px]" />
                Imprimir
            </button>
        </div>
    );
}

/** Cabeçalho do bloco de uma organização, dentro do card da tabela (`toolbarTop`). */
export function CabecalhoDaOrganizacao({ nome, cnpj, detalhe, direita }: {
    nome: string;
    cnpj: string | null;
    detalhe: string;
    direita?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
            <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate" title={nome}>{nome}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{cnpj ? `CNPJ ${cnpj} · ` : ''}{detalhe}</p>
            </div>
            {direita && <div className="text-sm text-gray-700 shrink-0">{direita}</div>}
        </div>
    );
}

/** Quem está na folha mas sem nenhum valor fica fora da tabela — e a tela diz quem é. */
export function NotaSemValor({ nomes }: { nomes: string[] }) {
    if (nomes.length === 0) return null;
    return (
        <p className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500">
            {nomes.length === 1 ? '1 colaborador está' : `${nomes.length} colaboradores estão`} na folha sem nenhum valor e
            não {nomes.length === 1 ? 'aparece' : 'aparecem'} na lista: {nomes.join(', ')}.
        </p>
    );
}
