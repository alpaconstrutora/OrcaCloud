import React from 'react';
import { X, Building2, MapPin, Ruler, FileText, Cloud, Search, ChevronDown, TrendingUp, Calendar, Hash, Layers, Settings2, Users } from 'lucide-react';
import { TipoObra, RegimeObra, TechnicalConfig } from '../types/project';
import { BASE_CUB_RATES, CUB_STANDARDS_DATA } from '../constants';
import { clientService } from '../services/clientService';
import { projectService } from '../services/projectService';
import { investorService } from '../services/investorService';
import { laborService, Employee } from '../services/laborService';
import { Client, Investor } from '../types';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

interface NewProjectData {
  id?: string;
  name: string;
  client: string;
  clientId?: string;
  location: string;
  standard: string;
  area: number;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  notes: string;
  database: string;
  referenceMonth: string;
  socialChargesMode: string;
  bdi: number;
  autoSave?: boolean;
  budgetStatus?: 'Em Andamento' | 'Fechado';
  obraStatus?: 'Não Iniciado' | 'Em andamento' | 'Paralisada' | 'Concluída';
  budgetType?: 'ANALYTIC' | 'PARAMETRIC';
  linkedProjectName?: string;
  linkedProjectId?: string;
  investorId?: string;
  investor?: string;
  classification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO';
  startDate?: string;
  endDate?: string;
  startDateReal?: string;
  endDateReal?: string;
  responsibleTeam?: string;
  code?: string;
  organizationId?: string;
  empresaId?: string;
  tipo?: 'Reforma' | 'Manutenção' | 'Greenfield' | 'Administração' | 'Condomínio';
  tipoObra?: TipoObra;
  regimeObra?: RegimeObra;
  technicalConfig?: TechnicalConfig;
  // Gestão financeira
  valorEstimado?: number;
  valorContratado?: number;
  margemAlvo?: number;
  modalidade?: 'publica' | 'privada';
  // Equipe
  mestreObras?: string;
  encarregado?: string;
  tecnicoSeguranca?: string;
  almoxarife?: string;
  // Registro documental
  artRrt?: string;
  alvara?: string;
  matriculaCNO?: string;
}

