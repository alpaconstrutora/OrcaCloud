import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesEspecificacao } from '../types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { 
  Sparkles, 
  ArrowLeft, 
  Folder, 
  FileText, 
  Share2, 
  Plus, 
  Trash2, 
  CheckSquare, 
  Layers, 
  Image as ImageIcon, 
  HardHat, 
  Calendar,
  CheckCircle2,
  ExternalLink,
  DollarSign,
  AlertTriangle,
  TrendingUp
} from 'lucide-react';

interface OfficesEspecificadorProps {
  userId: string;
}

// Lista padrão de imagens para banners de projetos
const BANNER_PROJETOS = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80'
];

// Fases de cronograma padrão para iniciar projetos novos
const CRONOGRAMA_PADRAO = [
  { id: '1', fase: 'Estudo Preliminar', item: 'Briefing inicial com cliente', completed: true },
  { id: '2', fase: 'Estudo Preliminar', item: 'Levantamento métrico in-loco', completed: true },
  { id: '3', fase: 'Estudo Preliminar', item: 'Apresentação de Moodboards conceituais', completed: false },
  { id: '4', fase: 'Anteprojeto', item: 'Modelagem 3D & Estudo de Volumetria', completed: false },
  { id: '5', fase: 'Anteprojeto', item: 'Renders fotorrealistas aprovados', completed: false },
  { id: '6', fase: 'Projeto Legal', item: 'Desenho de pranchas para prefeitura', completed: false },
  { id: '7', fase: 'Projeto Executivo', item: 'Detalhamento de marcenaria e pedra', completed: false },
  { id: '8', fase: 'Projeto Executivo', item: 'Caderno de especificações técnicas', completed: false },
  { id: '9', fase: 'Obra', item: 'Marcação hidráulica e elétrica', completed: false },
  { id: '10', fase: 'Obra', item: 'Acompanhamento de pintura e acabamentos', completed: false }
];

