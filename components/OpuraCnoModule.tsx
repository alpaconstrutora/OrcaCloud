import React from 'react';
import ActionIconButton from './ui/ActionIconButton';
import {
  Building2,
  ShieldAlert,
  Calculator,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Percent,
  DollarSign,
  Loader2,
  Download,
  FileText,
  Zap,
  Plus,
  RefreshCw,
  FolderOpen,
  Link2,
  UploadCloud,
  Paperclip
} from 'lucide-react';
import { cnoService } from '../services/cnoService';
import { useStore } from '../store/useStore';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { KpiCard } from './ui/KpiCard';
import Breadcrumb from './ui/Breadcrumb';
import { DocumentPicker } from './ui/DocumentPicker';
import { SeroAreasManager } from './SeroAreasManager';
import { SeroMemorySimulator } from './SeroMemorySimulator';
import { SeroReductionsManager } from './SeroReductionsManager';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import {
  OpuraCnoRegistration,
  OpuraCnoSimulation,
  OpuraCnoDeduction,
  OpuraCnoComplianceScore,
  OpuraCnoDctfweb,
  OpuraCnoDocument,
  OpuraCnoDocumentBloco,
  CNO_DOCUMENT_CATALOG
} from '../types';
import type { OpuraDocument } from '../types/documents';

// §2 — colunas da tela de seleção de obra. Sem coluna `actions`: a única ação da
// tela (abrir a previdência da obra) é a própria linha — ver §9.1.
const PROJECT_COLUMNS: ColumnConfig[] = [
  { key: 'obra',    label: 'Obra',    sortable: true },
  { key: 'codigo',  label: 'Código',  sortable: true },
  { key: 'cliente', label: 'Cliente', sortable: true },
  { key: 'local',   label: 'Local',   sortable: true },
  { key: 'area',    label: 'Área',    sortable: true },
  { key: 'status',  label: 'Status',  sortable: true },
];

// §8 — status da obra em texto colorido simples (sem pílula/fundo/uppercase)
const OBRA_STATUS_COLORS: Record<string, string> = {
  'Em andamento': 'text-blue-600',
  'Concluída':    'text-emerald-600',
  'Paralisada':   'text-red-600',
  'Não Iniciado': 'text-gray-600',
};

interface OpuraCnoModuleProps {
  activeOrganizationId: string | null;
  projectId: string | null;
  onChangeView: (view: string) => void;
}

