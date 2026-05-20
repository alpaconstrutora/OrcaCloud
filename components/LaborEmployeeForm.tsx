import React, { useState, useEffect } from 'react';
import { X, User, Users, MapPin, Phone, Mail, FileText, DollarSign, Calendar, Building2, ChevronDown, Loader2, CheckSquare, Square, Calculator, Wallet, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { Employee, ContractType, EmployeeStatus, laborService } from '../services/laborService';
import { payrollService, PayrollRubric } from '../services/payrollService';
import { validateCPF } from '../lib/validators';

interface OrganizationOption {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface LaborEmployeeFormProps {
    employee: Employee | null;
    orgId: string;
    organizations: OrganizationOption[];
    onClose: () => void;
    onSaved: () => void;
}

const ROLES = [
    'Mestre de Obras', 'Pedreiro', 'Servente', 'Carpinteiro', 'Encanador',
    'Eletricista', 'Pintor', 'Armador', 'Topógrafo', 'Soldador',
    'Operador de Máquina', 'Técnico em Edificações', 'Engenheiro', 'Arquiteto', 'Outros'
];

const BR_STATES = [
    'AC','AL','AP','AM','BA','CE','DF','ES','GO',
    'MA','MT','MS','MG','PA','PB','PR','PE','PI',
    'RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

const ADMISSION_CHECKLIST_ITEMS = [
    'RG / CNH', 'CPF', 'Comprovante de residência', 'Carteira de trabalho (CTPS)',
    'Foto 3x4', 'PIS/PASEP', 'Conta bancária', 'Exame admissional', 'ASO (Atestado de Saúde Ocupacional)'
];

const InputGroup: React.FC<{ label: string; children: React.ReactNode; icon?: React.ElementType }> = ({ label, children, icon: Icon }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            {Icon && <Icon className="w-3 h-3" />}
            {label}
        </label>
        {children}
    </div>
);

const inputCls = "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all";

const LaborEmployeeForm: React.FC<LaborEmployeeFormProps> = ({ employee, orgId, organizations = [], onClose, onSaved }) => {
    const isEditing = !!employee;
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'geral' | 'pessoal' | 'documentos' | 'endereco' | 'checklist' | 'folha'>('geral');
    const [allRubrics, setAllRubrics] = useState<PayrollRubric[]>([]);
    const [recurringRubrics, setRecurringRubrics] = useState<string[]>([]);
    const [loadingRubrics, setLoadingRubrics] = useState(false);
    const [form, setForm] = useState<Partial<Employee>>({
        name: employee?.name || '',
        cpf: employee?.cpf || '',
        phone: employee?.phone || '',
        email: employee?.email || '',
        contract_type: employee?.contract_type || 'CLT',
        role: employee?.role || ROLES[0],
        status: employee?.status || 'ATIVO',
        daily_cost: employee?.daily_cost || 0,
        hourly_cost: employee?.hourly_cost || 0,
        base_salary: employee?.base_salary || 0,
        hire_date: employee?.hire_date || '',
        notes: employee?.notes || '',
        admission_checklist: employee?.admission_checklist || [],
        org_id: employee?.org_id || orgId,
        // Novos Campos Registro
        father_name: employee?.father_name || '',
        mother_name: employee?.mother_name || '',
        birth_date: employee?.birth_date || '',
        birth_place: employee?.birth_place || '',
        nationality: employee?.nationality || 'BRASIL',
        marital_status: employee?.marital_status || '',
        rg_number: employee?.rg_number || '',
        rg_issuing_agency: employee?.rg_issuing_agency || '',
        rg_issue_date: employee?.rg_issue_date || '',
        ctps_number: employee?.ctps_number || '',
        ctps_series: employee?.ctps_series || '',
        ctps_issue_date: employee?.ctps_issue_date || '',
        ctps_uf: employee?.ctps_uf || '',
        military_doc: employee?.military_doc || '',
        military_category: employee?.military_category || '',
        ethnicity: employee?.ethnicity || '',
        gender: employee?.gender || '',
        education_level: employee?.education_level || '',
        is_disabled: employee?.is_disabled || false,
        voter_title_number: employee?.voter_title_number || '',
        voter_title_zone: employee?.voter_title_zone || '',
        voter_title_section: employee?.voter_title_section || '',
        cbo: employee?.cbo || '',
        residential_phone: employee?.residential_phone || '',
        address_street: employee?.address_street || '',
        address_number: employee?.address_number || '',
        address_complement: employee?.address_complement || '',
        address_neighborhood: employee?.address_neighborhood || '',
        address_city: employee?.address_city || '',
        address_uf: employee?.address_uf || '',
        address_zip_code: employee?.address_zip_code || '',
    });

    useEffect(() => {
        const loadInitialData = async () => {
            setLoadingRubrics(true);
            try {
                // 1. Carregar todas as rubricas automáticas que não são mandatórias CLT (pois as mandatórias já entram sempre)
                const rubrics = await payrollService.listRubrics();
                const available = rubrics.filter(r => r.is_automatic && !r.is_clt_mandatory);
                setAllRubrics(available);

                // 2. Se estiver editando, carregar vínculos atuais
                if (isEditing && employee?.id) {
                    const linked = await payrollService.getEmployeeRecurringRubrics(employee.id);
                    setRecurringRubrics(linked);
                }
            } catch (err) {
                console.error('[LaborEmployeeForm] Error loading rubrics:', err);
            } finally {
                setLoadingRubrics(false);
            }
        };

        loadInitialData();
    }, [isEditing, employee?.id]);

    const setField = <K extends keyof Employee>(key: K, value: Employee[K]) => setForm(prev => ({ ...prev, [key]: value }));
    
    // Máscaras de Input (CPF e Telefone)
    const formatCPF = (value: string) => {
        const raw = value.replace(/\D/g, '').slice(0, 11);
        if (raw.length <= 3) return raw;
        if (raw.length <= 6) return `${raw.slice(0, 3)}.${raw.slice(3)}`;
        if (raw.length <= 9) return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6)}`;
        return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
    };

    const handleCEPBlur = async (cep: string) => {
        const raw = cep.replace(/\D/g, '');
        if (raw.length !== 8) return;
        try {
            const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
            const data = await res.json();
            if (!data.erro) {
                setForm(prev => ({
                    ...prev,
                    address_street: data.logradouro || prev.address_street,
                    address_neighborhood: data.bairro || prev.address_neighborhood,
                    address_city: data.localidade || prev.address_city,
                    address_uf: data.uf || prev.address_uf,
                }));
            }
        } catch { /* sem acesso à ViaCEP — ignora */ }
    };

    const formatPhone = (value: string) => {
        const raw = value.replace(/\D/g, '').slice(0, 11);
        if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : raw;
        if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
        return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
    };

    const toggleChecklist = (item: string) => {
        const list = (form.admission_checklist || []) as string[];
        const next = list.includes(item) ? list.filter(i => i !== item) : [...list, item];
        setField('admission_checklist', next);
    };

    const handleSave = async () => {
        if (!form.name?.trim()) { alert('Nome é obrigatório.'); return; }
        if (!form.role?.trim()) { alert('Função é obrigatória.'); return; }
        if (form.cpf && form.cpf.replace(/\D/g, '').length === 11 && !validateCPF(form.cpf)) {
            alert('CPF inválido. Verifique os dígitos informados.');
            return;
        }
        setSaving(true);
        const cleanedForm = { ...form };
        const dateFields: (keyof Employee)[] = ['hire_date', 'birth_date', 'rg_issue_date', 'ctps_issue_date'];
        
        dateFields.forEach(field => {
            if (cleanedForm[field] === '') {
                (cleanedForm as any)[field] = null;
            }
        });

        try {
            let savedEmployee: Employee;
            if (isEditing && employee?.id) {
                savedEmployee = await laborService.updateEmployee(employee.id, cleanedForm);
            } else {
                savedEmployee = await laborService.createEmployee({ ...cleanedForm, org_id: cleanedForm.org_id || orgId } as any);
            }

            // Salvar vínculos de rubricas recorrentes
            if (savedEmployee?.id) {
                await payrollService.updateEmployeeRecurringRubrics(
                    savedEmployee.id, 
                    recurringRubrics, 
                    savedEmployee.org_id
                );
            }

            onSaved();
        } catch (err: any) {
            console.error(err);
            alert('Erro ao salvar colaborador: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h2 className="text-lg font-black text-white">
                            {isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}
                        </h2>
                        <p className="text-indigo-200 text-xs mt-0.5">
                            {isEditing ? 'Atualize os dados do colaborador' : 'Preencha os dados para cadastrar'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body with Tabs */}
                <div className="flex border-b border-slate-100 mb-0 sticky top-0 bg-white z-10 px-6 shrink-0">
                    {([
                        { id: 'geral', label: 'Geral', icon: User },
                        { id: 'pessoal', label: 'Pessoal', icon: Users },
                        { id: 'documentos', label: 'Docs', icon: FileText },
                        { id: 'endereco', label: 'Endereço', icon: MapPin },
                        { id: 'folha', label: 'Folha', icon: Wallet },
                        { id: 'checklist', label: 'Checklist', icon: CheckSquare }
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                                activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <tab.icon className="w-3 h-3" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'geral' && (
                        <>
                    {/* Dados Pessoais */}
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-indigo-500" /> Dados Pessoais
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <InputGroup label="Nome Completo *">
                                    <input value={form.name} onChange={e => setField('name', e.target.value)} className={inputCls} placeholder="Nome do colaborador" />
                                </InputGroup>
                            </div>
                            <InputGroup label="CPF" icon={FileText}>
                                <input 
                                    value={form.cpf} 
                                    onChange={e => setField('cpf', formatCPF(e.target.value))} 
                                    className={inputCls} 
                                    placeholder="000.000.000-00" 
                                />
                            </InputGroup>
                            <InputGroup label="Telefone" icon={Phone}>
                                <input 
                                    value={form.phone} 
                                    onChange={e => setField('phone', formatPhone(e.target.value))} 
                                    className={inputCls} 
                                    placeholder="(11) 99999-9999" 
                                />
                            </InputGroup>
                            <InputGroup label="E-mail" icon={Mail}>
                                <input value={form.email} onChange={e => setField('email', e.target.value.toLowerCase())} className={inputCls} placeholder="email@exemplo.com" type="email" />
                            </InputGroup>
                            <InputGroup label="Data de Admissão" icon={Calendar}>
                                <input value={form.hire_date} onChange={e => setField('hire_date', e.target.value)} className={inputCls} type="date" />
                            </InputGroup>
                        </div>
                    </div>

                    {/* Vínculo e Função */}
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500" /> Vínculo e Função
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputGroup label="Organização *">
                                <div className="relative">
                                    <select value={form.org_id} onChange={e => setField('org_id', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                        <option value="">Selecione...</option>
                                        {organizations.map(org => (
                                            <option key={org.id} value={org.id}>{org.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            </InputGroup>
                            <InputGroup label="Tipo de Vínculo *">
                                <div className="relative">
                                    <select value={form.contract_type} onChange={e => setField('contract_type', e.target.value as ContractType)} className={inputCls + ' appearance-none pr-8'}>
                                        <option value="CLT">CLT</option>
                                        <option value="PJ">PJ</option>
                                        <option value="DIARISTA">Diarista</option>
                                        <option value="EMPREITEIRO">Empreiteiro</option>
                                        <option value="ESTAGIARIO">Estágio</option>
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            </InputGroup>
                            <InputGroup label="Função / Cargo *">
                                <div className="relative">
                                    <select value={form.role} onChange={e => setField('role', e.target.value)} className={inputCls + ' appearance-none pr-8'}>
                                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            </InputGroup>
                            <InputGroup label="Status">
                                <div className="relative">
                                    <select value={form.status} onChange={e => setField('status', e.target.value as EmployeeStatus)} className={inputCls + ' appearance-none pr-8'}>
                                        <option value="ATIVO">Ativo</option>
                                        <option value="INATIVO">Inativo</option>
                                        <option value="AFASTADO">Afastado</option>
                                        <option value="DESLIGADO">Desligado</option>
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                            </InputGroup>
                        </div>
                    </div>

                    {/* Custos */}
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <DollarSign className="w-3.5 h-3.5 text-indigo-500" /> Custo de Mão de Obra
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <InputGroup label="Custo por Dia (R$)" icon={DollarSign}>
                                <input
                                    type="number" min="0" step="0.01"
                                    value={form.daily_cost || ''}
                                    onChange={e => setField('daily_cost', parseFloat(e.target.value) || 0)}
                                    onFocus={e => e.target.select()}
                                    className={inputCls}
                                    placeholder="200.00"
                                />
                            </InputGroup>
                            <InputGroup label="Custo por Hora (R$)" icon={DollarSign}>
                                <input
                                    type="number" min="0" step="0.01"
                                    value={form.hourly_cost || ''}
                                    onChange={e => setField('hourly_cost', parseFloat(e.target.value) || 0)}
                                    onFocus={e => e.target.select()}
                                    className={inputCls}
                                    placeholder="25.00"
                                />
                            </InputGroup>
                            <InputGroup label="Salário Base (220h)" icon={Calculator}>
                                <input
                                    type="number" min="0" step="0.01"
                                    value={form.base_salary || ''}
                                    onChange={e => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const h = val / 220;
                                        const d = h * 8;
                                        setForm(prev => ({
                                            ...prev, 
                                            base_salary: val,
                                            hourly_cost: parseFloat(h.toFixed(2)),
                                            daily_cost: parseFloat(d.toFixed(2))
                                        }));
                                    }}
                                    onFocus={e => e.target.select()}
                                    className={inputCls + " border-indigo-200 bg-indigo-50/30"}
                                    placeholder="2500.00"
                                />
                            </InputGroup>
                        </div>
                        </div>
                        </>
                    )}

                    {activeTab === 'pessoal' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-indigo-500" /> Informações Pessoais e Filiação
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <InputGroup label="Data de Nascimento">
                                        <input type="date" value={form.birth_date} onChange={e => setField('birth_date', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Local de Nascimento (Cidade - UF)">
                                        <input value={form.birth_place} onChange={e => setField('birth_place', e.target.value)} className={inputCls} placeholder="Ex: Cambuí - MG" />
                                    </InputGroup>
                                    <InputGroup label="Nacionalidade">
                                        <input value={form.nationality} onChange={e => setField('nationality', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Estado Civil">
                                        <select value={form.marital_status} onChange={e => setField('marital_status', e.target.value)} className={inputCls}>
                                            <option value="">Selecione...</option>
                                            <option value="Solteiro(a)">Solteiro(a)</option>
                                            <option value="Casado(a)">Casado(a)</option>
                                            <option value="Divorciado(a)">Divorciado(a)</option>
                                            <option value="Viúvo(a)">Viúvo(a)</option>
                                            <option value="União Estável">União Estável</option>
                                        </select>
                                    </InputGroup>
                                    <InputGroup label="Nome do Pai">
                                        <input value={form.father_name} onChange={e => setField('father_name', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Nome da Mãe">
                                        <input value={form.mother_name} onChange={e => setField('mother_name', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Sexo">
                                        <select value={form.gender} onChange={e => setField('gender', e.target.value)} className={inputCls}>
                                            <option value="">Selecione...</option>
                                            <option value="Masculino">Masculino</option>
                                            <option value="Feminino">Feminino</option>
                                            <option value="Outro">Outro</option>
                                        </select>
                                    </InputGroup>
                                    <InputGroup label="Cor / Raça">
                                        <select value={form.ethnicity} onChange={e => setField('ethnicity', e.target.value)} className={inputCls}>
                                            <option value="">Selecione...</option>
                                            <option value="Branca">Branca</option>
                                            <option value="Preta">Preta</option>
                                            <option value="Parda">Parda</option>
                                            <option value="Amarela">Amarela</option>
                                            <option value="Indígena">Indígena</option>
                                        </select>
                                    </InputGroup>
                                    <InputGroup label="Grau de Instrução">
                                        <input value={form.education_level} onChange={e => setField('education_level', e.target.value)} className={inputCls} placeholder="Ex: Ensino Médio Completo" />
                                    </InputGroup>
                                    <div className="flex items-center gap-2 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setField('is_disabled', !form.is_disabled)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-bold ${form.is_disabled ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                                        >
                                            {form.is_disabled ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            Pessoa com Deficiência (PcD)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'documentos' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500" /> Documentos de Identificação e Trabalho
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <InputGroup label="RG (Número)">
                                        <input value={form.rg_number} onChange={e => setField('rg_number', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="RG (Órgão / UF)">
                                        <input value={form.rg_issuing_agency} onChange={e => setField('rg_issuing_agency', e.target.value)} className={inputCls} placeholder="Ex: SSP/MG" />
                                    </InputGroup>
                                    <InputGroup label="RG (Expedição)">
                                        <input type="date" value={form.rg_issue_date} onChange={e => setField('rg_issue_date', e.target.value)} className={inputCls} />
                                    </InputGroup>

                                    <InputGroup label="CTPS (Número)">
                                        <input value={form.ctps_number} onChange={e => setField('ctps_number', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="CTPS (Série)">
                                        <input value={form.ctps_series} onChange={e => setField('ctps_series', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="CTPS (UF)">
                                        <input value={form.ctps_uf} onChange={e => setField('ctps_uf', e.target.value)} className={inputCls} maxLength={2} />
                                    </InputGroup>
                                    <InputGroup label="CTPS (Emissão)">
                                        <input type="date" value={form.ctps_issue_date} onChange={e => setField('ctps_issue_date', e.target.value)} className={inputCls} />
                                    </InputGroup>

                                    <InputGroup label="Título Eleitoral">
                                        <input value={form.voter_title_number} onChange={e => setField('voter_title_number', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Zona">
                                        <input value={form.voter_title_zone} onChange={e => setField('voter_title_zone', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Seção">
                                        <input value={form.voter_title_section} onChange={e => setField('voter_title_section', e.target.value)} className={inputCls} />
                                    </InputGroup>

                                    <InputGroup label="Doc. Militar (Reservista)">
                                        <input value={form.military_doc} onChange={e => setField('military_doc', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Categoria Militar">
                                        <input value={form.military_category} onChange={e => setField('military_category', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="CBO">
                                        <input value={form.cbo} onChange={e => setField('cbo', e.target.value)} className={inputCls} placeholder="Código CBO" />
                                    </InputGroup>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'folha' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-start gap-4">
                                <Wallet className="text-indigo-600 mt-1" size={20} />
                                <div>
                                    <h4 className="text-sm font-black text-indigo-900 tracking-tight">Rubricas Recorrentes Individuais</h4>
                                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Selecione rubricas extras que serão incluídas automaticamente para este colaborador todas as folhas.</p>
                                </div>
                            </div>

                            {loadingRubrics ? (
                                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carregando rubricas...</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-2">
                                        {allRubrics.length > 0 ? (
                                            allRubrics.map(rubric => {
                                                const isSelected = recurringRubrics.includes(rubric.code);
                                                return (
                                                    <button
                                                        key={rubric.code}
                                                        type="button"
                                                        onClick={() => {
                                                            setRecurringRubrics(prev => 
                                                                isSelected 
                                                                ? prev.filter(c => c !== rubric.code)
                                                                : [...prev, rubric.code]
                                                            );
                                                        }}
                                                        className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left group
                                                            ${isSelected 
                                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                                                                : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300 shadow-sm'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${isSelected ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                                                                {rubric.code.substring(0, 3)}
                                                            </div>
                                                            <div>
                                                                <p className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>{rubric.name}</p>
                                                                <p className={`text-[9px] font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-400'} uppercase tracking-tight`}>{rubric.code}</p>
                                                            </div>
                                                        </div>
                                                        {isSelected ? (
                                                            <CheckCircle2 size={18} className="text-white" />
                                                        ) : (
                                                            <Calculator size={18} className="text-slate-200 group-hover:text-slate-400 transition-colors" />
                                                        )}
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                                <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma rubrica automática customizada disponível.</p>
                                                <p className="text-[9px] text-slate-400 mt-1 italic">Vá em Rubricas e certifique-se de que há rubricas marcadas como "Automática" mas não como "Padrão CLT".</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-start gap-3">
                                        <AlertTriangle className="text-amber-600 mt-0.5" size={16} />
                                        <p className="text-[9px] font-bold text-amber-700 leading-tight">
                                            As rubricas marcadas como <strong className="uppercase">"Padrão CLT"</strong> na gestão de rubricas não aparecem nesta lista pois já são incluídas automaticamente para todos os colaboradores com contrato CLT.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'endereco' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-indigo-500" /> Endereço Residencial e Contato
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                    <div className="md:col-span-2">
                                        <InputGroup label="CEP">
                                            <input
                                                value={form.address_zip_code}
                                                onChange={e => {
                                                    const v = e.target.value.replace(/\D/g, '').slice(0, 8);
                                                    const masked = v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
                                                    setField('address_zip_code', masked);
                                                }}
                                                onBlur={e => handleCEPBlur(e.target.value)}
                                                className={inputCls}
                                                placeholder="00000-000"
                                            />
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-4">
                                        <InputGroup label="Rua / Logradouro">
                                            <input value={form.address_street} onChange={e => setField('address_street', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-1">
                                        <InputGroup label="Nº">
                                            <input value={form.address_number} onChange={e => setField('address_number', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-2">
                                        <InputGroup label="Complemento">
                                            <input value={form.address_complement} onChange={e => setField('address_complement', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-3">
                                        <InputGroup label="Bairro">
                                            <input value={form.address_neighborhood} onChange={e => setField('address_neighborhood', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-4">
                                        <InputGroup label="Cidade">
                                            <input value={form.address_city} onChange={e => setField('address_city', e.target.value)} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-2">
                                        <InputGroup label="UF">
                                            <select value={form.address_uf} onChange={e => setField('address_uf', e.target.value)} className={inputCls}>
                                                <option value="">Selecione...</option>
                                                {BR_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                            </select>
                                        </InputGroup>
                                    </div>
                                    <div className="md:col-span-3">
                                        <InputGroup label="Telefone Residencial">
                                            <input value={form.residential_phone} onChange={e => setField('residential_phone', formatPhone(e.target.value))} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'checklist' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <CheckSquare className="w-3.5 h-3.5 text-indigo-500" /> Checklist de Admissão
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {ADMISSION_CHECKLIST_ITEMS.map(item => {
                                        const checked = ((form.admission_checklist || []) as string[]).includes(item);
                                        return (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() => toggleChecklist(item)}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-sm font-medium text-left
                                                    ${checked ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                            >
                                                {checked ? <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
                                                {item}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <InputGroup label="Observações Extra" icon={FileText}>
                                <textarea
                                    value={form.notes}
                                    onChange={e => setField('notes', e.target.value)}
                                    className={inputCls + ' resize-none h-24'}
                                    placeholder="Destaque informações importantes sobre o colaborador..."
                                />
                            </InputGroup>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {saving ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Cadastrar Colaborador')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LaborEmployeeForm;
