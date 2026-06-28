import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesEspecificacao } from '../types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  Sparkles, ArrowLeft, Folder, FileText, Share2, Plus, Trash2,
  CheckSquare, Layers, Image as ImageIcon, HardHat, Calendar,
  CheckCircle2, ExternalLink, DollarSign, AlertTriangle, TrendingUp, Filter
} from 'lucide-react';

interface OfficesEspecificadorProps {
  userId: string;
}

const BANNER_PROJETOS = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80'
];

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

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

const CHIP = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55] font-medium';

export const OfficesEspecificador: React.FC<OfficesEspecificadorProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [projetos, setProjetos] = useState<any[]>([]);
  const [selectedProjeto, setSelectedProjeto] = useState<any | null>(null);
  const [especificacoes, setEspecificacoes] = useState<OfficesEspecificacao[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'CRONOGRAMA' | 'ESPECIFICACOES' | 'ARQUIVOS' | 'RDO' | 'FINANCEIRO'>('CRONOGRAMA');

  // Cronograma
  const [cronogramaFase, setCronogramaFase] = useState('Estudo Preliminar');
  const [cronogramaItem, setCronogramaItem] = useState('');
  const [cronogramaResponsavel, setCronogramaResponsavel] = useState('Altair');
  const [isAddCronogramaOpen, setIsAddCronogramaOpen] = useState(false);

  // Financeiro por projeto
  const [financeiroParcela, setFinanceiroParcela] = useState('1/3');
  const [financeiroValor, setFinanceiroValor] = useState('0');
  const [financeiroVencimento, setFinanceiroVencimento] = useState(new Date().toISOString().split('T')[0]);
  const [financeiroStatus, setFinanceiroStatus] = useState<'PAGO' | 'PENDENTE' | 'ATRASADO'>('PENDENTE');
  const [isAddFinanceiroOpen, setIsAddFinanceiroOpen] = useState(false);

  // Modais
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [isArquivoModalOpen, setIsArquivoModalOpen] = useState(false);
  const [isRDOModalOpen, setIsRDOModalOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Partial<OfficesEspecificacao> | null>(null);

  // Form Spec
  const [ambiente, setAmbiente] = useState('');
  const [itemNome, setItemNome] = useState('');
  const [fabricanteFornecedor, setFabricanteFornecedor] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [precoUnitario, setPrecoUnitario] = useState('0');
  const [fotoUrl, setFotoUrl] = useState('');
  const [statusAprovacao, setStatusAprovacao] = useState<'PENDENTE' | 'APROVADO' | 'RECUSADO'>('PENDENTE');
  const [comentarioCliente, setComentarioCliente] = useState('');

  // Form Arquivo
  const [arqNome, setArqNome] = useState('');
  const [arqTipo, setArqTipo] = useState<'PLANTA' | 'PDF' | 'RENDER'>('PLANTA');
  const [arqUrl, setArqUrl] = useState('');

  // Form RDO
  const [rdoData, setRdoData] = useState(new Date().toISOString().split('T')[0]);
  const [rdoResponsavel, setRdoResponsavel] = useState('Altair');
  const [rdoDescricao, setRdoDescricao] = useState('');
  const [rdoStatus, setRdoStatus] = useState<'OK' | 'ATRASO' | 'PROBLEMA'>('OK');

  const fetchProjetos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setProjetos(data || []);
    } catch (err) {
      console.error('Erro ao buscar projetos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjetos(); }, []);

  const loadSpecs = useCallback(async (projetoId: string) => {
    try {
      setLoading(true);
      const data = await officesService.listEspecificacoesByProjeto(projetoId);
      setEspecificacoes(data);
    } catch (err) {
      console.error(err); alert('Erro ao carregar especificações.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectProjeto = (proj: any) => {
    setSelectedProjeto(proj); loadSpecs(proj.id); setActiveSubTab('CRONOGRAMA');
  };
  const handleBackToGallery = () => {
    setSelectedProjeto(null); setEspecificacoes([]); fetchProjetos();
  };

  const updateProjectSettings = async (updatedSettings: any) => {
    if (!selectedProjeto) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('projects').update({ settings: updatedSettings }).eq('id', selectedProjeto.id);
      if (error) throw error;
      setSelectedProjeto((prev: any) => prev ? { ...prev, settings: updatedSettings } : null);
      setProjetos((prev: any[]) => prev.map((p: any) => p.id === selectedProjeto.id ? { ...p, settings: updatedSettings } : p));
    } catch (e: any) {
      console.error(e); alert('Erro ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  // ── Cronograma ──────────────────────────────────────────────────────────
  const cronogramaItens = useMemo(() => selectedProjeto?.settings?.etapas || CRONOGRAMA_PADRAO, [selectedProjeto]);
  const progressoProjeto = useMemo(() => {
    if (!cronogramaItens.length) return 0;
    return Math.round((cronogramaItens.filter((c: any) => c.completed).length / cronogramaItens.length) * 100);
  }, [cronogramaItens]);

  const toggleCronogramaItem = async (itemId: string) => {
    const updated = cronogramaItens.map((item: any) => item.id === itemId ? { ...item, completed: !item.completed } : item);
    const settings = { ...(selectedProjeto?.settings || {}), etapas: updated };
    await updateProjectSettings(settings);
  };

  const handleAddCronogramaItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cronogramaItem.trim()) { alert('Informe a descrição da atividade.'); return; }
    const newItem = { id: `task-${Math.random().toString(36).substring(2, 9)}`, fase: cronogramaFase, item: cronogramaItem.trim(), completed: false, responsavel: cronogramaResponsavel };
    const settings = { ...(selectedProjeto?.settings || {}), etapas: [...(selectedProjeto?.settings?.etapas || CRONOGRAMA_PADRAO), newItem] };
    await updateProjectSettings(settings);
    setCronogramaItem(''); setIsAddCronogramaOpen(false);
  };

  const handleDeleteCronogramaItem = async (itemId: string) => {
    if (!confirm('Remover esta atividade?')) return;
    const settings = { ...(selectedProjeto?.settings || {}), etapas: (selectedProjeto?.settings?.etapas || CRONOGRAMA_PADRAO).filter((i: any) => i.id !== itemId) };
    await updateProjectSettings(settings);
  };

  // ── Financeiro do projeto ────────────────────────────────────────────────
  const financeiroItens = useMemo(() => selectedProjeto?.settings?.financeiro || [], [selectedProjeto]);
  const financeiroConsolidado = useMemo(() => {
    let pago = 0, pendente = 0, atrasado = 0;
    financeiroItens.forEach((i: any) => { const v = Number(i.valor || 0); if (i.status === 'PAGO') pago += v; else if (i.status === 'PENDENTE') pendente += v; else atrasado += v; });
    return { pago, pendente, atrasado };
  }, [financeiroItens]);

  const handleAddFinanceiroItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(financeiroValor) <= 0) { alert('Informe um valor maior que zero.'); return; }
    const newItem = { id: `finst-${Math.random().toString(36).substring(2, 9)}`, projectName: selectedProjeto.name, parcela: financeiroParcela, valor: Number(financeiroValor), vencimento: financeiroVencimento, status: financeiroStatus };
    const settings = { ...(selectedProjeto?.settings || {}), financeiro: [...(selectedProjeto?.settings?.financeiro || []), newItem] };
    await updateProjectSettings(settings);
    setFinanceiroValor('0'); setIsAddFinanceiroOpen(false);
  };

  const handleDeleteFinanceiroItem = async (itemId: string) => {
    if (!confirm('Remover esta parcela?')) return;
    const settings = { ...(selectedProjeto?.settings || {}), financeiro: (selectedProjeto?.settings?.financeiro || []).filter((i: any) => i.id !== itemId) };
    await updateProjectSettings(settings);
  };

  const handleToggleFinanceiroStatus = async (itemId: string, current: string) => {
    const next: Record<string, 'PAGO' | 'PENDENTE' | 'ATRASADO'> = { PENDENTE: 'PAGO', PAGO: 'ATRASADO', ATRASADO: 'PENDENTE' };
    const settings = { ...(selectedProjeto?.settings || {}), financeiro: (selectedProjeto?.settings?.financeiro || []).map((i: any) => i.id === itemId ? { ...i, status: next[current] || 'PENDENTE' } : i) };
    await updateProjectSettings(settings);
  };

  // ── Arquivos ─────────────────────────────────────────────────────────────
  const arquivosProjeto = useMemo(() => selectedProjeto?.settings?.arquivos || [], [selectedProjeto]);

  const handleAddArquivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arqNome.trim() || !arqUrl.trim()) { alert('Preencha título e URL.'); return; }
    const newArq = { id: `arq-${Math.random().toString(36).substring(2, 9)}`, nome: arqNome.trim(), tipo: arqTipo, url: arqUrl.trim(), criado_em: new Date().toISOString() };
    const settings = { ...(selectedProjeto?.settings || {}), arquivos: [...(selectedProjeto?.settings?.arquivos || []), newArq] };
    await updateProjectSettings(settings);
    setArqNome(''); setArqUrl(''); setIsArquivoModalOpen(false);
  };

  const handleDeleteArquivo = async (id: string) => {
    if (!confirm('Remover este arquivo?')) return;
    const settings = { ...(selectedProjeto?.settings || {}), arquivos: (selectedProjeto?.settings?.arquivos || []).filter((a: any) => a.id !== id) };
    await updateProjectSettings(settings);
  };

  // ── RDO ──────────────────────────────────────────────────────────────────
  const rdosProjeto = useMemo(() => selectedProjeto?.settings?.rdos || [], [selectedProjeto]);

  const handleAddRDO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rdoDescricao.trim()) { alert('Descreva a vistoria técnica.'); return; }
    const newRDO = { id: `rdo-${Math.random().toString(36).substring(2, 9)}`, data: rdoData, responsavel: rdoResponsavel.trim(), descricao: rdoDescricao.trim(), status: rdoStatus, criado_em: new Date().toISOString() };
    const settings = { ...(selectedProjeto?.settings || {}), rdos: [...(selectedProjeto?.settings?.rdos || []), newRDO] };
    await updateProjectSettings(settings);
    setRdoDescricao(''); setIsRDOModalOpen(false);
  };

  const handleDeleteRDO = async (id: string) => {
    if (!confirm('Remover este RDO?')) return;
    const settings = { ...(selectedProjeto?.settings || {}), rdos: (selectedProjeto?.settings?.rdos || []).filter((r: any) => r.id !== id) };
    await updateProjectSettings(settings);
  };

  // ── Especificações ────────────────────────────────────────────────────────
  const handleOpenNewSpec = () => {
    setEditingSpec(null); setAmbiente(''); setItemNome(''); setFabricanteFornecedor(''); setQuantidade('1'); setPrecoUnitario('0'); setFotoUrl(''); setStatusAprovacao('PENDENTE'); setComentarioCliente(''); setIsSpecModalOpen(true);
  };

  const handleOpenEditSpec = (spec: OfficesEspecificacao) => {
    setEditingSpec(spec); setAmbiente(spec.ambiente); setItemNome(spec.item_nome); setFabricanteFornecedor(spec.fabricante_fornecedor || ''); setQuantidade(spec.quantidade.toString()); setPrecoUnitario(spec.preco_unitario.toString()); setFotoUrl(spec.foto_url || ''); setStatusAprovacao(spec.status_aprovacao); setComentarioCliente(spec.comentario_cliente || ''); setIsSpecModalOpen(true);
  };

  const handleSaveSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ambiente || !itemNome || !selectedProjeto) return;
    try {
      setLoading(true);
      await officesService.saveEspecificacao({ id: editingSpec?.id, user_id: userId, projeto_id: selectedProjeto.id, ambiente: ambiente.trim(), item_nome: itemNome.trim(), fabricante_fornecedor: fabricanteFornecedor.trim() || undefined, quantidade: Number(quantidade || 1), preco_unitario: Number(precoUnitario || 0), foto_url: fotoUrl.trim() || undefined, status_aprovacao: statusAprovacao, comentario_cliente: comentarioCliente.trim() || undefined });
      setIsSpecModalOpen(false); loadSpecs(selectedProjeto.id);
    } catch (err: any) {
      console.error(err); alert('Erro ao salvar item.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSpec = async (id: string) => {
    if (!confirm('Excluir esta especificação?')) return;
    try {
      setLoading(true);
      await officesService.deleteEspecificacao(id);
      setIsSpecModalOpen(false); loadSpecs(selectedProjeto.id);
    } catch (err) {
      console.error(err); alert('Erro ao excluir.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyClientLink = () => {
    if (!selectedProjeto) return;
    const link = `${window.location.origin}/especificacoes-cliente/${selectedProjeto.id}`;
    navigator.clipboard.writeText(link).then(() => alert('Link copiado! Envie para o cliente via WhatsApp.')).catch(() => alert('Link: ' + link));
  };

  const handleExportPDF = () => {
    if (!selectedProjeto || especificacoes.length === 0) return;
    try {
      const doc = new jsPDF();
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(15, 23, 42);
      doc.text('MEMORIAL DESCRITIVO DE ESPECIFICAÇÕES', 14, 20);
      doc.setFont('Helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
      doc.text(`Projeto: ${selectedProjeto.name}`, 14, 28);
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);
      const totalCost = especificacoes.reduce((s, e) => s + e.quantidade * e.preco_unitario, 0);
      doc.setFont('Helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(212, 122, 85);
      doc.text(`Custo Total Especificado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}`, 14, 42);
      (doc as any).autoTable({ head: [['Ambiente', 'Item', 'Fornecedor', 'Qtd', 'Preço Unit.', 'Subtotal', 'Aprovação']], body: especificacoes.map(i => [i.ambiente, i.item_nome, i.fabricante_fornecedor || '-', i.quantidade.toString(), new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.preco_unitario), new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.quantidade * i.preco_unitario), i.status_aprovacao]), startY: 50, theme: 'striped', headStyles: { fillColor: [212, 122, 85], fontSize: 9 }, styles: { fontSize: 8, cellPadding: 3 } });
      doc.save(`memorial-${selectedProjeto.name.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch (err: any) {
      alert('Erro ao exportar: ' + err.message);
    }
  };

  const specsPorAmbiente = useMemo(() => {
    const map: Record<string, OfficesEspecificacao[]> = {};
    especificacoes.forEach(s => { if (!map[s.ambiente]) map[s.ambiente] = []; map[s.ambiente].push(s); });
    return map;
  }, [especificacoes]);

  const custoTotal = especificacoes.reduce((s, e) => s + e.quantidade * e.preco_unitario, 0);

  if (loading && projetos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#F3F7F9]">
        <div className="w-8 h-8 border-4 border-[#D47A55] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscando Projetos...</span>
      </div>
    );
  }

  // ── GALERIA DE PROJETOS ───────────────────────────────────────────────────
  if (!selectedProjeto) {
    return (
      <div className="p-6 space-y-6 bg-[#F3F7F9] text-slate-700 min-h-screen pb-24">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Projetos do Escritório</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">ÒPURA Offices / Gerenciamento de Projetos</p>
        </div>

        {projetos.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-[28px] text-xs text-slate-400 bg-white">
            Nenhum projeto registrado no sistema.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projetos.map((p, index) => {
              const etapas = p.settings?.etapas || CRONOGRAMA_PADRAO;
              const concluidas = etapas.filter((c: any) => c.completed).length;
              const rate = etapas.length > 0 ? Math.round((concluidas / etapas.length) * 100) : 0;
              const rdos = p.settings?.rdos || [];
              const banner = BANNER_PROJETOS[index % BANNER_PROJETOS.length];
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectProjeto(p)}
                  className="bg-white border border-slate-200/50 rounded-[28px] overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_35px_rgb(0,0,0,0.08)] hover:border-[#D47A55]/25 transition-all cursor-pointer group"
                >
                  <div className="h-36 w-full relative overflow-hidden bg-slate-100">
                    <img src={banner} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                    <div className="absolute top-3 right-3 bg-white/85 backdrop-blur-md px-2.5 py-1 rounded-full">
                      <span className="text-[9px] font-black text-slate-700">{rate}%</span>
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <h3 className="font-black text-sm text-slate-800 group-hover:text-[#D47A55] transition-colors">{p.name}</h3>
                      <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400 tracking-wider mt-1">
                        <span>{concluidas}/{etapas.length} etapas</span>
                        <span>•</span>
                        <span>{rdos.length} RDOs</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#D47A55] to-[#C8643C] rounded-full" style={{ width: `${rate}%` }} />
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

  // ── PÁGINA INDIVIDUAL DO PROJETO ─────────────────────────────────────────
  const bannerAtual = BANNER_PROJETOS[projetos.findIndex(p => p.id === selectedProjeto.id) % BANNER_PROJETOS.length];

  const SPEC_STATUS: Record<string, string> = {
    APROVADO: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    RECUSADO: 'bg-rose-50 text-rose-500 border-rose-100',
    PENDENTE: 'bg-slate-100 text-slate-500 border-slate-200'
  };

  const RDO_STATUS_DOT: Record<string, string> = { OK: 'bg-emerald-500', ATRASO: 'bg-amber-500', PROBLEMA: 'bg-rose-500' };

  const FIN_STYLE: Record<string, string> = {
    PAGO:     'bg-emerald-50 text-emerald-600 border-emerald-100',
    PENDENTE: 'bg-slate-100 text-slate-500 border-slate-200',
    ATRASADO: 'bg-rose-50 text-rose-500 border-rose-100'
  };

  return (
    <div className="bg-[#F3F7F9] text-slate-700 min-h-screen pb-24 flex flex-col">

      {/* ── Banner com overlay ──────────────────────────────────────────────── */}
      <div className="h-44 w-full relative bg-slate-100">
        <img src={bannerAtual} alt={selectedProjeto.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#F3F7F9] via-[#F3F7F9]/30 to-black/20" />

        <button
          onClick={handleBackToGallery}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-white/85 backdrop-blur-md border border-white/60 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-[#D47A55] transition-colors shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Projetos
        </button>

        <div className="absolute bottom-4 left-6 right-6">
          <span className="text-[8px] font-black uppercase tracking-widest text-[#D47A55] bg-[#D47A55]/10 border border-[#D47A55]/15 px-2.5 py-1 rounded-full">
            Projeto Ativo
          </span>
          <h2 className="text-xl font-black text-slate-800 tracking-tight mt-1.5">{selectedProjeto.name}</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
            Área: 320 m² · {BRL(custoTotal || 48000)} especificado
          </p>
        </div>
      </div>

      {/* ── Sub-abas ──────────────────────────────────────────────────────── */}
      <div className="px-6 border-b border-slate-200/70 bg-white flex gap-1 overflow-x-auto scrollbar-none">
        {[
          { id: 'CRONOGRAMA',    label: 'Cronograma',   icon: CheckSquare },
          { id: 'ESPECIFICACOES', label: 'Especificador', icon: Folder },
          { id: 'ARQUIVOS',      label: 'Arquivos',     icon: FileText },
          { id: 'RDO',           label: 'Diário Obra',  icon: HardHat },
          { id: 'FINANCEIRO',    label: 'Financeiro',   icon: DollarSign }
        ].map(sub => {
          const Icon = sub.icon;
          return (
            <button
              key={sub.id}
              onClick={() => setActiveSubTab(sub.id as any)}
              className={`relative flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                activeSubTab === sub.id ? 'text-[#D47A55]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {sub.label}
              {activeSubTab === sub.id && <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#D47A55] rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      <div className="p-6 flex-1 space-y-5">

        {/* ABA: CRONOGRAMA ─────────────────────────────────────────────────── */}
        {activeSubTab === 'CRONOGRAMA' && (
          <div className="space-y-4">
            {/* Progresso */}
            <div className="bg-white border border-slate-200/50 p-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[#D47A55]">Visão Geral</span>
                  <span className="block font-black text-sm text-slate-800 mt-0.5">Progresso Técnico</span>
                </div>
                <span className="text-2xl font-black text-[#D47A55]">{progressoProjeto}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#D47A55] to-[#C8643C] rounded-full" style={{ width: `${progressoProjeto}%` }} />
              </div>
            </div>

            {/* Lista de etapas */}
            <div className="bg-white border border-slate-200/50 p-5 rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Etapas do Projeto</span>
                <button
                  onClick={() => setIsAddCronogramaOpen(!isAddCronogramaOpen)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-[#D47A55] hover:border-[#D47A55]/30 rounded-xl transition-all"
                >
                  <Plus className="w-3 h-3" /> {isAddCronogramaOpen ? 'Fechar' : 'Nova Tarefa'}
                </button>
              </div>

              {isAddCronogramaOpen && (
                <form onSubmit={handleAddCronogramaItem} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Adicionar Tarefa</span>
                  <input type="text" placeholder="Descrição da atividade" value={cronogramaItem} onChange={e => setCronogramaItem(e.target.value)} className={`w-full ${CHIP}`} required />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={cronogramaFase} onChange={e => setCronogramaFase(e.target.value)} className={CHIP}>
                      {['Estudo Preliminar','Anteprojeto','Projeto Legal','Projeto Executivo','Obra'].map(f => <option key={f}>{f}</option>)}
                    </select>
                    <select value={cronogramaResponsavel} onChange={e => setCronogramaResponsavel(e.target.value)} className={CHIP}>
                      {['Altair','Colaborador','Engenheiro','Cliente'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="w-full py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[9px] uppercase tracking-widest rounded-xl active:scale-95 transition-all">
                    Gravar Atividade
                  </button>
                </form>
              )}

              <div className="space-y-1">
                {cronogramaItens.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-2 hover:bg-slate-50 rounded-xl transition-all group">
                    <div onClick={() => toggleCronogramaItem(item.id)} className="flex items-start gap-3 cursor-pointer select-none flex-1">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${item.completed ? 'bg-[#D47A55] border-[#C8643C] text-white' : 'border-slate-300 bg-white'}`}>
                        {item.completed && <span className="text-[9px] font-black">✓</span>}
                      </div>
                      <div>
                        <span className={`block text-xs font-semibold ${item.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.item}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] font-black uppercase text-[#D47A55] tracking-widest">{item.fase}</span>
                          {item.responsavel && <span className="text-[8px] font-black uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 tracking-wider">👤 {item.responsavel}</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteCronogramaItem(item.id)} className="p-1.5 text-slate-300 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ABA: FINANCEIRO ─────────────────────────────────────────────────── */}
        {activeSubTab === 'FINANCEIRO' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Recebido', value: BRL(financeiroConsolidado.pago), color: 'text-emerald-600' },
                { label: 'A Receber', value: BRL(financeiroConsolidado.pendente), color: 'text-[#D47A55]' },
                { label: 'Atrasado', value: BRL(financeiroConsolidado.atrasado), color: financeiroConsolidado.atrasado > 0 ? 'text-rose-500' : 'text-slate-700' },
              ].map(k => (
                <div key={k.label} className="bg-white border border-slate-200/50 p-3.5 rounded-[20px] shadow-[0_4px_16px_rgb(0,0,0,0.03)]">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">{k.label}</span>
                  <span className={`block text-sm font-black mt-1 ${k.color} truncate`}>{k.value}</span>
                </div>
              ))}
            </div>

            <div className="bg-white border border-slate-200/50 p-5 rounded-[28px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Fluxo de Medições</span>
                <button onClick={() => setIsAddFinanceiroOpen(!isAddFinanceiroOpen)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-[#D47A55] rounded-xl transition-all">
                  <Plus className="w-3 h-3" /> {isAddFinanceiroOpen ? 'Fechar' : 'Nova Parcela'}
                </button>
              </div>

              {isAddFinanceiroOpen && (
                <form onSubmit={handleAddFinanceiroItem} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-[#D47A55]">Cadastrar Parcela</span>
                  <input type="text" value={financeiroParcela} onChange={e => setFinanceiroParcela(e.target.value)} placeholder="Ex: Parcela 2/3" className={`w-full ${CHIP}`} required />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={financeiroValor} onChange={e => setFinanceiroValor(e.target.value)} placeholder="Valor (R$)" className={CHIP} required />
                    <input type="date" value={financeiroVencimento} onChange={e => setFinanceiroVencimento(e.target.value)} className={CHIP} required />
                  </div>
                  <button type="submit" className="w-full py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[9px] uppercase tracking-widest rounded-xl active:scale-95 transition-all">
                    Gravar Medição
                  </button>
                </form>
              )}

              {financeiroItens.length === 0 ? (
                <div className="text-center py-8 text-[11px] text-slate-400">Nenhuma parcela registrada para este projeto.</div>
              ) : (
                <div className="space-y-2">
                  {financeiroItens.map((item: any) => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl flex items-center justify-between group hover:border-[#D47A55]/20 transition-colors">
                      <div>
                        <span className="block text-xs font-black text-slate-800">{item.parcela}</span>
                        <span className="block text-[8.5px] text-slate-400 font-bold uppercase mt-0.5">
                          Vence: {new Date(item.vencimento).toLocaleDateString('pt-BR')} · {BRL(item.valor)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleFinanceiroStatus(item.id, item.status)} className={`text-[8.5px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${FIN_STYLE[item.status]}`}>
                          {item.status}
                        </button>
                        <button onClick={() => handleDeleteFinanceiroItem(item.id)} className="p-1 text-slate-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all">
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

        {/* ABA: ESPECIFICAÇÕES ─────────────────────────────────────────────── */}
        {activeSubTab === 'ESPECIFICACOES' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200/50 p-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
              <div className="flex justify-between items-start">
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Total Especificado</span>
                  <span className="block text-xl font-black text-slate-800 mt-1">{BRL(custoTotal)}</span>
                </div>
                <button onClick={handleOpenNewSpec} className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white text-[9px] font-black uppercase tracking-widest rounded-xl shadow-sm active:scale-95 transition-all">
                  <Plus className="w-3 h-3" /> Novo Item
                </button>
              </div>
              {especificacoes.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                  <button onClick={handleCopyClientLink} className="py-2 bg-slate-50 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 rounded-xl hover:text-[#D47A55] hover:border-[#D47A55]/30 flex items-center justify-center gap-1.5 transition-all">
                    <Share2 className="w-3 h-3" /> Link Cliente
                  </button>
                  <button onClick={handleExportPDF} className="py-2 bg-slate-50 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 rounded-xl hover:text-[#D47A55] hover:border-[#D47A55]/30 flex items-center justify-center gap-1.5 transition-all">
                    <FileText className="w-3 h-3" /> Exportar PDF
                  </button>
                </div>
              )}
            </div>

            {especificacoes.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 bg-white rounded-[24px] text-xs text-slate-400">Nenhuma especificação para este projeto.</div>
            ) : (
              <div className="space-y-5">
                {Object.keys(specsPorAmbiente).map(amb => {
                  const items = specsPorAmbiente[amb];
                  const subTotal = items.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
                  return (
                    <div key={amb}>
                      <div className="flex justify-between items-center mb-3 px-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#D47A55]">🛋️ {amb}</span>
                        <span className="text-[9px] font-black text-slate-500">{BRL(subTotal)}</span>
                      </div>
                      <div className="space-y-2.5">
                        {items.map(item => (
                          <div key={item.id} onClick={() => handleOpenEditSpec(item)} className="bg-white border border-slate-200/50 p-4 rounded-[20px] flex items-center justify-between cursor-pointer hover:border-[#D47A55]/25 hover:shadow-[0_4px_16px_rgb(0,0,0,0.05)] transition-all group shadow-[0_2px_10px_rgb(0,0,0,0.03)]">
                            <div className="flex items-center gap-3 min-w-0">
                              {item.foto_url ? (
                                <img src={item.foto_url} alt={item.item_nome} className="w-11 h-11 object-cover rounded-xl border border-slate-200 shrink-0" />
                              ) : (
                                <div className="w-11 h-11 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shrink-0 text-slate-400 text-sm">🖼️</div>
                              )}
                              <div className="min-w-0">
                                <span className="block font-black text-xs text-slate-800 group-hover:text-[#D47A55] transition-colors truncate">{item.item_nome}</span>
                                <span className="block text-[10px] text-slate-500 truncate">{item.fabricante_fornecedor || 'Sem fornecedor'}</span>
                                <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{item.quantidade}x · {BRL(item.preco_unitario)}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <span className="block font-black text-slate-800 text-xs">{BRL(item.quantidade * item.preco_unitario)}</span>
                              <span className={`inline-block text-[8.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border mt-1 ${SPEC_STATUS[item.status_aprovacao]}`}>
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

        {/* ABA: ARQUIVOS ───────────────────────────────────────────────────── */}
        {activeSubTab === 'ARQUIVOS' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/50 p-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex items-center justify-between">
              <div>
                <span className="block text-[9px] font-black uppercase tracking-widest text-[#D47A55]">Pranchas & Projetos</span>
                <span className="block font-black text-sm text-slate-800 mt-0.5">Repositório Construtivo</span>
              </div>
              <button onClick={() => setIsArquivoModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white text-[9px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all">
                <Plus className="w-3 h-3" /> Subir Arquivo
              </button>
            </div>

            {arquivosProjeto.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 bg-white rounded-[24px] text-xs text-slate-400">Nenhum arquivo carregado para este projeto.</div>
            ) : (
              <div className="space-y-3">
                {arquivosProjeto.map((a: any) => (
                  <div key={a.id} className="bg-white border border-slate-200/50 p-4 rounded-[20px] flex items-center justify-between shadow-[0_2px_10px_rgb(0,0,0,0.03)] hover:border-[#D47A55]/25 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                        {a.tipo === 'PDF' && <FileText className="w-5 h-5 text-rose-400" />}
                        {a.tipo === 'PLANTA' && <Layers className="w-5 h-5 text-teal-500" />}
                        {a.tipo === 'RENDER' && <ImageIcon className="w-5 h-5 text-[#D47A55]" />}
                      </div>
                      <div>
                        <span className="block font-black text-xs text-slate-800 truncate max-w-[200px]">{a.nome}</span>
                        <span className="block text-[8.5px] font-black uppercase text-[#D47A55] tracking-widest mt-0.5">{a.tipo}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={a.url} target="_blank" rel="noreferrer" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button onClick={() => handleDeleteArquivo(a.id)} className="p-2 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-400 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: RDO ────────────────────────────────────────────────────────── */}
        {activeSubTab === 'RDO' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/50 p-5 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex items-center justify-between">
              <div>
                <span className="block text-[9px] font-black uppercase tracking-widest text-[#D47A55]">Visitas Técnicas</span>
                <span className="block font-black text-sm text-slate-800 mt-0.5">Relatório Diário de Obra</span>
              </div>
              <button onClick={() => setIsRDOModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white text-[9px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-all">
                <Plus className="w-3 h-3" /> Novo RDO
              </button>
            </div>

            {rdosProjeto.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 bg-white rounded-[24px] text-xs text-slate-400">Nenhum relatório diário de obra lançado ainda.</div>
            ) : (
              <div className="space-y-3 border-l-2 border-slate-200 pl-4 ml-2 pt-2">
                {rdosProjeto.map((r: any) => (
                  <div key={r.id} className="relative bg-white border border-slate-200/50 p-4 rounded-[20px] shadow-[0_2px_10px_rgb(0,0,0,0.03)] group">
                    <div className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full border-2 border-[#F3F7F9] bg-white flex items-center justify-center">
                      <div className={`w-1.5 h-1.5 rounded-full ${RDO_STATUS_DOT[r.status]}`} />
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[8.5px] font-black uppercase text-[#D47A55] tracking-widest">
                        {new Date(r.data).toLocaleDateString('pt-BR')} · {r.responsavel}
                      </span>
                      <button onClick={() => handleDeleteRDO(r.id)} className="p-1 text-slate-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{r.descricao}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAIS ────────────────────────────────────────────────────────── */}

      {/* Modal: Spec */}
      {isSpecModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveSpec} className="bg-white border border-slate-200/60 rounded-[28px] p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> {editingSpec ? 'Editar Especificação' : 'Nova Especificação'}
              </span>
              <button type="button" onClick={() => setIsSpecModalOpen(false)} className="text-slate-400 text-xl hover:text-slate-700">×</button>
            </div>
            <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1">
              {[
                { label: 'Ambiente', placeholder: 'Ex: Living, Suíte Master', value: ambiente, setter: setAmbiente, required: true },
                { label: 'Nome do Item', placeholder: 'Ex: Sofá Modular Couro Cognac', value: itemNome, setter: setItemNome, required: true },
                { label: 'Fornecedor / Fabricante', placeholder: 'Ex: Decameron', value: fabricanteFornecedor, setter: setFabricanteFornecedor, required: false },
                { label: 'Foto (URL)', placeholder: 'https://images...', value: fotoUrl, setter: setFotoUrl, required: false },
              ].map(f => (
                <div key={f.label} className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">{f.label}</label>
                  <input type="text" placeholder={f.placeholder} value={f.value} onChange={e => f.setter(e.target.value)} className={`w-full ${CHIP}`} required={f.required} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Qtd</label>
                  <input type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} className={CHIP} required />
                </div>
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Valor Unit. (R$)</label>
                  <input type="number" step="0.01" value={precoUnitario} onChange={e => setPrecoUnitario(e.target.value)} className={CHIP} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Status de Aprovação</label>
                <select value={statusAprovacao} onChange={e => setStatusAprovacao(e.target.value as any)} className={`w-full ${CHIP}`}>
                  <option value="PENDENTE">Pendente</option>
                  <option value="APROVADO">Aprovado</option>
                  <option value="RECUSADO">Recusado</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Notas / Comentários</label>
                <textarea rows={2} value={comentarioCliente} onChange={e => setComentarioCliente(e.target.value)} className={`w-full ${CHIP} resize-none`} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              {editingSpec && (
                <button type="button" onClick={() => handleDeleteSpec(editingSpec.id!)} className="py-2.5 px-4 bg-rose-50 text-rose-500 font-bold text-button rounded-xl border border-rose-100 hover:bg-rose-100 transition-colors">
                  Excluir
                </button>
              )}
              <button type="submit" className="flex-1 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-button uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
                Salvar Spec
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Arquivo */}
      {isArquivoModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddArquivo} className="bg-white border border-slate-200/60 rounded-[28px] p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Novo Arquivo Técnico
              </span>
              <button type="button" onClick={() => setIsArquivoModalOpen(false)} className="text-slate-400 text-xl hover:text-slate-700">×</button>
            </div>
            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Nome / Prancha</label>
                <input type="text" placeholder="Ex: Prancha 02 - Layout Executivo" value={arqNome} onChange={e => setArqNome(e.target.value)} className={`w-full ${CHIP}`} required />
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Extensão / Tipo</label>
                <select value={arqTipo} onChange={e => setArqTipo(e.target.value as any)} className={`w-full ${CHIP}`}>
                  <option value="PLANTA">Modelo / Planta (DWG, SKP, RVT)</option>
                  <option value="PDF">Arquivo PDF</option>
                  <option value="RENDER">Foto / Renderização (JPEG, PNG)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">URL / Link do Arquivo</label>
                <input type="text" placeholder="drive.google.com/..." value={arqUrl} onChange={e => setArqUrl(e.target.value)} className={`w-full ${CHIP}`} required />
              </div>
            </div>
            <button type="submit" className="w-full py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-form-input uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
              Salvar Arquivo
            </button>
          </form>
        </div>
      )}

      {/* Modal: RDO */}
      {isRDOModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddRDO} className="bg-white border border-slate-200/60 rounded-[28px] p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <HardHat className="w-4 h-4" /> RDO — Relatório de Obra
              </span>
              <button type="button" onClick={() => setIsRDOModalOpen(false)} className="text-slate-400 text-xl hover:text-slate-700">×</button>
            </div>
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Data Visita</label>
                  <input type="date" value={rdoData} onChange={e => setRdoData(e.target.value)} className={`w-full ${CHIP}`} required />
                </div>
                <div className="space-y-1">
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Responsável</label>
                  <input type="text" value={rdoResponsavel} onChange={e => setRdoResponsavel(e.target.value)} className={`w-full ${CHIP}`} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Status da Obra</label>
                <select value={rdoStatus} onChange={e => setRdoStatus(e.target.value as any)} className={`w-full ${CHIP}`}>
                  <option value="OK">Tudo Ok / Em Dia</option>
                  <option value="ATRASO">Atraso na entrega de material</option>
                  <option value="PROBLEMA">Problema técnico identificado</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Vistoria e Ocorrências</label>
                <textarea rows={3} placeholder="Descreva os serviços realizados e o andamento geral..." value={rdoDescricao} onChange={e => setRdoDescricao(e.target.value)} className={`w-full ${CHIP} resize-none`} required />
              </div>
            </div>
            <button type="submit" className="w-full py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-form-input uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
              Salvar RDO
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default OfficesEspecificador;
