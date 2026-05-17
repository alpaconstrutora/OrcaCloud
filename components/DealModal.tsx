import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, FileText, Briefcase, User, Info, Building, Check, AlertCircle, TrendingUp, Maximize2, Layers, UserCheck, Percent } from 'lucide-react';
import { Property, PropertyDeal, Client, Organization, PaymentInstallment, BrokerProfile } from '../types';
import { commercialService } from '../services/commercialService';
import { clientService } from '../services/clientService';
import { organizationService } from '../services/organizationService';
import { propertyExportService } from '../services/propertyExportService';
import { projectService, ProjectData } from '../services/projectService';
import { brokerService } from '../services/brokerService';
import { commercialFinanceService } from '../services/commercialFinanceService';

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
        }
    }, [initialData, isOpen]);

    const [properties, setProperties] = useState<Property[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [brokers, setBrokers] = useState<BrokerProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [org, setOrg] = useState<Organization | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [allProps, c, o, projs] = await Promise.all([
                    commercialService.listProperties(),
                    clientService.listClients(),
                    organizationService.listOrganizations(),
                    projectService.listProjects()
                ]);

                // Filtrar imóveis negociáveis:
                // - Se há um edifício em contexto (buildingId), mostra APENAS as unidades filhas daquele edifício
                // - Caso contrário, exibe todas as unidades que NÃO são edifícios master (type !== BUILDING e com ou sem parent_id)
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

                    // Carregar corretores
                    const brokerData = await brokerService.listProfiles(organizationId);
                    setBrokers(brokerData.filter(b => b.is_active));
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

    // Recalcular valor de comissão sempre que valor ou % mudar
    const recalcCommission = (value: number, pct: number) => {
        return +(value * (pct / 100)).toFixed(2);
    };

    const handleGenerateInstallments = async () => {
        // 1. Verificar se a negociação já existe e se tem parcelas pagas
        if (formData.id) {
            setLoading(true);
            try {
                const { hasPaid, paidCount } = await commercialFinanceService.hasPaidInstallments(formData.id);
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

        // 2. Proceder com a geração (se permitido ou se for nova negociação)
        setFormData(prev => {
            const downPayment = prev.down_payment || 0;
            const count = prev.installments || 1;
            const baseValue = prev.value || 0;
            const instValue = Math.max(0, baseValue - downPayment) / count;

            const newInstallments: PaymentInstallment[] = [];
            for (let i = 1; i <= count; i++) {
                const date = new Date(prev.date || Date.now());
                date.setMonth(date.getMonth() + i);
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

    const handleExportPDF = () => {
        if (!selectedProperty) {
            alert('Selecione um imóvel antes de exportar.');
            return;
        }
        propertyExportService.generateProposalPDF(formData as PropertyDeal, selectedProperty, selectedClient, org);
    };

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e) e.preventDefault();
        
        // Validação Manual
        if (!formData.property_id || !formData.client_id) {
            alert('Por favor, selecione o imóvel e o cliente para continuar.');
            return;
        }

        if (formData.value === 0 && !confirm('O valor da negociação está zerado. Deseja continuar assim mesmo?')) {
            return;
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

    return (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-8">
            <div className="absolute inset-0 bg-[#0B1727]/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose} />

            <div className="relative bg-white w-full h-full overflow-hidden rounded-[2.5rem] shadow-2xl border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col">
                {/* Header Executivo Premium */}
                <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6 flex-1">
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-100 ring-2 ring-white">
                                <Briefcase className="w-6 h-6 text-white" />
                            </div>
                            <div className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 shadow-sm uppercase tracking-tighter">
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
                                    <span className={`text-[10px] font-black uppercase ${formData.status === 'COMPLETED' ? 'text-green-600' :
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
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Tipo de Acordo</p>
                            <div className="flex items-center gap-2 justify-end">
                                <TrendingUp className="w-4 h-4 text-purple-400" />
                                <span className="text-lg font-black text-purple-600 uppercase tracking-tighter">
                                    {formData.type === 'SALE' ? 'Venda Direta' : formData.type === 'RENTAL' ? 'Contrato Locação' : 'Prestação de Serviço'}
                                </span>
                            </div>
                        </div>
                        <div className="h-10 w-px bg-gray-200" />
                        <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Valor Total</p>
                            <div className="flex items-baseline gap-1 text-purple-600">
                                <span className="text-xs font-bold font-mono">R$</span>
                                <span className="text-3xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.value || 0)}</span>
                            </div>
                        </div>
                        {/* Comissão no header se houver corretor */}
                        {(formData.broker_commission_value || 0) > 0 && (
                            <>
                                <div className="h-10 w-px bg-gray-200" />
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1 leading-none">Comissão Corretor</p>
                                    <div className="flex items-baseline gap-1 text-amber-600">
                                        <span className="text-xs font-bold font-mono">R$</span>
                                        <span className="text-xl font-black">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(formData.broker_commission_value || 0)}</span>
                                    </div>
                                </div>
                            </>
                        )}
                        <button type="button" onClick={onClose} className="w-12 h-12 bg-white text-gray-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all border border-gray-100 shadow-sm group">
                            <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                        </button>
                    </div>
                </div>

                <form 
                    id="deal-modal-form"
                    onSubmit={handleSubmit} 
                    className="flex-1 overflow-y-auto p-8 space-y-8"
                >
                    {/* Grid Principal Premium */}
                    <div className="grid grid-cols-12 gap-8">
                        {/* Coluna 1: Ativo, Cliente, Obra e Corretor */}
                        <div className="col-span-12 lg:col-span-7 space-y-4">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <Building className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Imóvel da Negociação</h3>
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
                                                <span className="text-[10px] font-black bg-white px-2 py-1 rounded-lg border border-gray-100 text-purple-600 shadow-sm uppercase tracking-widest">Ativo Disponível</span>
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">{selectedProperty.address}</p>
                                            <div className="flex items-center gap-4 mt-4">
                                                <div className="flex items-center gap-1.5 text-gray-400">
                                                    <Maximize2 className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-black tracking-widest">{selectedProperty.area} m²</span>
                                                </div>
                                                <div className="h-3 w-px bg-gray-200" />
                                                <p className="text-sm font-black text-purple-600 font-mono">R$ {(selectedProperty.price || 0).toLocaleString('pt-BR')}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <User className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Informação do Cliente</h3>
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

                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <Layers className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Obra Vinculada (Opcional)</h3>
                                </div>
                                <select
                                    value={formData.linked_project_id || ''}
                                    onChange={(e) => setFormData({ ...formData, linked_project_id: e.target.value })}
                                    className="w-full px-8 py-5 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-3xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-lg"
                                >
                                    <option value="">Nenhuma Obra Vinculada</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* ════════════════════════════════════════
                                SEÇÃO: CORRETOR DA NEGOCIAÇÃO
                            ════════════════════════════════════════ */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-amber-600">
                                    <UserCheck className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">Corretor da Negociação</h3>
                                    <span className="text-[9px] font-black bg-amber-50 text-amber-500 px-2 py-0.5 rounded-full border border-amber-100 uppercase tracking-wider">Opcional</span>
                                </div>

                                <select
                                    value={formData.broker_id || ''}
                                    onChange={(e) => {
                                        const brokerId = e.target.value;
                                        const broker = brokers.find(b => b.id === brokerId);
                                        const commissionPct = broker?.commission_rate || 0;
                                        const commissionValue = recalcCommission(formData.value || 0, commissionPct);
                                        setFormData({
                                            ...formData,
                                            broker_id: brokerId || undefined,
                                            broker_name: broker?.name || undefined,
                                            broker_commission_pct: commissionPct,
                                            broker_commission_value: commissionValue
                                        });
                                    }}
                                    className="w-full px-6 py-4 bg-amber-50/60 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner text-base"
                                >
                                    <option value="">Sem corretor / Venda direta</option>
                                    {brokers.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}{b.creci ? ` — CRECI: ${b.creci}` : ''}{b.commission_rate ? ` (${b.commission_rate}%)` : ''}
                                        </option>
                                    ))}
                                </select>

                                {formData.broker_id && (
                                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
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
                                                        const commissionValue = recalcCommission(formData.value || 0, pct);
                                                        setFormData({
                                                            ...formData,
                                                            broker_commission_pct: pct,
                                                            broker_commission_value: commissionValue
                                                        });
                                                    }}
                                                    className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                                    placeholder="Ex: 5.00"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">%</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Valor da Comissão</label>
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
                                                            broker_commission_pct: 0 // Zera o percentual quando o usuário digita valor manualmente
                                                        });
                                                    }}
                                                    className="w-full pl-10 pr-4 py-4 bg-amber-50 border border-amber-100 focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-black text-amber-700 font-mono transition-all shadow-inner text-sm"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                                                Forma de Pagto.
                                            </label>
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
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                                                Data de Pagto.
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.broker_payment_due_date || formData.date || ''}
                                                onChange={(e) => setFormData({ ...formData, broker_payment_due_date: e.target.value })}
                                                className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-amber-400 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Card info do corretor selecionado */}
                                {selectedBroker && (
                                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center gap-4 animate-in slide-in-from-left-4 duration-400">
                                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                            <UserCheck className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black text-gray-900 truncate">{selectedBroker.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {selectedBroker.creci && (
                                                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">CRECI: {selectedBroker.creci}</span>
                                                )}
                                                {selectedBroker.agency_name && (
                                                    <span className="text-[10px] font-bold text-gray-400 truncate">{selectedBroker.agency_name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Comissão padrão</span>
                                            <span className="text-lg font-black text-amber-600">{selectedBroker.commission_rate || 0}%</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Coluna 2: Acordo e Datas */}
                        <div className="col-span-12 lg:col-span-5 space-y-4">
                            <div className="space-y-8">
                                <div className="flex items-center gap-2 text-purple-600">
                                    <DollarSign className="w-5 h-5" />
                                    <h3 className="font-black uppercase tracking-widest text-xs">
                                        {formData.type === 'SALE' ? 'Condições de Venda' :
                                            formData.type === 'RENTAL' ? 'Condições de Aluguel' :
                                                'Condições do Acordo'}
                                    </h3>
                                </div>

                                <div className={`grid gap-4 bg-gray-50 p-2 rounded-3xl shadow-inner ${(initialData?.type || defaultType) ? 'hidden' : 'grid-cols-3'}`}>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: 'SALE' })}
                                        className={`py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${formData.type === 'SALE' ? 'bg-white text-purple-600 shadow-xl border border-gray-100 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        Venda
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: 'RENTAL' })}
                                        className={`py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${formData.type === 'RENTAL' ? 'bg-white text-purple-600 shadow-xl border border-gray-100 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        Aluguel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: 'SERVICE' })}
                                        className={`py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${formData.type === 'SERVICE' ? 'bg-white text-purple-600 shadow-xl border border-gray-100 scale-[1.02]' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        Serviço
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Valor do Fechamento</label>
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

                                <div className="grid grid-cols-1 gap-4">
                                    {/* Data Efetiva */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Data Efetiva da Negociação</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    {/* Data de Vencimento do Pagamento */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Data de Vencimento do Pagamento</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                                            <input
                                                type="date"
                                                value={formData.payment_due_date || ''}
                                                onChange={(e) => setFormData({ ...formData, payment_due_date: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-purple-50/50 border border-purple-100 focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-purple-700 transition-all shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    {/* Número do Contrato */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
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

                                    {/* Forma de Pagamento */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Forma de Pagamento</label>
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
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Entrada (BRL)</label>
                                                <input
                                                    type="number"
                                                    value={formData.down_payment || ''}
                                                    onChange={(e) => setFormData({ ...formData, down_payment: parseFloat(e.target.value) || 0 })}
                                                    className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Nº Parcelas</label>
                                                <input
                                                    type="number"
                                                    min="1" max="120"
                                                    value={formData.installments}
                                                    onChange={(e) => setFormData({ ...formData, installments: parseInt(e.target.value) || 1 })}
                                                    className="w-full px-4 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all shadow-inner text-sm"
                                                />
                                            </div>

                                            <div className="col-span-2 mt-2">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h4 className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Plano de Pagamento</h4>
                                                    <button
                                                        type="button"
                                                        onClick={handleGenerateInstallments}
                                                        disabled={loading}
                                                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                                                            loading 
                                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200 active:scale-95'
                                                        }`}
                                                    >
                                                        {loading ? 'Verificando...' : 'Gerar Parcelas'}
                                                    </button>
                                                </div>

                                                {formData.custom_installments && formData.custom_installments.length > 0 && (
                                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                                        {formData.custom_installments.map((inst, index) => (
                                                            <div key={inst.id} className="grid grid-cols-12 gap-2 p-2 bg-white border border-purple-100 rounded-xl items-center shadow-sm">
                                                                <div className="col-span-1 flex justify-center">
                                                                    <span className="text-[10px] font-black text-gray-400">{index + 1}</span>
                                                                </div>
                                                                <div className="col-span-5">
                                                                    <input
                                                                        type="date"
                                                                        value={inst.dueDate}
                                                                        onChange={(e) => {
                                                                            const newInsts = [...formData.custom_installments!];
                                                                            newInsts[index] = { ...inst, dueDate: e.target.value };
                                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                                        }}
                                                                        className="w-full bg-gray-50 border border-transparent focus:bg-white focus:border-purple-300 rounded-lg p-2 text-xs font-bold text-gray-700 outline-none"
                                                                    />
                                                                </div>
                                                                <div className="col-span-6 relative">
                                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">R$</span>
                                                                    <input
                                                                        type="number"
                                                                        value={inst.value}
                                                                        onChange={(e) => {
                                                                            const newInsts = [...formData.custom_installments!];
                                                                            newInsts[index] = { ...inst, value: parseFloat(e.target.value) || 0 };
                                                                            setFormData({ ...formData, custom_installments: newInsts });
                                                                        }}
                                                                        className="w-full pl-6 pr-2 py-2 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-300 rounded-lg text-xs font-bold text-gray-700 outline-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}

                                                        <div className="flex justify-between items-center p-3 mt-2 bg-gray-50 rounded-xl border border-gray-100">
                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Soma das Parcelas</span>
                                                            <span className={`text-sm font-black ${Math.abs((formData.custom_installments.reduce((sum, i) => sum + i.value, 0) + (formData.down_payment || 0)) - (formData.value || 0)) < 0.01
                                                                ? 'text-green-600' : 'text-amber-600'
                                                                }`}>
                                                                Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                                                    formData.custom_installments.reduce((sum, i) => sum + i.value, 0) + (formData.down_payment || 0)
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Status */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Status do Processo</label>
                                        <div className="relative">
                                            <select
                                                value={formData.status}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                                className="w-full px-6 py-4 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-2xl outline-none font-bold text-gray-700 transition-all cursor-pointer shadow-inner appearance-none"
                                            >
                                                <option value="IN_NEGOTIATION">🔄 Em Negociação</option>
                                                <option value="PENDING">✍️ Aguardando Assinatura</option>
                                                <option value="WAITING_PAYMENT">💰 Aguardando Pagamentos</option>
                                                <option value="COMPLETED" disabled={formData.payment_method === 'INSTALLMENTS' || formData.payment_method === 'FINANCING'}>
                                                    ✅ {formData.type === 'RENTAL' ? 'Alugado / Liquidado' : 'Vendido / Liquidado'} (Automático pelo Financeiro)
                                                </option>
                                                <option value="CANCELLED">❌ Cancelado</option>
                                            </select>
                                            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <Info className="w-4 h-4 text-purple-400" />
                                            </div>
                                        </div>
                                        {(formData.payment_method === 'INSTALLMENTS' || formData.payment_method === 'FINANCING') && (
                                            <p className="text-[9px] font-black text-purple-500 uppercase tracking-tighter px-2 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> Status "Liquidado" será ativado automaticamente após a baixa da última parcela.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4">
                                    <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Aviso de Disponibilidade</p>
                                        <p>
                                            O status "{formData.type === 'RENTAL' ? 'Alugado' : 'Vendido'}" altera automaticamente a visibilidade do ativo no catálogo público.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notas Premium */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 text-purple-600">
                            <FileText className="w-5 h-5" />
                            <h3 className="font-black uppercase tracking-widest text-xs">Observações da Negociação</h3>
                        </div>
                        <textarea
                            value={formData.notes || ''}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={3}
                            placeholder="Descreva aqui detalhes das parcelas, garantias, taxas de transferência ou observações gerais do fechamento..."
                            className="w-full p-6 bg-gray-50 border border-transparent focus:bg-white focus:border-purple-500 rounded-[2rem] outline-none font-medium text-gray-700 transition-all shadow-inner resize-none text-sm leading-relaxed"
                        />
                    </div>
                </form>

                {/* Footer Executivo Premium */}
                <div className="p-8 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4 text-gray-400">
                        <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-300">
                            <Info className="w-5 h-5" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] max-w-xs leading-relaxed">
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
            </div>
        </div>
    );
};

export default DealModal;
