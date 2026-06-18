import React from 'react';
import {
  FolderOpen,
  Upload,
  Search,
  Plus,
  Trash2,
  Calendar,
  Tag,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  History,
  CheckCircle2,
  X,
  ChevronDown,
  Building2,
  Briefcase,
  ExternalLink,
  Shield,
  Loader2,
} from 'lucide-react';
import { documentService } from '../services/documentService';
import {
  OpuraDocument,
  OpuraDocumentVersion,
  OpuraDocumentCategoria,
  OpuraDocumentStatus,
} from '../types';
import { useStore } from '../store/useStore';

interface OpuraDocsModuleProps {
  activeOrganizationId: string | null;
  projects: any[];
  currentProfile: {
    group: string;
    role: string;
    email?: string;
  };
  onChangeView: (view: string) => void;
}

const CATEGORIES: { id: OpuraDocumentCategoria; label: string; roles: string[]; placeholder: string }[] = [
  { id: 'engenharia', label: 'Projetos', roles: ['admin', 'owner', 'engenheiro'], placeholder: 'ex: Projeto Estrutural, Memoriais, ART, RRT' },
  { id: 'juridico', label: 'Contratos', roles: ['admin', 'owner', 'financeiro'], placeholder: 'ex: Contratos de Prestação de Serviço, Aditivos, Procurações' },
  { id: 'compliance', label: 'Licenças \u0026 Alvarás', roles: ['admin', 'owner', 'engenheiro'], placeholder: 'ex: AVCB, Licença Ambiental, Seguro, Alvará de Construção' },
  { id: 'financeiro', label: 'Financeiro', roles: ['admin', 'owner', 'financeiro'], placeholder: 'ex: Notas Fiscais, Boletos, Comprovantes de Medição' },
  { id: 'comercial', label: 'Comercial', roles: ['admin', 'owner', 'engenheiro', 'financeiro'], placeholder: 'ex: Propostas Comerciais, Apresentações de Vendas' },
];

