import React from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Loader2, AlertTriangle, Download, FileText } from 'lucide-react';
import { downloadProposalPdf } from '../services/proposalPdfService';

// Página pública da proposta (F3). Acesso anon via RPC fn_proposal_public — o
// token no link é o segredo. NUNCA mostra custo/margem (nem existem nesta RPC).

interface PublicProposal {
    id: string;
    version?: number;
    status: string;
    buyer_name?: string;
    unit_price?: number;
    discount_pct?: number;
    total_value?: number;
    down_payment?: number;
    monthly_installments?: number;
    monthly_value?: number;
    balloon_value?: number;
    financing_value?: number;
    notes?: string;
    created_at?: string;
    property_name?: string;
    organization_name?: string;
    /** Cesta da proposta (fn_proposal_public devolve sempre, com 1 item no caso
     *  de uma unidade só — o backfill garante). */
    units?: { unit_name?: string; property_id?: string; unit_price?: number; allocated_value?: number; is_primary?: boolean }[];
}

const fmtBRL = (v?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0);

const Props: React.FC<{ token: string }> = ({ token }) => {
    const [proposal, setProposal] = React.useState<PublicProposal | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        (async () => {
            try {
                const { data, error } = await supabase.rpc('fn_proposal_public', { p_token: token });
                if (error) throw error;
                if (!data) { setError('Proposta não encontrada ou link inválido.'); return; }
                setProposal(data as PublicProposal);
            } catch {
                setError('Erro ao carregar a proposta. Verifique o link e tente novamente.');
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
    );

    if (error || !proposal) return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500 px-6 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
            <p className="text-sm font-medium">{error || 'Proposta indisponível.'}</p>
        </div>
    );

    const p = proposal;
    const basket = (p.units || []).filter(Boolean);
    const isBasket = basket.length > 1;
    const Line: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
        <div className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-100 last:border-b-0">
            <span className="text-sm font-normal text-gray-500">{label}</span>
            <span className={`text-sm ${strong ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{value}</span>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-lg mx-auto space-y-4">
                <div className="bg-blue-600 text-white rounded-[14px] p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-medium opacity-90">
                        <Building2 className="w-4 h-4" /> {p.organization_name || 'Proposta comercial'}
                    </div>
                    <h1 className="text-2xl font-bold mt-2">Proposta de compra</h1>
                    <p className="text-sm opacity-90 mt-1">
                        {isBasket
                            ? `${basket.length} unidades`
                            : (p.property_name || 'Unidade')}{p.version ? ` · versão ${p.version}` : ''}
                    </p>
                </div>

                {/* Cesta: uma linha por unidade, com a cota de cada uma. Com uma
                    unidade só este bloco não aparece — layout intacto. */}
                {isBasket && (
                    <div className="bg-white rounded-[14px] p-6 shadow-sm">
                        <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5" /> Unidades
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                                        <th className="py-2 font-medium">Unidade</th>
                                        <th className="py-2 font-medium text-right whitespace-nowrap">Tabela</th>
                                        <th className="py-2 font-medium text-right whitespace-nowrap">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {basket.map((u, i) => (
                                        <tr key={u.property_id || i} className="border-b border-gray-100 last:border-b-0">
                                            <td className="py-2.5 text-sm font-medium text-gray-800">{u.unit_name || '—'}</td>
                                            <td className="py-2.5 text-sm font-normal text-gray-500 text-right whitespace-nowrap">{fmtBRL(u.unit_price)}</td>
                                            <td className="py-2.5 text-sm font-medium text-gray-900 text-right whitespace-nowrap">{fmtBRL(u.allocated_value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-[14px] p-6 shadow-sm">
                    <Line label="Comprador" value={p.buyer_name || '—'} />
                    <Line label="Preço de tabela" value={fmtBRL(p.unit_price)} />
                    {!!p.discount_pct && <Line label={`Desconto (${p.discount_pct}%)`} value={`- ${fmtBRL((p.unit_price || 0) * (p.discount_pct || 0) / 100)}`} />}
                    <Line label="Valor total" value={fmtBRL(p.total_value)} strong />
                    <Line label="Entrada" value={fmtBRL(p.down_payment)} />
                    {!!p.financing_value && <Line label="Financiamento" value={fmtBRL(p.financing_value)} />}
                    {!!p.monthly_installments && <Line label={`Parcelas mensais (${p.monthly_installments}x)`} value={fmtBRL(p.monthly_value)} />}
                    {!!p.balloon_value && <Line label="Intermediária / balão" value={fmtBRL(p.balloon_value)} />}
                </div>

                {p.notes && (
                    <div className="bg-white rounded-[14px] p-6 shadow-sm">
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Observações
                        </p>
                        <p className="text-sm font-normal text-gray-700 whitespace-pre-wrap">{p.notes}</p>
                    </div>
                )}

                <button
                    onClick={() => downloadProposalPdf(p)}
                    className="w-full flex items-center justify-center gap-2 h-11 rounded-[10px] bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm transition-all active:scale-95"
                >
                    <Download className="w-4 h-4" /> Baixar PDF
                </button>

                <p className="text-xs text-gray-400 font-medium text-center px-4">
                    Proposta comercial — sujeita a aprovação. Não constitui contrato.
                </p>
            </div>
        </div>
    );
};

export default Props;
