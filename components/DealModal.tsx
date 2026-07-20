import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, FileText, Briefcase, User, Info, Building, Check, AlertCircle, TrendingUp, Maximize2, Layers, UserCheck, Percent, PenLine, ArrowLeft, Mail, Phone, MapPin, Pencil } from 'lucide-react';
import { Property, PropertyDeal, Client, Organization, PaymentInstallment, BrokerProfile } from '../types';
import { commercialService } from '../services/commercialService';
import { clientService } from '../services/clientService';
import { organizationService } from '../services/organizationService';
import { propertyExportService } from '../services/propertyExportService';
import { projectService, ProjectData } from '../services/projectService';
import { brokerService } from '../services/brokerService';
import { commercialFinanceService } from '../services/commercialFinanceService';
import { contractService } from '../services/contractService';
import { Contract } from '../types';
import DealWorkflowBar from './DealWorkflowBar';
import { DealWorkflowStatus } from '../lib/dealWorkflow';
import DealSignaturePanel from './DealSignaturePanel';
import CreditAnalysisPanel from './CreditAnalysisPanel';
import { useConfirm } from './ui/confirm';

type TabId = 'cliente' | 'unidade' | 'pagamento' | 'partes' | 'contrato';

/**
 * Edição em lote de desconto (Plano de Pagamento → seleção múltipla).
 * Modelo: `components/BankTxEdicaoEmLoteModal.tsx` (Financeiro → Extrato
 * Bancário) — modal dedicado em vez de controles inline na barra de seleção
 * (guia §10). Aplica o MESMO tipo+valor de desconto a todas as parcelas
 * selecionadas; cada uma recalcula seu valor final a partir da própria base
 * (originalValue ?? value), então parcelas com valores diferentes recebem
 * o desconto proporcional (%) ou o mesmo abatimento fixo (R$) corretamente.
 */
