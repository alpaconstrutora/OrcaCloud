import React from 'react';
import { AlertTriangle, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from './ui/modal';
import CostCenterSelect, { CostCenterOption } from './CostCenterSelect';
import PlanoContasSelect, { PlanoContasOption } from './PlanoContasSelect';
import { useWritableOrganizations } from '../hooks/useOrgContext';
import { contractService, type PreviaMoverContratoOrganizacao } from '../services/contractService';
import { financialRegistryService } from '../services/financialRegistryService';

/**
 * Mover o contrato para outra organização, levando tudo (pedido de 25/10/2026,
 * plano docs/planos/2026-10-25-contrato-mover-organizacao.md).
 *
 * O contrato pertence a UMA organização (REGRA #5) e é ela que decide quais
 * centros de custo e planos de contas aparecem nele. Por isso o centro de custo
 * e o plano de contas do destino são escolhidos AQUI, antes de mover: a RPC
 * aplica os dois ao contrato e a todos os títulos na mesma transação.
 *
 * A prévia (RPC `previa_mover_contrato_organizacao`) é a mesma regra que a RPC
 * de mover confere — o botão só diz antes o que o banco recusaria depois.
 */

interface Props {
    open: boolean;
    onClose: () => void;
    contrato: { id: string; number?: string | null; organization_id?: string | null };
    nomeOrgAtual?: string;
    onMovido: (orgDestinoId: string, nomeDestino: string) => void;
}

const SELETOR_H9 = 'h-9 bg-gray-50 border border-gray-100 rounded-[6px] pl-3 pr-2 hover:border-blue-200';
const ROTULO = 'text-xs font-semibold text-slate-500 ml-1';

/** Motivo de o botão Mover estar desligado — `null` = pode mover. Exportado
 *  para o teste: botão desligado sempre diz por quê. */
export function motivoParaNaoMover(args: {
    destino: string;
    carregandoPrevia: boolean;
    previa: PreviaMoverContratoOrganizacao | null;
    movendo: boolean;
}): string | null {
    if (args.movendo) return 'Movendo…';
    if (!args.destino) return 'Escolha a organização de destino.';
    if (args.carregandoPrevia || !args.previa) return 'Conferindo o que vai junto…';
    if (args.previa.impedimentos.length > 0) return args.previa.impedimentos[0];
    return null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export const MoverContratoOrganizacaoModal: React.FC<Props> = ({ open, onClose, contrato, nomeOrgAtual, onMovido }) => {
    const gravaveis = useWritableOrganizations();
    const destinos = React.useMemo(
        () => gravaveis.filter(o => o.id !== contrato.organization_id),
        [gravaveis, contrato.organization_id],
    );

    const [destino, setDestino] = React.useState('');
    const [costCenterId, setCostCenterId] = React.useState('');
    const [planoId, setPlanoId] = React.useState('');
    const [costCenters, setCostCenters] = React.useState<CostCenterOption[]>([]);
    const [planoContas, setPlanoContas] = React.useState<PlanoContasOption[]>([]);
    const [previa, setPrevia] = React.useState<PreviaMoverContratoOrganizacao | null>(null);
    const [carregandoPrevia, setCarregandoPrevia] = React.useState(false);
    const [movendo, setMovendo] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setDestino(''); setCostCenterId(''); setPlanoId('');
        setPrevia(null); setErro(null);
    }, [open]);

    React.useEffect(() => {
        if (!open || !destino) return;
        let vivo = true;
        setCarregandoPrevia(true);
        setPrevia(null);
        setCostCenterId(''); setPlanoId('');
        setErro(null);
        Promise.all([
            contractService.previaMoverOrganizacao(contrato.id, destino),
            financialRegistryService.listCostCenters(destino),
            financialRegistryService.listPlanoContas(destino),
        ])
            .then(([p, cc, pl]) => {
                if (!vivo) return;
                setPrevia(p);
                setCostCenters(cc as CostCenterOption[]);
                setPlanoContas(pl as PlanoContasOption[]);
            })
            .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao conferir o contrato.'); })
            .finally(() => { if (vivo) setCarregandoPrevia(false); });
        return () => { vivo = false; };
    }, [open, destino, contrato.id]);

    const motivo = motivoParaNaoMover({ destino, carregandoPrevia, previa, movendo });
    const nomeDestino = destinos.find(o => o.id === destino)?.name ?? '';

    const handleMover = async () => {
        if (motivo) return;
        setMovendo(true);
        setErro(null);
        try {
            await contractService.moverParaOrganizacao(contrato.id, destino, costCenterId || null, planoId || null);
            onMovido(destino, nomeDestino);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao mover o contrato.');
        } finally {
            setMovendo(false);
        }
    };

    return (
        <Modal open={open} onClose={movendo ? () => {} : onClose} size="lg" dismissable={!movendo}>
            <ModalHeader
                title={`Mover contrato ${contrato.number ?? ''}`.trim()}
                description={<>Organização atual: <span className="font-semibold text-gray-700">{nomeOrgAtual ?? '—'}</span></>}
                icon={<ArrowRightLeft className="w-5 h-5 text-blue-600 mt-0.5" />}
                onClose={movendo ? undefined : onClose}
            />
            <ModalBody className="space-y-4">
                <div className="space-y-1.5">
                    <label htmlFor="mover-contrato-destino" className={ROTULO}>Mover para *</label>
                    <select
                        id="mover-contrato-destino"
                        value={destino}
                        onChange={e => setDestino(e.target.value)}
                        disabled={movendo}
                        className="w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    >
                        <option value="">Selecione a organização de destino</option>
                        {destinos.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {destinos.length === 0 && (
                        <p className="text-xs text-gray-500 ml-1">Você não é membro de outra organização para onde mover.</p>
                    )}
                </div>

                {destino && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Centro de custo no destino</label>
                            <CostCenterSelect
                                costCenters={costCenters}
                                value={costCenterId}
                                onChange={setCostCenterId}
                                placeholder="Sem centro de custo"
                                hoverCls="hover:bg-blue-50"
                                size="sm"
                                disabled={carregandoPrevia || movendo}
                                triggerClassName={SELETOR_H9}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={ROTULO}>Plano de contas no destino</label>
                            <PlanoContasSelect
                                planoContas={planoContas}
                                value={planoId}
                                onChange={setPlanoId}
                                placeholder="Sem plano de contas"
                                hoverCls="hover:bg-blue-50"
                                size="sm"
                                disabled={carregandoPrevia || movendo}
                                triggerClassName={SELETOR_H9}
                            />
                        </div>
                        <p className="sm:col-span-2 text-xs text-gray-500 ml-1">
                            Os dois valem para o contrato e para todos os títulos dele. Obra, empresa,
                            empreendimento, orçamento e conta financeira são cadastros da organização atual e
                            ficam em branco.
                        </p>
                    </div>
                )}

                {carregandoPrevia && (
                    <p className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Conferindo o que vai junto…
                    </p>
                )}

                {previa && (
                    <div className="rounded-[10px] border border-gray-100 bg-gray-50 p-4 space-y-1.5 text-sm text-gray-700">
                        <p className="font-semibold text-gray-900">Vai junto</p>
                        <p>{plural(previa.titulos, 'título no financeiro', 'títulos no financeiro')}
                            {previa.titulos > 0 && ` (${previa.titulos_pagos} pagos, ${previa.titulos_conciliados} conciliados)`}</p>
                        {previa.documentos > 0 && <p>{plural(previa.documentos, 'documento', 'documentos')}</p>}
                        {previa.processos > 0 && <p>{plural(previa.processos, 'processo de aprovação', 'processos de aprovação')}</p>}
                        <p>Itens, medições, aditivos, garantias e demais registros do contrato</p>
                        <p className="text-xs text-gray-500 pt-1">O fornecedor e o cliente continuam: são compartilhados com a organização de destino.</p>
                        {previa.recibos_ficam > 0 && (
                            <p className="text-xs text-gray-500">
                                {plural(previa.recibos_ficam, 'recibo já emitido fica', 'recibos já emitidos ficam')} na
                                organização atual — foram emitidos em nome dela, com a numeração dela.
                            </p>
                        )}
                    </div>
                )}

                {previa && previa.titulos_conciliados > 0 && previa.impedimentos.length === 0 && (
                    <div className="flex gap-3 rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>
                            {plural(previa.titulos_conciliados, 'título está conciliado', 'títulos estão conciliados')} com o
                            extrato da conta bancária de {nomeOrgAtual ?? 'organização atual'}. A conciliação continua
                            ligada a esse extrato: os títulos passam a ser de {nomeDestino}, mas o pagamento saiu da
                            conta da organização atual.
                        </p>
                    </div>
                )}

                {previa && previa.impedimentos.length > 0 && (
                    <div className="flex gap-3 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <ul className="space-y-1">{previa.impedimentos.map(i => <li key={i}>{i}</li>)}</ul>
                    </div>
                )}

                {erro && (
                    <div className="flex gap-3 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>{erro}</p>
                    </div>
                )}
            </ModalBody>
            <ModalFooter>
                {motivo && !movendo && <p className="mr-auto text-xs text-gray-500">{motivo}</p>}
                <button
                    type="button"
                    onClick={onClose}
                    disabled={movendo}
                    className="h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={handleMover}
                    disabled={!!motivo}
                    title={motivo ?? undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50"
                >
                    {movendo ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ArrowRightLeft className="w-[15px] h-[15px]" />}
                    Mover contrato
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default MoverContratoOrganizacaoModal;