export const OpuraCnoModule: React.FC<OpuraCnoModuleProps> = ({
  activeOrganizationId,
  projectId: initialProjectId,
  onChangeView
}) => {
  const { projects, projectsLoading, organizations, fetchProjects, session } = useStore();
  const confirm = useConfirm();
  const userEmail = session?.user?.email;
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'cadastro' | 'areas' | 'pre_moldados' | 'simulador' | 'deducoes' | 'dctfweb' | 'dossie'>('dashboard');

  // Toast de notificação (§13 do guia — substitui os alert() nativos)
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  }, []);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(initialProjectId);

  // §3 — busca persistida + colunas da tela de seleção de obra
  const [projectSearch, setProjectSearch] = usePersistedState<string>('opuraCno:projectSearch', '');
  const projectColumns = useTableColumns(PROJECT_COLUMNS, 'opuraCnoProjectColumns');

  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Estados dos dados reais
  const [registration, setRegistration] = React.useState<OpuraCnoRegistration | null>(null);
  const [simulations, setSimulations] = React.useState<OpuraCnoSimulation[]>([]);
  const [deductions, setDeductions] = React.useState<OpuraCnoDeduction[]>([]);
  const [score, setScore] = React.useState<OpuraCnoComplianceScore | null>(null);
  const [dctfwebList, setDctfwebList] = React.useState<OpuraCnoDctfweb[]>([]);

  // Estado do formulário de DCTFWeb / DARF
  const [dctfForm, setDctfForm] = React.useState({
    declaration_number: '',
    transmission_date: '',
    principal_amount: '',
    fine_amount: '',
    interest_amount: ''
  });

  // Checklist documental (aba Dossiê Digital)
  const [cnoDocuments, setCnoDocuments] = React.useState<OpuraCnoDocument[]>([]);
  const [docSheetOpen, setDocSheetOpen] = React.useState(false);
  const [editingDoc, setEditingDoc] = React.useState<OpuraCnoDocument | null>(null);
  const [docBusy, setDocBusy] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [pendingLink, setPendingLink] = React.useState<OpuraDocument | null>(null);
  const emptyDocForm = {
    bloco: 'obra' as OpuraCnoDocumentBloco,
    tipo_documento: '',
    titulo: '',
    referente_a: '',
    numero: '',
    data_emissao: '',
    data_validade: '',
    obrigatorio: false,
    notas: ''
  };
  const [docForm, setDocForm] = React.useState(emptyDocForm);

  // Estados do formulário de cadastro
  const [cnoForm, setCnoForm] = React.useState({
    cno_number: '',
    status: 'rascunho' as OpuraCnoRegistration['status'],
    data_abertura: '',
    data_encerramento: '',
    matricula_imovel: '',
    alvara_numero: '',
    area_aprovada: 0,
    area_real: 0,
    padrao_construtivo: 'normal' as OpuraCnoRegistration['padrao_construtivo'],
    tipo_obra: '',
    responsavel_tipo: 'construtor' as OpuraCnoRegistration['responsavel_tipo'],
    art_rrt: '',
    sero_category: 'obra_nova' as any,
    sero_destination: 'residencial_multifamiliar' as any,
    sero_type: 'alvenaria' as any,
    vau_value: 0,
    used_pre_mixed_concrete: false
  });

  // Estados do formulário de simulação
  const [simForm, setSimForm] = React.useState({
    scenario_name: 'Simulação Inicial',
    state: 'SP',
    reference_date: '2026-02',
    social_charges: 'sem_desoneracao' as 'com_desoneracao' | 'sem_desoneracao',
    area_construida: 1000,
    padrao: 'normal' as 'baixo' | 'normal' | 'alto',
    metodo_construtivo: 'convencional' as OpuraCnoSimulation['metodo_construtivo'],
    regime_contratacao: 'equipe_propria' as OpuraCnoSimulation['regime_contratacao']
  });

  const [activeSimResult, setActiveSimResult] = React.useState<{
    custoEstimadoObra: number;
    baseCalculoMaoObra: number;
    inssPatronalEstimado: number;
    economiaMetodoConstrutivo: number;
    inssFinalEstimado: number;
    cubValor: number;
  } | null>(null);

  // Carregar dados
  const loadData = React.useCallback(async (projId: string) => {
    setLoading(true);
    try {
      const reg = await cnoService.getRegistrationByProject(projId);
      setRegistration(reg);
      if (reg) {
        setCnoForm({
          cno_number: reg.cno_number || '',
          status: reg.status,
          data_abertura: reg.data_abertura || '',
          data_encerramento: reg.data_encerramento || '',
          matricula_imovel: reg.matricula_imovel || '',
          alvara_numero: reg.alvara_numero || '',
          area_aprovada: reg.area_aprovada,
          area_real: reg.area_real,
          padrao_construtivo: reg.padrao_construtivo || 'normal',
          tipo_obra: reg.tipo_obra || '',
          responsavel_tipo: reg.responsavel_tipo || 'construtor',
          art_rrt: reg.art_rrt || '',
          sero_category: reg.sero_category || 'obra_nova',
          sero_destination: reg.sero_destination || 'residencial_multifamiliar',
          sero_type: reg.sero_type || 'alvenaria',
          vau_value: reg.vau_value || 0,
          used_pre_mixed_concrete: reg.used_pre_mixed_concrete || false
        });

        // Declarações DCTFWeb e checklist documental dependem de um CNO cadastrado
        const dctf = await cnoService.listDctfweb(reg.id);
        setDctfwebList(dctf);

        const docs = await cnoService.listDocuments(reg.id);
        setCnoDocuments(docs);
      } else {
        setDctfwebList([]);
        setCnoDocuments([]);
      }

      const sims = await cnoService.listSimulations(projId);
      setSimulations(sims);

      const deds = await cnoService.listDeductions(projId);
      setDeductions(deds);

      // Recalcular ou buscar o compliance score
      const compliance = await cnoService.getComplianceScore(projId);
      setScore(compliance);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao carregar dados do projeto:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedProjectId) {
      loadData(selectedProjectId);
    }
  }, [selectedProjectId, loadData]);

  // Executar simulação de INSS (Calculadora)
  const handleRunSimulation = async () => {
    if (!selectedProjectId) return;
    setActionLoading(true);
    try {
      const result = await cnoService.calculateSimulation({
        projectId: selectedProjectId,
        state: simForm.state,
        referenceDate: simForm.reference_date,
        socialCharges: simForm.social_charges,
        areaConstruida: simForm.area_construida,
        padrao: simForm.padrao,
        metodoConstrutivo: simForm.metodo_construtivo as any,
        regimeContratacao: simForm.regime_contratacao as any
      });
      setActiveSimResult(result);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao rodar simulação:', err);
      notify('Erro ao rodar simulação. Verifique as configurações do CUB.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Salvar Simulação
  const handleSaveSimulation = async () => {
    if (!selectedProjectId || !activeSimResult || !activeOrganizationId) return;
    setActionLoading(true);
    try {
      const newSim = await cnoService.createSimulation({
        organization_id: activeOrganizationId,
        project_id: selectedProjectId,
        scenario_name: simForm.scenario_name,
        area_construida: simForm.area_construida,
        custo_estimado: activeSimResult.custoEstimadoObra,
        metodo_construtivo: simForm.metodo_construtivo as any,
        regime_contratacao: simForm.regime_contratacao as any,
        mao_de_obra_estimada: activeSimResult.baseCalculoMaoObra,
        inss_estimado: activeSimResult.inssFinalEstimado,
        economia_potencial: activeSimResult.economiaMetodoConstrutivo,
        is_active: true,
        notes: `Simulado com CUB de ${simForm.state} (${simForm.reference_date})`
      });
      
      setSimulations(prev => [newSim, ...prev]);
      notify('Simulação salva com sucesso!');
      // Atualizar o score após salvar nova simulação ativa
      await cnoService.recalculateComplianceScore(selectedProjectId).then(setScore);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao salvar simulação:', err);
      notify('Erro ao salvar simulação.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Salvar Cadastro CNO
  const handleSaveCnoRegistration = async () => {
    if (!selectedProjectId || !activeOrganizationId) return;
    setActionLoading(true);
    try {
      let result;
      if (registration?.id) {
        result = await cnoService.updateRegistration(registration.id, {
          cno_number: cnoForm.cno_number,
          status: cnoForm.status,
          data_abertura: cnoForm.data_abertura || null,
          data_encerramento: cnoForm.data_encerramento || null,
          matricula_imovel: cnoForm.matricula_imovel,
          alvara_numero: cnoForm.alvara_numero,
          area_aprovada: cnoForm.area_aprovada,
          area_real: cnoForm.area_real,
          padrao_construtivo: cnoForm.padrao_construtivo,
          tipo_obra: cnoForm.tipo_obra,
          responsavel_tipo: cnoForm.responsavel_tipo,
          art_rrt: cnoForm.art_rrt,
          sero_category: cnoForm.sero_category,
          sero_destination: cnoForm.sero_destination,
          sero_type: cnoForm.sero_type,
          vau_value: cnoForm.vau_value,
          used_pre_mixed_concrete: cnoForm.used_pre_mixed_concrete
        });
      } else {
        result = await cnoService.createRegistration({
          organization_id: activeOrganizationId,
          project_id: selectedProjectId,
          cno_number: cnoForm.cno_number || null,
          status: cnoForm.status,
          data_abertura: cnoForm.data_abertura || null,
          data_encerramento: cnoForm.data_encerramento || null,
          matricula_imovel: cnoForm.matricula_imovel || null,
          alvara_numero: cnoForm.alvara_numero || null,
          area_aprovada: cnoForm.area_aprovada,
          area_real: cnoForm.area_real,
          padrao_construtivo: cnoForm.padrao_construtivo,
          tipo_obra: cnoForm.tipo_obra || null,
          responsavel_tipo: cnoForm.responsavel_tipo,
          art_rrt: cnoForm.art_rrt || null,
          sero_category: cnoForm.sero_category,
          sero_destination: cnoForm.sero_destination,
          sero_type: cnoForm.sero_type,
          vau_value: cnoForm.vau_value,
          used_pre_mixed_concrete: cnoForm.used_pre_mixed_concrete
        });
      }
      setRegistration(result);
      notify('Cadastro de CNO salvo com sucesso!');
      await cnoService.recalculateComplianceScore(selectedProjectId).then(setScore);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao salvar CNO:', err);
      notify('Erro ao salvar CNO.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Varredura Fiscal (Scanner de deduções de notas)
  const handleScanInvoices = async () => {
    if (!selectedProjectId || !registration?.id) {
      notify('É necessário cadastrar o CNO antes de rodar a varredura fiscal.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const added = await cnoService.scanAndAddMaterialDeductions(selectedProjectId, registration.id);
      notify(`${added.length} novos abatimentos fiscais identificados e adicionados.`);
      // Atualizar lista e recalcular score
      await cnoService.listDeductions(selectedProjectId).then(setDeductions);
      await cnoService.recalculateComplianceScore(selectedProjectId).then(setScore);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro na varredura fiscal:', err);
      notify('Erro ao rodar varredura de NF-e.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Adicionar declaração DCTFWeb / DARF
  const handleAddDctfweb = async () => {
    if (!registration?.id || !activeOrganizationId) {
      notify('Cadastre o CNO antes de registrar uma DCTFWeb.', 'error');
      return;
    }
    if (!dctfForm.declaration_number || !dctfForm.principal_amount) {
      notify('Informe o número do recibo e o valor principal.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const principal = Number(dctfForm.principal_amount) || 0;
      const fine = Number(dctfForm.fine_amount) || 0;
      const interest = Number(dctfForm.interest_amount) || 0;

      const created = await cnoService.addDctfweb({
        organization_id: activeOrganizationId,
        cno_registration_id: registration.id,
        declaration_number: dctfForm.declaration_number,
        transmission_date: dctfForm.transmission_date || null,
        principal_amount: principal,
        fine_amount: fine,
        interest_amount: interest,
        total_amount: principal + fine + interest,
        status: 'transmitida'
      });

      setDctfwebList(prev => [created, ...prev]);
      setDctfForm({ declaration_number: '', transmission_date: '', principal_amount: '', fine_amount: '', interest_amount: '' });
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao adicionar DCTFWeb:', err);
      notify('Erro ao registrar DCTFWeb.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDctfweb = async (id: string) => {
    const ok = await confirm({
      title: 'Remover declaração?',
      message: 'Esta declaração DCTFWeb será removida permanentemente.',
      variant: 'danger',
      confirmLabel: 'Remover'
    });
    if (!ok) return;
    try {
      await cnoService.deleteDctfweb(id);
      setDctfwebList(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao remover DCTFWeb:', err);
      notify('Erro ao remover declaração.', 'error');
    }
  };

  // ─── Checklist documental (aba Dossiê Digital) ───────────────
  const openNewDoc = (bloco: OpuraCnoDocumentBloco) => {
    setEditingDoc(null);
    setPendingFile(null);
    setPendingLink(null);
    const firstTipo = CNO_DOCUMENT_CATALOG.find(b => b.bloco === bloco)?.tipos[0];
    setDocForm({
      ...emptyDocForm,
      bloco,
      tipo_documento: firstTipo?.value || '',
      titulo: firstTipo?.label || '',
      obrigatorio: firstTipo?.obrigatorio || false
    });
    setDocSheetOpen(true);
  };

  const openEditDoc = (doc: OpuraCnoDocument) => {
    setEditingDoc(doc);
    setPendingFile(null);
    setPendingLink(null);
    setDocForm({
      bloco: doc.bloco,
      tipo_documento: doc.tipo_documento,
      titulo: doc.titulo,
      referente_a: doc.referente_a || '',
      numero: doc.numero || '',
      data_emissao: doc.data_emissao || '',
      data_validade: doc.data_validade || '',
      obrigatorio: doc.obrigatorio,
      notas: doc.notas || ''
    });
    setDocSheetOpen(true);
  };

  // Ao trocar o tipo no select, sincroniza o título com o rótulo do catálogo
  const handleTipoChange = (tipo: string) => {
    const catalog = CNO_DOCUMENT_CATALOG.find(b => b.bloco === docForm.bloco);
    const found = catalog?.tipos.find(t => t.value === tipo);
    setDocForm(prev => ({
      ...prev,
      tipo_documento: tipo,
      titulo: found?.label || prev.titulo,
      obrigatorio: found?.obrigatorio || false
    }));
  };

  const handleSaveDoc = async () => {
    if (!registration?.id || !activeOrganizationId) return;
    if (!docForm.tipo_documento || !docForm.titulo.trim()) {
      notify('Selecione o tipo de documento e informe um título.', 'error');
      return;
    }
    setDocBusy(true);
    try {
      const metadata = {
        bloco: docForm.bloco,
        tipo_documento: docForm.tipo_documento,
        titulo: docForm.titulo.trim(),
        referente_a: docForm.referente_a.trim() || null,
        numero: docForm.numero.trim() || null,
        data_emissao: docForm.data_emissao || null,
        data_validade: docForm.data_validade || null,
        obrigatorio: docForm.obrigatorio,
        notas: docForm.notas.trim() || null
      };

      // 1. Cria ou atualiza a linha do checklist (metadados)
      let saved = editingDoc
        ? await cnoService.updateDocument(editingDoc.id, metadata)
        : await cnoService.addDocument({
            organization_id: activeOrganizationId,
            cno_registration_id: registration.id,
            ...metadata
          });

      // 2. Anexa o arquivo, se houver origem escolhida
      if (pendingFile) {
        saved = await cnoService.uploadAndAttach(saved, pendingFile, userEmail, selectedProjectId);
      } else if (pendingLink) {
        saved = await cnoService.linkExistingDocument(
          saved.id,
          pendingLink.id,
          pendingLink.active_version?.storage_path || null
        );
      }

      // 3. Atualiza a lista em memória
      setCnoDocuments(prev => {
        const exists = prev.some(d => d.id === saved.id);
        return exists ? prev.map(d => (d.id === saved.id ? saved : d)) : [...prev, saved];
      });
      notify(editingDoc ? 'Documento atualizado.' : 'Documento adicionado ao checklist.');
      setDocSheetOpen(false);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao salvar documento do checklist:', err);
      notify('Erro ao salvar documento.', 'error');
    } finally {
      setDocBusy(false);
    }
  };

  const handleDownloadDoc = async (doc: OpuraCnoDocument) => {
    if (!doc.storage_path) {
      notify('Este item ainda não tem arquivo anexado.', 'error');
      return;
    }
    try {
      const url = await cnoService.getDownloadUrl(doc.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao gerar link de download:', err);
      notify('Erro ao abrir o documento.', 'error');
    }
  };

  const handleDeleteDoc = async (doc: OpuraCnoDocument) => {
    const ok = await confirm({
      title: 'Remover documento do checklist?',
      message: `"${doc.titulo}" será removido do checklist. O arquivo permanece no ÒPURA Docs.`,
      variant: 'danger',
      confirmLabel: 'Remover'
    });
    if (!ok) return;
    try {
      await cnoService.deleteDocument(doc.id);
      setCnoDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao remover documento do checklist:', err);
      notify('Erro ao remover documento.', 'error');
    }
  };

  const handleDownloadDossie = async () => {
    const anexados = cnoDocuments.filter(d => d.storage_path);
    if (anexados.length === 0) {
      notify('Nenhum documento anexado para baixar.', 'error');
      return;
    }
    try {
      for (const doc of anexados) {
        const url = await cnoService.getDownloadUrl(doc.storage_path!);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      notify(`${anexados.length} documento(s) aberto(s) para download.`);
    } catch (err) {
      console.error('[OpuraCnoModule] Erro ao baixar dossiê:', err);
      notify('Erro ao baixar o dossiê.', 'error');
    }
  };

  // Seção de Seleção de Obras
  if (!selectedProjectId) {
    // Normaliza a obra para as colunas da tabela (§2)
    const rows = (projects as any[])
      .filter(p => p.name)
      .map(p => {
        const s = p.settings || {};
        const cidade = [s.city, s.state].filter(Boolean).join('/');
        return {
          id: p.id as string | undefined,
          obra: p.name as string,
          codigo: (s.code || p.code || '') as string,
          cliente: (s.obraPropria ? 'Obra própria' : s.client || '') as string,
          local: cidade,
          area: Number(s.area) || 0,
          status: (s.obraStatus || '') as string,
        };
      });

    const termo = projectSearch.trim().toLowerCase();
    const filtered = rows
      .filter(r =>
        !termo ||
        r.obra.toLowerCase().includes(termo) ||
        r.codigo.toLowerCase().includes(termo) ||
        r.cliente.toLowerCase().includes(termo) ||
        r.local.toLowerCase().includes(termo)
      )
      .sort((a, b) => {
        const col = projectColumns.sortColumn;
        if (col) {
          const dir = projectColumns.sortDirection === 'desc' ? -1 : 1;
          if (col === 'area') return (a.area - b.area) * dir;
          const va = String((a as any)[col] ?? '');
          const vb = String((b as any)[col] ?? '');
          return va.localeCompare(vb, 'pt-BR') * dir;
        }
        return a.obra.localeCompare(b.obra, 'pt-BR'); // §6.4 — default sem seleção: obra A-Z
      });

    const areaTotal = rows.reduce((acc, r) => acc + r.area, 0);
    const emAndamento = rows.filter(r => r.status === 'Em andamento').length;
    const concluidas = rows.filter(r => r.status === 'Concluída').length;
    const paralisadas = rows.filter(r => r.status === 'Paralisada').length;

    return (
      <div className="space-y-6">
        {/* §20 — cabeçalho flat: h1 + p mt-1.5, sem card/hero */}
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">ÒPURA CNO &amp; Previdência de Obras</h1>
          <p className="text-gray-400 text-sm mt-1.5 font-medium">Selecione uma obra ativa para gerenciar CNO, regularização fiscal e simular reduções de INSS.</p>
        </div>

        {/* §4 + §4.2 — Total é o KPI principal; os demais são recortes dele */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            shadow={false}
            size="lg"
            className="col-span-2"
            label="Obras disponíveis"
            value={rows.length}
            sub={`${areaTotal.toLocaleString('pt-BR')} m² de área cadastrada`}
            icon={<Building2 className="w-4 h-4" />}
            color="blue"
          />
          <KpiCard shadow={false} size="sm" label="Em andamento" value={emAndamento} icon={<TrendingUp className="w-4 h-4" />} color="indigo" />
          <KpiCard shadow={false} size="sm" label="Concluídas" value={concluidas} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
          <KpiCard shadow={false} size="sm" label="Paralisadas" value={paralisadas} icon={<AlertCircle className="w-4 h-4" />} color="amber" />
        </div>

        {/* §5.2 — toolbar acoplada: toolbar e tabela num único card */}
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-white space-y-3">
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
              <div className="flex-1 relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar obra por nome, código, cliente ou cidade..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <button
                onClick={() => fetchProjects(organizations)}
                disabled={projectsLoading}
                title="Atualizar"
                className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${projectsLoading ? 'animate-spin' : ''}`} />
              </button>

              <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

              {/* Sem toggle grade/lista: a tela é uma lista de seleção — §5 permite só o ColumnConfig */}
              <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                <ColumnConfigButton
                  columns={PROJECT_COLUMNS}
                  visibleColumns={projectColumns.visibleColumns}
                  showColumnConfig={projectColumns.showColumnConfig}
                  onToggleShow={() => projectColumns.setShowColumnConfig(!projectColumns.showColumnConfig)}
                  onToggleColumn={projectColumns.toggleColumn}
                  onReset={projectColumns.resetColumns}
                />
              </div>
            </div>
          </div>

          {projectsLoading ? (
            /* §11 */
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Carregando...</p>
            </div>
          ) : filtered.length === 0 ? (
            /* §12 — sem card próprio: o card acoplado já supre (§5.2) */
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma obra encontrada</h3>
              <p className="text-sm text-gray-500">Tente ajustar sua busca.</p>
            </div>
          ) : (
            /* §6.5 — cabeçalho fixo: a lista de obras cresce bem além da dobra */
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-left border-collapse">
                <thead>
                  {/* §6.2 — sentence case */}
                  <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                    {projectColumns.visibleColumns.includes('obra') && (
                      <SortableHeader colKey="obra" label="Obra" uppercase={false}
                        sortColumn={projectColumns.sortColumn} sortDirection={projectColumns.sortDirection}
                        onSort={projectColumns.handleColumnSort}
                        className="px-6 py-2 border-r border-gray-100" />
                    )}
                    {projectColumns.visibleColumns.includes('codigo') && (
                      <SortableHeader colKey="codigo" label="Código" uppercase={false}
                        sortColumn={projectColumns.sortColumn} sortDirection={projectColumns.sortDirection}
                        onSort={projectColumns.handleColumnSort}
                        className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                    )}
                    {projectColumns.visibleColumns.includes('cliente') && (
                      <SortableHeader colKey="cliente" label="Cliente" uppercase={false}
                        sortColumn={projectColumns.sortColumn} sortDirection={projectColumns.sortDirection}
                        onSort={projectColumns.handleColumnSort}
                        className="px-6 py-2 border-r border-gray-100" />
                    )}
                    {projectColumns.visibleColumns.includes('local') && (
                      <SortableHeader colKey="local" label="Local" uppercase={false}
                        sortColumn={projectColumns.sortColumn} sortDirection={projectColumns.sortDirection}
                        onSort={projectColumns.handleColumnSort}
                        className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                    )}
                    {projectColumns.visibleColumns.includes('area') && (
                      <SortableHeader colKey="area" label="Área" uppercase={false}
                        sortColumn={projectColumns.sortColumn} sortDirection={projectColumns.sortDirection}
                        onSort={projectColumns.handleColumnSort}
                        className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                    )}
                    {projectColumns.visibleColumns.includes('status') && (
                      <SortableHeader colKey="status" label="Status" uppercase={false}
                        sortColumn={projectColumns.sortColumn} sortDirection={projectColumns.sortDirection}
                        onSort={projectColumns.handleColumnSort}
                        className="px-6 py-2" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedProjectId(row.id || null)}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                    >
                      {projectColumns.visibleColumns.includes('obra') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                          {/* §9.1 — a linha É a ação; o botão existe só para dar foco de teclado à mesma ação, não é um segundo controle */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedProjectId(row.id || null); }}
                            className="text-left text-sm font-normal text-gray-700 group-hover:text-blue-600 transition-colors"
                            title="Gerenciar previdência desta obra"
                          >
                            {row.obra}
                          </button>
                        </td>
                      )}
                      {projectColumns.visibleColumns.includes('codigo') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                          {row.codigo || 'N/D'}
                        </td>
                      )}
                      {projectColumns.visibleColumns.includes('cliente') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                          {row.cliente || '—'}
                        </td>
                      )}
                      {projectColumns.visibleColumns.includes('local') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                          {row.local || '—'}
                        </td>
                      )}
                      {projectColumns.visibleColumns.includes('area') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                          {row.area ? `${row.area.toLocaleString('pt-BR')} m²` : '—'}
                        </td>
                      )}
                      {projectColumns.visibleColumns.includes('status') && (
                        <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                          {/* §8 — texto colorido, sem pílula */}
                          <span className={`text-sm font-normal ${OBRA_STATUS_COLORS[row.status] || 'text-gray-400'}`}>
                            {row.status || '—'}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  const activeProject = projects.find(p => p.id === selectedProjectId);

  return (
    <div className="space-y-6">
      {/* Header com breadcrumbs e seletor de obra */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          {/* Trilha módulo → obra selecionada — §23 */}
          <Breadcrumb
            items={[
              { label: 'Previdência', onClick: () => setSelectedProjectId(null) },
              { label: activeProject?.name || 'Obra Selecionada' },
            ]}
          />
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1.5 flex items-center gap-2">
            ÒPURA CNO & Previdência
            {score && (
              <span className={`text-sm font-semibold
                ${score.status_color === 'verde' ? 'text-emerald-600' : score.status_color === 'amarelo' ? 'text-amber-600' : 'text-red-600'}`}>
                Score {score.score}
              </span>
            )}
          </h1>
        </div>

        <button 
          onClick={() => setSelectedProjectId(null)}
          className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl font-bold text-button uppercase tracking-wider transition-colors"
        >
          Trocar de Obra
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
        {(['dashboard', 'cadastro', 'areas', 'pre_moldados', 'simulador', 'deducoes', 'dctfweb', 'dossie'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-black text-button uppercase tracking-widest transition-colors border-b-2 whitespace-nowrap
              ${activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {tab === 'deducoes' ? 'Deduções (Scanner)' : tab === 'dctfweb' ? 'DCTFWeb / DARF' : tab === 'dossie' ? 'Dossiê Digital' : tab === 'areas' ? 'Áreas SERO' : tab === 'pre_moldados' ? 'Pré-moldados (SERO)' : tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Carregando painel...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. ABA DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Painel Principal de Score */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between items-center text-center">
                <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider w-full text-left">Compliance Previdenciário</h3>
                
                <div className="my-8 relative flex items-center justify-center">
                  <div className={`w-36 h-36 rounded-full border-8 flex flex-col items-center justify-center shadow-lg
                    ${score?.status_color === 'verde' ? 'border-emerald-500 bg-emerald-50/20' : score?.status_color === 'amarelo' ? 'border-amber-500 bg-amber-50/20' : 'border-red-500 bg-red-50/20'}`}>
                    <span className="text-4xl font-black text-gray-800">{score?.score ?? 'N/D'}</span>
                    <span className="text-xs font-black uppercase text-gray-400 tracking-widest mt-1">Score</span>
                  </div>
                </div>

                <div className="w-full text-left">
                  <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                    <span className="text-gray-500">CNO Regular</span>
                    <span className="font-bold">{score?.cno_regular ? '🟢 Regular' : '🔴 Pendente'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                    <span className="text-gray-500">eSocial Atualizado</span>
                    <span className="font-bold">{score?.esocial_atualizado ? '🟢 Em Dia' : '🔴 Inconforme'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1 border-b border-gray-50">
                    <span className="text-gray-500">CNDs Terceiros</span>
                    <span className="font-bold">{score?.certidoes_validas ? '🟢 Válidas' : '🔴 Vencidas'}</span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-gray-500">Retenções Medições</span>
                    <span className="font-bold">{score?.retencoes_corretas ? '🟢 Conformidade' : '🔴 Inconsistente'}</span>
                  </div>
                </div>
              </div>

              {/* Cards de Métricas e Gráficos Rápidos */}
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="bg-blue-50 text-blue-600 w-8 h-8 rounded-xl flex items-center justify-center mb-3">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">INSS Previsto (CUB)</p>
                    <h4 className="text-xl font-bold text-gray-800 mt-2">
                      {simulations.find(s => s.is_active) 
                        ? `R$ ${simulations.find(s => s.is_active)?.inss_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                        : 'Simulação Pendente'}
                    </h4>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="bg-emerald-50 text-emerald-600 w-8 h-8 rounded-xl flex items-center justify-center mb-3">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Crédito de Materiais</p>
                    <h4 className="text-xl font-bold text-gray-800 mt-2">
                      R$ {deductions
                        .filter(d => d.source_type === 'nfe')
                        .reduce((acc, d) => acc + Number(d.valor_abatimento), 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h4>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow">
                    <div className="bg-indigo-50 text-indigo-600 w-8 h-8 rounded-xl flex items-center justify-center mb-3">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Economia Estimada</p>
                    <h4 className="text-xl font-bold text-gray-800 mt-2">
                      R$ {(simulations.find(s => s.is_active)?.economia_potencial ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h4>
                  </div>
                </div>

                {/* Bloco de Ações Rápidas */}
                <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-950/20">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold">Identifique deduções ocultas na obra</h3>
                    <p className="text-indigo-200 text-xs max-w-md">O motor da ÒPURA analisa automaticamente as NF-es e compras de concreto e cimento para aplicar abatimentos previdenciários de forma instantânea.</p>
                  </div>
                  <button
                    onClick={handleScanInvoices}
                    disabled={actionLoading}
                    className="px-6 py-3 bg-white text-indigo-900 hover:bg-indigo-50 rounded-2xl font-black text-button uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-indigo-900" />}
                    Executar Varredura
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. ABA CADASTRO CNO */}
          {activeTab === 'cadastro' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Cadastro do CNO e Regularização</h3>
                <p className="text-gray-400 text-xs">Preencha as informações do alvará, matrícula e número do CNO.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Número do CNO</label>
                  <input
                    value={cnoForm.cno_number}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, cno_number: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Ex: 51.218.49079/78"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Status da Regularização</label>
                  <select
                    value={cnoForm.status}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="documentacao_enviada">Documentação Enviada</option>
                    <option value="validacao">Validação (Aferição)</option>
                    <option value="aberto">Aberto / Em Andamento</option>
                    <option value="encerrado">Encerrado (CND Emitida)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Alvará de Construção</label>
                  <input
                    value={cnoForm.alvara_numero}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, alvara_numero: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Nº Alvará / Ano"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Matrícula do Imóvel</label>
                  <input
                    value={cnoForm.matricula_imovel}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, matricula_imovel: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Nº Matrícula e Cartório"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Área Aprovada (m²)</label>
                  <input
                    type="number"
                    value={cnoForm.area_aprovada}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, area_aprovada: Number(e.target.value) }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Área Real de Aferição (m²)</label>
                  <input
                    type="number"
                    value={cnoForm.area_real}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, area_real: Number(e.target.value) }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Padrão Construtivo</label>
                  <select
                    value={cnoForm.padrao_construtivo || 'normal'}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, padrao_construtivo: e.target.value as any }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  >
                    <option value="baixo">Baixo</option>
                    <option value="normal">Normal</option>
                    <option value="alto">Alto</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Responsabilidade</label>
                  <select
                    value={cnoForm.responsavel_tipo || 'construtor'}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, responsavel_tipo: e.target.value as any }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                  >
                    <option value="proprietario">Proprietário</option>
                    <option value="incorporador">Incorporador</option>
                    <option value="construtor">Construtor (Solidário)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">ART / RRT Vinculada</label>
                  <input
                    value={cnoForm.art_rrt}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, art_rrt: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    placeholder="Código do Registro Técnico"
                  />
                </div>
              </div>

              
              <div className="pt-6 border-t border-gray-100">
                <h4 className="font-bold text-gray-800 mb-4">Enquadramento SERO (Aferição Indireta)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Categoria da Obra</label>
                    <select
                      value={cnoForm.sero_category}
                      onChange={(e) => setCnoForm(prev => ({ ...prev, sero_category: e.target.value as any }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="obra_nova">Obra Nova</option>
                      <option value="acrescimo">Acréscimo/Ampliação</option>
                      <option value="reforma">Reforma</option>
                      <option value="demolicao">Demolição</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Destinação</label>
                    <select
                      value={cnoForm.sero_destination}
                      onChange={(e) => setCnoForm(prev => ({ ...prev, sero_destination: e.target.value as any }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="residencial_unifamiliar">Residencial Unifamiliar</option>
                      <option value="residencial_multifamiliar">Residencial Multifamiliar</option>
                      <option value="comercial_salas_lojas">Comercial (Salas/Lojas)</option>
                      <option value="galpao_industrial">Galpão Industrial</option>
                      <option value="casa_popular">Casa Popular</option>
                      <option value="conjunto_habitacional_popular">Conjunto Habit. Popular</option>
                      <option value="edificio_garagens">Edifício de Garagens</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Tipo (Estrutura)</label>
                    <select
                      value={cnoForm.sero_type}
                      onChange={(e) => setCnoForm(prev => ({ ...prev, sero_type: e.target.value as any }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="alvenaria">Alvenaria</option>
                      <option value="madeira">Madeira</option>
                      <option value="mista">Mista</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Valor VAU (Atualizado)</label>
                    <input
                      type="number"
                      value={cnoForm.vau_value}
                      onChange={(e) => setCnoForm(prev => ({ ...prev, vau_value: Number(e.target.value) }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      placeholder="Ex: 2450.00"
                    />
                  </div>
                </div>
                
                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="concrete_check"
                    checked={cnoForm.used_pre_mixed_concrete}
                    onChange={(e) => setCnoForm(prev => ({ ...prev, used_pre_mixed_concrete: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                  />
                  <label htmlFor="concrete_check" className="text-sm font-semibold text-gray-700 cursor-pointer">
                    Houve uso de Concreto Usinado ou Massa Asfáltica? (Aplica redutor de 5%)
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                <button
                  onClick={handleSaveCnoRegistration}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Cadastro CNO
                </button>
              </div>
            </div>
          )}

          
          {activeTab === 'areas' && (
            <div className="space-y-6">
              {!registration ? (
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200">
                  <p className="text-amber-800 font-semibold">É necessário salvar o Cadastro do CNO primeiro.</p>
                </div>
              ) : (
                <SeroAreasManager 
                  organizationId={activeOrganizationId!} 
                  cnoRegistrationId={registration.id} 
                />
              )}
            </div>
          )}

          {activeTab === 'pre_moldados' && (
            <div className="space-y-6">
              {!registration ? (
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200">
                  <p className="text-amber-800 font-semibold">É necessário salvar o Cadastro do CNO primeiro.</p>
                </div>
              ) : (
                <SeroReductionsManager 
                  organizationId={activeOrganizationId!} 
                  cnoRegistrationId={registration.id} 
                  tipoObra={cnoForm.sero_type}
                />
              )}
            </div>
          )}
          
          {/* 3. ABA SIMULADOR DE INSS */}
          {activeTab === 'simulador' && (
            <div className="space-y-6">
              <SeroMemorySimulator registration={registration} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form da Simulação */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Parâmetros de Aferição</h3>
                  <p className="text-gray-400 text-xs">Informe os parâmetros para cálculo do CUB correspondente.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nome do Cenário</label>
                    <input
                      value={simForm.scenario_name}
                      onChange={(e) => setSimForm(prev => ({ ...prev, scenario_name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Estado (UF)</label>
                      <input
                        value={simForm.state}
                        onChange={(e) => setSimForm(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ref. Date</label>
                      <input
                        value={simForm.reference_date}
                        onChange={(e) => setSimForm(prev => ({ ...prev, reference_date: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                        placeholder="YYYY-MM"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Desoneração (CPRB)</label>
                    <select
                      value={simForm.social_charges}
                      onChange={(e) => setSimForm(prev => ({ ...prev, social_charges: e.target.value as any }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="sem_desoneracao">Sem Desoneração</option>
                      <option value="com_desoneracao">Com Desoneração (Desonerado)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Área (m²)</label>
                      <input
                        type="number"
                        value={simForm.area_construida}
                        onChange={(e) => setSimForm(prev => ({ ...prev, area_construida: Number(e.target.value) }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Padrão</label>
                      <select
                        value={simForm.padrao}
                        onChange={(e) => setSimForm(prev => ({ ...prev, padrao: e.target.value as any }))}
                        className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      >
                        <option value="baixo">Baixo</option>
                        <option value="normal">Normal</option>
                        <option value="alto">Alto</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Método Construtivo</label>
                    <select
                      value={simForm.metodo_construtivo || 'convencional'}
                      onChange={(e) => setSimForm(prev => ({ ...prev, metodo_construtivo: e.target.value as any }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="convencional">Alvenaria Convencional</option>
                      <option value="pre_moldado">Pré-Moldado de Concreto (Redutor 50%)</option>
                      <option value="estrutura_metalica">Estrutura Metálica (Redutor 40%)</option>
                      <option value="steel_frame">Steel Frame (Redutor 40%)</option>
                      <option value="drywall">Drywall (Redutor 15%)</option>
                      <option value="modular">Modular / Industrializado (Redutor 50%)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Regime de Contratação</label>
                    <select
                      value={simForm.regime_contratacao || 'equipe_propria'}
                      onChange={(e) => setSimForm(prev => ({ ...prev, regime_contratacao: e.target.value as any }))}
                      className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    >
                      <option value="equipe_propria">Mão de Obra Própria</option>
                      <option value="empreitada_global">Empreitada Global</option>
                      <option value="empreitada_parcial">Empreitada Parcial</option>
                      <option value="bts">Build To Suit (BTS)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 w-full">
                  <button
                    onClick={handleRunSimulation}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Simular
                  </button>
                  {activeSimResult && (
                    <button
                      onClick={handleSaveSimulation}
                      disabled={actionLoading}
                      className="px-4 py-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center transition-colors"
                      title="Salvar como simulação ativa"
                    >
                      Salvar
                    </button>
                  )}
                </div>
              </div>

              {/* Resultado da Simulação */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Cenário de Aferição SERO</h3>
                  <p className="text-gray-400 text-xs">Valores gerados com base nas fórmulas oficiais da Receita Federal.</p>
                </div>

                {activeSimResult ? (
                  <div className="my-6 space-y-6 flex-1 justify-center flex flex-col">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Valor CUB (m²)</span>
                        <h5 className="text-lg font-bold text-gray-800 mt-1">R$ {activeSimResult.cubValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Custo Global Estimado</span>
                        <h5 className="text-lg font-bold text-gray-800 mt-1">R$ {activeSimResult.custoEstimadoObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-400">Mão de Obra Aferida</span>
                        <h5 className="text-lg font-bold text-gray-800 mt-1">R$ {activeSimResult.baseCalculoMaoObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                      <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/30">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-600">INSS Final Estimado</span>
                        <h5 className="text-lg font-bold text-indigo-900 mt-1">R$ {activeSimResult.inssFinalEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h5>
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between text-emerald-800">
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-600">Redução e Economia Previdenciária</span>
                        <p className="text-xs font-semibold mt-0.5">Graças ao método construtivo industrializado ({simForm.metodo_construtivo})</p>
                      </div>
                      <h4 className="text-xl font-black">R$ {activeSimResult.economiaMetodoConstrutivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 py-12 gap-3 text-center">
                    <Calculator className="w-12 h-12 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">Preencha os dados e execute a simulação no menu lateral.</p>
                  </div>
                )}

                {/* Lista de Simulações Gravadas */}
                {simulations.length > 0 && (
                  <div className="mt-6 border-t border-gray-100 pt-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Simulações de Cenários</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {simulations.map(sim => (
                        <div key={sim.id} className="flex items-center justify-between p-3 border border-gray-50 hover:border-gray-100 rounded-xl text-xs">
                          <div>
                            <span className="font-bold text-gray-800">{sim.scenario_name}</span>
                            <span className="text-gray-400 ml-2">({sim.area_construida} m² · {sim.metodo_construtivo})</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">INSS: <strong className="text-gray-800">R$ {sim.inss_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            {sim.is_active && <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase">Ativo</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {/* 4. ABA DEDUÇÕES */}
          {activeTab === 'deducoes' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Scanner de Abatimentos & Créditos</h3>
                  <p className="text-gray-400 text-xs">Notas Fiscais de concreto usinado vinculadas a esta obra para abatimento do INSS no SERO.</p>
                </div>

                <button
                  onClick={handleScanInvoices}
                  disabled={actionLoading}
                  className="px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-black text-button uppercase tracking-wider transition-colors flex items-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Scanner de NF-e
                </button>
              </div>

              {deductions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Origem</th>
                        <th className="py-3 px-4">Descrição</th>
                        <th className="py-3 px-4">Valor Base</th>
                        <th className="py-3 px-4">Valor Abatimento (40%)</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Validação IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductions.map(ded => (
                        <tr key={ded.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-3.5 px-4 text-sm font-normal text-gray-800">
                            {ded.source_type === 'nfe' ? '🧾 NF-e de Compra' : '🛠️ Medição'}
                          </td>
                          <td className="py-3.5 px-4 text-sm font-normal text-gray-500">{ded.description}</td>
                          <td className="py-3.5 px-4 text-sm font-medium text-gray-700">R$ {ded.valor_base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4 text-sm font-medium text-indigo-600">R$ {ded.valor_abatimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3.5 px-4">
                            <span className={`text-sm font-normal ${
                              ded.status_validacao === 'aproveitado' ? 'text-emerald-600' : ded.status_validacao === 'rejeitado' ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {ded.status_validacao}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-sm font-normal text-gray-400">{ded.revisao_ia_feedback || 'Sem revisões.'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <FileText className="w-12 h-12 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-400">Nenhum abatimento localizado. Clique em "Scanner de NF-e" para iniciar a busca.</p>
                </div>
              )}
            </div>
          )}

          {/* 5. ABA DCTFWeb / DARF */}
          {activeTab === 'dctfweb' && (
            !registration?.id ? (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 gap-3 text-center">
                <FileText className="w-12 h-12 text-gray-300" />
                <p className="text-sm font-semibold text-gray-400">Cadastre o CNO na aba "cadastro" antes de registrar as guias DCTFWeb / DARF.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulário de Registro */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Controle de DCTFWeb & DARF</h3>
                  <p className="text-gray-400 text-xs">Registre as guias transmitidas e os DARFs pagos referentes à aferição da obra.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Nº do Recibo / Declaração</label>
                    <input
                      value={dctfForm.declaration_number}
                      onChange={(e) => setDctfForm(prev => ({ ...prev, declaration_number: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      placeholder="Ex: 1234567890"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Data de Transmissão</label>
                    <input
                      type="date"
                      value={dctfForm.transmission_date}
                      onChange={(e) => setDctfForm(prev => ({ ...prev, transmission_date: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Valor Principal</label>
                      <input
                        type="number"
                        value={dctfForm.principal_amount}
                        onChange={(e) => setDctfForm(prev => ({ ...prev, principal_amount: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Multa (R$)</label>
                      <input
                        type="number"
                        value={dctfForm.fine_amount}
                        onChange={(e) => setDctfForm(prev => ({ ...prev, fine_amount: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-form-label font-bold text-gray-400 uppercase tracking-widest">Juros (R$)</label>
                    <input
                      type="number"
                      value={dctfForm.interest_amount}
                      onChange={(e) => setDctfForm(prev => ({ ...prev, interest_amount: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-indigo-600 transition-colors text-sm font-semibold"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddDctfweb}
                  disabled={actionLoading}
                  className="w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Registrar DCTFWeb
                </button>
              </div>

              {/* Lista de Declarações */}
              <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Declarações Transmitidas</h3>
                  <p className="text-gray-400 text-xs">Guias DCTFWeb e DARFs vinculados a esta obra.</p>
                </div>

                {dctfwebList.length > 0 ? (
                  <div className="space-y-3">
                    {dctfwebList.map(dec => (
                      <div key={dec.id} className="p-4 border border-gray-100 rounded-2xl flex items-start justify-between gap-4 hover:border-indigo-100 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-gray-800">Recibo: {dec.declaration_number || '—'}</span>
                            <span className={`text-xs font-medium ${
                              dec.status === 'paga' ? 'text-emerald-600' : dec.status === 'cancelada' ? 'text-red-600' : dec.status === 'retificada' ? 'text-amber-600' : 'text-indigo-600'
                            }`}>
                              {dec.status}
                            </span>
                          </div>
                          {dec.transmission_date && (
                            <p className="text-gray-400 text-xs mb-3">Transmitida em: {dec.transmission_date.split('-').reverse().join('/')}</p>
                          )}
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="block text-gray-400">Principal</span>
                              <span className="font-medium text-gray-700">R$ {dec.principal_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div>
                              <span className="block text-gray-400">Multa / Juros</span>
                              <span className="font-medium text-gray-700">R$ {(dec.fine_amount + dec.interest_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div>
                              <span className="block text-gray-400">Total DARF</span>
                              <span className="font-bold text-indigo-900">R$ {dec.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>
                        <ActionIconButton kind="delete" className="opacity-0 group-hover:opacity-100" title="Remover declaração" onClick={() => handleDeleteDctfweb(dec.id)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <FileText className="w-12 h-12 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">Nenhuma declaração DCTFWeb registrada.</p>
                  </div>
                )}
              </div>
            </div>
            )
          )}

          {/* 6. ABA DOSSIÊ DIGITAL — Checklist documental de abertura do CNO */}
          {activeTab === 'dossie' && (
            !registration?.id ? (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 gap-3 text-center">
                <FileText className="w-12 h-12 text-gray-300" />
                <p className="text-sm font-semibold text-gray-400">Cadastre o CNO na aba "cadastro" antes de montar o checklist documental.</p>
              </div>
            ) : (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Dossiê Digital — Documentação do CNO</h3>
                  <p className="text-gray-400 text-xs">Documentos exigidos pela Receita Federal para abertura/regularização. Vincule do ÒPURA Docs ou envie o arquivo — tudo fica no GED.</p>
                </div>
                <button
                  onClick={handleDownloadDossie}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 whitespace-nowrap self-start"
                >
                  <Download className="w-[15px] h-[15px]" />
                  Baixar dossiê
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {CNO_DOCUMENT_CATALOG.map(bloco => {
                  const items = cnoDocuments.filter(d => d.bloco === bloco.bloco);
                  return (
                    <div key={bloco.bloco} className="border border-gray-100 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="bg-indigo-50 text-indigo-600 w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
                            <FolderOpen className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-sm font-bold text-gray-800">{bloco.label}</h5>
                            {bloco.descricao && <p className="text-gray-400 text-xs">{bloco.descricao}</p>}
                          </div>
                        </div>
                        <button
                          onClick={() => openNewDoc(bloco.bloco)}
                          className="flex items-center gap-1 h-8 px-2.5 border border-gray-200 text-gray-600 rounded-[6px] hover:border-indigo-200 hover:text-indigo-600 text-xs font-medium transition-all shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar
                        </button>
                      </div>

                      {items.length > 0 ? (
                        <div className="space-y-2">
                          {items.map(doc => {
                            const statusColor =
                              doc.status === 'anexado' ? 'text-emerald-600'
                              : doc.status === 'vencido' ? 'text-red-600'
                              : doc.status === 'dispensado' ? 'text-gray-400'
                              : 'text-amber-600';
                            const statusLabel =
                              doc.status === 'anexado' ? 'Anexado'
                              : doc.status === 'vencido' ? 'Vencido'
                              : doc.status === 'dispensado' ? 'Dispensado'
                              : 'Pendente';
                            return (
                              <div key={doc.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-gray-50/60 border border-gray-100">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800 truncate">{doc.titulo}</span>
                                    {doc.obrigatorio && <span className="text-xs font-medium text-indigo-600">Obrigatório</span>}
                                    <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                                    {doc.referente_a && <span>Referente a: {doc.referente_a}</span>}
                                    {doc.numero && <span>Nº {doc.numero}</span>}
                                    {doc.data_validade && <span>Validade: {doc.data_validade.split('-').reverse().join('/')}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {doc.storage_path && (
                                    <ActionIconButton kind="download" title="Baixar arquivo" onClick={() => handleDownloadDoc(doc)} />
                                  )}
                                  <ActionIconButton kind="edit" title="Editar" onClick={() => openEditDoc(doc)} />
                                  <ActionIconButton kind="delete" title="Remover do checklist" onClick={() => handleDeleteDoc(doc)} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 py-2">Nenhum documento neste bloco ainda.</p>
                      )}

                      {bloco.bloco === 'representacao' && (
                        <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-2">
                          O termo de guarda não é necessário para pais que já constam no documento do menor. A identidade do representado é dispensada quando a procuração tem firma reconhecida.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )
          )}
        </div>
      )}

      {/* Sheet — adicionar/editar documento do checklist (UI_PATTERNS §3) */}
      <Sheet open={docSheetOpen} onClose={() => setDocSheetOpen(false)} size="lg">
        <SheetHeader onClose={() => setDocSheetOpen(false)}>
          <SheetTitle>{editingDoc ? 'Editar documento' : 'Adicionar documento'}</SheetTitle>
          <SheetDescription>Checklist documental do CNO</SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Bloco</label>
            <select
              value={docForm.bloco}
              onChange={(e) => {
                const bloco = e.target.value as OpuraCnoDocumentBloco;
                const firstTipo = CNO_DOCUMENT_CATALOG.find(b => b.bloco === bloco)?.tipos[0];
                setDocForm(prev => ({
                  ...prev,
                  bloco,
                  tipo_documento: firstTipo?.value || '',
                  titulo: firstTipo?.label || '',
                  obrigatorio: firstTipo?.obrigatorio || false
                }));
              }}
              className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
            >
              {CNO_DOCUMENT_CATALOG.map(b => (
                <option key={b.bloco} value={b.bloco}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Tipo de documento</label>
            <select
              value={docForm.tipo_documento}
              onChange={(e) => handleTipoChange(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
            >
              {CNO_DOCUMENT_CATALOG.find(b => b.bloco === docForm.bloco)?.tipos.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Título</label>
            <input
              value={docForm.titulo}
              onChange={(e) => setDocForm(prev => ({ ...prev, titulo: e.target.value }))}
              className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
              placeholder="Título do documento"
            />
          </div>

          {(docForm.bloco === 'identificacao' || docForm.bloco === 'representacao') && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Referente a (pessoa / empresa)</label>
              <input
                value={docForm.referente_a}
                onChange={(e) => setDocForm(prev => ({ ...prev, referente_a: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
                placeholder="Ex: João da Silva / Construtora ABC Ltda."
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Número</label>
              <input
                value={docForm.numero}
                onChange={(e) => setDocForm(prev => ({ ...prev, numero: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
                placeholder="Nº do documento"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={docForm.obrigatorio}
                  onChange={(e) => setDocForm(prev => ({ ...prev, obrigatorio: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Obrigatório
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Emissão</label>
              <input
                type="date"
                value={docForm.data_emissao}
                onChange={(e) => setDocForm(prev => ({ ...prev, data_emissao: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Validade</label>
              <input
                type="date"
                value={docForm.data_validade}
                onChange={(e) => setDocForm(prev => ({ ...prev, data_validade: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Origem do arquivo */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <label className="text-xs font-semibold text-slate-500">Arquivo</label>
            {editingDoc?.storage_path && !pendingFile && !pendingLink && (
              <p className="flex items-center gap-2 text-xs text-emerald-600">
                <Paperclip className="w-3.5 h-3.5" /> Já existe um arquivo anexado. Anexar outro substitui o vínculo.
              </p>
            )}

            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Link2 className="w-3.5 h-3.5" /> Vincular do ÒPURA Docs
              </p>
              {pendingLink ? (
                <div className="flex items-center justify-between gap-2 p-2 rounded-[6px] bg-indigo-50 border border-indigo-100">
                  <span className="text-xs text-indigo-700 truncate">{pendingLink.nome}</span>
                  <button onClick={() => setPendingLink(null)} className="text-xs text-indigo-600 hover:underline shrink-0">Trocar</button>
                </div>
              ) : (
                activeOrganizationId && (
                  <DocumentPicker
                    organizationId={activeOrganizationId}
                    excludeIntegrated
                    storageKey="opuraCno:docPicker:search"
                    onPick={(doc) => { setPendingLink(doc); setPendingFile(null); }}
                  />
                )
              )}
            </div>

            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <UploadCloud className="w-3.5 h-3.5" /> Ou enviar um arquivo novo
              </p>
              <input
                type="file"
                onChange={(e) => { setPendingFile(e.target.files?.[0] || null); setPendingLink(null); }}
                className="w-full text-xs text-gray-600 file:mr-3 file:h-8 file:px-3 file:rounded-[6px] file:border-0 file:bg-indigo-50 file:text-indigo-600 file:text-xs file:font-medium hover:file:bg-indigo-100 cursor-pointer"
              />
              {pendingFile && <p className="text-xs text-gray-500 truncate">{pendingFile.name}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500">Observações</label>
            <textarea
              value={docForm.notas}
              onChange={(e) => setDocForm(prev => ({ ...prev, notas: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-[6px] text-sm outline-none focus:border-indigo-500 resize-none"
              placeholder="Anotações internas (opcional)"
            />
          </div>
        </SheetPanel>
        <SheetFooter>
          <button
            onClick={() => setDocSheetOpen(false)}
            className="h-9 px-3.5 border border-gray-200 text-gray-600 rounded-[6px] hover:bg-gray-50 text-[13px] font-medium transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveDoc}
            disabled={docBusy}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-indigo-600 text-white rounded-[6px] hover:bg-indigo-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
          >
            {docBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingDoc ? 'Salvar documento' : 'Adicionar documento'}
          </button>
        </SheetFooter>
      </Sheet>

      {/* Toast de notificação (§13) */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default OpuraCnoModule;
