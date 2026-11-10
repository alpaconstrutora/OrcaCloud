import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, CreditCard, Loader2, MessageSquareText, Tag, Truck, User } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { TabsBar } from '../ui/TabsBar';
import CostCenterSelect from '../CostCenterSelect';
import PlanoContasSelect from '../PlanoContasSelect';
import { useStore } from '../../store/useStore';
import { useOrgContext, useWritableOrganizations, useDefaultWriteOrgId } from '../../hooks/useOrgContext';
import { temAcessoTotal } from '../../lib/acessoTotal';
import { costCenterService } from '../../services/costCenterService';
import { financialRegistryService } from '../../services/financialRegistryService';
import { pedidoPreferenciasService } from '../../services/pedidoPreferenciasService';
import { FORMAS_DE_ENTREGA } from '../../utils/formaEntrega';
import {
    FORMAS_PAGAMENTO_PEDIDO, LIMITE_OBSERVACAO, resolverPadroes, sanearPadroes,
    type CampoPadrao, type PadroesDoPedido,
} from '../../lib/pedidoPreferencias';
import type { CostCenter, PaymentAccount } from '../../types';
import type { CostCenterV2 } from '../../types/financial';

/**
 * Suprimentos › Pedidos de Compra › Preferências — os padrões do pedido NOVO.
 * Plano: docs/planos/2026-11-09-pedido-compra-preferencias.md
 *
 * Duas camadas por organização: "Padrão da empresa" (owner/admin grava, vale
 * para todos) e "Meu padrão" (só do usuário, sobrepõe a empresa campo a campo).
 * Campo vazio = segue a camada de baixo, e o painel mostra qual valor vale.
 */

type Camada = 'empresa' | 'pessoal';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-blue-600 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed';

const rotuloEntrega = (v: string) => v.split(' - ')[0];

interface Props {
    open: boolean;
    onClose: () => void;
    notify: (message: string, type?: 'success' | 'error') => void;
}

