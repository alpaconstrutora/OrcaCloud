import React, { useState, useEffect, useRef } from 'react';
import CostCenterSelect from './CostCenterSelect';
import PlanoContasSelect from './PlanoContasSelect';
import { X, ArrowLeft, User, Users, MapPin, Phone, Mail, FileText, DollarSign, Calendar, Building2, ChevronDown, Loader2, CheckSquare, Square, Calculator, Wallet, Check, Info, CreditCard, Briefcase, AlertCircle } from 'lucide-react';
import { Employee, ContractType, EmployeeStatus, laborService } from '../services/laborService';
import { payrollService, PayrollRubric, CalculationType } from '../services/payrollService';
import StandardTable, { type StandardTableColumn } from './ui/StandardTable';
import TableSwitch from './ui/TableSwitch';
import { TabsBar } from './ui/TabsBar';
import LaborEmployeePhoto from './LaborEmployeePhoto';
import LaborEmployeeBankAccounts, { EmployeeBankAccountDraft, toDraft } from './LaborEmployeeBankAccounts';
import { employeeBankAccountService } from '../services/employeeBankAccountService';
import { orgGovernanceService } from '../services/orgGovernanceService';
import { OrgRole } from '../types';
import { validateCPF } from '../lib/validators';
import CityStateSelect from './CityStateSelect';
import LaborEmployeeSalaryHistory from './LaborEmployeeSalaryHistory';
import { supabase } from '../lib/supabase';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import SaveStatus from './ui/SaveStatus';