export const OpuraDocsModule: React.FC<OpuraDocsModuleProps> = ({
  activeOrganizationId,
  projects,
  currentProfile,
}) => {
  const { companies } = useStore();
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('all');
  const [activeTab, setActiveTab] = React.useState<OpuraDocumentCategoria>('engenharia');
  const [documents, setDocuments] = React.useState<OpuraDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [selectedDocForVersions, setSelectedDocForVersions] = React.useState<OpuraDocument | null>(null);

  // Form State para Upload
  const [newDocName, setNewDocName] = React.useState('');
  const [newDocDesc, setNewDocDesc] = React.useState('');
  const [newDocType, setNewDocType] = React.useState('');
  const [newDocCategory, setNewDocCategory] = React.useState<OpuraDocumentCategoria>('engenharia');
  const [newDocEmissao, setNewDocEmissao] = React.useState('');
  const [newDocValidade, setNewDocValidade] = React.useState('');
  const [newDocAlertaDias, setNewDocAlertaDias] = React.useState(30);
  const [newDocTagsInput, setNewDocTagsInput] = React.useState('');
  const [newDocFile, setNewDocFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  
  // Controle de vinculação opcional a outras tabelas
  const [newDocCompanyId, setNewDocCompanyId] = React.useState('');
  const [newDocProjectId, setNewDocProjectId] = React.useState('');
  const [newDocContractId, setNewDocContractId] = React.useState('');
  const [newDocSupplierId, setNewDocSupplierId] = React.useState('');
  const [newDocClientId, setNewDocClientId] = React.useState('');
  const [newDocInvestorId, setNewDocInvestorId] = React.useState('');

  // Nova versão Upload
  const [newVersionFile, setNewVersionFile] = React.useState<File | null>(null);
  const [uploadingVersion, setUploadingVersion] = React.useState(false);

  // Determinar Permissões do Usuário
  const isDev = currentProfile?.email?.toLowerCase() === 'altair.rosa@alpaconstrutora.com.br' || currentProfile?.group === 'DESENVOLVEDOR';
  const rawRole = currentProfile?.role?.toLowerCase() || 'member';
  const isOrgAdmin = isDev || rawRole === 'owner' || rawRole === 'admin';
  const isEngenheiro = rawRole === 'engenheiro';
  const isFinanceiro = rawRole === 'financeiro';

  // Verificar permissão sobre a aba ativa
  const canAccessTab = (catId: OpuraDocumentCategoria) => {
    if (isOrgAdmin) return true;
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return false;
    if (isEngenheiro && cat.roles.includes('engenheiro')) return true;
    if (isFinanceiro && cat.roles.includes('financeiro')) return true;
    return false;
  };

  // Se o usuário não puder ler a aba ativa default (engenharia), redireciona para a primeira permitida
  React.useEffect(() => {
    if (!canAccessTab(activeTab)) {
      const allowed = CATEGORIES.find(c => canAccessTab(c.id));
      if (allowed) setActiveTab(allowed.id);
    }
  }, [rawRole]);

  // Carregar lista de documentos
  const fetchDocs = async () => {
    if (!activeOrganizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const projFilter = selectedProjectId === 'all' ? undefined : selectedProjectId;
      const data = await documentService.listDocuments(activeOrganizationId, {
        projectId: projFilter,
        categoria: activeTab,
      });
      setDocuments(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar os documentos da organização.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDocs();
  }, [activeOrganizationId, selectedProjectId, activeTab]);

  // Filtrar projetos/obras (classification === 'OBRA')
  const obras = React.useMemo(() => {
    return projects.filter(p => p.settings?.classification === 'OBRA' || !p.settings?.classification);
  }, [projects]);

  // Filtrar documentos localmente por busca simples
  const filteredDocuments = React.useMemo(() => {
    if (!searchQuery) return documents;
    const query = searchQuery.toLowerCase();
    return documents.filter(doc => 
      doc.nome.toLowerCase().includes(query) ||
      (doc.descricao && doc.descricao.toLowerCase().includes(query)) ||
      doc.tipo_documento.toLowerCase().includes(query) ||
      doc.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [documents, searchQuery]);

  // Função para deletar documento
  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Deseja realmente excluir este documento? Todas as versões físicas também serão deletadas.')) return;
    try {
      await documentService.deleteDocument(id, activeOrganizationId || '');
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (selectedDocForVersions?.id === id) setSelectedDocForVersions(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao deletar documento.');
    }
  };

  // Submeter Upload de Novo Documento
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganizationId) return;
    if (!newDocFile) {
      alert('Selecione um arquivo para upload.');
      return;
    }
    
    // Validar tipo de arquivo
    const allowedExtensions = ['pdf', 'docx', 'xlsx', 'dwg', 'jpg', 'png'];
    const fileExt = newDocFile.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(fileExt)) {
      alert('Formato de arquivo não permitido. Use: PDF, DOCX, XLSX, DWG, JPG ou PNG.');
      return;
    }

    // Validar tamanho (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (newDocFile.size > maxSize) {
      alert('O arquivo excede o limite máximo permitido de 50MB.');
      return;
    }

    setUploading(true);
    try {
      const tags = newDocTagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await documentService.uploadNewDocument(
        {
          organization_id: activeOrganizationId,
          nome: newDocName,
          descricao: newDocDesc || undefined,
          categoria: newDocCategory,
          tipo_documento: newDocType,
          status: 'ativo',
          data_emissao: newDocEmissao || undefined,
          data_validade: newDocValidade || undefined,
          alerta_dias_antecedencia: newDocAlertaDias,
          tags,
          project_id: selectedProjectId !== 'all' ? selectedProjectId : (newDocProjectId || undefined),
          company_id: newDocCompanyId || undefined,
          contract_id: newDocContractId || undefined,
          supplier_id: newDocSupplierId || undefined,
          client_id: newDocClientId || undefined,
          investor_id: newDocInvestorId || undefined,
        },
        newDocFile
      );

      // Reset form
      setNewDocName('');
      setNewDocDesc('');
      setNewDocType('');
      setNewDocEmissao('');
      setNewDocValidade('');
      setNewDocAlertaDias(30);
      setNewDocTagsInput('');
      setNewDocFile(null);
      setNewDocCompanyId('');
      setNewDocProjectId('');
      setNewDocContractId('');
      setNewDocSupplierId('');
      setNewDocClientId('');
      setNewDocInvestorId('');
      
      setUploadModalOpen(false);
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao realizar upload do documento.');
    } finally {
      setUploading(false);
    }
  };

  // Submeter Upload de Nova Versão
  const handleUploadVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForVersions || !newVersionFile || !activeOrganizationId) return;

    setUploadingVersion(true);
    try {
      const currentVersions = selectedDocForVersions.versions || [];
      const nextVerNum = currentVersions.length > 0
        ? Math.max(...currentVersions.map(v => v.version_number)) + 1
        : 1;

      await documentService.uploadNewVersion(
        selectedDocForVersions.id,
        activeOrganizationId,
        nextVerNum,
        newVersionFile
      );

      setNewVersionFile(null);
      
      // Recarrega os dados do documento para atualizar o modal de versões
      const updatedDoc = await documentService.getDocumentById(selectedDocForVersions.id);
      setSelectedDocForVersions(updatedDoc);
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao subir nova versão.');
    } finally {
      setUploadingVersion(false);
    }
  };

  // Tratar download seguro
  const handleDownload = async (path: string, fileName: string) => {
    try {
      const url = await documentService.generateDownloadUrl(path);
      // Abre em nova aba ou força download
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert('Erro ao gerar link de download seguro: ' + err.message);
    }
  };

  // Formatar tamanho de arquivo
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Renderizador de Ícone com base no MIME-type/Extensão
  const renderFileIcon = (mime: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-rose-500" />;
    if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="w-8 h-8 text-emerald-600" />;
    if (ext === 'docx' || ext === 'doc') return <FileText className="w-8 h-8 text-blue-600" />;
    if (ext === 'dwg') return <Briefcase className="w-8 h-8 text-amber-600" />;
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) return <ImageIcon className="w-8 h-8 text-violet-500" />;
    return <FileText className="w-8 h-8 text-gray-400" />;
  };

  // Obter classe CSS com base no status da validade do documento
  const getValidadeBadge = (validade?: string) => {
    if (!validade) return null;
    const today = new Date();
    const valDate = new Date(validade);
    const diffTime = valDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-black bg-red-50 text-red-600 rounded-full border border-red-100 uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5" />
          Vencido
        </span>
      );
    }
    if (diffDays <= 30) {
      return (
        <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-black bg-amber-50 text-amber-600 rounded-full border border-amber-100 uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
          Vence em {diffDays} dias
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-black bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 uppercase tracking-wider">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Válido
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-2xl">
              <FolderOpen className="w-6 h-6" />
            </span>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">ÒPURA Docs</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium">
            Governança e centralização de documentos integrados ao ecossistema ÒPURA.
          </p>
        </div>

        {/* Dropdown de Obras / Empreendimento (Feature 2) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-[1.25rem] text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 cursor-pointer"
            >
              <option value="all">🏢 Todos os Empreendimentos</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  🚧 {o.name}
                </option>
              ))}
            </select>
            <Building2 className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Botão de Upload condicional à permissão de escrita do usuário na aba/categoria */}
          {canAccessTab(activeTab) && (
            <button
              onClick={() => {
                setNewDocCategory(activeTab);
                setUploadModalOpen(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/10 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Novo Documento
            </button>
          )}
        </div>
      </div>

      {/* ─── CATEGORIAS / DIRETÓRIOS (Feature 2) ─── */}
      <div className="flex border-b border-slate-100 overflow-x-auto gap-2 pb-px">
        {CATEGORIES.map((cat) => {
          const isAllowed = canAccessTab(cat.id);
          if (!isAllowed) return null; // Esconde abas proibidas pelo controle de acesso (Feature 3)

          const isActive = activeTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`px-5 py-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* ─── FILTROS DE BUSCA E LISTAGEM ─── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Barra de Busca */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/20">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar documento por nome, tipo, tag ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-4.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Listagem */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Carregando Acervo...</p>
          </div>
        ) : !activeOrganizationId ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
              <FolderOpen className="w-12 h-12" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700">Nenhuma Organização Selecionada</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-sm">
                Selecione uma organização no menu superior para visualizar os documentos.
              </p>
            </div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
              <FolderOpen className="w-12 h-12" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700">Nenhum documento encontrado</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-sm">
                Não existem arquivos nesta pasta para o empreendimento selecionado.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4 hover:bg-slate-50/40 transition-colors"
              >
                {/* Metadados Básicos */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {doc.active_version
                      ? renderFileIcon(doc.active_version.mime_type, doc.active_version.storage_path)
                      : <FileText className="w-8 h-8 text-gray-300" />}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-800 leading-snug">{doc.nome}</h4>
                      <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 rounded">
                        {doc.tipo_documento}
                      </span>
                      {getValidadeBadge(doc.data_validade)}
                    </div>
                    {doc.descricao && (
                      <p className="text-slate-500 text-sm max-w-2xl">{doc.descricao}</p>
                    )}
                    
                    {/* Tags */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {doc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-xs font-semibold border border-slate-100"
                          >
                            <Tag className="w-3 h-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Vínculo de Obras / Contrato */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 pt-1 font-semibold">
                      {doc.project_id && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" />
                          Obra: {projects.find(p => p.id === doc.project_id)?.name || 'Vínculo Externo'}
                        </span>
                      )}
                      {doc.data_emissao && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          Emissão: {new Date(doc.data_emissao).toLocaleDateString()}
                        </span>
                      )}
                      {doc.active_version && (
                        <span className="text-slate-400">
                          {formatSize(doc.active_version.tamanho)} • V{doc.active_version.version_number}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações (Download, Versões, Exclusão) */}
                <div className="flex items-center gap-2 self-end md:self-auto">
                  {doc.active_version && (
                    <button
                      onClick={() => handleDownload(doc.active_version!.storage_path, doc.nome)}
                      title="Download do arquivo atual"
                      className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-xl transition-all shadow-sm active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const fullDoc = await documentService.getDocumentById(doc.id);
                      setSelectedDocForVersions(fullDoc);
                    }}
                    title="Histórico de versões"
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-xl transition-all shadow-sm text-xs font-bold active:scale-95"
                  >
                    <History className="w-4 h-4" />
                    Histórico
                  </button>

                  {/* Apenas Admins ou Donos podem deletar (Feature 3) */}
                  {isOrgAdmin && (
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      title="Excluir documento"
                      className="p-2.5 bg-white border border-red-50 text-red-500 hover:bg-red-50 rounded-xl transition-all shadow-sm active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL DE UPLOAD DE NOVO DOCUMENTO (Feature 1) ─── */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">Novo Documento — {CATEGORIES.find(c => c.id === newDocCategory)?.label}</h3>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-5">
              {/* Arquivo (Drag and Drop Simples) */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Arquivo Físico (PDF, DOCX, XLSX, DWG, Imagens — Max 50MB)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50 relative">
                  <input
                    type="file"
                    required
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setNewDocFile(e.target.files[0]);
                        // Tenta sugerir nome automaticamente
                        if (!newDocName) {
                          const baseName = e.target.files[0].name.split('.').slice(0, -1).join('.');
                          setNewDocName(baseName);
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">
                    {newDocFile ? newDocFile.name : 'Arraste ou clique para selecionar seu arquivo'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {newDocFile ? formatSize(newDocFile.size) : 'Limite de 50 MB'}
                  </p>
                </div>
              </div>

              {/* Linha 1: Nome e Tipo de Doc */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Nome do Documento</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome simplificado"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Tipo de Documento</label>
                  <input
                    type="text"
                    required
                    placeholder={CATEGORIES.find(c => c.id === newDocCategory)?.placeholder}
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Descrição / Notas</label>
                <textarea
                  placeholder="Observações ou detalhes importantes..."
                  value={newDocDesc}
                  onChange={(e) => setNewDocDesc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25 resize-none"
                />
              </div>

              {/* Emissão, Validade e Dias Alerta */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Data de Emissão</label>
                  <input
                    type="date"
                    value={newDocEmissao}
                    onChange={(e) => setNewDocEmissao(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Data de Vencimento</label>
                  <input
                    type="date"
                    value={newDocValidade}
                    onChange={(e) => setNewDocValidade(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Alerta de Vencimento</label>
                  <select
                    value={newDocAlertaDias}
                    onChange={(e) => setNewDocAlertaDias(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value={90}>90 dias antes</option>
                    <option value={60}>60 dias antes</option>
                    <option value={30}>30 dias antes</option>
                    <option value={15}>15 dias antes</option>
                    <option value={7}>7 dias antes</option>
                  </select>
                </div>
              </div>

              {/* Tags e Vínculos adicionais */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Tags (Separadas por vírgula)</label>
                  <input
                    type="text"
                    placeholder="obra, fundação, AVCB, fiscal"
                    value={newDocTagsInput}
                    onChange={(e) => setNewDocTagsInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>

                {/* Vínculo de Obra/Empreendimento (Opcional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Obra/Empreendimento (Opcional)</label>
                  <select
                    value={selectedProjectId !== 'all' ? selectedProjectId : newDocProjectId}
                    onChange={(e) => setNewDocProjectId(e.target.value)}
                    disabled={selectedProjectId !== 'all'}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60"
                  >
                    <option value="">Nenhum (Geral)</option>
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vínculo de Empresa (Sócio/Filial/Holding) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Empresa Vinculada (Opcional)</label>
                  <select
                    value={newDocCompanyId}
                    onChange={(e) => setNewDocCompanyId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Nenhuma</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razao_social}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-5 py-3 border border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/10 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Salvar Documento
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE HISTÓRICO DE VERSÕES / RENOVAÇÃO (Feature 4/5) ─── */}
      {selectedDocForVersions && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Histórico de Versões</h3>
                  <p className="text-xs text-slate-400 font-bold">{selectedDocForVersions.nome}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDocForVersions(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Form para Upload de Nova Versão / Renovação */}
              {canAccessTab(selectedDocForVersions.categoria) && (
                <form onSubmit={handleUploadVersionSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                    <Upload className="w-4 h-4" />
                    Subir nova versão ou renovação
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-grow border border-slate-200 rounded-xl bg-white p-3 hover:border-blue-400 transition-colors">
                      <input
                        type="file"
                        required
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setNewVersionFile(e.target.files[0]);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <p className="text-xs font-bold text-slate-600 text-center truncate">
                        {newVersionFile ? newVersionFile.name : 'Selecionar novo arquivo...'}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={uploadingVersion || !newVersionFile}
                      className="px-6 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {uploadingVersion ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Upload'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Histórico / Lista de Versões */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Versões Cadastradas</h4>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                  {selectedDocForVersions.versions?.map((ver) => {
                    const isActive = selectedDocForVersions.active_version_id === ver.id;
                    return (
                      <div key={ver.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider rounded ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            V{ver.version_number} {isActive && '(Atual)'}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-700 truncate max-w-xs md:max-w-md" title={ver.storage_path.split('/').pop()}>
                              {ver.storage_path.split('/').pop()?.substring(37)} {/* Remove UUID do nome */}
                            </p>
                            <p className="text-xs text-slate-400 font-semibold">
                              Por {ver.criado_por} em {new Date(ver.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload(ver.storage_path, selectedDocForVersions.nome)}
                          title="Baixar esta versão"
                          className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpuraDocsModule;