// ── Employee combobox ──────────────────────────────────────────────────────────
const EmployeeCombobox: React.FC<{
  label: string;
  value: string;
  employees: Employee[];
  onChange: (val: string) => void;
}> = ({ label, value, employees, onChange }) => {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    return employees
      .filter(e => e.status === 'ATIVO')
      .filter(e => !q || e.name.toLowerCase().includes(q) || (e.role || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [employees, query]);

  const displayValue = value || '';

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          placeholder={`Buscar ou digitar ${label.toLowerCase()}`}
          className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none pr-8"
          value={open ? query : displayValue}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {employees.length > 0 && (
          <ChevronDown className="absolute right-2.5 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map(emp => (
            <button
              key={emp.id}
              type="button"
              onMouseDown={() => { onChange(emp.name); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shrink-0">
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{emp.name}</p>
                {emp.role && <p className="text-xs text-gray-400 truncate">{emp.role}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TIPO_OBRA_LABELS: Record<TipoObra, string> = {
  residencial_multifamiliar: 'Residencial Multifamiliar (Prédio)',
  casa: 'Casa Residencial',
  loja: 'Loja Comercial',
  sala: 'Sala Comercial / Escritório',
  galpao: 'Galpão Industrial / Logístico',
  reforma: 'Reforma / Manutenção',
  outro: 'Outro',
};

const REGIME_OBRA_LABELS: Record<RegimeObra, string> = {
  empreitada_global: 'Empreitada Global',
  administracao: 'Administração',
  preco_unitario: 'Preço Unitário',
  turn_key: 'Turn-Key',
};

const REQUIRED_DOCS_BY_TYPE: Record<TipoObra, { name: string; required: boolean }[]> = {
  residencial_multifamiliar: [
    { name: 'ART/RRT do Projeto', required: true },
    { name: 'ART/RRT da Execução', required: true },
    { name: 'Alvará de Construção', required: true },
    { name: 'Matrícula CNO', required: true },
    { name: 'Seguro de Obra (RCOC)', required: true },
    { name: 'AVCB', required: true },
    { name: 'Habite-se', required: true },
  ],
  casa: [
    { name: 'ART/RRT do Projeto', required: true },
    { name: 'ART/RRT da Execução', required: true },
    { name: 'Alvará de Construção', required: true },
    { name: 'Matrícula CNO', required: true },
    { name: 'Habite-se', required: true },
  ],
  loja: [
    { name: 'ART/RRT da Execução', required: true },
    { name: 'Alvará de Reforma/Construção', required: true },
    { name: 'AVCB', required: true },
    { name: 'Manual / Padrão da Franqueadora', required: false },
    { name: 'Autorização do Shopping', required: false },
  ],
  sala: [
    { name: 'ART/RRT da Execução', required: true },
    { name: 'Alvará de Reforma', required: true },
    { name: 'Autorização do Condomínio', required: true },
  ],
  galpao: [
    { name: 'ART/RRT Projeto Estrutural', required: true },
    { name: 'ART/RRT da Execução', required: true },
    { name: 'Alvará de Construção', required: true },
    { name: 'Matrícula CNO', required: true },
    { name: 'Licença Ambiental', required: true },
    { name: 'Licença Corpo de Bombeiros', required: true },
    { name: 'PPRA / PCMSO', required: true },
    { name: 'Habite-se / Auto de Conclusão', required: true },
  ],
  reforma: [
    { name: 'ART/RRT da Execução', required: true },
    { name: 'Alvará de Reforma', required: false },
    { name: 'Autorização do Condomínio', required: false },
  ],
  outro: [
    { name: 'ART/RRT da Execução', required: true },
  ],
};

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: NewProjectData) => void;
  initialData?: NewProjectData;
  mode?: 'create' | 'edit';
  initialClassification?: 'OBRA' | 'ORCAMENTO' | 'PLANEJAMENTO' | 'DIARIO';
  organizationId?: string;
  organizations?: { id: string; name: string }[];
  empresaId?: string;
  // clients removed from props
}

const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, onSubmit, initialData, mode = 'create', initialClassification, organizationId, organizations = [], empresaId }) => {
  const { companies, activeEmpresaId } = useStore();

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'technical' | 'select' | 'address'>('technical');
  const [clients, setClients] = React.useState<Client[]>([]);
  const [investors, setInvestors] = React.useState<Investor[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [selectedOrgId, setSelectedOrgId] = React.useState<string | undefined>(undefined);
  const [selectedEmpresaId, setSelectedEmpresaId] = React.useState<string | undefined>(
    empresaId ?? activeEmpresaId ?? undefined
  );

  const [projects, setProjects] = React.useState<any[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [projectCode, setProjectCode] = React.useState('');
  const [isFetchingCode, setIsFetchingCode] = React.useState(false);
  const [isClientListOpen, setIsClientListOpen] = React.useState(false);
  const [isInvestorListOpen, setIsInvestorListOpen] = React.useState(false);
  const [linkedProjectId, setLinkedProjectId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<NewProjectData>({
    name: '',
    client: '',
    clientId: undefined,
    investor: '',
    investorId: undefined,
    location: 'SP',
    standard: 'R8-N',
    area: 100,
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: 'SP',
    zipCode: '',
    notes: '',
    database: 'SINAPI',
    referenceMonth: '01/2025',
    socialChargesMode: 'Com Desoneração',
    bdi: 25.0,
    autoSave: true,
    budgetStatus: 'Em Andamento',
    obraStatus: 'Não Iniciado',
    budgetType: 'ANALYTIC',
    classification: 'ORCAMENTO',
    startDate: '',
    endDate: '',
    startDateReal: '',
    endDateReal: '',
    responsibleTeam: '',
    tipo: undefined,
    tipoObra: undefined,
    regimeObra: undefined,
    technicalConfig: undefined,
    valorEstimado: undefined,
    valorContratado: undefined,
    margemAlvo: undefined,
    modalidade: undefined,
    mestreObras: '',
    encarregado: '',
    tecnicoSeguranca: '',
    almoxarife: '',
    artRrt: '',
    alvara: '',
    matriculaCNO: '',
  });


  React.useEffect(() => {
    if (isOpen) {
      projectService.listProjects().then(setProjects).catch(console.error);
      // Fetch clients directly here to ensure fresh data
      clientService.listClients().then(setClients).catch(console.error);
      investorService.listInvestors().then(setInvestors).catch(console.error);
      const empOrgId = selectedEmpresaId ? undefined : (organizationId || selectedOrgId);
      laborService.listEmployees(empOrgId, selectedEmpresaId).then(setEmployees).catch(console.error);
    }
  }, [isOpen]);

  // Fetch suggested code for new OBRA creation
  React.useEffect(() => {
    if (isOpen && mode === 'create' && initialClassification === 'OBRA' && organizationId) {
      setIsFetchingCode(true);
      const fetchCode = async () => {
        try {
          const { data, error } = await supabase.rpc('get_next_project_code', { p_org_id: organizationId });
          if (error) throw error;
          if (data) setProjectCode(data as string);
        } catch (err) {
          console.error(err);
        } finally {
          setIsFetchingCode(false);
        }
      };
      fetchCode();
    } else if (isOpen && mode === 'edit' && initialData?.code) {
      setProjectCode(initialData.code);
    } else if (!isOpen) {
      setProjectCode('');
    }
  }, [isOpen, mode, initialClassification, organizationId, initialData?.code]);

  // Helper to sanitize old status values to new ones
  const sanitizeStatus = (data: NewProjectData): NewProjectData => {
    const sanitized = { ...data };

    // Budget Status Mapping
    if (sanitized.budgetStatus) {
      const bs = sanitized.budgetStatus.toString().toUpperCase();
      if (bs === 'EM ANÁLISE' || bs === 'EM ANDAMENTO') sanitized.budgetStatus = 'Em Andamento';
      else if (bs === 'APROVADO' || bs === 'FECHADO' || bs === 'CONCLUÍDO') sanitized.budgetStatus = 'Fechado';
      else if (!['Em Andamento', 'Fechado'].includes(sanitized.budgetStatus)) sanitized.budgetStatus = 'Em Andamento';
    }

    // Obra Status Mapping
    if (sanitized.obraStatus) {
      const os = sanitized.obraStatus.toString().toUpperCase();
      if (os === 'NÃO INICIADA' || os === 'NÃO INICIADO') sanitized.obraStatus = 'Não Iniciado';
      else if (os === 'EM ANDAMENTO') sanitized.obraStatus = 'Em andamento';
      else if (os === 'CONCLUÍDA' || os === 'CONCLUIDA' || os === 'CONCLUÍDO') sanitized.obraStatus = 'Concluída';
      else if (!['Não Iniciado', 'Em andamento', 'Concluída'].includes(sanitized.obraStatus)) sanitized.obraStatus = 'Não Iniciado';
    }

    return sanitized;
  };

  // 1. Initial Data Population (Runs on mount/key change)
  React.useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const sanitized = sanitizeStatus(initialData);

        // Force classification from prop if it's missing in data
        if (!sanitized.classification && initialClassification) {
          sanitized.classification = initialClassification;
        }

        setFormData(sanitized);
        setSelectedOrgId((initialData as any).organizationId || organizationId);
        setSelectedEmpresaId((initialData as any).empresaId || empresaId || activeEmpresaId || undefined);

        // Immediate link check if projects are already here
        if (initialClassification !== 'OBRA' && initialData.linkedProjectId) {
          const projectToLink = projects.find(p => p.id === initialData.linkedProjectId);
          if (projectToLink) {
            setLinkedProjectId(projectToLink.id);
          }
        }
      } else {
        setFormData({
          name: '',
          client: '',
          clientId: undefined,
          investor: '',
          investorId: undefined,
          location: 'SP',
          standard: 'R8-N',
          area: 100,
          street: '',
          number: '',
          complement: '',
          neighborhood: '',
          city: '',
          state: 'SP',
          zipCode: '',
          notes: '',
          database: 'SINAPI',
          referenceMonth: '01/2025',
          socialChargesMode: 'Com Desoneração',
          bdi: 25.0,
          autoSave: true,
          budgetStatus: 'Em Andamento',
          obraStatus: 'Não Iniciado',
          budgetType: 'ANALYTIC',
          classification: initialClassification || 'ORCAMENTO',
          startDate: '',
          endDate: '',
          startDateReal: '',
          endDateReal: '',
          responsibleTeam: '',
          tipo: undefined,
          tipoObra: undefined,
          regimeObra: undefined,
          technicalConfig: undefined,
        });
        setLinkedProjectId(null);
      }
    }
  }, [isOpen]); // Only run when modal opens (handled by key in App.tsx)

  // 2. Background Link Synchronization (Only when projects arrive)
  React.useEffect(() => {
    if (isOpen && initialClassification !== 'OBRA' && projects.length > 0 && initialData?.linkedProjectId && !linkedProjectId) {
      const projectToLink = projects.find(p => p.id === initialData.linkedProjectId);
      if (projectToLink) {
        setLinkedProjectId(projectToLink.id);
        // We update formData only once if it hasn't been modified or if we strictly need to sync parent data
        setFormData(prev => ({
          ...prev,
          linkedProjectId: projectToLink.id,
          linkedProjectName: projectToLink.name,
          client: projectToLink.settings?.client || prev.client,
          clientId: projectToLink.settings?.clientId || prev.clientId,
          investor: projectToLink.settings?.investor || prev.investor,
          investorId: projectToLink.settings?.investorId || prev.investorId,
          street: projectToLink.settings?.street || prev.street,
          number: projectToLink.settings?.number || prev.number,
          complement: projectToLink.settings?.complement || prev.complement,
          neighborhood: projectToLink.settings?.neighborhood || prev.neighborhood,
          city: projectToLink.settings?.city || prev.city,
          state: projectToLink.settings?.state || prev.state,
          zipCode: projectToLink.settings?.zipCode || prev.zipCode,
          location: projectToLink.settings?.location || prev.location,
          startDate: projectToLink.settings?.startDate || prev.startDate,
          endDate: projectToLink.settings?.endDate || prev.endDate
        }));
      }
    }
  }, [isOpen, projects.length, initialClassification, initialData?.linkedProjectId]);

  // Delay sheet open state by one frame so CSS transition plays on mount
  const [sheetOpen, setSheetOpen] = React.useState(false);
  React.useEffect(() => {
    if (isOpen && mode === 'edit') {
      const id = requestAnimationFrame(() => setSheetOpen(true));
      return () => { cancelAnimationFrame(id); setSheetOpen(false); };
    }
    setSheetOpen(false);
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setActiveTab('technical');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        linkedProjectId: linkedProjectId || undefined,
        linkedProjectName: linkedProjectId ? projects.find(p => p.id === linkedProjectId)?.name : undefined,
        code: (formData.classification === 'OBRA' && projectCode.trim()) ? projectCode.trim() : undefined,
        organizationId: selectedOrgId,
        empresaId: selectedEmpresaId,
      });
    } finally {
      setIsSubmitting(false);
    }
    setProjectCode('');
    if (mode === 'create') {
      // Only reset if creating
      setFormData({
        name: '',
        client: '',
        clientId: undefined,
        investor: '',
        investorId: undefined,
        location: 'SP',
        standard: 'R8-N',
        area: 100,
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: 'SP',
        zipCode: '',
        notes: '',
        database: 'SINAPI',
        referenceMonth: '01/2025',
        socialChargesMode: 'Com Desoneração',
        bdi: 25.0,
        autoSave: true,
        budgetStatus: 'Em Andamento',
        obraStatus: 'Não Iniciado',
        budgetType: 'ANALYTIC',
        classification: initialClassification || 'ORCAMENTO',
        startDate: '',
        endDate: '',
        startDateReal: '',
        endDateReal: '',
        responsibleTeam: '',
        tipo: undefined
      });
      setLinkedProjectId(null);
    }
    setActiveTab('technical');
  };

  return (
    <div className={
      mode === 'edit'
        ? 'fixed inset-0 z-50'
        : 'absolute inset-0 z-50 flex items-center justify-center p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200'
    }>

      {/* Sheet backdrop (edit mode only) */}
      {mode === 'edit' && (
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${sheetOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
      )}

      {/* Modal / Sheet Content */}
      <div className={
        mode === 'edit'
          ? `absolute top-0 right-0 bottom-0 flex flex-col bg-white shadow-2xl w-full max-w-2xl overflow-hidden border-l border-gray-200 transition-transform duration-300 ease-in-out ${sheetOpen ? 'translate-x-0' : 'translate-x-full'}`
          : 'relative bg-white rounded-[2.5rem] shadow-2xl w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden border border-gray-200'
      }>

        {/* Header */}
        <div className={`border-b border-gray-100 bg-gray-50/50 flex justify-between items-start gap-6 shrink-0 ${mode === 'edit' ? 'px-6 py-5' : 'px-12 py-8'}`}>
          <div className="flex items-start gap-5 flex-1 min-w-0">
            {/* Bloco de Identidade: Ícone */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100 flex items-center justify-center w-12 h-12">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shadow-sm text-center">
                {formData.classification === 'OBRA' ? 'OBRA' : (formData.classification === 'PLANEJAMENTO' ? 'PLAN' : (formData.classification === 'DIARIO' ? 'DIAR' : 'BUDG'))}
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                  {mode === 'create'
                    ? ((formData.classification as string) === 'OBRA' ? 'Nova Obra' : (formData.classification as string) === 'PLANEJAMENTO' ? 'Novo Planejamento' : (formData.classification as string) === 'DIARIO' ? 'Novo Diário' : 'Novo Orçamento')
                    : ((formData.classification as string) === 'OBRA' ? 'Editar Obra' : (formData.classification as string) === 'PLANEJAMENTO' ? 'Editar Planejamento' : (formData.classification as string) === 'DIARIO' ? 'Editar Diário' : 'Editar Dados do Orçamento')}
                </h2>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-md border border-gray-200 shadow-sm">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Tipo:</span>
                  <span className="text-[10px] font-bold text-gray-600 uppercase">
                    {(formData.classification as string) === 'OBRA' ? 'Modelo / Obra Base' : (formData.classification as string) === 'PLANEJAMENTO' ? 'Escopo Temporal' : (formData.classification as string) === 'DIARIO' ? 'Controle de Campo' : 'Quantitativo'}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 font-medium leading-tight max-w-4xl">
                {mode === 'create'
                  ? `Configure os detalhes e a localização ${(formData.classification as string) === 'OBRA' ? 'da obra' : (formData.classification as string) === 'PLANEJAMENTO' ? 'do planejamento' : 'do orçamento'}.`
                  : `Atualize as informações ${(formData.classification as string) === 'OBRA' ? 'da obra selecionada' : (formData.classification as string) === 'PLANEJAMENTO' ? 'do planejamento selecionado' : 'do orçamento selecionado'}.`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs - Only show if NOT an 'OBRA' creation from Management */}
        {initialClassification !== 'OBRA' && (
          <div className="flex border-b border-gray-100">
            <button
              type="button"
              onClick={() => setActiveTab('technical')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'technical'
                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {(formData.classification as string) === 'DIARIO' ? 'Configurações do Diário' : 'Configurações Técnicas'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('select')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 flex items-center justify-center gap-2 relative ${activeTab === 'select'
                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {(formData.classification as string) === 'OBRA' ? 'Vincular Budgets' : (formData.classification as string) === 'PLANEJAMENTO' ? 'Vincular Obra / Orçamento' : 'Vincular Obra'}
              {linkedProjectId ? (
                <div className="absolute top-1 right-2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 border border-white shadow-sm"></span>
                </div>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('address')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'address'
                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              Localização e Status
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className={`flex-1 overflow-y-auto space-y-6 ${mode === 'edit' ? 'p-6' : 'p-12'}`}>

            {initialClassification === 'OBRA' ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Specialized Obra View - Combined Technical & Address */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {initialData ? 'Nome da Obra' : 'Nova Obra'}
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Ex: Prédio Residencial Vista Alegre"
                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Code field — always editable */}
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-blue-500" />
                      Código da Obra
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={isFetchingCode ? 'Carregando...' : '001'}
                        className="w-full rounded-lg border border-blue-200 bg-blue-50 p-2.5 font-mono font-bold text-blue-700 outline-none transition-all focus:ring-2 focus:ring-blue-500"
                        value={projectCode}
                        onChange={(e) => setProjectCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        maxLength={6}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {mode === 'create' ? 'Sugerido automaticamente. Você pode alterar antes de salvar.' : 'Você pode corrigir o código desta obra.'}
                    </p>
                  </div>

                  {/* Organization selector — visible when multiple orgs exist */}
                  {organizations.length > 1 && (
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                        Organização
                      </label>
                      <select
                        className="w-full rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-indigo-800 text-sm"
                        value={selectedOrgId || ''}
                        onChange={(e) => setSelectedOrgId(e.target.value || undefined)}
                      >
                        <option value="">Sem vínculo</option>
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Empresa do grupo — sempre visível quando há empresas cadastradas */}
                  {companies.length > 0 && (
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        Empresa Executora
                      </label>
                      <select
                        className="w-full rounded-lg border border-blue-200 bg-blue-50 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-blue-800 text-sm"
                        value={selectedEmpresaId || ''}
                        onChange={(e) => setSelectedEmpresaId(e.target.value || undefined)}
                      >
                        <option value="">Sem vínculo</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.nome_fantasia ?? c.razao_social}{c.cnpj ? ` — ${c.cnpj}` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">Empresa do grupo responsável por esta obra.</p>
                    </div>
                  )}

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente / Proprietário</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Ex: João Silva"
                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={formData.client}
                        onFocus={() => setIsClientListOpen(true)}
                        onBlur={() => setTimeout(() => setIsClientListOpen(false), 200)}
                        onChange={(e) => {
                          const val = e.target.value;
                          const client = clients.find(c => c.name === val);
                          if (client) {
                            setFormData({
                              ...formData,
                              client: val,
                              clientId: client.id,
                              street: client.address || formData.street,
                              neighborhood: client.neighborhood || formData.neighborhood,
                              city: client.city || formData.city,
                              state: client.state || formData.state
                            });
                          } else {
                            setFormData({ ...formData, client: val, clientId: undefined });
                          }
                        }}
                      />
                      <div className="absolute right-2 top-2.5 flex items-center gap-1">
                        {formData.client ? (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormData({ ...formData, client: '', clientId: undefined });
                              setIsClientListOpen(true);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                            title="Limpar seleção"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setIsClientListOpen(!isClientListOpen);
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isClientListOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>

                      {/* Custom Searchable Dropdown */}
                      {isClientListOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                          {clients.filter(c => c.name.toLowerCase().includes(formData.client.toLowerCase())).length > 0 ? (
                            clients
                              .filter(c => c.name.toLowerCase().includes(formData.client.toLowerCase()))
                              .map(client => (
                                <button
                                  key={client.id}
                                  type="button"
                                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm transition-colors border-b border-gray-50 last:border-0 flex flex-col"
                                  onClick={() => {
                                    setFormData({
                                      ...formData,
                                      client: client.name,
                                      clientId: client.id,
                                      street: client.address || formData.street,
                                      neighborhood: client.neighborhood || formData.neighborhood,
                                      city: client.city || formData.city,
                                      state: client.state || formData.state
                                    });
                                    setIsClientListOpen(false);
                                  }}
                                >
                                  <span className="font-bold text-gray-900">{client.name}</span>
                                  {client.email && <span className="text-[10px] text-gray-400">{client.email}</span>}
                                </button>
                              ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center italic">
                              Nenhum cliente encontrado.
                              <br />
                              <span className="text-xs text-blue-500 cursor-pointer hover:underline" onMouseDown={(e) => {
                                e.preventDefault();
                                setFormData({ ...formData, client: '', clientId: undefined });
                                setIsClientListOpen(true);
                              }}>
                                Limpar busca para ver todos
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Investidor Vinculado</label>
                    <div className="relative">
                      <TrendingUp className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Ex: Investidora ABC"
                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                        value={formData.investor || ''}
                        onFocus={() => setIsInvestorListOpen(true)}
                        onBlur={() => setTimeout(() => setIsInvestorListOpen(false), 200)}
                        onChange={(e) => {
                          const val = e.target.value;
                          const investor = investors.find(i => i.name === val);
                          if (investor) {
                            setFormData({
                              ...formData,
                              investor: val,
                              investorId: investor.id
                            });
                          } else {
                            setFormData({ ...formData, investor: val, investorId: undefined });
                          }
                        }}
                      />
                      <div className="absolute right-2 top-2.5 flex items-center gap-1">
                        {formData.investor ? (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setFormData({ ...formData, investor: '', investorId: undefined });
                              setIsInvestorListOpen(true);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                            title="Limpar seleção"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setIsInvestorListOpen(!isInvestorListOpen);
                            }}
                            className="p-1 text-gray-400 hover:text-purple-600 rounded-full hover:bg-purple-50 transition-colors"
                          >
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isInvestorListOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>

                      {/* Custom Searchable Dropdown for Investors */}
                      {isInvestorListOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                          {investors.filter(i => i.name.toLowerCase().includes((formData.investor || '').toLowerCase())).length > 0 ? (
                            investors
                              .filter(i => i.name.toLowerCase().includes((formData.investor || '').toLowerCase()))
                              .map(investor => (
                                <button
                                  key={investor.id}
                                  type="button"
                                  className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm transition-colors border-b border-gray-50 last:border-0 flex flex-col"
                                  onClick={() => {
                                    setFormData({
                                      ...formData,
                                      investor: investor.name,
                                      investorId: investor.id
                                    });
                                    setIsInvestorListOpen(false);
                                  }}
                                >
                                  <span className="font-bold text-gray-900">{investor.name}</span>
                                  {investor.email && <span className="text-[10px] text-gray-400">{investor.email}</span>}
                                </button>
                              ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center italic">
                              Nenhum investidor encontrado.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Localização da Obra
                  </h3>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-9">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rua / Logradouro</label>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nº</label>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.number}
                        onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                      />
                    </div>
                    <div className="col-span-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.neighborhood}
                        onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      />
                    </div>
                    <div className="col-span-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                      <select
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value, state: e.target.value })}
                      >
                        <option value="">UF</option>
                        {Object.keys(BASE_CUB_RATES).sort().map(uf => (
                          <option key={uf} value={uf}>{uf}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                      <input
                        type="text"
                        placeholder="00000-000"
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.zipCode}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Tipo, Regime e Status */}
                <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-500" />
                      Tipo de Obra
                    </label>
                    <select
                      className="w-full rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-blue-900"
                      value={formData.tipoObra || ''}
                      onChange={(e) => {
                        const novoTipo = (e.target.value as TipoObra) || undefined;
                        setFormData({
                          ...formData,
                          tipoObra: novoTipo,
                          technicalConfig: novoTipo ? { tipo: novoTipo } as TechnicalConfig : undefined,
                        });
                      }}
                    >
                      <option value="">Selecione o tipo de obra...</option>
                      {(Object.keys(TIPO_OBRA_LABELS) as TipoObra[]).map(k => (
                        <option key={k} value={k}>{TIPO_OBRA_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Regime de Contratação</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-sm"
                      value={formData.regimeObra || ''}
                      onChange={(e) => setFormData({ ...formData, regimeObra: (e.target.value as RegimeObra) || undefined })}
                    >
                      <option value="">Selecione o regime...</option>
                      {(Object.keys(REGIME_OBRA_LABELS) as RegimeObra[]).map(k => (
                        <option key={k} value={k}>{REGIME_OBRA_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status da Obra</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-sm"
                      value={formData.obraStatus || 'Não Iniciado'}
                      onChange={(e) => setFormData({ ...formData, obraStatus: e.target.value as any })}
                    >
                      <option value="Não Iniciado">Não Iniciado</option>
                      <option value="Em andamento">Em andamento</option>
                      <option value="Paralisada">Paralisada</option>
                      <option value="Concluída">Concluída</option>
                    </select>
                  </div>
                </div>

                {/* Dados Técnicos Dinâmicos por Tipo de Obra */}
                {formData.tipoObra && formData.tipoObra !== 'outro' && (
                  <div className="border border-blue-100 rounded-xl bg-blue-50/30 p-5 space-y-4">
                    <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      Dados Técnicos — {TIPO_OBRA_LABELS[formData.tipoObra]}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">

                      {/* Residencial Multifamiliar */}
                      {formData.tipoObra === 'residencial_multifamiliar' && (<>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nº Pavimentos</label>
                          <input type="number" min={1} placeholder="Ex: 12"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.numeroPavimentos || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'residencial_multifamiliar', numeroPavimentos: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nº Torres</label>
                          <input type="number" min={1} placeholder="Ex: 2"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.numeroTorres || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'residencial_multifamiliar', numeroTorres: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nº Unidades</label>
                          <input type="number" min={1} placeholder="Ex: 48"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.numeroUnidades || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'residencial_multifamiliar', numeroUnidades: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Área Construída Total (m²)</label>
                          <input type="number" min={0} placeholder="Ex: 4200"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.areaConstruidaTotal || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'residencial_multifamiliar', areaConstruidaTotal: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo Estrutural</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            value={(formData.technicalConfig as any)?.tipoEstrutural || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'residencial_multifamiliar', tipoEstrutural: e.target.value || undefined } })}
                          >
                            <option value="">Selecione...</option>
                            <option value="concreto_armado">Concreto Armado</option>
                            <option value="metalica">Estrutura Metálica</option>
                            <option value="alvenaria_estrutural">Alvenaria Estrutural</option>
                          </select>
                        </div>
                      </>)}

                      {/* Casa Residencial */}
                      {formData.tipoObra === 'casa' && (<>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Área do Terreno (m²)</label>
                          <input type="number" min={0} placeholder="Ex: 360"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.areaTerreno || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'casa', areaTerreno: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Área Construída (m²)</label>
                          <input type="number" min={0} placeholder="Ex: 180"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.areaConstruida || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'casa', areaConstruida: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nº Pavimentos</label>
                          <input type="number" min={1} placeholder="Ex: 2"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.numeroPavimentos || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'casa', numeroPavimentos: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={!!(formData.technicalConfig as any)?.condominioFechado}
                              onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'casa', condominioFechado: e.target.checked } })}
                            />
                            Condomínio fechado
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={!!(formData.technicalConfig as any)?.piscina}
                              onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'casa', piscina: e.target.checked } })}
                            />
                            Piscina
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={!!(formData.technicalConfig as any)?.energiaSolar}
                              onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'casa', energiaSolar: e.target.checked } })}
                            />
                            Energia Solar
                          </label>
                        </div>
                      </>)}

                      {/* Loja Comercial */}
                      {formData.tipoObra === 'loja' && (<>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Localidade</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            value={(formData.technicalConfig as any)?.localidade || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'loja', localidade: e.target.value || undefined } })}
                          >
                            <option value="">Selecione...</option>
                            <option value="shopping">Shopping Center</option>
                            <option value="rua">Rua / Galeria</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Data de Inauguração</label>
                          <input type="date"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.dataInauguracao || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'loja', dataInauguracao: e.target.value || undefined } })}
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-6 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={!!(formData.technicalConfig as any)?.trabalhoNoturno}
                              onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'loja', trabalhoNoturno: e.target.checked } })}
                            />
                            Trabalho noturno permitido
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={!!(formData.technicalConfig as any)?.marcenariaCorporativa}
                              onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'loja', marcenariaCorporativa: e.target.checked } })}
                            />
                            Marcenaria corporativa
                          </label>
                        </div>
                      </>)}

                      {/* Sala Comercial */}
                      {formData.tipoObra === 'sala' && (<>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Ocupação</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            value={(formData.technicalConfig as any)?.tipoOcupacao || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'sala', tipoOcupacao: e.target.value || undefined } })}
                          >
                            <option value="">Selecione...</option>
                            <option value="escritorio">Escritório Corporativo</option>
                            <option value="clinica">Clínica / Consultório</option>
                            <option value="coworking">Coworking</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
                          {[
                            { key: 'pisoElevado', label: 'Piso elevado' },
                            { key: 'forroModular', label: 'Forro modular' },
                            { key: 'cabeamentoEstruturado', label: 'Cabeamento estruturado' },
                            { key: 'cpd', label: 'CPD / Data room' },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                              <input type="checkbox"
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={!!(formData.technicalConfig as any)?.[key]}
                                onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'sala', [key]: e.target.checked } })}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </>)}

                      {/* Galpão */}
                      {formData.tipoObra === 'galpao' && (<>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Área Total (m²)</label>
                          <input type="number" min={0} placeholder="Ex: 5000"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.areaTotal || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'galpao', areaTotal: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Pé Direito (m)</label>
                          <input type="number" min={0} step={0.5} placeholder="Ex: 8"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.peDireito || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'galpao', peDireito: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Estrutura</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            value={(formData.technicalConfig as any)?.tipoEstrutura || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'galpao', tipoEstrutura: e.target.value || undefined } })}
                          >
                            <option value="">Selecione...</option>
                            <option value="pre_moldado">Pré-moldado</option>
                            <option value="metalica">Estrutura Metálica</option>
                            <option value="concreto">Concreto In Loco</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nº de Docas</label>
                          <input type="number" min={0} placeholder="Ex: 4"
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={(formData.technicalConfig as any)?.numeroDOcas || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'galpao', numeroDOcas: Number(e.target.value) || undefined } })}
                          />
                        </div>
                        <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
                          {[
                            { key: 'ponteRolante', label: 'Ponte rolante' },
                            { key: 'subestacao', label: 'Subestação elétrica' },
                            { key: 'sprinklers', label: 'Sprinklers' },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
                              <input type="checkbox"
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={!!(formData.technicalConfig as any)?.[key]}
                                onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'galpao', [key]: e.target.checked } })}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </>)}

                      {/* Reforma */}
                      {formData.tipoObra === 'reforma' && (
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Descrição do Escopo</label>
                          <textarea rows={2} placeholder="Descreva o escopo principal da reforma..."
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            value={(formData.technicalConfig as any)?.descricao || ''}
                            onChange={(e) => setFormData({ ...formData, technicalConfig: { ...(formData.technicalConfig as any), tipo: 'reforma', descricao: e.target.value } })}
                          />
                        </div>
                      )}

                    </div>
                  </div>
                )}

                {/* Datas Reais */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Datas
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Início Previsto</label>
                      <input type="date" className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.startDate || ''}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Término Previsto</label>
                      <input type="date" className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.endDate || ''}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Início Real</label>
                      <input type="date" className="w-full rounded-lg border border-emerald-300 bg-emerald-50/30 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={formData.startDateReal || ''}
                        onChange={(e) => setFormData({ ...formData, startDateReal: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Término Real</label>
                      <input type="date" className="w-full rounded-lg border border-emerald-300 bg-emerald-50/30 p-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={formData.endDateReal || ''}
                        onChange={(e) => setFormData({ ...formData, endDateReal: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Gestão Financeira */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Gestão Financeira
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Modalidade</label>
                      <select
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        value={formData.modalidade || ''}
                        onChange={(e) => setFormData({ ...formData, modalidade: (e.target.value as any) || undefined })}
                      >
                        <option value="">Selecione...</option>
                        <option value="privada">Privada</option>
                        <option value="publica">Pública (Licitação)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Margem Alvo (%)</label>
                      <input
                        type="number" min={0} max={100} step={0.5} placeholder="Ex: 18"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.margemAlvo ?? ''}
                        onChange={(e) => setFormData({ ...formData, margemAlvo: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Valor Estimado (R$)</label>
                      <input
                        type="number" min={0} step={1000} placeholder="Ex: 2500000"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.valorEstimado ?? ''}
                        onChange={(e) => setFormData({ ...formData, valorEstimado: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Valor Contratado (R$)</label>
                      <input
                        type="number" min={0} step={1000} placeholder="Ex: 2350000"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.valorContratado ?? ''}
                        onChange={(e) => setFormData({ ...formData, valorContratado: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </div>
                  </div>
                </div>

                {/* Equipe de Campo */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Equipe de Campo
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { key: 'mestreObras', label: 'Mestre de Obras' },
                      { key: 'encarregado', label: 'Encarregado' },
                      { key: 'tecnicoSeguranca', label: 'Técnico de Segurança' },
                      { key: 'almoxarife', label: 'Almoxarife' },
                    ] as { key: keyof NewProjectData; label: string }[]).map(({ key, label }) => (
                      <EmployeeCombobox
                        key={key}
                        label={label}
                        value={(formData[key] as string) || ''}
                        employees={employees}
                        onChange={(val) => setFormData({ ...formData, [key]: val })}
                      />
                    ))}
                  </div>
                </div>

                {/* Registro Documental */}
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Registro Documental
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">ART/RRT nº</label>
                      <input
                        type="text" placeholder="Número da ART"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.artRrt || ''}
                        onChange={(e) => setFormData({ ...formData, artRrt: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Alvará nº</label>
                      <input
                        type="text" placeholder="Número do Alvará"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.alvara || ''}
                        onChange={(e) => setFormData({ ...formData, alvara: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Matrícula CNO</label>
                      <input
                        type="text" placeholder="Número CNO"
                        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.matriculaCNO || ''}
                        onChange={(e) => setFormData({ ...formData, matriculaCNO: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Documentos obrigatórios pelo tipo de obra */}
                  {formData.tipoObra && (
                    <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3">
                        Documentação exigida — {TIPO_OBRA_LABELS[formData.tipoObra]}
                      </p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {REQUIRED_DOCS_BY_TYPE[formData.tipoObra].map((doc) => (
                          <div key={doc.name} className="flex items-center gap-2 text-sm">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${doc.required ? 'bg-red-500' : 'bg-gray-400'}`} />
                            <span className={doc.required ? 'text-gray-800 font-medium' : 'text-gray-500'}>
                              {doc.name}
                            </span>
                            {!doc.required && (
                              <span className="text-[10px] text-gray-400 font-medium">(se aplicável)</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-600 mt-3">
                        Ponto vermelho = obrigatório · Cinza = condicional
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea
                    placeholder="Informações adicionais..."
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  ></textarea>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'select' ? (
                  <div className="space-y-4 animate-in slide-in-from-right-2 duration-200 pb-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar obra pelo nome ou cliente..."
                        className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[40vh] overflow-y-auto">
                      {projects.filter(p =>
                        ((p.settings?.classification === 'OBRA') || (formData.classification === 'PLANEJAMENTO' && p.settings?.classification === 'ORCAMENTO')) &&
                        (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.settings?.client || '').toLowerCase().includes(searchTerm.toLowerCase()))
                      ).length === 0 ? (
                        <div className="p-8 text-center text-gray-500 italic text-sm">
                          Nenhuma obra cadastrada encontrada.
                        </div>
                      ) : (
                        <table className="w-full text-left">
                          <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-400">
                            <tr>
                              <th className="px-4 py-2">Projeto / Recurso</th>
                              <th className="px-4 py-2">Tipo</th>
                              <th className="px-4 py-2">Cliente</th>
                              <th className="px-4 py-2">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 italic">
                            {projects.filter(p =>
                              ((p.settings?.classification === 'OBRA') || (formData.classification === 'PLANEJAMENTO' && p.settings?.classification === 'ORCAMENTO')) &&
                              (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (p.settings?.client || '').toLowerCase().includes(searchTerm.toLowerCase()))
                            ).map(p => (
                              <tr key={p.id} className={`transition-all duration-200 ${linkedProjectId === p.id ? 'bg-green-50 ring-1 ring-inset ring-green-200' : 'hover:bg-blue-50/50'}`}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className={`font-bold text-sm ${linkedProjectId === p.id ? 'text-green-800' : 'text-gray-700'}`}>{p.name}</div>
                                    {linkedProjectId === p.id && (
                                      <span className="text-[9px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm">Vinculado</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${p.settings?.classification === 'OBRA' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {p.settings?.classification === 'OBRA' ? 'Obra' : 'Orçamento'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                  {p.settings?.client || '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {linkedProjectId === p.id ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLinkedProjectId(null);
                                        setFormData(prev => ({
                                          ...prev,
                                          linkedProjectId: undefined,
                                          linkedProjectName: undefined
                                        }));
                                      }}
                                      className="text-xs font-black uppercase px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-all border border-red-200 shadow-sm"
                                    >
                                      Desvincular
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (p.settings?.classification === 'OBRA' && formData.classification === 'ORCAMENTO') {
                                          const jaVinculado = projects.filter(proj =>
                                            (proj.settings?.classification === 'ORCAMENTO' || !proj.settings?.classification) &&
                                            !proj.code && !proj.settings?.code &&
                                            (proj.settings?.linkedProjectId === p.id || proj.settings?.linkedProjectName === p.name) &&
                                            proj.id !== initialData?.id
                                          );
                                          if (jaVinculado.length > 0) {
                                            alert(`A obra "${p.name}" já possui o orçamento "${jaVinculado[0].name}" vinculado. Cada obra pode ter no máximo um orçamento vinculado.`);
                                            return;
                                          }
                                        }
                                        setFormData({
                                          ...formData,
                                          name: formData.classification === 'PLANEJAMENTO' ? formData.name : p.name,
                                          client: p.settings?.client || '',
                                          clientId: p.settings?.clientId,
                                          location: p.settings?.location || 'SP',
                                          standard: p.settings?.standard || 'R8-N',
                                          area: p.settings?.area || 100,
                                          street: p.settings?.street || '',
                                          number: p.settings?.number || '',
                                          complement: p.settings?.complement || '',
                                          neighborhood: p.settings?.neighborhood || '',
                                          city: p.settings?.city || '',
                                          state: p.settings?.state || 'SP',
                                          zipCode: p.settings?.zipCode || '',
                                          notes: p.settings?.notes || '',
                                          database: p.settings?.database || 'SINAPI',
                                          referenceMonth: p.settings?.referenceMonth || '01/2025',
                                          socialChargesMode: p.settings?.socialChargesMode || 'Com Desoneração',
                                          bdi: p.settings?.bdi || 25.0,
                                          linkedProjectId: p.id,
                                          linkedProjectName: p.name,
                                          budgetType: formData.budgetType || p.settings?.budgetType || 'ANALYTIC',
                                          startDate: formData.startDate || p.settings?.startDate,
                                          endDate: formData.endDate || p.settings?.endDate
                                        });
                                        setLinkedProjectId(p.id);
                                        setActiveTab('technical');
                                      }}
                                      className="text-xs font-black uppercase px-2 py-1 rounded text-blue-600 hover:bg-blue-100 transition-all"
                                    >
                                      Vincular
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">Selecione uma obra acima para herdar suas configurações e dados básicos.</p>
                  </div>
                ) : activeTab === 'technical' ? (
                  <div className="space-y-4 animate-in slide-in-from-left-2 duration-200 pb-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {(formData.classification as string) === 'OBRA' ? 'Nome da Obra' : (formData.classification as string) === 'PLANEJAMENTO' ? 'Nome do Planejamento' : (formData.classification as string) === 'DIARIO' ? 'Nome do Diário' : 'Nome do Orçamento'}
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            placeholder={(formData.classification as string) === 'OBRA' ? "Ex: Modelo de Prédio Residencial" : (formData.classification as string) === 'PLANEJAMENTO' ? "Ex: Cronograma Previsto - Jan/2026" : (formData.classification as string) === 'DIARIO' ? "Ex: Diário da Equipe de Pintura" : "Ex: Residencial Vista Alegre"}
                            className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div>
                        {(formData.classification !== 'DIARIO' && formData.classification !== 'PLANEJAMENTO') && (
                          <>
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <input
                                type="checkbox"
                                id="is-obra-base"
                                checked={(formData.classification as string) === 'OBRA'}
                                onChange={(e) => {
                                  setFormData({ ...formData, classification: e.target.checked ? 'OBRA' : 'ORCAMENTO' });
                                }}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                              <label htmlFor="is-obra-base" className="text-sm text-gray-700 font-medium select-none cursor-pointer">
                                {formData.classification === 'OBRA' ? 'Cadastrar como Obra / Modelo' : 'Cadastrar como Orçamento'}
                              </label>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-1">
                              Marque para salvar como um modelo reutilizável.
                            </p>
                          </>
                        )}
                        {(formData.classification === 'DIARIO' || formData.classification === 'PLANEJAMENTO') && (
                          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100/50">
                            <p className="text-sm font-bold text-blue-800">
                              {formData.classification === 'DIARIO' ? 'Diário de Obra Ativo' : 'Planejamento Ativo'}
                            </p>
                            <p className="text-xs text-blue-600">Este registro gerencia dados dinâmicos do projeto.</p>
                          </div>
                        )}
                      </div>
                      {/* Organization selector — full-width row when multiple orgs exist */}
                      {organizations.length > 1 && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                            Organização
                          </label>
                          <select
                            className="w-full rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-indigo-800 text-sm"
                            value={selectedOrgId || ''}
                            onChange={(e) => setSelectedOrgId(e.target.value || undefined)}
                          >
                            <option value="">Sem vínculo</option>
                            {organizations.map(org => (
                              <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Empresa executora — visível quando há empresas do grupo */}
                      {companies.length > 0 && (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-500" />
                            Empresa Executora
                          </label>
                          <select
                            className="w-full rounded-lg border border-blue-200 bg-blue-50 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-blue-800 text-sm"
                            value={selectedEmpresaId || ''}
                            onChange={(e) => setSelectedEmpresaId(e.target.value || undefined)}
                          >
                            <option value="">Sem vínculo</option>
                            {companies.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.nome_fantasia ?? c.razao_social}{c.cnpj ? ` — ${c.cnpj}` : ''}
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-gray-400 mt-1">Empresa do grupo responsável por esta obra.</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cliente / Proprietário
                          {(formData.classification === 'ORCAMENTO' || formData.classification === 'PLANEJAMENTO' || formData.classification === 'DIARIO') && (
                            <span className="ml-2 text-[10px] text-amber-600 font-bold uppercase tracking-tight bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                              Herdado da Obra
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            placeholder={formData.classification === 'OBRA' ? "Ex: João Silva" : "Vincule uma obra para definir o cliente"}
                            readOnly={formData.classification === 'ORCAMENTO' || formData.classification === 'PLANEJAMENTO' || formData.classification === 'DIARIO'}
                            className={`pl-10 w-full rounded-lg border border-gray-300 p-2.5 outline-none transition-all ${formData.classification === 'ORCAMENTO' || formData.classification === 'PLANEJAMENTO' || formData.classification === 'DIARIO'
                              ? 'bg-gray-50 text-gray-500 cursor-not-allowed border-dashed'
                              : 'focus:ring-2 focus:ring-blue-500'
                              }`}
                            value={formData.client}
                            onFocus={() => setIsClientListOpen(true)}
                            onBlur={() => setTimeout(() => setIsClientListOpen(false), 200)}
                            onChange={(e) => {
                              if (formData.classification === 'ORCAMENTO') return;
                              const val = e.target.value;
                              const client = clients.find(c => c.name === val);
                              if (client) {
                                setFormData({
                                  ...formData,
                                  client: val,
                                  clientId: client.id,
                                  street: client.address || formData.street,
                                  neighborhood: client.neighborhood || formData.neighborhood,
                                  city: client.city || formData.city,
                                  state: client.state || formData.state
                                });
                              } else {
                                setFormData({ ...formData, client: val, clientId: undefined });
                              }
                            }}
                          />

                          {/* Custom Searchable Dropdown for Standard View */}
                          {isClientListOpen && formData.classification !== 'ORCAMENTO' && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                              {clients.filter(c => c.name.toLowerCase().includes(formData.client.toLowerCase())).length > 0 ? (
                                clients
                                  .filter(c => c.name.toLowerCase().includes(formData.client.toLowerCase()))
                                  .map(client => (
                                    <button
                                      key={client.id}
                                      type="button"
                                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm transition-colors border-b border-gray-50 last:border-0 flex flex-col"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          client: client.name,
                                          clientId: client.id,
                                          street: client.address || formData.street,
                                          neighborhood: client.neighborhood || formData.neighborhood,
                                          city: client.city || formData.city,
                                          state: client.state || formData.state
                                        });
                                        setIsClientListOpen(false);
                                      }}
                                    >
                                      <span className="font-bold text-gray-900">{client.name}</span>
                                      {client.email && <span className="text-[10px] text-gray-400">{client.email}</span>}
                                    </button>
                                  ))
                              ) : (
                                <div className="px-4 py-3 text-sm text-gray-500 text-center italic">
                                  Nenhum cliente encontrado
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {formData.classification === 'ORCAMENTO' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Orçamento</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                            value={formData.budgetType || 'ANALYTIC'}
                            onChange={(e) => setFormData({ ...formData, budgetType: e.target.value as any })}
                          >
                            <option value="ANALYTIC">Orçamento Analítico</option>
                            <option value="PARAMETRIC">Orçamento Paramétrico</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Base de Dados</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                            value={formData.database}
                            onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                          >
                            <option value="SINAPI">SINAPI</option>
                            <option value="Própria">Própria</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {formData.classification === 'PLANEJAMENTO' && (
                      <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Data de Início</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                              type="date"
                              className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                              value={formData.startDate}
                              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Data de Término</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                              type="date"
                              className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                              value={formData.endDate}
                              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Equipe Responsável</label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Ex: Equipe de Engenharia / Terceiros"
                              className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                              value={formData.responsibleTeam}
                              onChange={(e) => setFormData({ ...formData, responsibleTeam: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {formData.classification !== 'PLANEJAMENTO' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value, state: e.target.value })}
                          >
                            <option value="">UF</option>
                            {Object.keys(BASE_CUB_RATES).sort().map(uf => (
                              <option key={uf} value={uf}>{uf}</option>
                            ))}
                          </select>
                        </div>
                        {formData.classification !== 'OBRA' && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Referência</label>
                            <select
                              className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                              value={formData.referenceMonth}
                              onChange={(e) => setFormData({ ...formData, referenceMonth: e.target.value })}
                            >
                              {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => (
                                <option key={m} value={`${m}/2025`}>{m}/2025</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {formData.classification !== 'OBRA' && formData.classification !== 'PLANEJAMENTO' && formData.classification !== 'DIARIO' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Encargos Sociais</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                            value={formData.socialChargesMode}
                            onChange={(e) => setFormData({ ...formData, socialChargesMode: e.target.value })}
                          >
                            <option value="Sem Desoneração">Sem Desoneração</option>
                            <option value="Com Desoneração">Com Desoneração</option>
                            <option value="Sem Encargos Sociais">Sem Encargos Sociais</option>
                          </select>
                        </div>
                        <div className={formData.budgetType === 'PARAMETRIC' ? 'col-span-1 border-blue-100' : 'col-span-1 border-blue-200'}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">BDI Padrão (%)</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                              value={formData.bdi}
                              onChange={(e) => setFormData({ ...formData, bdi: Number(e.target.value) })}
                            />
                            <span className="absolute right-3 top-3 text-gray-400 text-xs">%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {formData.budgetType === 'PARAMETRIC' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Área Estimada (m²)</label>
                          <div className="relative">
                            <Ruler className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                            <input
                              type="number"
                              min="1"
                              className="pl-10 w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                              value={formData.area}
                              onChange={(e) => setFormData({ ...formData, area: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Padrão (CUB)</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-sm"
                            value={formData.standard}
                            onChange={(e) => setFormData({ ...formData, standard: e.target.value })}
                          >
                            {Object.entries(CUB_STANDARDS_DATA).map(([key, data]) => (
                              <option key={key} value={key}>{data.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Opção de Salvamento Automático */}
                    <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 mt-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${formData.autoSave ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                          <Cloud className={`w-5 h-5 ${formData.autoSave ? 'animate-pulse' : ''}`} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-800">Salvamento Automático</h4>
                          <p className="text-xs text-gray-500">Sincroniza alterações na nuvem em tempo real.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, autoSave: !formData.autoSave })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-2 ring-offset-2 ${formData.autoSave ? 'bg-blue-600 ring-blue-500' : 'bg-gray-200 ring-transparent'
                          }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.autoSave ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in slide-in-from-right-2 duration-200 pb-2">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro / Rua</label>
                        <input
                          type="text"
                          placeholder="Rua, Avenida..."
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={formData.street}
                          onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                        <input
                          type="text"
                          placeholder="Ex: 123"
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={formData.number}
                          onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                        <input
                          type="text"
                          placeholder="Apto, Bloco, Sala..."
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={formData.complement}
                          onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                        <input
                          type="text"
                          placeholder="Nome do bairro"
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={formData.neighborhood}
                          onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-5">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                        <input
                          type="text"
                          placeholder="Ex: São Paulo"
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                        <select
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value, location: e.target.value })}
                        >
                          <option value="">UF</option>
                          {Object.keys(BASE_CUB_RATES).sort().map(uf => (
                            <option key={uf} value={uf}>{uf}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                        <input
                          type="text"
                          placeholder="00000-000"
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                          value={formData.zipCode}
                          onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {formData.classification !== 'OBRA' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Status do Orçamento</label>
                          <select
                            className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-sm"
                            value={formData.budgetStatus || 'Em Andamento'}
                            onChange={(e) => setFormData({ ...formData, budgetStatus: e.target.value as any })}
                          >
                            <option value="Em Andamento">Em Andamento</option>
                            <option value="Fechado">Fechado</option>
                          </select>
                        </div>
                      )}
                      <div className={(formData.classification as string) === 'OBRA' ? 'col-span-2' : ''}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status da Obra</label>
                        <select
                          className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-sm"
                          value={formData.obraStatus || 'Não Iniciado'}
                          onChange={(e) => setFormData({ ...formData, obraStatus: e.target.value as any })}
                        >
                          <option value="Não Iniciado">Não Iniciado</option>
                          <option value="Em andamento">Em andamento</option>
                          <option value="Concluída">Concluída</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                      <textarea
                        placeholder="Informações adicionais..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      ></textarea>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>

          {/* Footer - Standard Style */}
          <div className={`bg-gray-50 border-t border-gray-100 flex items-center shrink-0 ${mode === 'edit' ? 'px-6 py-4 justify-end gap-2' : 'px-12 py-8 justify-between'}`}>
            {mode !== 'edit' && (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-white px-3 py-1.5 rounded-full border border-gray-200 italic shadow-sm">
                <Cloud className="w-3.5 h-3.5" />
                Sincronização ativa: {formData.referenceMonth} ({formData.state || 'Geral'})
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-8 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Salvando...' : mode === 'create'
                  ? (formData.classification === 'OBRA' ? 'Criar Obra' : formData.classification === 'PLANEJAMENTO' ? 'Criar Planejamento' : 'Criar Orçamento')
                  : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </form>
      </div >
    </div >
  );
};

export default ProjectModal;