export const OfficesEspecificador: React.FC<OfficesEspecificadorProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [projetos, setProjetos] = useState<any[]>([]);
  const [selectedProjeto, setSelectedProjeto] = useState<any | null>(null);
  const [especificacoes, setEspecificacoes] = useState<OfficesEspecificacao[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'CRONOGRAMA' | 'ESPECIFICACOES' | 'ARQUIVOS' | 'RDO' | 'FINANCEIRO'>('CRONOGRAMA');

  // Estados para nova tarefa do Cronograma
  const [cronogramaFase, setCronogramaFase] = useState('Estudo Preliminar');
  const [cronogramaItem, setCronogramaItem] = useState('');
  const [cronogramaResponsavel, setCronogramaResponsavel] = useState('Altair');
  const [isAddCronogramaOpen, setIsAddCronogramaOpen] = useState(false);

  // Estados para nova parcela do Financeiro
  const [financeiroParcela, setFinanceiroParcela] = useState('1/3');
  const [financeiroValor, setFinanceiroValor] = useState('0');
  const [financeiroVencimento, setFinanceiroVencimento] = useState(new Date().toISOString().split('T')[0]);
  const [financeiroStatus, setFinanceiroStatus] = useState<'PAGO' | 'PENDENTE' | 'ATRASADO'>('PENDENTE');
  const [isAddFinanceiroOpen, setIsAddFinanceiroOpen] = useState(false);

  // Estados dos Modais
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [isArquivoModalOpen, setIsArquivoModalOpen] = useState(false);
  const [isRDOModalOpen, setIsRDOModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Partial<OfficesEspecificacao> | null>(null);

  // Estados do formulário de Especificações
  const [ambiente, setAmbiente] = useState('');
  const [itemNome, setItemNome] = useState('');
  const [fabricanteFornecedor, setFabricanteFornecedor] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [precoUnitario, setPrecoUnitario] = useState('0');
  const [fotoUrl, setFotoUrl] = useState('');
  const [statusAprovacao, setStatusAprovacao] = useState<'PENDENTE' | 'APROVADO' | 'RECUSADO'>('PENDENTE');
  const [comentarioCliente, setComentarioCliente] = useState('');

  // Estados do formulário de Arquivos
  const [arqNome, setArqNome] = useState('');
  const [arqTipo, setArqTipo] = useState<'PLANTA' | 'PDF' | 'RENDER'>('PLANTA');
  const [arqUrl, setArqUrl] = useState('');

  // Estados do formulário de RDO
  const [rdoData, setRdoData] = useState(new Date().toISOString().split('T')[0]);
  const [rdoResponsavel, setRdoResponsavel] = useState('Altair');
  const [rdoDescricao, setRdoDescricao] = useState('');
  const [rdoStatus, setRdoStatus] = useState<'OK' | 'ATRASO' | 'PROBLEMA'>('OK');

  // Carregar lista de projetos no mount
  const fetchProjetos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjetos(data || []);
    } catch (err) {
      console.error('Erro ao buscar projetos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjetos();
  }, []);

  // Carrega especificações do projeto selecionado
  const loadSpecs = useCallback(async (projetoId: string) => {
    try {
      setLoading(true);
      const data = await officesService.listEspecificacoesByProjeto(projetoId);
      setEspecificacoes(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar especificações.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectProjeto = (proj: any) => {
    setSelectedProjeto(proj);
    loadSpecs(proj.id);
    setActiveSubTab('CRONOGRAMA');
  };

  const handleBackToGallery = () => {
    setSelectedProjeto(null);
    setEspecificacoes([]);
    fetchProjetos();
  };

  // Salva as configurações de settings do projeto no Supabase
  const updateProjectSettings = async (updatedSettings: any) => {
    if (!selectedProjeto) return;
    try {
      setLoading(true);
      const { error } = await supabase
        .from('projects')
        .update({ settings: updatedSettings })
        .eq('id', selectedProjeto.id);

      if (error) throw error;
      
      setSelectedProjeto((prev: any) => prev ? { ...prev, settings: updatedSettings } : null);
      setProjetos((prev: any[]) => prev.map((p: any) => p.id === selectedProjeto.id ? { ...p, settings: updatedSettings } : p));
    } catch (e: any) {
      console.error('Erro ao salvar configurações do projeto:', e);
      alert('Erro ao salvar alterações no Supabase.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // LOGICA: CRONOGRAMA & CHECKLISTS
  // ==========================================
  const cronogramaItens = useMemo(() => {
    return selectedProjeto?.settings?.etapas || CRONOGRAMA_PADRAO;
  }, [selectedProjeto]);

  const progressoProjeto = useMemo(() => {
    if (cronogramaItens.length === 0) return 0;
    const concluidos = cronogramaItens.filter((c: any) => c.completed).length;
    return Math.round((concluidos / cronogramaItens.length) * 100);
  }, [cronogramaItens]);

  const toggleCronogramaItem = async (itemId: string) => {
    const updated = cronogramaItens.map((item: any) => 
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    const settings = selectedProjeto?.settings || {};
    settings.etapas = updated;
    await updateProjectSettings(settings);
  };

  const handleAddCronogramaItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cronogramaItem.trim()) {
      alert('Por favor, informe a descrição da atividade.');
      return;
    }

    const newItem = {
      id: `task-${Math.random().toString(36).substring(2, 9)}`,
      fase: cronogramaFase,
      item: cronogramaItem.trim(),
      completed: false,
      responsavel: cronogramaResponsavel
    };

    const settings = selectedProjeto?.settings || {};
    const etapas = settings.etapas || CRONOGRAMA_PADRAO;
    settings.etapas = [...etapas, newItem];

    await updateProjectSettings(settings);

    setCronogramaItem('');
    setIsAddCronogramaOpen(false);
  };

  const handleDeleteCronogramaItem = async (itemId: string) => {
    if (!confirm('Deseja realmente remover esta atividade do cronograma?')) return;
    
    const settings = selectedProjeto?.settings || {};
    const etapas = settings.etapas || CRONOGRAMA_PADRAO;
    settings.etapas = etapas.filter((item: any) => item.id !== itemId);

    await updateProjectSettings(settings);
  };

  // ==========================================
  // LOGICA: FINANCEIRO DO PROJETO
  // ==========================================
  const financeiroItens = useMemo(() => {
    return selectedProjeto?.settings?.financeiro || [];
  }, [selectedProjeto]);

  const financeiroConsolidado = useMemo(() => {
    let pago = 0;
    let pendente = 0;
    let atrasado = 0;

    financeiroItens.forEach((item: any) => {
      const val = Number(item.valor || 0);
      if (item.status === 'PAGO') pago += val;
      else if (item.status === 'PENDENTE') pendente += val;
      else if (item.status === 'ATRASADO') atrasado += val;
    });

    return { pago, pendente, atrasado };
  }, [financeiroItens]);

  const handleAddFinanceiroItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(financeiroValor) <= 0) {
      alert('Por favor, informe um valor maior que zero.');
      return;
    }

    const newItem = {
      id: `finst-${Math.random().toString(36).substring(2, 9)}`,
      projectName: selectedProjeto.name,
      parcela: financeiroParcela,
      valor: Number(financeiroValor),
      vencimento: financeiroVencimento,
      status: financeiroStatus
    };

    const settings = selectedProjeto?.settings || {};
    const current = settings.financeiro || [];
    settings.financeiro = [...current, newItem];

    await updateProjectSettings(settings);

    setFinanceiroValor('0');
    setIsAddFinanceiroOpen(false);
  };

  const handleDeleteFinanceiroItem = async (itemId: string) => {
    if (!confirm('Deseja remover esta parcela?')) return;

    const settings = selectedProjeto?.settings || {};
    const current = settings.financeiro || [];
    settings.financeiro = current.filter((item: any) => item.id !== itemId);

    await updateProjectSettings(settings);
  };

  const handleToggleFinanceiroStatus = async (itemId: string, currentStatus: string) => {
    const nextStatusMap: Record<string, 'PAGO' | 'PENDENTE' | 'ATRASADO'> = {
      'PENDENTE': 'PAGO',
      'PAGO': 'ATRASADO',
      'ATRASADO': 'PENDENTE'
    };
    const nextStatus = nextStatusMap[currentStatus] || 'PENDENTE';

    const settings = selectedProjeto?.settings || {};
    const current = settings.financeiro || [];
    settings.financeiro = current.map((item: any) =>
      item.id === itemId ? { ...item, status: nextStatus } : item
    );

    await updateProjectSettings(settings);
  };

  // ==========================================
  // LOGICA: ARQUIVOS & PLANTA
  // ==========================================
  const arquivosProjeto = useMemo(() => {
    return selectedProjeto?.settings?.arquivos || [];
  }, [selectedProjeto]);

  const handleAddArquivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arqNome.trim() || !arqUrl.trim()) {
      alert('Preencha título e URL do arquivo.');
      return;
    }

    const newArq = {
      id: `arq-${Math.random().toString(36).substring(2, 9)}`,
      nome: arqNome.trim(),
      tipo: arqTipo,
      url: arqUrl.trim(),
      criado_em: new Date().toISOString()
    };

    const settings = selectedProjeto?.settings || {};
    const current = settings.arquivos || [];
    settings.arquivos = [...current, newArq];

    await updateProjectSettings(settings);

    setArqNome('');
    setArqUrl('');
    setIsArquivoModalOpen(false);
  };

  const handleDeleteArquivo = async (id: string) => {
    if (!confirm('Deseja realmente remover este arquivo?')) return;
    const settings = selectedProjeto?.settings || {};
    const current = settings.arquivos || [];
    settings.arquivos = current.filter((a: any) => a.id !== id);

    await updateProjectSettings(settings);
  };

  // ==========================================
  // LOGICA: DIÁRIO DE OBRA (RDO)
  // ==========================================
  const rdosProjeto = useMemo(() => {
    return selectedProjeto?.settings?.rdos || [];
  }, [selectedProjeto]);

  const handleAddRDO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rdoDescricao.trim()) {
      alert('Por favor, descreva a vistoria técnica da obra.');
      return;
    }

    const newRDO = {
      id: `rdo-${Math.random().toString(36).substring(2, 9)}`,
      data: rdoData,
      responsavel: rdoResponsavel.trim(),
      descricao: rdoDescricao.trim(),
      status: rdoStatus,
      criado_em: new Date().toISOString()
    };

    const settings = selectedProjeto?.settings || {};
    const current = settings.rdos || [];
    settings.rdos = [...current, newRDO];

    await updateProjectSettings(settings);

    setRdoDescricao('');
    setIsRDOModalOpen(false);
  };

  const handleDeleteRDO = async (id: string) => {
    if (!confirm('Deseja realmente remover este RDO?')) return;
    const settings = selectedProjeto?.settings || {};
    const current = settings.rdos || [];
    settings.rdos = current.filter((r: any) => r.id !== id);

    await updateProjectSettings(settings);
  };

  // ==========================================
  // LOGICA: ESPECIFICAÇÕES
  // ==========================================
  const handleOpenNewSpec = () => {
    setEditingSpec(null);
    setAmbiente('');
    setItemNome('');
    setFabricanteFornecedor('');
    setQuantidade('1');
    setPrecoUnitario('0');
    setFotoUrl('');
    setStatusAprovacao('PENDENTE');
    setComentarioCliente('');
    setIsSpecModalOpen(true);
  };

  const handleOpenEditSpec = (spec: OfficesEspecificacao) => {
    setEditingSpec(spec);
    setAmbiente(spec.ambiente);
    setItemNome(spec.item_nome);
    setFabricanteFornecedor(spec.fabricante_fornecedor || '');
    setQuantidade(spec.quantidade.toString());
    setPrecoUnitario(spec.preco_unitario.toString());
    setFotoUrl(spec.foto_url || '');
    setStatusAprovacao(spec.status_aprovacao);
    setComentarioCliente(spec.comentario_cliente || '');
    setIsSpecModalOpen(true);
  };

  const handleSaveSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ambiente || !itemNome || !selectedProjeto) return;

    try {
      setLoading(true);
      await officesService.saveEspecificacao({
        id: editingSpec?.id,
        user_id: userId,
        projeto_id: selectedProjeto.id,
        ambiente: ambiente.trim(),
        item_nome: itemNome.trim(),
        fabricante_fornecedor: fabricanteFornecedor.trim() || undefined,
        quantidade: Number(quantidade || 1),
        preco_unitario: Number(precoUnitario || 0),
        foto_url: fotoUrl.trim() || undefined,
        status_aprovacao: statusAprovacao,
        comentario_cliente: comentarioCliente.trim() || undefined
      });

      setIsSpecModalOpen(false);
      loadSpecs(selectedProjeto.id);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar item.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSpec = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta especificação?')) return;
    try {
      setLoading(true);
      await officesService.deleteEspecificacao(id);
      setIsSpecModalOpen(false);
      loadSpecs(selectedProjeto.id);
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyClientLink = () => {
    if (!selectedProjeto) return;
    const clientLink = `${window.location.origin}/especificacoes-cliente/${selectedProjeto.id}`;
    navigator.clipboard.writeText(clientLink)
      .then(() => alert('Link copiado para a área de transferência! Envie para o seu cliente via WhatsApp.'))
      .catch(err => alert('Link: ' + clientLink));
  };

  const handleExportPDF = () => {
    if (!selectedProjeto || especificacoes.length === 0) return;
    try {
      const doc = new jsPDF();
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text("MEMORIAL DESCRITIVO DE ESPECIFICAÇÕES", 14, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Projeto: ${selectedProjeto.name}`, 14, 28);
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

      const totalCost = especificacoes.reduce((sum, s) => sum + (s.quantidade * s.preco_unitario), 0);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(212, 122, 85);
      doc.text(`Custo Total Especificado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}`, 14, 42);

      (doc as any).autoTable({
        head: [['Ambiente', 'Item Especificado', 'Fornecedor / Fabricante', 'Qtd', 'Preço Unit.', 'Subtotal', 'Aprovação']],
        body: especificacoes.map(item => [
          item.ambiente,
          item.item_nome,
          item.fabricante_fornecedor || '-',
          item.quantidade.toString(),
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco_unitario),
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.quantidade * item.preco_unitario),
          item.status_aprovacao
        ]),
        startY: 50,
        theme: 'striped',
        headStyles: { fillColor: [30, 32, 34], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { top: 50 }
      });

      doc.save(`memorial-${selectedProjeto.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao exportar: ' + err.message);
    }
  };

  const specsPorAmbiente = useMemo(() => {
    const map: Record<string, OfficesEspecificacao[]> = {};
    especificacoes.forEach(spec => {
      const amb = spec.ambiente;
      if (!map[amb]) map[amb] = [];
      map[amb].push(spec);
    });
    return map;
  }, [especificacoes]);

  const custoTotal = especificacoes.reduce((sum, s) => sum + (s.quantidade * s.preco_unitario), 0);

  if (loading && projetos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#121315]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3 text-[#D47A55]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Buscando Projetos...</span>
      </div>
    );
  }

  // RENDERIZAÇÃO: GALERIA DE CARD DE PROJETOS (SE NÃO HOUVER PROJETO SELECIONADO)
  if (!selectedProjeto) {
    return (
      <div className="p-5 space-y-6 bg-[#121315] text-slate-100 min-h-screen pb-24">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">Projetos do Escritório</h1>
          <p className="text-xs font-semibold text-slate-400">Gerenciamento completo e visualização de pranchas</p>
        </div>

        {projetos.length === 0 ? (
          <div className="text-center py-16 px-4 border border-dashed border-white/5 rounded-[28px] text-xs text-slate-500 bg-[#1E2022]">
            Nenhum projeto registrado no sistema.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {projetos.map((p, index) => {
              const bgBanner = BANNER_PROJETOS[index % BANNER_PROJETOS.length];
              const etapas = p.settings?.etapas || CRONOGRAMA_PADRAO;
              const concluidas = etapas.filter((c: any) => c.completed).length;
              const rate = etapas.length > 0 ? Math.round((concluidas / etapas.length) * 100) : 0;
              const rdos = p.settings?.rdos || [];

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectProjeto(p)}
                  className="bg-[#1E2022] border border-white/5 rounded-[28px] overflow-hidden shadow-lg hover:shadow-2xl hover:border-white/10 transition-all cursor-pointer group relative flex flex-col"
                >
                  <div className="h-32 w-full relative overflow-hidden bg-slate-950">
                    <img src={bgBanner} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1E2022] to-transparent" />
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1">
                      <h3 className="font-black text-sm text-white group-hover:text-[#D47A55] transition-colors">{p.name}</h3>
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                        <span>Fases: {concluidas}/{etapas.length}</span>
                        <span>•</span>
                        <span>{rdos.length} RDOs</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-[#D47A55]">
                        <span>Progresso</span>
                        <span>{rate}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#D47A55] to-[#C8643C]" style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // RENDERIZAÇÃO: PÁGINA INDIVIDUAL DO PROJETO COM ABAS
  const bannerAtual = BANNER_PROJETOS[projetos.findIndex(p => p.id === selectedProjeto.id) % BANNER_PROJETOS.length];

  return (
    <div className="bg-[#121315] text-slate-100 min-h-screen pb-24 flex flex-col">
      {/* Banner Imersivo */}
      <div className="h-44 w-full relative bg-slate-950">
        <img src={bannerAtual} alt={selectedProjeto.name} className="w-full h-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121315] via-[#121315]/40 to-black/40" />
        
        {/* Voltar botão */}
        <button 
          onClick={handleBackToGallery}
          className="absolute top-4 left-4 p-2 bg-black/45 hover:bg-black/60 border border-white/5 backdrop-blur-md rounded-xl text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Metadados no topo da imagem */}
        <div className="absolute bottom-4 left-5 right-5 flex flex-col justify-end">
          <span className="text-[8px] font-black uppercase tracking-widest text-[#D47A55] bg-[#D47A55]/10 border border-[#D47A55]/10 px-2 py-0.5 rounded-full w-fit">
            Projeto Ativo
          </span>
          <h2 className="text-lg font-black text-white tracking-tight mt-1">{selectedProjeto.name}</h2>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            <span>Área: 320 m²</span>
            <span>•</span>
            <span>Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(custoTotal || 48000)}</span>
          </div>
        </div>
      </div>

      {/* Abas Subnavegação */}
      <div className="px-5 border-b border-white/5 bg-[#17181A] flex gap-4 overflow-x-auto scrollbar-none py-2.5">
        {[
          { id: 'CRONOGRAMA', label: 'Cronograma', icon: CheckSquare },
          { id: 'ESPECIFICACOES', label: 'Especificador', icon: Folder },
          { id: 'ARQUIVOS', label: 'Arquivos', icon: FileText },
          { id: 'RDO', label: 'Diário Obra', icon: HardHat },
          { id: 'FINANCEIRO', label: 'Financeiro', icon: DollarSign }
        ].map((subTab) => {
          const Icon = subTab.icon;
          return (
            <button
              key={subTab.id}
              onClick={() => setActiveSubTab(subTab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                activeSubTab === subTab.id
                  ? 'bg-[#D47A55] text-white border-[#D47A55] shadow-md'
                  : 'bg-[#1E2022] text-slate-400 border-white/5 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {subTab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo Aba Ativa */}
      <div className="p-5 flex-1 space-y-5">

        {/* ==========================================
            ABA 1: CRONOGRAMA & VISÃO GERAL
            ========================================== */}
        {activeSubTab === 'CRONOGRAMA' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Visão Geral</span>
                  <span className="block font-black text-sm text-white mt-0.5">Progresso Técnico</span>
                </div>
                <span className="text-sm font-black text-[#D47A55]">{progressoProjeto}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-[#D47A55]" style={{ width: `${progressoProjeto}%` }} />
              </div>
            </div>

            <div className="space-y-2 bg-[#1E2022] border border-white/5 p-4 rounded-[28px] shadow-lg">
              <div className="flex justify-between items-center mb-3">
                <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Etapas do Projeto</span>
                <button
                  onClick={() => setIsAddCronogramaOpen(!isAddCronogramaOpen)}
                  className="px-2.5 py-1 bg-slate-900 border border-white/5 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-white rounded-lg transition-all"
                >
                  {isAddCronogramaOpen ? 'Fechar' : '+ Nova Tarefa'}
                </button>
              </div>

              {isAddCronogramaOpen && (
                <form onSubmit={handleAddCronogramaItem} className="p-3.5 bg-slate-900/60 border border-white/5 rounded-2xl space-y-3 mb-4">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Adicionar Tarefa</span>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Nome da atividade (ex: Detalhamento de Banheiro)"
                      value={cronogramaItem}
                      onChange={(e) => setCronogramaItem(e.target.value)}
                      className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                      required
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={cronogramaFase}
                        onChange={(e) => setCronogramaFase(e.target.value)}
                        className="bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                      >
                        <option value="Estudo Preliminar">Estudo Preliminar</option>
                        <option value="Anteprojeto">Anteprojeto</option>
                        <option value="Projeto Legal">Projeto Legal</option>
                        <option value="Projeto Executivo">Projeto Executivo</option>
                        <option value="Obra">Obra</option>
                      </select>
                      <select
                        value={cronogramaResponsavel}
                        onChange={(e) => setCronogramaResponsavel(e.target.value)}
                        className="bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                      >
                        <option value="Altair">Altair</option>
                        <option value="Colaborador">Colaborador</option>
                        <option value="Engenheiro">Engenheiro</option>
                        <option value="Cliente">Cliente</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                  >
                    Gravar Atividade
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {cronogramaItens.map((item: any) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between py-1.5 hover:bg-white/5 px-2 rounded-xl transition-all group"
                  >
                    <div
                      onClick={() => toggleCronogramaItem(item.id)}
                      className="flex items-start gap-3 cursor-pointer select-none flex-1"
                    >
                      <div className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center transition-colors ${
                        item.completed ? 'bg-[#D47A55] border-[#C8643C] text-white' : 'border-white/10 bg-slate-900'
                      }`}>
                        {item.completed && '✓'}
                      </div>
                      <div className="space-y-0.5">
                        <span className={`block text-xs font-semibold ${item.completed ? 'line-through text-slate-500' : 'text-white'}`}>
                          {item.item}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="block text-[8px] font-black uppercase text-[#D47A55] tracking-widest">
                            {item.fase}
                          </span>
                          {item.responsavel && (
                            <>
                              <span className="text-slate-600 text-[8px]">•</span>
                              <span className="block text-[8px] font-black uppercase text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-white/5 tracking-wider">
                                👤 {item.responsavel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteCronogramaItem(item.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-all opacity-0 group-hover:opacity-100"
                      title="Excluir Atividade"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            ABA 5: FINANCEIRO DO PROJETO
            ========================================== */}
        {activeSubTab === 'FINANCEIRO' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* KPIs Financeiros Locais */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-[#1E2022] border border-white/5 p-3 rounded-2xl shadow space-y-1">
                <span className="block text-[7px] font-black uppercase tracking-widest text-slate-500">Recebido</span>
                <span className="block text-xs font-black text-white truncate">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financeiroConsolidado.pago)}
                </span>
              </div>
              <div className="bg-[#1E2022] border border-white/5 p-3 rounded-2xl shadow space-y-1">
                <span className="block text-[7px] font-black uppercase tracking-widest text-slate-500">A Receber</span>
                <span className="block text-xs font-black text-[#D47A55] truncate">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financeiroConsolidado.pendente)}
                </span>
              </div>
              <div className="bg-[#1E2022] border border-white/5 p-3 rounded-2xl shadow space-y-1">
                <span className="block text-[7px] font-black uppercase tracking-widest text-slate-500">Atrasado</span>
                <span className={`block text-xs font-black truncate ${financeiroConsolidado.atrasado > 0 ? 'text-red-400' : 'text-white'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(financeiroConsolidado.atrasado)}
                </span>
              </div>
            </div>

            {/* Cabeçalho da Lista + Adicionar Parcela */}
            <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[28px] shadow-lg space-y-4">
              <div className="flex justify-between items-center">
                <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Fluxo de Medições</span>
                <button
                  onClick={() => setIsAddFinanceiroOpen(!isAddFinanceiroOpen)}
                  className="px-2.5 py-1 bg-slate-900 border border-white/5 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-white rounded-lg transition-all"
                >
                  {isAddFinanceiroOpen ? 'Fechar' : '+ Nova Parcela'}
                </button>
              </div>

              {/* Formulário Nova Parcela */}
              {isAddFinanceiroOpen && (
                <form onSubmit={handleAddFinanceiroItem} className="p-3.5 bg-slate-900/60 border border-white/5 rounded-2xl space-y-3">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Cadastrar Parcela</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1 col-span-2">
                      <label className="block text-[7px] font-bold text-slate-500 uppercase">Identificação / Parcela (ex: Parcela 2/3)</label>
                      <input
                        type="text"
                        value={financeiroParcela}
                        onChange={(e) => setFinanceiroParcela(e.target.value)}
                        className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[7px] font-bold text-slate-500 uppercase">Valor (R$)</label>
                      <input
                        type="number"
                        value={financeiroValor}
                        onChange={(e) => setFinanceiroValor(e.target.value)}
                        className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[7px] font-bold text-slate-500 uppercase">Vencimento</label>
                      <input
                        type="date"
                        value={financeiroVencimento}
                        onChange={(e) => setFinanceiroVencimento(e.target.value)}
                        className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-[#D47A55] font-medium"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                  >
                    Gravar Medição
                  </button>
                </form>
              )}

              {/* Tabela/Lista de Parcelas */}
              {financeiroItens.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  Nenhuma parcela ou medição registrada para este projeto.
                </div>
              ) : (
                <div className="space-y-2">
                  {financeiroItens.map((item: any) => (
                    <div 
                      key={item.id}
                      className="bg-slate-900/40 border border-white/5 p-3 rounded-2xl flex items-center justify-between hover:bg-slate-900/60 transition-all group"
                    >
                      <div className="space-y-0.5">
                        <span className="block text-xs font-black text-white">{item.parcela}</span>
                        <span className="block text-[8px] text-slate-500 font-bold uppercase">
                          Vence: {new Date(item.vencimento).toLocaleDateString('pt-BR')} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Status Toggle Badge */}
                        <button
                          onClick={() => handleToggleFinanceiroStatus(item.id, item.status)}
                          className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-all ${
                            item.status === 'PAGO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/10' :
                            item.status === 'ATRASADO' ? 'bg-red-500/20 text-red-400 border-red-500/10 animate-pulse' :
                            'bg-slate-800 text-slate-400 border-white/5 hover:text-white'
                          }`}
                          title="Clique para alternar o status de pagamento"
                        >
                          {item.status}
                        </button>

                        {/* Excluir Parcela */}
                        <button
                          onClick={() => handleDeleteFinanceiroItem(item.id)}
                          className="p-1 text-slate-550 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            ABA 2: ESPECIFICADOR (PRODUTO ATUAL)
            ========================================== */}
        {activeSubTab === 'ESPECIFICACOES' && (
          <div className="space-y-5">
            <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg space-y-3">
              <span className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Resumo Técnico</span>
              <div className="flex justify-between items-center pt-1">
                <div className="space-y-0.5">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Total Especificado</span>
                  <span className="block text-base font-black text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(custoTotal)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleOpenNewSpec} className="px-3 py-1.5 bg-[#D47A55] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#C8643C]">
                    + Novo Item
                  </button>
                </div>
              </div>

              {especificacoes.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                  <button onClick={handleCopyClientLink} className="py-2 bg-slate-900 border border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400 rounded-xl hover:text-white flex items-center justify-center gap-1 shadow-sm">
                    <Share2 className="w-3 h-3 text-[#D47A55]" /> Link Cliente
                  </button>
                  <button onClick={handleExportPDF} className="py-2 bg-slate-900 border border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400 rounded-xl hover:text-white flex items-center justify-center gap-1 shadow-sm">
                    <FileText className="w-3 h-3 text-[#D47A55]" /> PDF
                  </button>
                </div>
              )}
            </div>

            {especificacoes.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-white/5 bg-[#1E2022] rounded-[24px] text-xs text-slate-500">
                Nenhuma especificação para este projeto.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.keys(specsPorAmbiente).map(amb => {
                  const items = specsPorAmbiente[amb];
                  const subTotal = items.reduce((s, i) => s + (i.quantidade * i.preco_unitario), 0);

                  return (
                    <div key={amb} className="space-y-2.5">
                      <div className="flex justify-between items-center bg-[#1E2022] px-4 py-2 border border-white/5 rounded-xl">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#D47A55]">🛋️ {amb}</span>
                        <span className="text-[9px] font-black text-slate-400">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subTotal)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {items.map(item => (
                          <div 
                            key={item.id}
                            onClick={() => handleOpenEditSpec(item)}
                            className="bg-[#1E2022]/60 hover:bg-[#1E2022] border border-white/5 p-4 rounded-[24px] flex items-center justify-between cursor-pointer transition-all shadow-md"
                          >
                            <div className="flex items-center gap-3 max-w-[70%]">
                              {item.foto_url ? (
                                <img src={item.foto_url} alt={item.item_nome} className="w-10 h-10 object-cover rounded-lg border border-white/5 shrink-0" />
                              ) : (
                                <div className="w-10 h-10 bg-slate-900 border border-white/5 rounded-lg flex items-center justify-center text-xs shrink-0 text-slate-500">🖼️</div>
                              )}
                              <div className="space-y-0.5">
                                <span className="block font-black text-xs text-white truncate">{item.item_nome}</span>
                                <span className="block text-[10px] text-slate-400 truncate">{item.fabricante_fornecedor || 'Sem fornecedor'}</span>
                                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wide">
                                  {item.quantidade}x de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco_unitario)}
                                </span>
                              </div>
                            </div>

                            <div className="text-right space-y-1 shrink-0">
                              <span className="block font-black text-white text-xs">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.quantidade * item.preco_unitario)}
                              </span>
                              <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                item.status_aprovacao === 'APROVADO' ? 'bg-emerald-500/20 text-emerald-400' :
                                item.status_aprovacao === 'RECUSADO' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {item.status_aprovacao}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            ABA 3: ARQUIVOS & PLANTA
            ========================================== */}
        {activeSubTab === 'ARQUIVOS' && (
          <div className="space-y-4">
            <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg flex items-center justify-between">
              <div>
                <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Pranchas & Projetos</span>
                <span className="block font-black text-sm text-white mt-0.5">Repositório Construtivo</span>
              </div>
              <button 
                onClick={() => setIsArquivoModalOpen(true)}
                className="px-3 py-1.5 bg-[#D47A55] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#C8643C]"
              >
                + Subir Arquivo
              </button>
            </div>

            {arquivosProjeto.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-white/5 bg-[#1E2022] rounded-[24px] text-xs text-slate-500">
                Nenhum arquivo ou prancha carregada para este projeto.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {arquivosProjeto.map((a: any) => (
                  <div key={a.id} className="bg-[#1E2022]/60 hover:bg-[#1E2022] border border-white/5 p-4 rounded-[24px] flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-900 border border-white/5 rounded-lg flex items-center justify-center shrink-0">
                        {a.tipo === 'PDF' && <FileText className="w-5 h-5 text-red-400" />}
                        {a.tipo === 'PLANTA' && <Layers className="w-5 h-5 text-teal-400" />}
                        {a.tipo === 'RENDER' && <ImageIcon className="w-5 h-5 text-[#D47A55]" />}
                      </div>
                      <div className="space-y-0.5">
                        <span className="block font-black text-xs text-white truncate max-w-[200px]">{a.nome}</span>
                        <span className="block text-[8px] font-black uppercase text-[#D47A55] tracking-widest">{a.tipo}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={a.url} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-all">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button onClick={() => handleDeleteArquivo(a.id)} className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-red-400 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==========================================
            ABA 4: DIÁRIO DE OBRA (RDO)
            ========================================== */}
        {activeSubTab === 'RDO' && (
          <div className="space-y-4">
            <div className="bg-[#1E2022] border border-white/5 p-4 rounded-[24px] shadow-lg flex items-center justify-between">
              <div>
                <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Visitas Técnicas</span>
                <span className="block font-black text-sm text-white mt-0.5">Relatório Diário de Obra</span>
              </div>
              <button 
                onClick={() => setIsRDOModalOpen(true)}
                className="px-3 py-1.5 bg-[#D47A55] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#C8643C]"
              >
                + Novo RDO
              </button>
            </div>

            {rdosProjeto.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-white/5 bg-[#1E2022] rounded-[24px] text-xs text-slate-500">
                Nenhum relatório diário de obra lançado ainda.
              </div>
            ) : (
              <div className="space-y-4 relative border-l-2 border-white/5 pl-4 ml-2 pt-2">
                {rdosProjeto.map((r: any) => (
                  <div key={r.id} className="relative space-y-2 bg-[#1E2022] p-4 border border-white/5 rounded-2xl shadow-sm">
                    {/* Indicador de Status */}
                    <div className="absolute -left-[25px] top-4 w-2.5 h-2.5 rounded-full border border-[#121315] bg-slate-950 flex items-center justify-center">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        r.status === 'OK' ? 'bg-emerald-500' :
                        r.status === 'ATRASO' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                    </div>
                    
                    <div className="flex items-center justify-between w-full">
                      <div className="space-y-0.5">
                        <span className="block text-[8px] font-black text-[#D47A55] uppercase tracking-widest">
                          {new Date(r.data).toLocaleDateString('pt-BR')} • Por: {r.responsavel}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteRDO(r.id)} className="p-1 text-slate-500 hover:text-red-400 rounded transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">{r.descricao}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ==========================================
          MODAIS DE FORMULÁRIO (SPEC, ARQUIVO, RDO)
          ========================================== */}

      {/* MODAL 1: Cadastrar/Editar Spec */}
      {isSpecModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={handleSaveSpec} className="bg-[#17181A] border border-white/5 rounded-[28px] p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                {editingSpec ? 'Editar Especificação' : 'Nova Especificação'}
              </span>
              <button type="button" onClick={() => setIsSpecModalOpen(false)} className="text-slate-400 text-lg hover:text-white">×</button>
            </div>

            <div className="space-y-3.5 overflow-y-auto max-h-[400px] pr-1 scrollbar-none">
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Ambiente</label>
                <input type="text" placeholder="Ex: Living, Suíte Master" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Nome do Item</label>
                <input type="text" placeholder="Ex: Sofá Modular Couro Cognac" value={itemNome} onChange={(e) => setItemNome(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Fornecedor / Fabricante</label>
                <input type="text" placeholder="Ex: Decameron" value={fabricanteFornecedor} onChange={(e) => setFabricanteFornecedor(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Qtd</label>
                  <input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Valor Unitário (R$)</label>
                  <input type="number" step="0.01" value={precoUnitario} onChange={(e) => setPrecoUnitario(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Foto (URL)</label>
                <input type="text" placeholder="https://images..." value={fotoUrl} onChange={(e) => setFotoUrl(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" />
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Status de Aprovação</label>
                <select value={statusAprovacao} onChange={(e) => setStatusAprovacao(e.target.value as any)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55]">
                  <option value="PENDENTE">Pendente</option>
                  <option value="APROVADO">Aprovado</option>
                  <option value="RECUSADO">Recusado</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Notas / Comentários</label>
                <textarea rows={2} placeholder="Comentários sobre a especificação..." value={comentarioCliente} onChange={(e) => setComentarioCliente(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55] resize-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              {editingSpec && (
                <button type="button" onClick={() => handleDeleteSpec(editingSpec.id!)} className="py-2 px-3 bg-red-950/20 hover:bg-red-950/40 text-red-400 font-bold text-xs rounded-xl border border-red-900/30 transition-colors">
                  Excluir
                </button>
              )}
              <button type="submit" className="flex-1 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95">
                Salvar Spec
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: Subir Arquivo */}
      {isArquivoModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={handleAddArquivo} className="bg-[#17181A] border border-white/5 rounded-[28px] p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1">
                <FileText className="w-4 h-4" />
                Novo Arquivo Técnico
              </span>
              <button type="button" onClick={() => setIsArquivoModalOpen(false)} className="text-slate-400 text-lg hover:text-white">×</button>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Nome do Arquivo / Prancha</label>
                <input type="text" placeholder="Ex: Prancha 02 - Layout Executivo" value={arqNome} onChange={(e) => setArqNome(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Extensão / Tipo</label>
                <select value={arqTipo} onChange={(e) => setArqTipo(e.target.value as any)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55]">
                  <option value="PLANTA">Modelo / Planta (DWG, SKP, RVT)</option>
                  <option value="PDF">Arquivo PDF</option>
                  <option value="RENDER">Foto / Renderização (JPEG, PNG)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">URL / Link do Arquivo</label>
                <input type="text" placeholder="Ex: drive.google.com/..." value={arqUrl} onChange={(e) => setArqUrl(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
              </div>
            </div>

            <button type="submit" className="w-full py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95">
              Salvar Arquivo
            </button>
          </form>
        </div>
      )}

      {/* MODAL 3: Novo RDO */}
      {isRDOModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={handleAddRDO} className="bg-[#17181A] border border-white/5 rounded-[28px] p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1">
                <HardHat className="w-4 h-4" />
                Relatório Diário de Obra (RDO)
              </span>
              <button type="button" onClick={() => setIsRDOModalOpen(false)} className="text-slate-400 text-lg hover:text-white">×</button>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Data Visita</label>
                  <input type="date" value={rdoData} onChange={(e) => setRdoData(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
                </div>
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Responsável</label>
                  <input type="text" value={rdoResponsavel} onChange={(e) => setRdoResponsavel(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]" required />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Status da Obra</label>
                <select value={rdoStatus} onChange={(e) => setRdoStatus(e.target.value as any)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55]">
                  <option value="OK">Tudo Ok / Em Dia</option>
                  <option value="ATRASO">Atraso na entrega de material</option>
                  <option value="PROBLEMA">Problema técnico identificado</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Vistoria e Ocorrências da Obra</label>
                <textarea rows={3} placeholder="Descreva os serviços realizados e o andamento geral..." value={rdoDescricao} onChange={(e) => setRdoDescricao(e.target.value)} className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55] resize-none" required />
              </div>
            </div>

            <button type="submit" className="w-full py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95">
              Salvar RDO
            </button>
          </form>
        </div>
      )}

    </div>
  );
};

export default OfficesEspecificador;
