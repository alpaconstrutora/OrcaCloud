import React from 'react';
import { Building2 } from 'lucide-react';
import { CardHeader, fmtBRL, KpiStrip, PortalCard, PortalEmpty, PortalLoading, PortalTabs, TextLinkButton } from '../../portal/PortalKit';
import Espelho3D from '../../espelho3d/Espelho3D';
import { investorPortalTokenService } from '../../../services/investorPortalTokenService';
import { montarEspelhoDoInvestidor, type ObraDoEspelho } from '../../../utils/espelhoDoInvestidor';

/**
 * "Espelho de Vendas" do Portal do Investidor (Espelho de Vendas 3D, F4 — 10/11/2026).
 * Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * As torres das obras do investidor em 3D, cada unidade na cor do status, com o
 * preço de tabela na ficha e a faixa de VGV vendido e em estoque. Decisão do
 * usuário (09/11/2026): o investidor NÃO vê o comprador — a função do banco só
 * entrega o status já resolvido e o valor vendido somado.
 *
 * A aba carrega o próprio dado (e não na rajada do portal): quem nunca abre o
 * espelho não paga por ele, e um erro aqui não derruba as outras abas. A mesma
 * tela serve o link (`portalToken`) e o app logado (`investorId` — o gestor
 * olhando o investidor, ou o próprio investidor). Sem ações: é leitura.
 */

interface Props {
    portalToken?: string;
    investorId?: string;
}

type Estado = { fase: 'carregando' } | { fase: 'erro' } | { fase: 'pronto'; obras: ObraDoEspelho[] };

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

const PortalEspelho: React.FC<Props> = ({ portalToken, investorId }) => {
    const [estado, setEstado] = React.useState<Estado>({ fase: 'carregando' });
    const [obraId, setObraId] = React.useState<string | null>(null);
    const [tentativa, setTentativa] = React.useState(0);

    React.useEffect(() => {
        if (!portalToken && !investorId) {
            setEstado({ fase: 'pronto', obras: [] });
            return;
        }
        let vivo = true;
        setEstado({ fase: 'carregando' });
        investorPortalTokenService
            .getEspelho(portalToken ? { token: portalToken } : { investorId: investorId! })
            .then((obras) => { if (vivo) setEstado({ fase: 'pronto', obras }); })
            .catch((err) => {
                console.error('[PortalEspelho] espelho de vendas:', err);
                if (vivo) setEstado({ fase: 'erro' });
            });
        return () => { vivo = false; };
    }, [portalToken, investorId, tentativa]);

    const obras = estado.fase === 'pronto' ? estado.obras : [];
    const obra = obras.find((o) => o.project_id === obraId) ?? obras[0] ?? null;
    const espelho = React.useMemo(() => (obra ? montarEspelhoDoInvestidor(obra) : null), [obra]);

    if (estado.fase === 'carregando') {
        return <PortalCard><PortalLoading label="Carregando o espelho de vendas…" /></PortalCard>;
    }
    if (estado.fase === 'erro') {
        return (
            <PortalCard>
                <div className="text-center py-12 px-6" role="alert">
                    <p className="text-sm font-semibold text-[#4A505C]">Não foi possível carregar o espelho de vendas.</p>
                    <TextLinkButton onClick={() => setTentativa((n) => n + 1)} className="mt-2">Tentar de novo</TextLinkButton>
                </div>
            </PortalCard>
        );
    }
    if (!obra || !espelho) {
        return (
            <PortalCard>
                <PortalEmpty
                    icon={<Building2 className="w-10 h-10" />}
                    title={!portalToken && !investorId ? 'Escolha um investidor' : 'Nenhuma obra com torres e unidades'}
                    subtitle={
                        !portalToken && !investorId
                            ? 'O espelho mostra as obras de um investidor — abra o portal a partir do cadastro dele.'
                            : 'O espelho aparece quando uma obra da sua carteira tiver as torres e as unidades cadastradas no empreendimento.'
                    }
                />
            </PortalCard>
        );
    }

    const { resumo } = espelho;
    return (
        <div className="space-y-3">
            <KpiStrip
                items={[
                    { label: 'Unidades vendidas', value: `${resumo.vendidas} de ${resumo.unidades}`, hint: `${pct(resumo.taxaVendida)} das unidades` },
                    { label: 'VGV vendido', value: fmtBRL(resumo.vgvVendido), hint: 'Valor das vendas com contrato' },
                    {
                        label: 'VGV em estoque',
                        value: fmtBRL(resumo.vgvEstoque),
                        hint: resumo.semPreco > 0 ? `${resumo.semPreco} ${resumo.semPreco === 1 ? 'unidade sem preço fica' : 'unidades sem preço ficam'} fora` : 'Preço de tabela do que falta vender',
                    },
                ]}
            />

            <PortalCard className="overflow-hidden">
                <CardHeader title="Espelho de vendas" subtitle={`${obra.project_name} · cada unidade na cor do status; toque para ver o preço de tabela`} />
                {obras.length > 1 && (
                    <PortalTabs tabs={obras.map((o) => ({ id: o.project_id, label: o.project_name }))} active={obra.project_id} onChange={setObraId} />
                )}
                <div className="p-4 border-t border-[#ECECEF]">
                    {espelho.cena.prismas.some((p) => p.unitId) ? (
                        <Espelho3D key={obra.project_id} cena={espelho.cena} dados={espelho.dados} mostrarPreco moldura={false} />
                    ) : (
                        <p className="min-h-[160px] flex items-center justify-center text-[13px] text-[#4A505C] text-center">
                            As unidades desta obra não têm andar cadastrado, então não há como desenhar a torre. Os números acima valem para a obra inteira.
                        </p>
                    )}
                    {resumo.foraDoDesenho > 0 && espelho.cena.prismas.some((p) => p.unitId) && (
                        <p className="mt-3 text-[13px] text-[#4A505C]">
                            {resumo.foraDoDesenho === 1 ? '1 unidade sem andar cadastrado entra nos números, mas não aparece' : `${resumo.foraDoDesenho} unidades sem andar cadastrado entram nos números, mas não aparecem`} no desenho.
                        </p>
                    )}
                </div>
            </PortalCard>
        </div>
    );
};

export default PortalEspelho;