interface InstallmentLoteModalProps {
    installments: PaymentInstallment[]; // selecionadas
    onClose: () => void;
    onSave: (discountType: 'VALUE' | 'PERCENT' | null, discountAmount: number) => void;
}
const InstallmentLoteDiscountModal: React.FC<InstallmentLoteModalProps> = ({ installments, onClose, onSave }) => {
    const [discountType, setDiscountType] = useState<'VALUE' | 'PERCENT' | ''>('');
    const [discountAmount, setDiscountAmount] = useState('');

    const totalBruto = installments.reduce((s, i) => s + (i.originalValue ?? i.value), 0);
    const amount = parseFloat(discountAmount.replace(',', '.')) || 0;
    const canSave = discountType === '' /* limpar desconto */ || amount > 0;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Editar Desconto em Lote</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {installments.length} parcela{installments.length !== 1 ? 's' : ''} selecionada{installments.length !== 1 ? 's' : ''} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBruto)} (bruto)
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Tipo de Desconto</label>
                        <select
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value as 'VALUE' | 'PERCENT' | '')}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                        >
                            <option value="">Remover desconto de todas</option>
                            <option value="VALUE">Desconto em R$ (mesmo valor em todas)</option>
                            <option value="PERCENT">Desconto em % (mesmo percentual em todas)</option>
                        </select>
                    </div>

                    {discountType !== '' && (
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">
                                Valor do desconto {discountType === 'PERCENT' ? '(%)' : '(R$)'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                placeholder={discountType === 'PERCENT' ? 'Ex: 10' : 'Ex: 100,00'}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-purple-400"
                            />
                        </div>
                    )}

                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                        {installments.map(i => (
                            <div key={i.id} className="flex items-center justify-between px-4 py-2 text-xs">
                                <span className="text-gray-700 font-medium truncate max-w-[60%]">{i.description}</span>
                                <span className="text-gray-500 font-bold shrink-0 ml-2">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.originalValue ?? i.value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-button uppercase tracking-widest hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSave(discountType || null, amount)}
                        disabled={!canSave}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-purple-600 text-white font-bold text-button uppercase tracking-widest hover:bg-purple-700 transition-colors disabled:opacity-40 shadow-lg shadow-purple-900/20"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DealModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Partial<PropertyDeal>;
    onSave?: () => void;
    defaultType?: 'SALE' | 'RENTAL' | 'SERVICE';
    organizationId?: string;
    /** ID do edifício selecionado — se informado, filtra o dropdown apenas para unidades filhas deste edifício */
    buildingId?: string;
}

const DealModal: React.FC<DealModalProps> = ({ isOpen, onClose, initialData, onSave, defaultType, organizationId, buildingId }) => {
    const [activeTab, setActiveTab] = useState<TabId>('cliente');
    const confirm = useConfirm();

    const [formData, setFormData] = useState<Partial<PropertyDeal>>({
        type: defaultType || 'SALE',
        status: 'IN_NEGOTIATION',
        value: 0,
        date: new Date().toISOString().split('T')[0],
        notes: '',
        payment_method: 'CASH',
        installments: 1,
        down_payment: 0,
        contract_number: '',
        organization_id: organizationId,
        broker_commission_pct: 0,
        broker_commission_value: 0,
        ...initialData
    });

    useEffect(() => {
        if (isOpen) {
            setActiveTab('cliente');
            setFormData({
                type: defaultType || 'SALE',
                status: 'IN_NEGOTIATION',
                value: 0,
                date: new Date().toISOString().split('T')[0],
                notes: '',
                payment_method: 'CASH',
                installments: 1,
                down_payment: 0,
                contract_number: '',
                organization_id: organizationId,
                broker_commission_pct: 0,
                broker_commission_value: 0,
                ...initialData
            });
            setSelectedInstallmentIds(new Set());
            setLastCheckedInstallmentIndex(null);
        }
    }, [initialData, isOpen]);

    const [properties, setProperties] = useState<Property[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [org, setOrg] = useState<Organization | null>(null);

    // Seleção em lote das parcelas (Plano de Pagamento) — mesmo padrão de
    // BankReconciliation.tsx (Extrato Bancário): Set de ids + âncora de
    // Shift+clique (guia §10.1) + modal dedicado de edição em lote (§10).
    const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<Set<string>>(new Set());
    const [lastCheckedInstallmentIndex, setLastCheckedInstallmentIndex] = useState<number | null>(null);
    const [showInstallmentLoteModal, setShowInstallmentLoteModal] = useState(false);

    const handleInstallmentRowCheck = (id: string, index: number, checked: boolean, shiftKey: boolean) => {
        const rows = formData.custom_installments || [];
        if (shiftKey && lastCheckedInstallmentIndex !== null) {
            const [start, end] = lastCheckedInstallmentIndex < index ? [lastCheckedInstallmentIndex, index] : [index, lastCheckedInstallmentIndex];
            const rangeIds = rows.slice(start, end + 1).map(i => i.id);
            setSelectedInstallmentIds(prev => new Set([...prev, ...rangeIds]));
        } else {
            setSelectedInstallmentIds(prev => {
                const next = new Set(prev);
                if (checked) next.add(id); else next.delete(id);
                return next;
            });
            setLastCheckedInstallmentIndex(index);
        }
    };

    /** Aplica o mesmo tipo+valor de desconto a todas as parcelas selecionadas — cada
     * uma recalcula seu próprio valor final a partir da sua base (originalValue ?? value). */
    const applyBulkInstallmentDiscount = (discountType: 'VALUE' | 'PERCENT' | null, discountAmount: number) => {
        setFormData(prev => {
            const insts = (prev.custom_installments || []).map(inst => {
                if (!selectedInstallmentIds.has(inst.id)) return inst;
                const base = inst.originalValue ?? inst.value;
                let finalValue = base;
                if (discountType === 'PERCENT') finalValue = base - (base * discountAmount / 100);
                else if (discountType === 'VALUE') finalValue = base - discountAmount;
                finalValue = Math.max(0, finalValue);
                return {
                    ...inst,
                    originalValue: base,
                    discountType: discountType ?? undefined,
                    discountAmount: discountType ? discountAmount : undefined,
                    value: Number(finalValue.toFixed(2))
                };
            });
            return { ...prev, custom_installments: insts };
        });
        setShowInstallmentLoteModal(false);
        setSelectedInstallmentIds(new Set());
    };

    // Ponte Negociação → Contrato formal. Venda (domain='VENDAS') gera um contrato
    // de compra e venda; Locação (domain='LOCACAO') gera um contrato recorrente.
    const [linkedContract, setLinkedContract] = useState<Contract | null>(null);
    const [generatingContract, setGeneratingContract] = useState(false);
    const [contractError, setContractError] = useState<string | null>(null);

    // Quem tem ponte para contrato formal: Venda e Locação (Serviço não).
    const canGenerateContract = formData.type === 'SALE' || formData.type === 'RENTAL';

    // Ao abrir uma negociação de venda/locação já salva, verifica se já há contrato gerado
    useEffect(() => {
        setLinkedContract(null);
        setContractError(null);
        if (isOpen && formData.id && canGenerateContract) {
            contractService.getContractByDealId(formData.id)
                .then(setLinkedContract)
                .catch(err => console.error('[DealModal] Erro ao buscar contrato da negociação:', err));
        }
    }, [isOpen, formData.id, formData.type]);

    // Ao abrir uma negociação já salva, reconstrói o Plano de Pagamento a partir
    // do cofre financeiro (Gestão Comercial) — custom_installments NUNCA é coluna
    // de commercial_deals (removido antes do insert/update, ver
    // commercialService.saveDeal), só sobrevive materializado no cofre. Sem isto,
    // reabrir a negociação sempre mostrava o plano vazio mesmo com parcelas já
    // geradas e salvas — "as parcelas somem" ao sair e voltar.
    useEffect(() => {
        if (!isOpen || !formData.id) return;
        const orgId = formData.organization_id || organizationId;
        if (!orgId) return;
        let active = true;
        commercialFinanceService.getDealInstallments(formData.id, orgId)
            .then(insts => {
                if (active && insts.length > 0) {
                    // Não sobrescreve se já houver algo em edição (ex: efeito refirou
                    // depois que o usuário já gerou/editou parcelas nesta sessão).
                    setFormData(prev => (prev.custom_installments?.length ? prev : { ...prev, custom_installments: insts }));
                }
            })
            .catch(err => console.error('[DealModal] Erro ao recuperar parcelas do cofre:', err));
        return () => { active = false; };
    }, [isOpen, formData.id]);

    const handleGenerateContract = async () => {
        if (!formData.id) return;
        const isRental = formData.type === 'RENTAL';
        if (!formData.client_id) { setContractError(`Selecione o ${isRental ? 'locatário' : 'comprador'} antes de gerar o contrato.`); return; }
        setGeneratingContract(true);
        setContractError(null);
        try {
            const contract = await contractService.createFromDeal({
                id: formData.id,
                organization_id: formData.organization_id || organizationId,
                client_id: formData.client_id,
                property_id: formData.property_id,
                value: formData.value || 0,
                date: formData.date,
                contract_number: formData.contract_number,
                notes: formData.notes,
                payment_method: formData.payment_method,
                installments: formData.installments,
                status: formData.status,
                signature_status: formData.signature_status,
                signature_url: formData.signature_url,
                signed_contract_url: formData.signed_contract_url,
                // Locação: alimenta recorrência/reajuste do contrato
                payment_due_date: formData.payment_due_date,
            }, isRental ? 'LOCACAO' : 'VENDAS');
            setLinkedContract(contract);
        } catch (err: any) {
            console.error('[DealModal] Erro ao gerar contrato:', err);
            setContractError(err?.message || 'Erro ao gerar contrato.');
        } finally {
            setGeneratingContract(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [allProps, c, o, projs] = await Promise.all([
                    commercialService.listProperties(),
                    clientService.listClients(),
                    organizationService.listOrganizations(),
                    projectService.listProjects()
                ]);

                const negotiableProps = buildingId
                    ? allProps.filter(p => p.parent_id === buildingId)
                    : allProps.filter(p => p.type !== 'BUILDING');

                setProperties(negotiableProps);
                setClients(c);
                setProjects(projs.map(proj => ({ ...proj, budget: [] })));
                if (o && o.length > 0) {
                    setOrg(o[0]);
                    if (!formData.id && !formData.organization_id) {
                        setFormData(prev => ({ ...prev, organization_id: o[0].id }));
                    }
                    const brokerData = await brokerService.listProfiles(organizationId);
                    setBrokers(brokerData);
                }
            } catch (err) {
                console.error('Error loading DealModal data:', err);
            }
        };
        if (isOpen) load();
    }, [isOpen, buildingId]);

    const selectedProperty = properties.find(p => p.id === formData.property_id);
    const selectedClient = clients.find(c => c.id === formData.client_id);
    const selectedBroker = brokers.find(b => b.id === formData.broker_id);

    // Linhas de endereço do cliente selecionado — conferência antes de emitir
    // contrato (aba "Dados do Cliente"). Mesma convenção de exibição de
    // ClientList.tsx: campos vazios não geram vírgula/traço solto.
    const clientAddressLine1 = [selectedClient?.address, selectedClient?.address_number].filter(Boolean).join(', ');
    const clientAddressLine2 = [
        selectedClient?.neighborhood,
        [selectedClient?.city, selectedClient?.state].filter(Boolean).join('/'),
        selectedClient?.zip_code ? `CEP ${selectedClient.zip_code}` : '',
    ].filter(Boolean).join(' — ');

    const recalcCommission = (value: number, pct: number) => +(value * (pct / 100)).toFixed(2);

    const handleGenerateInstallments = async () => {
        if (formData.id) {
            setLoading(true);
            try {
                const orgId = formData.organization_id || organizationId || '';
                const { hasPaid, paidCount } = await commercialFinanceService.hasPaidInstallments(formData.id, orgId);
                if (hasPaid) {
                    alert(`Não é possível regerar as parcelas. Esta negociação possui ${paidCount} parcela(s) com status "PAGO" no módulo financeiro. Para habilitar a regeração, você deve primeiro reverter o status dessas parcelas para "PENDENTE" no financeiro.`);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.error('[DealModal] Error checking paid installments:', err);
            } finally {
                setLoading(false);
            }
        }

        setFormData(prev => {
            const downPayment = prev.down_payment || 0;
            const count = prev.installments || 1;
            const baseValue = prev.value || 0;
            const instValue = Math.max(0, baseValue - downPayment) / count;
            // Retém as parcelas já existentes (data, valor, desconto — tudo que o
            // usuário já ajustou manualmente): clicar em "Gerar Parcelas" de novo
            // (ex: só pra ajustar o Nº Parcelas) não pode apagar edições e descontos
            // já feitos. Só ajusta o TAMANHO do cronograma; índices que já existiam
            // continuam intactos, só o rótulo "Parcela i/count" é recalculado.
            const existing = prev.custom_installments || [];

            const newInstallments: PaymentInstallment[] = [];
            for (let i = 1; i <= count; i++) {
                const prior = existing[i - 1];
                if (prior) {
                    newInstallments.push({ ...prior, description: `Parcela ${i}/${count}` });
                    continue;
                }
                let date: Date;
                if (prev.payment_due_date) {
                    // Data do 1º Pagamento ancora a parcela 1; as demais somam 1 mês
                    // cada a partir dela (não mais da Data Efetiva). Meio-dia UTC
                    // evita o bug de fuso que retrocede 1 dia em UTC-3.
                    date = new Date(prev.payment_due_date + 'T12:00:00Z');
                    date.setUTCMonth(date.getUTCMonth() + (i - 1));
                } else {
                    // Sem Data do 1º Pagamento definida: comportamento antigo.
                    date = new Date(prev.date || Date.now());
                    date.setMonth(date.getMonth() + i);
                }
                newInstallments.push({
                    id: `temp-${Date.now()}-${i}`,
                    description: `Parcela ${i}/${count}`,
                    dueDate: date.toISOString().split('T')[0],
                    value: instValue,
                    status: 'PENDING',
                    dealId: prev.id
                });
            }
            return { ...prev, custom_installments: newInstallments };
        });
    };

    /**
     * Recalcula o valor final da parcela a partir do valor bruto + desconto
     * (R$ ou %). `value` continua sendo o que materializa em Contas a Receber
     * — editar o valor bruto, o tipo de desconto ou o valor do desconto sempre
     * recalcula `value` a partir da base (`originalValue`), nunca deixando os
     * dois soltos e fora de sincronia.
     */
    const updateInstallmentDiscount = (
        index: number,
        patch: Partial<Pick<PaymentInstallment, 'originalValue' | 'discountType' | 'discountAmount'>>
    ) => {
        setFormData(prev => {
            const insts = [...(prev.custom_installments || [])];
            const inst = insts[index];
            const merged = { ...inst, ...patch };
            const base = merged.originalValue ?? inst.value;
            const discType = merged.discountType;
            const discAmt = merged.discountAmount || 0;
            let finalValue = base;
            if (discType === 'PERCENT') finalValue = base - (base * discAmt / 100);
            else if (discType === 'VALUE') finalValue = base - discAmt;
            finalValue = Math.max(0, finalValue);
            insts[index] = { ...merged, originalValue: base, value: Number(finalValue.toFixed(2)) };
            return { ...prev, custom_installments: insts };
        });
    };

    /**
     * Handler do campo "Data do 1º Pagamento". Se já existem parcelas geradas
     * (custom_installments), muda-la sozinha deixaria a data e o cronograma
     * dessincronizados — pergunta antes de recalcular os vencimentos (mantendo
     * os valores). A gravação em Contas a Receber só acontece ao Salvar.
     */
    const handlePaymentDueDateChange = async (newDate: string) => {
        const hasGenerated = (formData.custom_installments?.length ?? 0) > 0;
        if (hasGenerated && newDate && newDate !== formData.payment_due_date) {
            const ok = await confirm({
                title: 'Atualizar datas das parcelas?',
                message: (
                    <>
                        As parcelas já foram geradas. Deseja recalcular o vencimento de cada
                        uma a partir da nova Data do 1º Pagamento (os valores não mudam)?
                        <p className="mt-2 text-xs text-gray-500">
                            A mudança só é gravada em Contas a Receber ao clicar em "Salvar Alterações".
                        </p>
                    </>
                ),
                variant: 'warning',
                confirmLabel: 'Recalcular parcelas',
            });
            if (ok) {
                setFormData(prev => {
                    const recalced = (prev.custom_installments || []).map((inst, idx) => {
                        const d = new Date(newDate + 'T12:00:00Z');
                        d.setUTCMonth(d.getUTCMonth() + idx);
                        return { ...inst, dueDate: d.toISOString().split('T')[0] };
                    });
                    return { ...prev, payment_due_date: newDate, custom_installments: recalced };
                });
                return;
            }
        }
        setFormData(prev => ({ ...prev, payment_due_date: newDate }));
    };

    const handleExportPDF = () => {
        if (!selectedProperty) {
            alert('Selecione um imóvel antes de exportar.');
            return;
        }
        propertyExportService.generateProposalPDF(formData as PropertyDeal, selectedProperty, selectedClient, org);
    };

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();

        if (!formData.property_id || !formData.client_id) {
            setActiveTab(!formData.property_id ? 'unidade' : 'cliente');
            alert('Por favor, selecione o imóvel e o cliente para continuar.');
            return;
        }

        if (formData.value === 0) {
            const ok = await confirm({
                title: 'Valor zerado',
                message: 'O valor da negociação está zerado. Deseja continuar assim mesmo?',
                variant: 'warning',
                confirmLabel: 'Continuar',
            });
            if (!ok) return;
        }

        setLoading(true);
        console.log('[DealModal] Tentando salvar negociação:', formData);

        try {
            const payload = {
                ...formData,
                organization_id: formData.organization_id || organizationId || org?.id || (initialData as any)?.organization_id
            };

            if (!payload.organization_id) {
                console.error('[DealModal] ERRO: organization_id ausente no payload');
                alert('Erro: Organização não identificada. Por favor, recarregue a página.');
                setLoading(false);
                return;
            }

            const savedDeal = await commercialService.saveDeal(payload);
            console.log('[DealModal] Negociação salva com sucesso:', savedDeal);

            if (onSave) onSave();
            onClose();
        } catch (err: any) {
            console.error('[DealModal] Erro ao salvar:', err);
            alert(`Erro ao salvar negociação: ${err.message || 'Erro de conexão/banco'}`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // "Gerenciar Negociação" (registro já existente) vira tela cheia — mesmo padrão
    // de conversão do ProjectModal (modo edit): sem backdrop/dim, seta "voltar" no
    // lugar do X. "Nova Negociação Comercial" (criação simples) continua modal.
    const isEditMode = !!formData.id;

    // Antes um único hasMissingRequired cobria os dois campos na mesma aba;
    // divididos agora que cada um vive na sua própria aba, aponta exatamente
    // onde falta o dado (badge por aba, não mais genérico).
    const hasMissingClient = !formData.client_id;
    const hasMissingProperty = !formData.property_id;
    const hasBroker = !!formData.broker_id;
    const hasContratoContent = formData.id && (
        ['WAITING_PAYMENT', 'CONTRATO', 'ASSINATURA'].includes(formData.status || '') ||
        formData.contract_number
    );

    const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: boolean }[] = [
        {
            id: 'cliente',
            label: 'Dados do Cliente',
            icon: <User className="w-4 h-4" />,
            badge: hasMissingClient
        },
        {
            id: 'unidade',
            label: 'Dados da Unidade',
            icon: <Building className="w-4 h-4" />,
            badge: hasMissingProperty
        },
        {
            id: 'pagamento',
            label: 'Forma de Pagamento',
            icon: <DollarSign className="w-4 h-4" />,
        },
        {
            id: 'partes',
            label: 'Partes e Comissões',
            icon: <UserCheck className="w-4 h-4" />,
            badge: hasBroker
        },
        {
            id: 'contrato',
            label: 'Contrato e Assinatura',
            icon: <PenLine className="w-4 h-4" />,
            badge: !!hasContratoContent
        },
    ];

    // `absolute` (não `fixed`): Layout.tsx tem <main className="relative"> abaixo da
    // barra superior sticky (irmã do main, não ancestral) — absolute preenche só a
    // área de conteúdo, deixando a barra visível. `fixed` ignora esse container e
    // cobre a janela inteira, escondendo a navegação do app.
    return (
        <div className={isEditMode ? 'absolute inset-0 z-[110] bg-white flex flex-col' : 'absolute inset-0 z-[110] flex items-center justify-center p-8'}>
            {!isEditMode && (
                <div className="absolute inset-0 bg-[#0B1727]/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />
            )}

            <div className={isEditMode
                ? 'relative bg-white w-full h-full overflow-hidden flex flex-col animate-in fade-in duration-300'
                : 'relative bg-white w-full h-full overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col'
            }>

                {/* Header */}
                <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6 flex-1">
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-100 ring-2 ring-white">
                                <Briefcase className="w-6 h-6 text-white" />
                            </div>
                            <div className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 shadow-sm uppercase tracking-tighter">
                                {formData.type === 'SALE' ? 'VENDA' : formData.type === 'RENTAL' ? 'ALUGUEL' : 'SERVIÇO'}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                    {formData.id ? 'Gerenciar Negociação' : 'Nova Negociação Comercial'}
                                </h2>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white rounded-md border border-gray-100 shadow-sm">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Status:</span>
                                    <span className={`text-xs font-black uppercase ${formData.status === 'COMPLETED' ? 'text-green-600' :
                                        formData.status === 'CANCELLED' ? 'text-red-500' : 'text-purple-600'
                                        }`}>
                                        {formData.status?.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] truncate max-w-xl">
                                {selectedProperty ? `${selectedProperty.name} • ${selectedProperty.address}` : 'Registro de Ativo Imobiliário'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 shrink-0">
                        <div className="text-right">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Tipo de Acordo</p>
                            <div className="flex items-center gap-2 justify-end">
                                <TrendingUp className="w-4 h-4 text-purple-400" />
                                <span className="text-lg font-black text-purple-600 uppercase tracking-tighter">
                                    {formData.type === 'SALE' ? 'Venda Direta' : formData.type === 'RENTAL' ? 'Contrato Locação' : 'Prestação de Serviço'}
                                </span>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-gray-200" />
                        <div className="text-right">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Valor Total</p>
                            <div className="flex items-baseline gap-1 text-purple-600">
                                <span className="text-xs font-bold font-mono">R$</span>
                                <span className="text-3xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.value || 0)}</span>
                            </div>
                        </div>
                        {(formData.broker_commission_value || 0) > 0 && (
                            <>
                                <div className="h-10 w-px bg-gray-200" />
                                <div className="text-right">
                                    <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1 leading-none">Comissão Corretor</p>
                                    <div className="flex items-baseline gap-1 text-amber-600">
                                        <span className="text-xs font-bold font-mono">R$</span>
                                        <span className="text-xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.broker_commission_value || 0)}</span>
                                    </div>
                                </div>
                            </>
                        )}
                        {isEditMode ? (
                            <button type="button" onClick={onClose} className="w-12 h-12 bg-white text-gray-400 rounded-xl flex items-center justify-center hover:text-blue-600 hover:border-blue-100 transition-all border border-gray-100 shadow-sm group">
                                <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
                            </button>
                        ) : (
                            <button type="button" onClick={onClose} className="w-12 h-12 bg-white text-gray-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-gray-100 shadow-sm group">
                                <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="px-8 pt-4 pb-0 bg-white border-b border-gray-100 shrink-0">
                    <div className="flex gap-1">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-2 px-5 py-3 text-button font-black uppercase tracking-widest rounded-t-xl transition-all border-b-2 ${
                                        isActive
                                            ? 'text-purple-600 bg-purple-50/60 border-purple-600'
                                            : 'text-gray-400 bg-transparent border-transparent hover:text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {tab.badge && tab.id === 'cliente' && hasMissingClient && (
                                        <span className="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2" />
                                    )}
                                    {tab.badge && tab.id === 'unidade' && hasMissingProperty && (
                                        <span className="w-2 h-2 rounded-full bg-red-400 absolute top-2 right-2" />
                                    )}
                                    {tab.badge && tab.id === 'partes' && hasBroker && (
                                        <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-2 right-2" />
                                    )}
                                    {tab.badge && tab.id === 'contrato' && hasContratoContent && (
                                        <span className="w-2 h-2 rounded-full bg-purple-400 absolute top-2 right-2" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Form content */}
                <form
                    id="deal-modal-form"
                    onSubmit={handleSubmit}
                    className="flex-1 overflow-y-auto p-8"
                >
                    {/* ══════════════════════════════════════════
                        ABA 1 — DADOS DO CLIENTE
                    ══════════════════════════════════════════ */}
                    {activeTab === 'cliente' && (
                        <div className="max-w-2xl space-y-8">
                            {/* Cliente */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <User className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Cliente / Comprador</h3>
                                    <span className="text-xs font-semibold text-red-500">Obrigatório</span>
                                </div>
                                <select
                                    required
                                    value={formData.client_id || ''}
                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                    className="w-full px-8 py-5 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-3xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-lg"
                                >
                                    <option value="" disabled>Selecione o Cliente / Comprador...</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Dados cadastrados do cliente (Minha Organização → Meus Clientes) —
                                somente leitura, para conferência antes de emitir o contrato. Não
                                edita o cadastro aqui (evita duas fontes de verdade); qualquer
                                correção é feita em Meus Clientes. */}
                            {selectedClient && (
                                <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-4 animate-in slide-in-from-left-4 duration-500 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-purple-600">
                                            <UserCheck className="w-4 h-4" />
                                            <h4 className="font-black uppercase tracking-widest text-xs">Dados Cadastrados — Conferência</h4>
                                        </div>
                                        {selectedClient.category && (
                                            <span className="text-xs font-black bg-white px-2 py-1 rounded-lg border border-gray-100 text-purple-600 shadow-sm uppercase tracking-widest">
                                                {selectedClient.category}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Tipo de Pessoa</p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <FileText className="w-3 h-3" /> CPF / CNPJ
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.document || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <Mail className="w-3 h-3" /> E-mail
                                            </p>
                                            <p className="text-sm font-bold text-gray-800 truncate">{selectedClient.email || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> Telefone
                                            </p>
                                            <p className="text-sm font-bold text-gray-800">{selectedClient.phone || '—'}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" /> Endereço
                                        </p>
                                        <p className="text-sm font-bold text-gray-800">{clientAddressLine1 || '—'}</p>
                                        {clientAddressLine2 && (
                                            <p className="text-xs font-medium text-gray-500 mt-0.5">{clientAddressLine2}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Origem / Canal — alimenta "Fontes de Locação" (e Vendas) */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Origem / Canal</label>
                                <select
                                    value={formData.origin_channel || ''}
                                    onChange={(e) => setFormData({ ...formData, origin_channel: e.target.value })}
                                    className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="">Não informado</option>
                                    <option value="Direto">Direto</option>
                                    <option value="Indicação">Indicação</option>
                                    <option value="Portal Imobiliário">Portal Imobiliário</option>
                                    <option value="Imobiliária / Corretor">Imobiliária / Corretor</option>
                                    <option value="Redes Sociais">Redes Sociais</option>
                                    <option value="Site">Site</option>
                                    <option value="Outros">Outros</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 2 — DADOS DA UNIDADE
                    ══════════════════════════════════════════ */}
                    {activeTab === 'unidade' && (
                        <div className="max-w-2xl space-y-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <Building className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Imóvel da Negociação</h3>
                                    <span className="text-xs font-semibold text-red-500">Obrigatório</span>
                                </div>
                                <select
                                    required
                                    value={formData.property_id || ''}
                                    onChange={(e) => {
                                        const propId = e.target.value;
                                        const prop = properties.find(p => p.id === propId);
                                        setFormData({
                                            ...formData,
                                            property_id: propId,
                                            linked_project_id: prop?.project_id || formData.linked_project_id || ''
                                        });
                                    }}
                                    className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-base"
                                >
                                    <option value="" disabled>Selecione um imóvel do inventário...</option>
                                    {properties.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} - R$ {(p.price || 0).toLocaleString('pt-BR')}</option>
                                    ))}
                                </select>

                                {selectedProperty && (
                                    <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 flex items-center gap-6 animate-in slide-in-from-left-4 duration-500 shadow-sm">
                                        <div className="w-20 h-20 rounded-xl border-2 border-white shadow-lg overflow-hidden bg-white shrink-0">
                                            {selectedProperty.images?.[0] ?
                                                <img src={selectedProperty.images[0]} className="w-full h-full object-cover" alt="Preview" /> :
                                                <div className="w-full h-full flex items-center justify-center text-gray-200"><Building className="w-10 h-10" /></div>
                                            }
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-lg font-black text-gray-900 tracking-tight">{selectedProperty.name}</p>
                                                <span className="text-xs font-black bg-white px-2 py-1 rounded-lg border border-gray-100 text-purple-600 shadow-sm uppercase tracking-widest">Ativo Disponível</span>
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">{selectedProperty.address}</p>
                                            <div className="flex items-center gap-4 mt-4">
                                                <div className="flex items-center gap-1.5 text-gray-400">
                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                    <span className="text-xs font-black tracking-widest">{selectedProperty.area} m²</span>
                                                </div>
                                                <div className="h-3 w-px bg-gray-200" />
                                                <p className="text-sm font-black text-purple-600 font-mono">R$ {(selectedProperty.price || 0).toLocaleString('pt-BR')}</p>
                                                {formData.linked_project_id && (() => {
                                                    const proj = projects.find(p => p.id === formData.linked_project_id);
                                                    return proj ? (
                                                        <>
                                                            <div className="h-3 w-px bg-gray-200" />
                                                            <div className="flex items-center gap-1.5 text-gray-400">
                                                                <Layers className="w-3.5 h-3.5" />
                                                                <span className="text-xs font-black tracking-widest truncate max-w-[140px]">{proj.name}</span>
                                                            </div>
                                                        </>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 3 — FORMA DE PAGAMENTO
                    ══════════════════════════════════════════ */}
                    {activeTab === 'pagamento' && (
                        <div className="space-y-6">
                            {/* Campos compactos (não precisam de tela cheia) — Tipo, Valor, Datas,
                                Forma de Pagamento, Entrada/Nº Parcelas. O Plano de Pagamento (abaixo,
                                fora deste container) usa a largura toda: cada parcela + desconto
                                cabe numa linha só. */}
                            <div className="max-w-3xl space-y-6">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <DollarSign className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">
                                        {formData.type === 'SALE' ? 'Condições de Venda' :
                                            formData.type === 'RENTAL' ? 'Condições de Aluguel' : 'Condições do Acordo'}
                                    </h3>
                                </div>

                                {/* Tipo */}
                                <div className={`grid gap-4 bg-gray-50 p-2 rounded-3xl shadow-inner ${(initialData?.type || defaultType) ? 'hidden' : 'grid-cols-3'}`}>
                                    {(['SALE', 'RENTAL', 'SERVICE'] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, type: t })}
                                            className={`py-4 rounded-2xl font-black text-button uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${formData.type === t ? 'bg-white text-purple-600 shadow-xl border border-gray-100 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {t === 'SALE' ? 'Venda' : t === 'RENTAL' ? 'Aluguel' : 'Serviço'}
                                        </button>
                                    ))}
                                </div>

                                {/* Valor */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Valor do Fechamento</label>
                                    <div className="relative group">
                                        <span className="absolute left-8 top-1/2 -translate-y-1/2 font-mono font-bold text-purple-300 group-focus-within:text-white transition-colors">BRL</span>
                                        <input
                                            required
                                            type="number"
                                            value={formData.value || ''}
                                            onChange={(e) => {
                                                const newValue = parseFloat(e.target.value) || 0;
                                                const pct = formData.broker_commission_pct || 0;
                                                setFormData({
                                                    ...formData,
                                                    value: newValue,
                                                    broker_commission_value: recalcCommission(newValue, pct)
                                                });
                                            }}
                                            className="w-full pl-20 pr-8 py-6 bg-purple-600 text-white placeholder-purple-300 rounded-[2rem] outline-none font-black text-3xl shadow-xl shadow-purple-600/20 focus:scale-[1.01] transition-all"
                                            placeholder="0,00"
                                        />
                                    </div>
                                </div>

                                {/* Datas */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Data Efetiva</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full pl-11 pr-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Data do 1º Pagamento</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                                            <input
                                                type="date"
                                                value={formData.payment_due_date || ''}
                                                onChange={(e) => handlePaymentDueDateChange(e.target.value)}
                                                className="w-full pl-11 pr-4 py-4 bg-purple-50/50 border border-purple-100 focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-purple-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Forma de Pagamento */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Forma de Pagamento</label>
                                    <select
                                        value={formData.payment_method}
                                        onChange={(e) => {
                                            const method = e.target.value;
                                            setFormData({
                                                ...formData,
                                                payment_method: method,
                                                installments: method === 'CASH' ? 1 : formData.installments
                                            });
                                        }}
                                        className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner"
                                    >
                                        <option value="CASH">À Vista</option>
                                        <option value="INSTALLMENTS">Parcelado Direto / Mensalidade</option>
                                        {formData.type === 'SALE' && (
                                            <>
                                                <option value="FINANCING">Financiamento</option>
                                                <option value="PERMUTA">Permuta</option>
                                                <option value="HIBRIDO">Híbrido</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                {formData.payment_method === 'INSTALLMENTS' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Entrada (BRL)</label>
                                            <input
                                                type="number"
                                                value={formData.down_payment || ''}
                                                onChange={(e) => setFormData({ ...formData, down_payment: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                                placeholder="0,00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Nº Parcelas</label>
                                            <input
                                                type="number"
                                                min="1" max="120"
                                                value={formData.installments}
                                                onChange={(e) => setFormData({ ...formData, installments: parseInt(e.target.value) || 1 })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Plano de Pagamento — largura total: data + valor bruto + desconto +
                                valor final cabem todos na mesma linha por parcela. */}
                            {formData.payment_method === 'INSTALLMENTS' && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            {(formData.custom_installments?.length ?? 0) > 0 && (
                                                <input
                                                    type="checkbox"
                                                    title="Selecionar todas"
                                                    checked={formData.custom_installments!.every(i => selectedInstallmentIds.has(i.id))}
                                                    onChange={() => {
                                                        const all = formData.custom_installments || [];
                                                        const allSelected = all.every(i => selectedInstallmentIds.has(i.id));
                                                        setSelectedInstallmentIds(allSelected ? new Set() : new Set(all.map(i => i.id)));
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                />
                                            )}
                                            <h4 className="text-xs font-black text-purple-600 uppercase tracking-widest">Plano de Pagamento</h4>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleGenerateInstallments}
                                            disabled={loading}
                                            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-700 hover:bg-purple-200 active:scale-95'}`}
                                        >
                                            {loading ? 'Verificando...' : 'Gerar Parcelas'}
                                        </button>
                                    </div>

                                    {formData.custom_installments && formData.custom_installments.length > 0 && (
                                        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-2 custom-scrollbar">
                                            {formData.custom_installments.map((inst, index) => (
                                                <div key={inst.id} className={`flex flex-wrap items-center gap-3 p-3 bg-white border rounded-xl shadow-sm ${selectedInstallmentIds.has(inst.id) ? 'border-purple-300 bg-purple-50/30' : 'border-purple-100'}`}>
                                                    <input
                                                        type="checkbox"
                                                        title="Dica: segure Shift e clique para selecionar um intervalo"
                                                        checked={selectedInstallmentIds.has(inst.id)}
                                                        onChange={(e) => handleInstallmentRowCheck(inst.id, index, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)}
                                                        className="w-4 h-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                    />
                                                    <span className="w-6 shrink-0 text-center text-xs font-black text-gray-400">{index + 1}</span>

                                                    <input
                                                        type="date"
                                                        value={inst.dueDate}
                                                        onChange={(e) => {
                                                            const newInsts = [...formData.custom_installments!];
                                                            newInsts[index] = { ...inst, dueDate: e.target.value };
                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                        }}
                                                        className="w-[160px] shrink-0 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-300 rounded-lg p-2 text-form-input font-bold text-gray-700 outline-none"
                                                    />

                                                    <div className="relative w-[150px] shrink-0">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R$</span>
                                                        <input
                                                            type="number"
                                                            value={inst.originalValue ?? inst.value}
                                                            onChange={(e) => updateInstallmentDiscount(index, { originalValue: parseFloat(e.target.value) || 0 })}
                                                            className="w-full pl-6 pr-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-300 rounded-lg text-form-input font-bold text-gray-700 outline-none"
                                                        />
                                                    </div>

                                                    <select
                                                        value={inst.discountType ?? ''}
                                                        onChange={(e) => {
                                                            const type = e.target.value as 'VALUE' | 'PERCENT' | '';
                                                            updateInstallmentDiscount(index, {
                                                                discountType: type || undefined,
                                                                discountAmount: type ? inst.discountAmount : undefined
                                                            });
                                                        }}
                                                        className="w-[150px] shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-2 py-2 bg-gray-50 outline-none cursor-pointer"
                                                    >
                                                        <option value="">Sem desconto</option>
                                                        <option value="VALUE">Desconto R$</option>
                                                        <option value="PERCENT">Desconto %</option>
                                                    </select>

                                                    {inst.discountType && (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={inst.discountAmount ?? ''}
                                                            onChange={(e) => updateInstallmentDiscount(index, { discountAmount: parseFloat(e.target.value) || 0 })}
                                                            placeholder={inst.discountType === 'PERCENT' ? '%' : 'R$'}
                                                            className="w-[110px] shrink-0 text-xs font-semibold text-amber-700 border border-amber-200 rounded-lg px-2 py-2 bg-amber-50 outline-none"
                                                        />
                                                    )}

                                                    <div className="flex-1 min-w-[140px] text-right">
                                                        {inst.discountType && (
                                                            <span className="text-xs font-black text-emerald-600">
                                                                Final: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {(() => {
                                                // Soma bruta valida contra o Valor do Fechamento (parcelas somam o
                                                // preço combinado, independente de desconto). Soma com desconto é
                                                // o que de fato será cobrado — mostrada só quando difere da bruta,
                                                // para não confundir "faltou parcela" com "desconto aplicado".
                                                const grossSum = formData.custom_installments!.reduce((sum, i) => sum + (i.originalValue ?? i.value), 0) + (formData.down_payment || 0);
                                                const netSum = formData.custom_installments!.reduce((sum, i) => sum + i.value, 0) + (formData.down_payment || 0);
                                                const hasDiscount = Math.abs(netSum - grossSum) > 0.01;
                                                return (
                                                    <div className="max-w-3xl flex items-center justify-between gap-6 p-3 mt-2 bg-gray-50 rounded-xl border border-gray-100">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Soma das Parcelas</span>
                                                            <span className={`text-sm font-black ${Math.abs(grossSum - (formData.value || 0)) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grossSum)}
                                                            </span>
                                                        </div>
                                                        {hasDiscount && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Total com Desconto</span>
                                                                <span className="text-sm font-black text-emerald-600">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netSum)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 4 — PARTES & COMISSÃO
                    ══════════════════════════════════════════ */}
                    {activeTab === 'partes' && (
                        <div className="max-w-2xl space-y-8">
                            {/* Corretor */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-amber-600">
                                    <UserCheck className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Corretor da Negociação</h3>
                                    <span className="text-xs font-semibold text-amber-500">Opcional</span>
                                </div>

                                <select
                                    value={formData.broker_id || ''}
                                    onChange={(e) => {
                                        const brokerId = e.target.value;
                                        const broker = brokers.find(b => b.id === brokerId);
                                        const commissionPct = 0;
                                        const commissionValue = recalcCommission(formData.value || 0, commissionPct);
                                        setFormData({
                                            ...formData,
                                            broker_id: brokerId || undefined,
                                            broker_name: broker?.name || undefined,
                                            broker_commission_pct: commissionPct,
                                            broker_commission_value: commissionValue
                                        });
                                    }}
                                    className="w-full px-6 py-4 bg-amber-50/60 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="">Sem corretor / Venda direta</option>
                                    {brokers.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}{b.agency_name ? ` - ${b.agency_name}` : ''}
                                        </option>
                                    ))}
                                </select>

                                {selectedBroker && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-4 animate-in slide-in-from-left-4 duration-400">
                                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                            <UserCheck className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black text-gray-900 truncate">{selectedBroker.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {selectedBroker.cpf && (
                                                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Doc: {selectedBroker.cpf}</span>
                                                )}
                                                {selectedBroker.agency_name && (
                                                    <span className="text-xs font-bold text-gray-400 truncate">{selectedBroker.agency_name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest block">Comissão inicial</span>
                                            <span className="text-lg font-black text-amber-600">0%</span>
                                        </div>
                                    </div>
                                )}

                                {formData.broker_id && (
                                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                                                <Percent className="w-3 h-3 inline mr-1" />% Comissão
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    value={formData.broker_commission_pct ?? ''}
                                                    onChange={(e) => {
                                                        const pct = parseFloat(e.target.value) || 0;
                                                        setFormData({
                                                            ...formData,
                                                            broker_commission_pct: pct,
                                                            broker_commission_value: recalcCommission(formData.value || 0, pct)
                                                        });
                                                    }}
                                                    className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                                    placeholder="Ex: 5.00"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">%</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Valor da Comissão</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500 font-mono">R$</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={formData.broker_commission_value ?? ''}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        setFormData({
                                                            ...formData,
                                                            broker_commission_value: val,
                                                            broker_commission_pct: 0
                                                        });
                                                    }}
                                                    className="w-full pl-10 pr-4 py-4 bg-amber-50 border border-amber-100 focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-black text-amber-700 font-mono transition-all shadow-inner text-sm"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Forma de Pagto.</label>
                                            <select
                                                value={formData.broker_payment_method || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_method: e.target.value })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-sm"
                                            >
                                                <option value="PIX">PIX</option>
                                                <option value="BOLETO">Boleto Bancário</option>
                                                <option value="TRANSFERENCIA">Transferência Bancária</option>
                                                <option value="DINHEIRO">Dinheiro Espécie</option>
                                                <option value="PERMUTA">Permuta</option>
                                                <option value="OUTROS">Outros</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Data de Pagto.</label>
                                            <input
                                                type="date"
                                                value={formData.broker_payment_due_date || formData.date || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_due_date: e.target.value })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════
                        ABA 5 — CONTRATO & ASSINATURA
                    ══════════════════════════════════════════ */}
                    {activeTab === 'contrato' && (
                        <div className="space-y-8">
                            {/* Nº Contrato + Etapa lado a lado */}
                            <div className="grid grid-cols-12 gap-8">
                                <div className="col-span-12 lg:col-span-5 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                                            {formData.type === 'SALE' ? 'Nº Contrato de Compra e Venda' :
                                                formData.type === 'RENTAL' ? 'Nº Contrato de Locação' : 'Nº Contrato de Prestação de Serviço'}
                                        </label>
                                        <div className="relative group">
                                            <FileText className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-purple-500 transition-colors" />
                                            <input
                                                type="text"
                                                value={formData.contract_number || ''}
                                                onChange={(e) => setFormData({ ...formData, contract_number: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner"
                                                placeholder={formData.type === 'SALE' ? 'Ex: CV-2026-001' : formData.type === 'RENTAL' ? 'Ex: CL-2026-001' : 'Ex: CPS-2026-001'}
                                            />
                                        </div>
                                    </div>

                                    {/* Ponte → Contrato formal (Venda ou Locação, negociação já salva) */}
                                    {canGenerateContract && formData.id && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                                                {formData.type === 'RENTAL' ? 'Contrato de Locação' : 'Contrato de Venda'}
                                            </label>
                                            {linkedContract ? (
                                                <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 flex gap-4 items-start">
                                                    <Check className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">Contrato Gerado</p>
                                                        <p className="text-xs text-emerald-700 leading-relaxed">
                                                            Nº <span className="font-black">{linkedContract.number}</span> · {linkedContract.status}.
                                                            {formData.type === 'RENTAL'
                                                                ? <> Contrato recorrente mensal, disponível no <span className="font-bold">Portal do Cliente</span> (categoria Locação).</>
                                                                : <> Disponível em <span className="font-bold">Vendas de Ativos → Contratos</span> e no Portal do Cliente.</>}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateContract}
                                                    disabled={generatingContract}
                                                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-700 transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <FileText className="w-5 h-5" />
                                                    <span className="uppercase text-xs tracking-widest">{generatingContract ? 'Gerando…' : formData.type === 'RENTAL' ? 'Gerar Contrato de Locação' : 'Gerar Contrato de Venda'}</span>
                                                </button>
                                            )}
                                            {contractError && (
                                                <p className="text-xs font-bold text-red-500 px-2 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> {contractError}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4">
                                        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1">Aviso de Disponibilidade</p>
                                            <p className="text-xs text-amber-700 leading-relaxed">
                                                O status "{formData.type === 'RENTAL' ? 'Alugado' : 'Vendido'}" altera automaticamente a visibilidade do ativo no catálogo público.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-12 lg:col-span-7 space-y-4">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1 block">Etapa da Negociação</label>
                                    <DealWorkflowBar
                                        currentStatus={(formData.status as DealWorkflowStatus) || 'IN_NEGOTIATION'}
                                        deal={formData}
                                        organizationId={formData.organization_id || organizationId}
                                        onTransition={(to, meta) => {
                                            const updates: Partial<typeof formData> = { status: to };
                                            if (to === 'CANCELLED' && meta?.reason) {
                                                updates.cancellation_reason = meta.reason;
                                                updates.cancellation_date = new Date().toISOString();
                                                updates.cancellation_refund_amount = meta.refundAmount || 0;
                                                const distratNotes = `[DISTRATO ${new Date().toLocaleDateString('pt-BR')}] Motivo: ${meta.reason}${meta.refundAmount ? ` | Devolução: R$ ${meta.refundAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`;
                                                updates.notes = formData.notes ? `${formData.notes}\n${distratNotes}` : distratNotes;
                                            }
                                            setFormData({ ...formData, ...updates });
                                        }}
                                    />
                                    {(formData.payment_method === 'INSTALLMENTS' || formData.payment_method === 'FINANCING') && (
                                        <p className="text-[9px] font-black text-purple-500 uppercase tracking-tighter px-2 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> Status "Concluído" será ativado automaticamente após a baixa da última parcela.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Assinatura Eletrônica */}
                            {formData.id && ['WAITING_PAYMENT', 'CONTRATO', 'ASSINATURA'].includes(formData.status || '') && (
                                <DealSignaturePanel
                                    deal={formData}
                                    client={selectedClient}
                                    organizationId={formData.organization_id || organizationId || ''}
                                    onStatusChange={(sigStatus: 'PENDING' | 'SIGNED') => {
                                        setFormData(prev => ({ ...prev, signature_status: sigStatus }));
                                        if (sigStatus === 'SIGNED' && formData.status === 'ASSINATURA') {
                                            confirm({
                                                title: 'Contrato assinado!',
                                                message: 'Deseja avançar a negociação para Concluído?',
                                                variant: 'default',
                                                confirmLabel: 'Avançar',
                                            }).then(ok => {
                                                if (ok) setFormData(prev => ({ ...prev, signature_status: 'SIGNED', status: 'COMPLETED' }));
                                            });
                                        }
                                    }}
                                />
                            )}

                            {/* Análise de Crédito */}
                            {formData.id && (formData.organization_id || organizationId) && (
                                <CreditAnalysisPanel
                                    dealId={formData.id}
                                    organizationId={(formData.organization_id || organizationId) as string}
                                    clientName={selectedClient?.name}
                                />
                            )}

                            {/* Observações */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <FileText className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Observações da Negociação</h3>
                                </div>
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={4}
                                    placeholder="Descreva aqui detalhes das parcelas, garantias, taxas de transferência ou observações gerais do fechamento..."
                                    className="w-full p-6 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-[2rem] outline-none font-medium text-gray-700 transition-all shadow-inner resize-none text-sm leading-relaxed"
                                />
                            </div>
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4 text-gray-400">
                        <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-300">
                            <Info className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] max-w-xs leading-relaxed">
                            Aprovação sistêmica obrigatória para fechamentos acima da margem de tabela permitida.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {formData.id && (
                            <button
                                type="button"
                                onClick={handleExportPDF}
                                className="flex items-center gap-3 px-6 py-4 bg-white text-gray-600 rounded-2xl font-black hover:text-purple-600 hover:border-purple-200 transition-all border border-gray-200 shadow-sm active:scale-95 group"
                            >
                                <FileText className="w-5 h-5 group-hover:animate-bounce" />
                                <span className="uppercase text-xs tracking-widest">Gerar Proposta</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-8 py-4 bg-white text-gray-500 rounded-2xl font-black hover:text-gray-900 transition-all border border-gray-200 shadow-sm active:scale-95"
                        >
                            CANCELAR
                        </button>
                        <button
                            type="submit"
                            form="deal-modal-form"
                            disabled={loading}
                            className="px-12 py-4 bg-purple-600 text-white rounded-2xl font-black shadow-2xl shadow-purple-600/30 hover:bg-purple-700 transition-all flex items-center gap-3 active:scale-95 disabled:opacity-50 ring-4 ring-purple-50"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Check className="w-6 h-6" />
                            )}
                            SALVAR ALTERAÇÕES
                        </button>
                    </div>
                </div>

                {/* Barra de ação em lote — parcelas selecionadas no Plano de Pagamento
                    (guia §10: fixa no rodapé, fora do fluxo normal). */}
                {activeTab === 'pagamento' && selectedInstallmentIds.size > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                        <span className="flex-1 text-sm font-bold whitespace-nowrap">
                            {selectedInstallmentIds.size} parcela{selectedInstallmentIds.size !== 1 ? 's' : ''} selecionada{selectedInstallmentIds.size !== 1 ? 's' : ''}
                            <span className="ml-2 font-normal opacity-75">
                                · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    (formData.custom_installments || [])
                                        .filter(i => selectedInstallmentIds.has(i.id))
                                        .reduce((s, i) => s + (i.originalValue ?? i.value), 0)
                                )}
                            </span>
                        </span>
                        <button
                            onClick={() => setShowInstallmentLoteModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-white text-blue-700 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-50 transition-colors"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar Desconto
                        </button>
                        <button
                            onClick={() => setSelectedInstallmentIds(new Set())}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500 rounded-xl font-bold text-button uppercase tracking-widest hover:bg-blue-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                            Desmarcar
                        </button>
                    </div>
                )}

                {showInstallmentLoteModal && (
                    <InstallmentLoteDiscountModal
                        installments={(formData.custom_installments || []).filter(i => selectedInstallmentIds.has(i.id))}
                        onClose={() => setShowInstallmentLoteModal(false)}
                        onSave={applyBulkInstallmentDiscount}
                    />
                )}
            </div>
        </div>
    );
};

export default DealModal;