const PreferenciasPedidoSheet: React.FC<Props> = ({ open, onClose, notify }) => {
    const { orgId: orgDoTopo } = useOrgContext();
    const gravaveis = useWritableOrganizations();
    const orgPadrao = useDefaultWriteOrgId();
    const email = useStore(s => s.currentProfile?.email);

    const [orgId, setOrgId] = useState<string>('');
    const [camada, setCamada] = useState<Camada>('empresa');
    const [gravado, setGravado] = useState<{ empresa: PadroesDoPedido; pessoal: PadroesDoPedido }>({ empresa: {}, pessoal: {} });
    const [rascunho, setRascunho] = useState<{ empresa: PadroesDoPedido; pessoal: PadroesDoPedido }>({ empresa: {}, pessoal: {} });
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [costCenters, setCostCenters] = useState<CostCenterV2[]>([]);
    const [planoContas, setPlanoContas] = useState<CostCenter[]>([]);
    const [contas, setContas] = useState<PaymentAccount[]>([]);

    // O topo manda (REGRA #5); em "Todas", a organização óbvia ou a escolha aqui.
    useEffect(() => {
        if (open) setOrgId(orgDoTopo ?? orgPadrao ?? '');
    }, [open, orgDoTopo, orgPadrao]);

    useEffect(() => {
        if (!open || !orgId) return;
        let cancelado = false;
        setCarregando(true);
        setErro(null);
        Promise.all([
            pedidoPreferenciasService.ler(orgId),
            costCenterService.list(orgId).catch(() => [] as CostCenterV2[]),
            financialRegistryService.listPlanoContas(orgId).catch(() => [] as CostCenter[]),
            financialRegistryService.listPaymentAccounts(orgId).catch(() => [] as PaymentAccount[]),
        ])
            .then(([prefs, ccs, planos, accs]) => {
                if (cancelado) return;
                setGravado(prefs);
                setRascunho(prefs);
                setCostCenters(ccs);
                setPlanoContas(planos);
                setContas(accs);
            })
            .catch(e => { if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro ao carregar as preferências.'); })
            .finally(() => { if (!cancelado) setCarregando(false); });
        return () => { cancelado = true; };
    }, [open, orgId]);

    const org = gravaveis.find(o => o.id === orgId);
    const ehGestor = temAcessoTotal(email) || !!org?.members?.some(m =>
        m.email?.toLowerCase() === email?.toLowerCase() && (m.role === 'owner' || m.role === 'admin'));
    const somenteLeitura = camada === 'empresa' && !ehGestor;

    const atual = rascunho[camada];
    // O que vale quando o campo desta camada fica vazio: na empresa, o sistema;
    // no pessoal, a empresa (já resolvida sobre o sistema).
    const herdado = useMemo(
        () => resolverPadroes(camada === 'pessoal' ? rascunho.empresa : {}, {}),
        [camada, rascunho.empresa],
    );
    const sujo = JSON.stringify(sanearPadroes(rascunho.empresa)) !== JSON.stringify(sanearPadroes(gravado.empresa))
        || JSON.stringify(sanearPadroes(rascunho.pessoal)) !== JSON.stringify(sanearPadroes(gravado.pessoal));

    const definir = <K extends CampoPadrao>(campo: K, valor: PadroesDoPedido[K] | undefined) =>
        setRascunho(r => {
            const proximo = { ...r[camada] };
            if (valor === undefined || valor === '') delete proximo[campo];
            else proximo[campo] = valor;
            return { ...r, [camada]: proximo };
        });

    /** Texto do "vazio": qual valor vale e de onde vem. */
    const segue = (campo: CampoPadrao, mostrar: (v: never) => string): string => {
        const v = herdado.valores[campo];
        const origem = herdado.origem[campo];
        // Curto de propósito: o texto mora dentro de um campo de meia largura.
        if (v === undefined || !origem) return camada === 'pessoal' ? 'Seguir a empresa' : 'Sem padrão';
        return `${camada === 'pessoal' ? 'Seguir a empresa' : 'Padrão do sistema'} — ${mostrar(v as never)}`;
    };
    const nomeConta = (id: string) => contas.find(c => c.id === id)?.name ?? 'conta fora da lista';
    const nomeCc = (id: string) => costCenters.find(c => c.id === id)?.name ?? 'centro de custo fora da lista';
    const nomePlano = (id: string) => planoContas.find(c => c.id === id)?.name ?? 'plano de contas fora da lista';

    const termoVigente = atual.paymentTermType ?? herdado.valores.paymentTermType;

    const salvar = async () => {
        if (!orgId) return;
        setSalvando(true);
        setErro(null);
        try {
            if (JSON.stringify(sanearPadroes(rascunho.empresa)) !== JSON.stringify(sanearPadroes(gravado.empresa))) {
                await pedidoPreferenciasService.gravarEmpresa(orgId, rascunho.empresa);
            }
            if (JSON.stringify(sanearPadroes(rascunho.pessoal)) !== JSON.stringify(sanearPadroes(gravado.pessoal))) {
                await pedidoPreferenciasService.gravarPessoal(orgId, rascunho.pessoal);
            }
            setGravado(rascunho);
            notify('Preferências salvas. Valem para os próximos pedidos novos.');
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Erro ao salvar as preferências.');
        } finally {
            setSalvando(false);
        }
    };

    const motivoSalvarDesligado = salvando ? 'Gravando…'
        : !orgId ? 'Escolha a organização'
        : !sujo ? 'Nada mudou'
        : null;

    return (
        <Sheet open={open} onClose={onClose} size="xl" dirty={sujo && !salvando}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>Preferências de pedidos de compra</SheetTitle>
                <SheetDescription>
                    Padrões que já vêm preenchidos em todo pedido novo. Só preenchem o que você não mexeu, e não mudam pedidos já criados.
                </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 py-5 space-y-8">
                {!orgDoTopo && (
                    <div className="space-y-1.5">
                        <label className={ROTULO} htmlFor="pref-org">Organização</label>
                        <select id="pref-org" value={orgId} onChange={e => setOrgId(e.target.value)} className={CAMPO}>
                            <option value="">Escolha a organização…</option>
                            {gravaveis.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>
                )}

                <TabsBar<Camada>
                    tabs={[
                        { id: 'empresa', label: 'Padrão da empresa', icon: <Building2 className="w-4 h-4" /> },
                        { id: 'pessoal', label: 'Meu padrão', icon: <User className="w-4 h-4" /> },
                    ]}
                    value={camada}
                    onChange={setCamada}
                    bare
                />

                {somenteLeitura && (
                    <p className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-[6px] p-3">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        Só administradores da organização alteram o padrão da empresa. Você pode definir o seu em "Meu padrão".
                    </p>
                )}
                {camada === 'pessoal' && (
                    <p className="text-sm text-gray-500">
                        Campo vazio segue o padrão da empresa. O que você definir aqui vale só para você.
                    </p>
                )}

                {!orgId ? (
                    <p className="text-sm text-gray-500">Escolha a organização para ver e definir os padrões.</p>
                ) : carregando ? (
                    <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            <SecaoTitulo icon={Tag} titulo="Classificação" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO}>Plano de contas</label>
                                    <PlanoContasSelect
                                        planoContas={planoContas}
                                        value={atual.planoDeContasId ?? ''}
                                        onChange={v => definir('planoDeContasId', v || undefined)}
                                        placeholder={segue('planoDeContasId', nomePlano)}
                                        clearLabel={segue('planoDeContasId', nomePlano)}
                                        clearValue=""
                                        size="sm"
                                        disabled={somenteLeitura}
                                        fallbackLabel={atual.planoDeContasId ? nomePlano(atual.planoDeContasId) : undefined}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO}>Centro de custo</label>
                                    <CostCenterSelect
                                        costCenters={costCenters}
                                        value={atual.costCenterId ?? ''}
                                        onChange={v => definir('costCenterId', v || undefined)}
                                        placeholder={segue('costCenterId', nomeCc)}
                                        clearLabel={segue('costCenterId', nomeCc)}
                                        clearValue=""
                                        size="sm"
                                        disabled={somenteLeitura}
                                        fallbackLabel={atual.costCenterId ? nomeCc(atual.costCenterId) : undefined}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <SecaoTitulo icon={CreditCard} titulo="Pagamento" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="pref-condicao">Condição de pagamento</label>
                                    <select id="pref-condicao" disabled={somenteLeitura} className={CAMPO}
                                        value={atual.paymentTermType ?? ''}
                                        onChange={e => definir('paymentTermType', (e.target.value || undefined) as PadroesDoPedido['paymentTermType'])}>
                                        <option value="">{segue('paymentTermType', v => (v === 'Parcelado' ? 'Parcelado' : 'À vista'))}</option>
                                        <option value="Vista">À vista</option>
                                        <option value="Parcelado">Parcelado</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="pref-dias">Prazo de pagamento (dias)</label>
                                    <input id="pref-dias" type="number" min={0} max={365} disabled={somenteLeitura} className={CAMPO}
                                        value={atual.paymentDays ?? ''}
                                        placeholder={segue('paymentDays', v => `${v} dias`)}
                                        onChange={e => definir('paymentDays', e.target.value === '' ? undefined : Math.max(0, Math.min(365, Math.trunc(Number(e.target.value)))))} />
                                </div>
                                {termoVigente === 'Parcelado' && (
                                    <div className="space-y-1.5">
                                        <label className={ROTULO} htmlFor="pref-parcelas">Quantidade de parcelas</label>
                                        <input id="pref-parcelas" type="number" min={1} max={60} disabled={somenteLeitura} className={CAMPO}
                                            value={atual.paymentInstallments ?? ''}
                                            placeholder={segue('paymentInstallments', v => `${v}x`)}
                                            onChange={e => definir('paymentInstallments', e.target.value === '' ? undefined : Math.max(1, Math.min(60, Math.trunc(Number(e.target.value)))))} />
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="pref-forma-pgto">Forma de pagamento</label>
                                    <select id="pref-forma-pgto" disabled={somenteLeitura} className={CAMPO}
                                        value={atual.paymentMethod ?? ''}
                                        onChange={e => definir('paymentMethod', e.target.value || undefined)}>
                                        <option value="">{segue('paymentMethod', v => FORMAS_PAGAMENTO_PEDIDO.find(f => f.value === v)?.label ?? String(v))}</option>
                                        {FORMAS_PAGAMENTO_PEDIDO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="pref-conta">Conta de pagamento</label>
                                    <select id="pref-conta" disabled={somenteLeitura} className={CAMPO}
                                        value={atual.paymentAccountId ?? ''}
                                        onChange={e => definir('paymentAccountId', e.target.value || undefined)}>
                                        <option value="">{segue('paymentAccountId', nomeConta)}</option>
                                        {atual.paymentAccountId && !contas.some(c => c.id === atual.paymentAccountId) && (
                                            <option value={atual.paymentAccountId}>— conta fora da lista —</option>
                                        )}
                                        {contas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <SecaoTitulo icon={Truck} titulo="Entrega" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="pref-entrega">Forma de entrega</label>
                                    <select id="pref-entrega" disabled={somenteLeitura} className={CAMPO}
                                        value={atual.deliveryMethod ?? ''}
                                        onChange={e => definir('deliveryMethod', e.target.value || undefined)}>
                                        <option value="">{segue('deliveryMethod', v => rotuloEntrega(String(v)))}</option>
                                        {FORMAS_DE_ENTREGA.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className={ROTULO} htmlFor="pref-prazo-entrega">Prazo de entrega (dias após o pedido)</label>
                                    <input id="pref-prazo-entrega" type="number" min={0} max={365} disabled={somenteLeitura} className={CAMPO}
                                        value={atual.prazoEntregaDias ?? ''}
                                        placeholder={segue('prazoEntregaDias', v => `${v} dias`)}
                                        onChange={e => definir('prazoEntregaDias', e.target.value === '' ? undefined : Math.max(0, Math.min(365, Math.trunc(Number(e.target.value)))))} />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className={ROTULO} htmlFor="pref-local">Local de entrega</label>
                                    <input id="pref-local" type="text" maxLength={200} disabled={somenteLeitura} className={CAMPO}
                                        value={atual.deliveryLocation ?? ''}
                                        placeholder={segue('deliveryLocation', v => String(v))}
                                        onChange={e => definir('deliveryLocation', e.target.value || undefined)} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <SecaoTitulo icon={MessageSquareText} titulo="Observações" />
                            <div className="space-y-1.5">
                                <label className={ROTULO} htmlFor="pref-obs">Observações padrão</label>
                                <textarea id="pref-obs" rows={4} maxLength={LIMITE_OBSERVACAO} disabled={somenteLeitura}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-blue-600 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    value={atual.notes ?? ''}
                                    placeholder={herdado.valores.notes
                                        ? `${camada === 'pessoal' ? 'Seguir a empresa' : 'Padrão'}: ${herdado.valores.notes}`
                                        : 'Ex.: Receber de segunda a sexta, das 7h às 16h. A nota fiscal deve vir com o número do pedido.'}
                                    onChange={e => definir('notes', e.target.value || undefined)} />
                            </div>
                            <div className="space-y-1.5 sm:w-1/2">
                                <label className={ROTULO} htmlFor="pref-obs-visivel">Observações visíveis ao fornecedor</label>
                                <select id="pref-obs-visivel" disabled={somenteLeitura} className={CAMPO}
                                    value={atual.notesVisibleToSupplier === undefined ? '' : atual.notesVisibleToSupplier ? 'sim' : 'nao'}
                                    onChange={e => definir('notesVisibleToSupplier', e.target.value === '' ? undefined : e.target.value === 'sim')}>
                                    <option value="">{segue('notesVisibleToSupplier', v => (v ? 'Sim' : 'Não'))}</option>
                                    <option value="sim">Sim</option>
                                    <option value="nao">Não</option>
                                </select>
                            </div>
                        </div>
                    </>
                )}
            </SheetPanel>

            <SheetFooter>
                <div className="flex items-center justify-end gap-3 w-full">
                    {erro && (
                        <p className="mr-auto flex items-center gap-1.5 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
                        </p>
                    )}
                    {!erro && !somenteLeitura && !!orgId && !carregando && Object.keys(sanearPadroes(atual)).length > 0 && (
                        <button
                            type="button"
                            onClick={() => setRascunho(r => ({ ...r, [camada]: {} }))}
                            className="mr-auto h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all whitespace-nowrap"
                            title={camada === 'empresa' ? 'Volta todos os campos ao padrão do sistema' : 'Volta todos os campos a seguir a empresa'}
                        >
                            Limpar<span className="hidden sm:inline"> {camada === 'empresa' ? 'padrão da empresa' : 'meu padrão'}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-3.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all"
                    >
                        Fechar
                    </button>
                    <span className="inline-flex" title={motivoSalvarDesligado ?? undefined}>
                        <button
                            type="button"
                            onClick={salvar}
                            disabled={!!motivoSalvarDesligado}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] whitespace-nowrap transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {salvando ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <CheckCircle2 className="w-[15px] h-[15px]" />}
                            Salvar<span className="hidden sm:inline"> preferências</span>
                        </button>
                    </span>
                </div>
            </SheetFooter>
        </Sheet>
    );
};

export default PreferenciasPedidoSheet;