interface OrganizationOption {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface LaborEmployeeFormProps {
    employee: Employee | null;
    orgId: string | null;
    organizations: OrganizationOption[];
    onClose: () => void;
    onSaved: (employee: Employee) => void;
}

const ROLES = [
    'Mestre de Obras', 'Pedreiro', 'Servente', 'Carpinteiro', 'Encanador',
    'Eletricista', 'Pintor', 'Armador', 'Topógrafo', 'Soldador',
    'Operador de Máquina', 'Técnico em Edificações', 'Engenheiro', 'Arquiteto', 'Outros'
];

const ADMISSION_CHECKLIST_ITEMS = [
    'RG / CNH', 'CPF', 'Comprovante de residência', 'Carteira de trabalho (CTPS)',
    'Foto 3x4', 'PIS/PASEP', 'Conta bancária', 'Exame admissional', 'ASO (Atestado de Saúde Ocupacional)'
];

// Toolbar de abas — anatomia canônica do guia §19.1 (trilho cinza dentro de
// card branco; aba ativa = bg-white text-blue-600 shadow-sm sobre bg-gray-50).
// 'salarios' só entra em modo edição: colaborador novo ainda não tem id, e sem
// id não há histórico para listar nem para gravar.
const BASE_EMPLOYEE_TABS = [
    { id: 'geral', label: 'Geral' },
    { id: 'pessoal', label: 'Pessoal' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'endereco', label: 'Endereço' },
    { id: 'organizacional', label: 'Organizacional' },
    { id: 'bancario', label: 'Dados Bancários' },
    { id: 'folha', label: 'Folha de Pagamento' },
    { id: 'salarios', label: 'Histórico Salarial' },
    { id: 'checklist', label: 'Checklist' },
] as const;

type EmployeeTabId = typeof BASE_EMPLOYEE_TABS[number]['id'];

// Subtítulo por aba — §19.1: o cabeçalho acompanha a aba ativa mesmo quando o
// título ("Editar Colaborador") permanece o mesmo, pois todas as abas editam a
// mesma entidade, só mudando o grupo de campos.
const TAB_SUBTITLES: Record<EmployeeTabId, string> = {
    geral: 'Dados pessoais, vínculo, função e custo de mão de obra.',
    pessoal: 'Filiação, nascimento, estado civil e demais dados pessoais.',
    documentos: 'RG, CTPS, título de eleitor e documentação militar.',
    endereco: 'Endereço residencial e telefone de contato.',
    organizacional: 'Empresa, matrícula, departamento, CNH e dependentes.',
    bancario: 'Contas bancárias e chaves PIX; a principal é a usada nos pagamentos.',
    folha: 'Rubricas recorrentes incluídas automaticamente na folha.',
    salarios: 'Reajustes, promoções e dissídios com data de vigência, motivo e documento.',
    checklist: 'Checklist de admissão e observações extras.',
};

// Aba Folha de Pagamento — tabela de rubricas recorrentes (§6.10). "Incluir"
// primeiro: é a única coluna editável e a razão de a aba existir.
const RUBRIC_COLUMNS: StandardTableColumn[] = [
    { key: 'incluir', label: 'Incluir', sortable: true, width: 90 },
    { key: 'codigo', label: 'Código', sortable: true, width: 190 },
    { key: 'nome', label: 'Rubrica', sortable: true, width: 260 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 120 },
    { key: 'inss', label: 'INSS', sortable: true, width: 80 },
    { key: 'fgts', label: 'FGTS', sortable: true, width: 80 },
    { key: 'irrf', label: 'IRRF', sortable: true, width: 80 },
    { key: 'calculo', label: 'Cálculo', sortable: true, width: 120 },
    { key: 'categoria', label: 'Categoria', sortable: true, width: 160 },
];

// Mesmos rótulos/cores de Rubricas (LaborRubrics.tsx) — status em texto
// colorido, sem pílula (§8).
const RUBRIC_TYPE_LABELS: Record<string, string> = { provento: 'Provento', desconto: 'Desconto', encargo: 'Encargo', informativa: 'Informativa' };
const RUBRIC_TYPE_COLORS: Record<string, string> = { provento: 'text-emerald-700', desconto: 'text-rose-700', encargo: 'text-amber-700', informativa: 'text-slate-500' };
const CALC_TYPE_LABELS: Record<CalculationType, string> = { manual: 'Manual', fixed: 'Valor fixo', percentage: 'Percentual', formula: 'Fórmula' };
// `rubrics.category` é gravada em inglês (motor da folha); valor fora da lista aparece cru.
const RUBRIC_CATEGORY_LABELS: Record<string, string> = {
    base: 'Salário base', overtime: 'Horas extras', tax: 'Tributo', benefit: 'Benefício',
    vacation: 'Férias', thirteenth: '13º salário', variable: 'Variável', termination: 'Rescisão',
};
const categoriaDaRubrica = (c?: string | null) => (c ? RUBRIC_CATEGORY_LABELS[c] ?? c : '');

/** Membro da organização que já aceitou o convite (tem usuário em auth.users). */
interface OrgMemberOption {
    user_id: string;
    name?: string | null;
    email?: string | null;
}

const InputGroup: React.FC<{ label: string; children: React.ReactNode; icon?: React.ElementType }> = ({ label, children, icon: Icon }) => (
    <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
            {Icon && <Icon className="w-3 h-3" />}
            {label}
        </label>
        {children}
    </div>
);

const inputCls = "w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all";

const LaborEmployeeForm: React.FC<LaborEmployeeFormProps> = ({ employee, orgId, organizations = [], onClose, onSaved }) => {
    const isEditing = !!employee;
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };
    const [activeTab, setActiveTab] = useState<EmployeeTabId>('geral');
    // Salvar não fecha mais a edição (§25 do guia) — dirty-tracking + guarda de
    // saída. Ver docs/planos/2026-08-27-salvar-sem-fechar-formularios-multiaba.md.
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [allRubrics, setAllRubrics] = useState<PayrollRubric[]>([]);
    const [recurringRubrics, setRecurringRubrics] = useState<string[]>([]);
    const [loadingRubrics, setLoadingRubrics] = useState(false);
    // Contas bancárias — lista da tela, gravada no "Salvar" (RPC atômica).
    const [bankAccounts, setBankAccounts] = useState<EmployeeBankAccountDraft[]>([]);
    const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
    const [companies, setCompanies] = useState<{ id: string; razao_social: string }[]>([]);
    const [orgRoles, setOrgRoles] = useState<OrgRole[]>([]);
    const [orgMembers, setOrgMembers] = useState<OrgMemberOption[]>([]);
    const [loadingRoles, setLoadingRoles] = useState(false);
    // Dimensões contábeis: cadastros DISTINTOS — Centro de Custo é
    // `cost_centers_v2`, Plano de Contas é `plano_de_contas`.
    const [costCenters, setCostCenters] = useState<{ id: string; name: string; code?: string; parent_id?: string | null }[]>([]);
    const [planoContas, setPlanoContas] = useState<{ id: string; name: string; code?: string }[]>([]);
    const [form, setForm] = useState<Partial<Employee>>({
        name: employee?.name || '',
        cpf: employee?.cpf || '',
        phone: employee?.phone || '',
        email: employee?.email || '',
        user_id: employee?.user_id ?? null,
        contract_type: employee?.contract_type || 'CLT',
        role: employee?.role || ROLES[0],
        status: employee?.status || 'ATIVO',
        daily_cost: employee?.daily_cost || 0,
        hourly_cost: employee?.hourly_cost || 0,
        base_salary: employee?.base_salary || 0,
        hire_date: employee?.hire_date || '',
        notes: employee?.notes || '',
        admission_checklist: employee?.admission_checklist || [],
        org_id: employee?.org_id || orgId || undefined,
        empresa_id: employee?.empresa_id || '',
        role_id: employee?.role_id || null,
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
        // Sprint 1: Organizacional
        matricula: employee?.matricula || '',
        departamento: employee?.departamento || '',
        centro_custo: employee?.centro_custo || '',
        cost_center_id: employee?.cost_center_id || '',
        plano_de_contas_id: employee?.plano_de_contas_id || '',
        sindicato: employee?.sindicato || '',
        jornada_horas_semana: employee?.jornada_horas_semana || 44,
        contract_type_extra: employee?.contract_type_extra || '',
        cnh_numero: employee?.cnh_numero || '',
        cnh_categoria: employee?.cnh_categoria || '',
        cnh_validade: employee?.cnh_validade || '',
        num_dependentes: employee?.num_dependentes || 0,
        // Foto 3x4 — caminho no bucket `organization-assets` (laborService.employeePhotoUrl)
        avatar_url: employee?.avatar_url || '',
        // Dados bancários NÃO moram mais aqui: as colunas employees.banco_* ficaram
        // obsoletas — a aba grava em employee_bank_accounts (várias contas, uma
        // principal; migration aplicar_20271007000020).
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

    // Contas bancárias do colaborador (employee_bank_accounts).
    useEffect(() => {
        if (!isEditing || !employee?.id) return;
        let cancelled = false;
        setLoadingBankAccounts(true);
        employeeBankAccountService.list(employee.id)
            .then(list => { if (!cancelled) setBankAccounts(list.map(toDraft)); })
            .catch(err => {
                console.error('[LaborEmployeeForm] Falha ao carregar contas bancárias:', err);
                if (!cancelled) notify('Não foi possível carregar as contas bancárias.');
            })
            .finally(() => { if (!cancelled) setLoadingBankAccounts(false); });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing, employee?.id]);

    // Carrega empresas da org para o seletor de cargo catalogado
    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        supabase.from('companies').select('id, razao_social').eq('org_id', orgId)
            .then(({ data }) => {
                if (cancelled) return;
                const list = data || [];
                setCompanies(list);
                if (list.length === 1 && !form.empresa_id) {
                    setForm(prev => ({ ...prev, empresa_id: list[0].id }));
                }
            });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    // Cadastros de Centro de Custo e Plano de Contas. Sem guard por org: em
    // "Todas" os services não filtram e a RLS recorta (REGRA #5).
    useEffect(() => {
        let cancelled = false;
        // allSettled: a falha de um cadastro não pode esvaziar o outro select
        // (ver o comentário equivalente em LaborPayroll.tsx).
        Promise.allSettled([
            payrollService.listCostCenters(orgId),
            payrollService.listPlanoContas(orgId),
        ]).then(([cc, pc]) => {
            if (cancelled) return;
            if (cc.status === 'fulfilled') setCostCenters(cc.value);
            else console.error('[LaborEmployeeForm] Falha ao carregar Centro de Custo:', cc.reason);
            if (pc.status === 'fulfilled') setPlanoContas(pc.value);
            else console.error('[LaborEmployeeForm] Falha ao carregar Plano de Contas:', pc.reason);
        });
        return () => { cancelled = true; };
    }, [orgId]);

    // Carrega os usuários do sistema da org, para o vínculo com o colaborador.
    // Só entram membros que já aceitaram o convite (user_id preenchido) —
    // convite pendente ainda não tem usuário em auth.users para apontar.
    useEffect(() => {
        if (!orgId) { setOrgMembers([]); return; }
        let cancelled = false;
        supabase.from('organization_members')
            .select('user_id, name, email')
            .eq('organization_id', orgId)
            .not('user_id', 'is', null)
            .then(({ data }) => {
                if (!cancelled) setOrgMembers((data || []) as OrgMemberOption[]);
            });
        return () => { cancelled = true; };
    }, [orgId]);

    // Carrega cargos do catálogo quando empresa_id muda
    useEffect(() => {
        if (!form.empresa_id) { setOrgRoles([]); return; }
        let cancelled = false;
        setLoadingRoles(true);
        orgGovernanceService.listRoles(form.empresa_id)
            .then(data => { if (!cancelled) setOrgRoles(data); })
            .catch(() => { if (!cancelled) setOrgRoles([]); })
            .finally(() => { if (!cancelled) setLoadingRoles(false); });
        return () => { cancelled = true; };
    }, [form.empresa_id]);

    const setField = <K extends keyof Employee>(key: K, value: Employee[K]) => {
        setForm(prev => ({ ...prev, [key]: value }));
        markDirty();
    };

    // ── Foto 3x4 ────────────────────────────────────────────────────────────
    // O arquivo sobe na hora da escolha (para a prévia), mas `avatar_url` só é
    // gravado no "Salvar", como o resto do formulário. Por isso dois registros:
    //  - `fotosNaoSalvas`: enviadas nesta sessão e ainda não gravadas em
    //    colaborador nenhum — apagadas ao trocar de novo, ao remover e ao sair
    //    sem salvar (senão o bucket acumula órfãs, como no OpuraAssetsModule);
    //  - `fotoGravada`: a que está no banco — só sai do bucket DEPOIS que o save
    //    trocou a coluna (antes disso, sair sem salvar a deixaria apontando
    //    para um arquivo apagado).
    const [photoUploading, setPhotoUploading] = useState(false);
    const fotosNaoSalvas = useRef<string[]>([]);
    const fotoGravada = useRef<string | null>(employee?.avatar_url || null);

    const descartarFotoNaoSalva = (path?: string | null) => {
        if (!path || !fotosNaoSalvas.current.includes(path)) return;
        fotosNaoSalvas.current = fotosNaoSalvas.current.filter(p => p !== path);
        void laborService.removeEmployeePhoto(path);
    };

    const handlePhotoSelect = async (file: File) => {
        setPhotoUploading(true);
        try {
            const path = await laborService.uploadEmployeePhoto(form.org_id || orgId, file);
            fotosNaoSalvas.current.push(path);
            descartarFotoNaoSalva(form.avatar_url);
            setField('avatar_url', path);
        } catch (err: any) {
            notify(err?.message || 'Não foi possível enviar a foto.');
        } finally {
            setPhotoUploading(false);
        }
    };

    const handlePhotoRemove = () => {
        descartarFotoNaoSalva(form.avatar_url);
        setField('avatar_url', '');
    };

    // Saiu sem salvar (Voltar/Cancelar confirmados): o que subiu e não foi
    // gravado não tem dono — limpa o bucket.
    useEffect(() => () => {
        fotosNaoSalvas.current.forEach(path => { void laborService.removeEmployeePhoto(path); });
    }, []);
    
    // Máscaras de Input (CPF e Telefone)
    const formatCPF = (value: string) => {
        const raw = value.replace(/\D/g, '').slice(0, 11);
        if (raw.length <= 3) return raw;
        if (raw.length <= 6) return `${raw.slice(0, 3)}.${raw.slice(3)}`;
        if (raw.length <= 9) return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6)}`;
        return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
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
        if (!form.name?.trim()) { notify('Nome é obrigatório.'); return; }
        if (!form.role?.trim()) { notify('Função é obrigatória.'); return; }
        if (form.cpf && form.cpf.replace(/\D/g, '').length === 11 && !validateCPF(form.cpf)) {
            notify('CPF inválido. Verifique os dígitos informados.');
            return;
        }
        if (!(isEditing ? form.org_id : form.org_id || orgId)) { notify('Selecione a organização.'); return; }
        setSaving(true);
        const cleanedForm = { ...form };
        const dateFields: (keyof Employee)[] = ['hire_date', 'birth_date', 'rg_issue_date', 'ctps_issue_date', 'cnh_validade'];
        
        dateFields.forEach(field => {
            if (cleanedForm[field] === '') {
                (cleanedForm as any)[field] = null;
            }
        });

        // FKs: string vazia não é UUID válido — o Postgres devolve 22P02. Todo
        // campo `*_id` entra, não uma lista: `empresa_id` nasce '' quando a org
        // não tem exatamente uma empresa e ficou de fora da lista antiga.
        (Object.keys(cleanedForm) as (keyof Employee)[]).forEach(field => {
            if (String(field).endsWith('_id') && cleanedForm[field] === '') {
                (cleanedForm as any)[field] = null;
            }
        });
        // Sem foto = NULL, não string vazia (o portal testa `avatar_url` truthy).
        if (cleanedForm.avatar_url === '') (cleanedForm as any).avatar_url = null;
        // banco_* obsoletas (employee_bank_accounts): o form não as escreve mais,
        // nem quando voltam no registro salvo (`setForm(...savedEmployee)`).
        for (const k of ['banco_codigo', 'banco_nome', 'banco_agencia', 'banco_conta', 'banco_conta_tipo', 'banco_pix'] as const) {
            delete cleanedForm[k];
        }

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
                // Contas bancárias: a lista inteira numa transação — devolve o
                // estado gravado (ids novos, principal normalizada).
                const contasGravadas = await employeeBankAccountService.saveAll(savedEmployee.id, bankAccounts);
                setBankAccounts(contasGravadas.map(toDraft));
            }

            // Foto: a gravada agora deixa de ser "não salva"; a que estava no
            // banco antes, se foi trocada ou removida, sai do bucket.
            const fotoAtual = savedEmployee.avatar_url || null;
            fotosNaoSalvas.current = fotosNaoSalvas.current.filter(p => p !== fotoAtual);
            if (fotoGravada.current && fotoGravada.current !== fotoAtual) {
                void laborService.removeEmployeePhoto(fotoGravada.current);
            }
            fotoGravada.current = fotoAtual;

            onSaved(savedEmployee);

            // Salvar não fecha mais a edição (§25 do guia) — o usuário costuma
            // ter várias abas por conferir e não quer reabrir o colaborador a
            // cada gravação pontual. Só a criação fecha: ali a tarefa acabou.
            if (isEditing) {
                setForm(prev => ({ ...prev, ...savedEmployee }));
                markSaved();
                setSavedAt(Date.now());
                notify('Alterações salvas.', 'success');
            } else {
                onClose();
            }
        } catch (err: any) {
            console.error(err);
            notify('Erro ao salvar colaborador: ' + (err.message || 'Tente novamente.'));
        } finally {
            setSaving(false);
        }
    };

    // Ctrl+S / Cmd+S grava sem fechar — atalho útil numa edição de 9 abas.
    useEffect(() => {
        if (!isEditing) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing, handleSave]);

    const handleBack = async () => {
        if (await confirmDiscard()) onClose();
    };



    const EMPLOYEE_TABS = isEditing
        ? BASE_EMPLOYEE_TABS
        : BASE_EMPLOYEE_TABS.filter(tab => tab.id !== 'salarios');

    // Toolbar de abas §19.1 — componente canônico, não o snippet copiado.
    const renderTabs = () => (
        <TabsBar<EmployeeTabId>
            tabs={EMPLOYEE_TABS.map(tab => ({ id: tab.id, label: tab.label }))}
            value={activeTab}
            onChange={setActiveTab}
        />
    );

    // Ao abrir a edição, a tela entra no fluxo do <main> (que rola): sem isto
    // ela apareceria na altura em que a lista estava rolada.
    const editRootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isEditing) editRootRef.current?.scrollIntoView({ block: 'start' });
    }, [isEditing]);

    const renderFooter = () => (
        <>
            {/* §25 do guia: em edição, Salvar não fecha — o indicador substitui o
                fechamento como prova de que a gravação aconteceu. mr-auto empurra
                os botões pra direita mesmo com o container em justify-end. */}
            {isEditing && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
            <button
                onClick={isEditing ? handleBack : onClose}
                className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] transition-all"
            >
                {isEditing ? 'Voltar' : 'Cancelar'}
            </button>
            <button
                onClick={handleSave}
                disabled={saving || (isEditing && !dirty)}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 transition-all active:scale-95 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Cadastrar Colaborador')}
            </button>
        </>
    );

    const renderTabContent = () => (
        <>
            {activeTab === 'geral' && (
                        <>
                    {/* Dados Pessoais */}
                    <div>
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                            <User className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Dados Pessoais</h3>
                        </div>
                        {/* Foto 3x4 no canto superior esquerdo, campos ao lado */}
                        <div className="flex flex-col sm:flex-row gap-6">
                        <LaborEmployeePhoto
                            src={laborService.employeePhotoUrl(form.avatar_url)}
                            uploading={photoUploading}
                            name={form.name}
                            onSelect={handlePhotoSelect}
                            onRemove={handlePhotoRemove}
                        />
                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
                            {/* Vínculo com o login. Sem isto, "Meus Treinamentos" não
                                consegue saber quais matrículas são desta pessoa. */}
                            <InputGroup label="Usuário do sistema" icon={User}>
                                <div className="relative">
                                    <select
                                        value={form.user_id || ''}
                                        onChange={e => setField('user_id', e.target.value || null)}
                                        className={inputCls + ' appearance-none pr-8'}
                                    >
                                        <option value="">Sem acesso ao sistema</option>
                                        {orgMembers.map(m => (
                                            <option key={m.user_id} value={m.user_id}>
                                                {m.name || m.email}
                                                {form.email && m.email
                                                    && m.email.toLowerCase() === form.email.toLowerCase()
                                                    ? ' — mesmo e-mail'
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                </div>
                                <p className="text-xs text-slate-400">
                                    A maior parte da mão de obra não tem login e acessa pelo Portal do Colaborador.
                                </p>
                            </InputGroup>
                        </div>
                        </div>
                    </div>

                    {/* Vínculo e Função */}
                    <div>
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Vínculo e Função</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
                            <InputGroup label="Cargo (Catálogo)">
                                {loadingRoles ? (
                                    <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-400">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando cargos...
                                    </div>
                                ) : orgRoles.length > 0 ? (
                                    <div className="space-y-1">
                                        <div className="relative">
                                            <select
                                                value={form.role_id || ''}
                                                onChange={e => {
                                                    const rid = e.target.value;
                                                    const found = orgRoles.find(r => r.id === rid);
                                                    setForm(prev => ({
                                                        ...prev,
                                                        role_id: rid || null,
                                                        role: found ? found.nome : (prev.role || ''),
                                                    }));
                                                    markDirty();
                                                }}
                                                className={inputCls + ' appearance-none pr-8'}
                                            >
                                                <option value="">— Selecione do catálogo —</option>
                                                {orgRoles.sort((a, b) => a.nivel_hierarquico - b.nivel_hierarquico || a.nome.localeCompare(b.nome)).map(r => (
                                                    <option key={r.id} value={r.id}>{r.nome}{r.codigo ? ` (${r.codigo})` : ''}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                        </div>
                                        {form.role_id && (() => {
                                            const sel = orgRoles.find(r => r.id === form.role_id);
                                            if (!sel) return null;
                                            const hasSalary = sel.salario_minimo != null || sel.salario_maximo != null;
                                            if (!hasSalary) return null;
                                            const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
                                            return (
                                                <p className="text-xs text-violet-600 font-medium px-1">
                                                    Faixa salarial: {sel.salario_minimo != null ? fmt(sel.salario_minimo) : '—'} – {sel.salario_maximo != null ? fmt(sel.salario_maximo) : '—'}
                                                </p>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic px-1">
                                        {form.empresa_id ? 'Nenhum cargo cadastrado no catálogo.' : 'Selecione a empresa para ver os cargos.'}
                                    </p>
                                )}
                            </InputGroup>
                            <InputGroup label="Função / Cargo *">
                                <input
                                    value={form.role || ''}
                                    onChange={e => setField('role', e.target.value)}
                                    className={inputCls}
                                    placeholder="Ex: Pedreiro, Mestre de Obras..."
                                />
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
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                            <DollarSign className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Custo de Mão de Obra</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
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
                                        markDirty();
                                    }}
                                    onFocus={e => e.target.select()}
                                    className={inputCls + " border-indigo-200 bg-indigo-50/30"}
                                    placeholder="2500.00"
                                />
                                {isEditing && (
                                    <p className="text-xs text-slate-400 mt-1.5">
                                        Alterações aqui geram um registro automático no Histórico Salarial.
                                    </p>
                                )}
                            </InputGroup>
                        </div>
                        </div>
                        </>
                    )}

                    {activeTab === 'pessoal' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <Users className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Informações Pessoais e Filiação</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
                                            className={`flex items-center gap-2 px-3 py-2 rounded-[6px] border transition-all text-form-input font-bold ${form.is_disabled ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
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
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <FileText className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Documentos de Identificação e Trabalho</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
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
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                <Wallet className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-semibold text-gray-900">Rubricas recorrentes individuais</h3>
                                <span className="text-xs text-gray-400">
                                    {recurringRubrics.length} de {allRubrics.length} incluída{allRubrics.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500">
                                Ligue as rubricas extras que entram automaticamente em todas as folhas deste colaborador.
                                As marcadas como "Padrão CLT" não aparecem aqui: já entram para todo contrato CLT.
                            </p>

                            {/* §6.10 — StandardTable traz busca persistida, engrenagem de
                                colunas e autofit (§5.1/§6.1.2). Na criação o form é um
                                modal estreito: `dense` (§6.9). */}
                            <StandardTable<PayrollRubric>
                                storageKey="rh:colaborador:folha:rubricas"
                                columns={RUBRIC_COLUMNS}
                                rows={allRubrics}
                                rowKey={r => r.code}
                                dense={!isEditing}
                                maxHeight="60vh"
                                loading={loadingRubrics}
                                searchText={r => `${r.code} ${r.name} ${categoriaDaRubrica(r.category)} ${RUBRIC_TYPE_LABELS[r.type] ?? r.type}`}
                                searchPlaceholder="Buscar rubrica por código, nome ou categoria..."
                                sortValue={(key, r) => {
                                    switch (key) {
                                        case 'incluir': return recurringRubrics.includes(r.code) ? 1 : 0;
                                        case 'tipo': return RUBRIC_TYPE_LABELS[r.type] ?? r.type;
                                        case 'inss': return r.incidence_inss ? 1 : 0;
                                        case 'fgts': return r.incidence_fgts ? 1 : 0;
                                        case 'irrf': return r.incidence_irrf ? 1 : 0;
                                        case 'calculo': return CALC_TYPE_LABELS[r.calculation_type ?? 'manual'];
                                        case 'categoria': return categoriaDaRubrica(r.category);
                                        case 'codigo': return r.code;
                                        default: return r.name;
                                    }
                                }}
                                renderCell={(key, r) => {
                                    const incluida = recurringRubrics.includes(r.code);
                                    switch (key) {
                                        case 'incluir':
                                            return (
                                                <TableSwitch
                                                    checked={incluida}
                                                    title={incluida ? 'Incluída em todas as folhas' : 'Não incluída'}
                                                    onChange={() => {
                                                        setRecurringRubrics(prev => incluida ? prev.filter(c => c !== r.code) : [...prev, r.code]);
                                                        markDirty();
                                                    }}
                                                />
                                            );
                                        case 'codigo': return <span className="block truncate text-sm font-normal text-gray-600" title={r.code}>{r.code}</span>;
                                        case 'tipo':
                                            return <span className={`text-sm font-normal ${RUBRIC_TYPE_COLORS[r.type] ?? 'text-gray-600'}`}>{RUBRIC_TYPE_LABELS[r.type] ?? r.type}</span>;
                                        case 'inss': case 'fgts': case 'irrf': {
                                            const on = key === 'inss' ? r.incidence_inss : key === 'fgts' ? r.incidence_fgts : r.incidence_irrf;
                                            return on
                                                ? <Check className="w-4 h-4 text-emerald-600" aria-label="Incide" />
                                                : <span className="text-sm font-normal text-gray-400" aria-label="Não incide">—</span>;
                                        }
                                        case 'calculo': return <span className="text-sm font-normal text-gray-600">{CALC_TYPE_LABELS[r.calculation_type ?? 'manual']}</span>;
                                        case 'categoria': return <span className="block truncate text-sm font-normal text-gray-600" title={categoriaDaRubrica(r.category)}>{categoriaDaRubrica(r.category) || '—'}</span>;
                                        default: return <span className="block truncate text-sm font-normal text-gray-700" title={r.name}>{r.name}</span>;
                                    }
                                }}
                                empty={{
                                    icon: <Info className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                                    title: 'Nenhuma rubrica automática disponível',
                                    subtitle: 'Em Rubricas, marque como "Automática" (e não como "Padrão CLT") as que podem entrar por colaborador.',
                                }}
                            />
                        </div>
                    )}

                    {activeTab === 'salarios' && isEditing && employee?.id && (
                        <LaborEmployeeSalaryHistory
                            employeeId={employee.id}
                            empresaId={form.empresa_id || employee.empresa_id}
                            currentSalary={form.base_salary || 0}
                            defaults={{
                                org_role_id: form.role_id || null,
                                role_label: form.role || null,
                                jornada_horas_semana: form.jornada_horas_semana ?? null,
                                contract_type: form.contract_type || null,
                            }}
                            // A aba grava direto no banco. Sem trazer o snapshot de volta
                            // pro form state, o "Salvar Alterações" abaixo regravaria o
                            // salário antigo por cima do reajuste recém-lançado.
                            onSalaryApplied={snapshot => setForm(prev => ({
                                ...prev,
                                base_salary: snapshot.base_salary,
                                hourly_cost: snapshot.hourly_cost,
                                daily_cost: snapshot.daily_cost,
                            }))}
                        />
                    )}

                    {activeTab === 'endereco' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <MapPin className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Endereço Residencial e Contato</h3>
                                </div>
                                <CityStateSelect
                                    cep={form.address_zip_code}
                                    stateCode={form.address_uf}
                                    cityName={form.address_city}
                                    onChange={({ cep, stateCode, cityName }) => {
                                        setForm(prev => ({
                                            ...prev,
                                            address_zip_code: cep ?? '',
                                            address_uf: stateCode ?? '',
                                            address_city: cityName ?? '',
                                        }));
                                        markDirty();
                                    }}
                                    onCepLookup={data => {
                                        setForm(prev => ({
                                            ...prev,
                                            address_street: data.logradouro || prev.address_street,
                                            address_neighborhood: data.bairro || prev.address_neighborhood,
                                        }));
                                        markDirty();
                                    }}
                                    inputCls={inputCls}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-x-6 gap-y-4 mt-4">
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
                                    <div className="md:col-span-3">
                                        <InputGroup label="Telefone Residencial">
                                            <input value={form.residential_phone} onChange={e => setField('residential_phone', formatPhone(e.target.value))} className={inputCls} />
                                        </InputGroup>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'organizacional' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <Briefcase className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Dados Organizacionais</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    {companies.length > 0 && (
                                        <InputGroup label="Empresa (CNPJ)">
                                            <div className="relative">
                                                <select
                                                    value={form.empresa_id || ''}
                                                    onChange={e => { setForm(prev => ({ ...prev, empresa_id: e.target.value, role_id: null })); markDirty(); }}
                                                    className={inputCls + ' appearance-none pr-8'}
                                                >
                                                    <option value="">— Nenhuma —</option>
                                                    {companies.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                            </div>
                                        </InputGroup>
                                    )}
                                    <InputGroup label="Matrícula">
                                        <input value={form.matricula} onChange={e => setField('matricula', e.target.value)} className={inputCls} placeholder="Ex: 001234" />
                                    </InputGroup>
                                    <InputGroup label="Departamento">
                                        <input value={form.departamento} onChange={e => setField('departamento', e.target.value)} className={inputCls} placeholder="Ex: Produção / Obras" />
                                    </InputGroup>
                                    {/* Centro de Custo e Plano de Contas: cadastros
                                        distintos (`cost_centers_v2` / `plano_de_contas`).
                                        Preenchidos aqui, sobrepõem os da folha nas linhas
                                        financeiras deste colaborador. O texto livre antigo
                                        (`centro_custo`) deixou de ser editável — virou FK. */}
                                    <InputGroup label="Centro de Custo">
                                        <CostCenterSelect
                                            costCenters={costCenters}
                                            value={form.cost_center_id ?? ''}
                                            onChange={v => setField('cost_center_id', v)}
                                            placeholder="Herdar da folha"
                                            hoverCls="hover:bg-indigo-50"
                                        />
                                    </InputGroup>
                                    <InputGroup label="Plano de Contas">
                                        <PlanoContasSelect
                                            planoContas={planoContas}
                                            value={form.plano_de_contas_id ?? ''}
                                            onChange={v => setField('plano_de_contas_id', v)}
                                            placeholder="Herdar da folha"
                                            size="sm"
                                        />
                                    </InputGroup>
                                    <InputGroup label="Sindicato">
                                        <input value={form.sindicato} onChange={e => setField('sindicato', e.target.value)} className={inputCls} placeholder="Ex: SINDUSCON-MG" />
                                    </InputGroup>
                                    <InputGroup label="Jornada Semanal (horas)">
                                        <input
                                            type="number" min="0" max="60" step="0.5"
                                            value={form.jornada_horas_semana ?? 44}
                                            onChange={e => setField('jornada_horas_semana', parseFloat(e.target.value) || 44)}
                                            className={inputCls}
                                        />
                                    </InputGroup>
                                    <InputGroup label="Subtipo de Contrato">
                                        <select value={form.contract_type_extra || ''} onChange={e => setField('contract_type_extra', e.target.value)} className={inputCls}>
                                            <option value="">Nenhum</option>
                                            <option value="TEMPORARIO">Temporário (Lei 6.019/74)</option>
                                            <option value="APRENDIZ">Aprendiz (CLT Art. 428)</option>
                                        </select>
                                    </InputGroup>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <FileText className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">CNH (Carteira Nacional de Habilitação)</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                                    <InputGroup label="Número CNH">
                                        <input value={form.cnh_numero} onChange={e => setField('cnh_numero', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                    <InputGroup label="Categoria">
                                        <select value={form.cnh_categoria || ''} onChange={e => setField('cnh_categoria', e.target.value)} className={inputCls}>
                                            <option value="">Sem CNH</option>
                                            {['A','B','C','D','E','AB','AC','AD','AE'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </InputGroup>
                                    <InputGroup label="Validade CNH">
                                        <input type="date" value={form.cnh_validade || ''} onChange={e => setField('cnh_validade', e.target.value)} className={inputCls} />
                                    </InputGroup>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <Users className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Dependentes</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                    <InputGroup label="Número de Dependentes">
                                        <input
                                            type="number" min="0" max="20"
                                            value={form.num_dependentes ?? 0}
                                            onChange={e => setField('num_dependentes', parseInt(e.target.value) || 0)}
                                            className={inputCls}
                                        />
                                    </InputGroup>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'bancario' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-4">
                            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                                <CreditCard className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-semibold text-gray-900">Contas bancárias e PIX</h3>
                                <span className="text-xs text-gray-400">
                                    {bankAccounts.length} conta{bankAccounts.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500">
                                Contas para transferência de salário e benefícios. A <span className="text-emerald-700">principal</span> é a usada por padrão nos pagamentos.
                            </p>
                            <LaborEmployeeBankAccounts
                                accounts={bankAccounts}
                                onChange={next => { setBankAccounts(next); markDirty(); }}
                                loading={loadingBankAccounts}
                                dense={!isEditing}
                                inputCls={inputCls}
                            />
                        </div>
                    )}

                    {activeTab === 'checklist' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-8">
                            <div>
                                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                                    <CheckSquare className="w-4 h-4 text-blue-600" />
                                    <h3 className="text-sm font-semibold text-gray-900">Checklist de Admissão</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {ADMISSION_CHECKLIST_ITEMS.map(item => {
                                        const checked = ((form.admission_checklist || []) as string[]).includes(item);
                                        return (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() => toggleChecklist(item)}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] border transition-all text-sm font-medium text-left
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
        </>
    );

    const renderToast = () => notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-[10px] shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    );

    if (isEditing) {
        return (
            // TELA, não sobreposição (mesmo desenho do ProjectModal mode==='edit'):
            // o conteúdo entra no fluxo do <main>, que já dá o gutter de 24px
            // (§20.2) e é quem rola. Era `absolute inset-0` com `px-6 md:px-10`
            // próprio + card `p-6 md:p-10` — os campos ficavam a 80px da borda
            // no desktop, contra os 48px (gutter + p-6 do card) do resto do app.
            // Quem esconde a lista enquanto a edição está aberta é o LaborModule.
            <div ref={editRootRef} className="pb-6">
                {/* Cabeçalho de tela §20 — sem padding horizontal próprio */}
                <div className="pb-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="p-3 bg-white border border-gray-100 rounded-[6px] text-gray-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm active:scale-95 group shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Editar Colaborador</h1>
                            <p className="text-gray-400 text-sm mt-1.5 font-medium">{TAB_SUBTITLES[activeTab]}</p>
                        </div>
                    </div>
                </div>

                {/* Toolbar de abas §19.1 — 24px abaixo do título (§20.1); o
                    TabsBar já traz o mb-3 até o card do formulário. */}
                <div className="pt-6">
                    {renderTabs()}
                </div>

                {/* Card do formulário — p-6 e seções a 32px (§30) */}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-6 space-y-8">
                    {renderTabContent()}
                </div>

                {/* Rodapé solto abaixo do card (§30), SaveStatus à esquerda (§25) */}
                <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 mt-6">
                    {renderFooter()}
                </div>

                {renderToast()}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700">
                    <div>
                        <h2 className="text-lg font-black text-white">Novo Colaborador</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">Preencha os dados para cadastrar</p>
                    </div>
                    <button onClick={handleBack} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar de abas — anatomia canônica §19.1 (renderTabs já traz seu próprio card) */}
                <div className="sticky top-0 bg-white z-10 px-6 pt-3 shrink-0">
                    {renderTabs()}
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3 space-y-8">
                    {renderTabContent()}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
                    {renderFooter()}
                </div>
            </div>

            {renderToast()}
        </div>
    );
};

export default LaborEmployeeForm;
