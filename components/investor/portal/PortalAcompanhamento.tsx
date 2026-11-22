import React from 'react';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import { linhasDoAcompanhamento, type RealizadoDoInvestidor } from '../../../utils/acompanhamentoDoInvestidor';
import type { OportunidadeNaVitrine } from '../../../utils/oportunidadeNumerosDaVersao';
import { fmtBRL, PortalLoading } from '../../portal/PortalKit';

/**
 * Aba "Acompanhamento" da oportunidade no portal (Fase D1 do plano 2026-11-21-portal-do-investidor-consolidacao):
 * previsto da versão publicada × realizado (custo e entradas conciliados da obra, vendas pela parte de cada
 * unidade, avanço físico). Só totais — nenhum lançamento nem negociação individual.
 */
const fmt = (v: number | null, formato: 'moeda' | 'unidades' | 'pct') =>
    v == null ? '—' : formato === 'moeda' ? fmtBRL(v) : formato === 'pct' ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : v.toLocaleString('pt-BR');

const PortalAcompanhamento: React.FC<{ op: OportunidadeNaVitrine; portalToken: string }> = ({ op, portalToken }) => {
    const [dados, setDados] = React.useState<RealizadoDoInvestidor | null | undefined>(undefined);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!op.id) return;
        let vivo = true;
        investorPortalTokenService.getAcompanhamentoByToken(portalToken, op.id)
            .then(d => { if (vivo) setDados(d); })
            .catch(e => { if (vivo) { setDados(null); setErro((e as Error).message); } });
        return () => { vivo = false; };
    }, [op.id, portalToken]);

    if (dados === undefined) return <PortalLoading label="Carregando o acompanhamento..." />;
    if (erro) return <p role="alert" className="text-sm text-[#5F6573]">{erro}</p>;
    if (!dados) return <p className="text-sm text-[#5F6573]">Esta oportunidade ainda não tem empreendimento vinculado para acompanhar.</p>;

    const linhas = linhasDoAcompanhamento({ vgv: op.vgv, custo_total: op.custo_total }, dados);
    return (
        <div className="space-y-3">
            {dados.obra_nome && <p className="text-[13px] text-[#5F6573]">Obra: <span className="text-[#1F2430] font-medium">{dados.obra_nome}</span> · custo e entradas conciliados</p>}
            <ul className="divide-y divide-[#F4F4F6] border border-[#ECECEF] rounded-[10px]" aria-label="Previsto × realizado">
                {linhas.map(l => (
                    <li key={l.rotulo} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-[#1F2430] font-medium">{l.rotulo}</span>
                            <span className="text-[#5F6573] tabular-nums">{fmt(l.realizado, l.formato)} <span className="text-[#8A8F9A]">de {fmt(l.previsto, l.formato)}</span></span>
                        </div>
                        {l.fracao != null && (
                            <div className="h-1.5 bg-[#F4F4F6] rounded-full overflow-hidden" aria-hidden>
                                <div className="h-full bg-[#2F6FED] rounded-full" style={{ width: `${Math.min(100, l.fracao * 100)}%` }} />
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default PortalAcompanhamento;
