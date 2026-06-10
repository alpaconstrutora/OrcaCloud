import React from 'react';
import { Share2, FileText, Compass, AlertTriangle, Check, X } from 'lucide-react';
import { officesService } from '../services/officesService';
import { supabase } from '../lib/supabase';
import { OfficesEspecificacao, OfficesAprovacaoStatus } from '../types';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface OfficesEspecificadorProps {
  userId: string;
}

const OfficesEspecificador: React.FC<OfficesEspecificadorProps> = ({ userId }) => {
  const [loading, setLoading] = React.useState(false);
  const [projetos, setProjetos] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedProjetoId, setSelectedProjetoId] = React.useState('');
  const [especificacoes, setEspecificacoes] = React.useState<OfficesEspecificacao[]>([]);
  
  // Modais e edição
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingSpec, setEditingSpec] = React.useState<Partial<OfficesEspecificacao> | null>(null);

  // Campos do formulário
  const [ambiente, setAmbiente] = React.useState('');
  const [itemNome, setItemNome] = React.useState('');
  const [fabricanteFornecedor, setFabricanteFornecedor] = React.useState('');
  const [quantidade, setQuantidade] = React.useState('1');
  const [precoUnitario, setPrecoUnitario] = React.useState('0');
  const [fotoUrl, setFotoUrl] = React.useState('');
  const [statusAprovacao, setStatusAprovacao] = React.useState<OfficesAprovacaoStatus>('PENDENTE');
  const [comentarioCliente, setComentarioCliente] = React.useState('');

  // Carregar lista de projetos no início
  React.useEffect(() => {
    const fetchProjetos = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;
        setProjetos(data || []);
        if (data && data.length > 0) {
          setSelectedProjetoId(data[0].id);
        }
      } catch (err) {
        console.error('Erro ao buscar projetos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjetos();
  }, []);

  // Carregar especificações do projeto selecionado
  const loadSpecs = React.useCallback(async () => {
    if (!selectedProjetoId) return;
    try {
      setLoading(true);
      const data = await officesService.listEspecificacoesByProjeto(selectedProjetoId);
      setEspecificacoes(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar especificações.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjetoId]);

  React.useEffect(() => {
    loadSpecs();
  }, [loadSpecs]);

  const handleOpenNew = () => {
    setEditingSpec(null);
    setAmbiente('');
    setItemNome('');
    setFabricanteFornecedor('');
    setQuantidade('1');
    setPrecoUnitario('0');
    setFotoUrl('');
    setStatusAprovacao('PENDENTE');
    setComentarioCliente('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (spec: OfficesEspecificacao) => {
    setEditingSpec(spec);
    setAmbiente(spec.ambiente);
    setItemNome(spec.item_nome);
    setFabricanteFornecedor(spec.fabricante_fornecedor || '');
    setQuantidade(spec.quantidade.toString());
    setPrecoUnitario(spec.preco_unitario.toString());
    setFotoUrl(spec.foto_url || '');
    setStatusAprovacao(spec.status_aprovacao);
    setComentarioCliente(spec.comentario_cliente || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ambiente || !itemNome || !selectedProjetoId) {
      alert('Por favor, informe o ambiente, nome do item e selecione um projeto.');
      return;
    }

    try {
      setLoading(true);
      await officesService.saveEspecificacao({
        id: editingSpec?.id,
        user_id: userId,
        projeto_id: selectedProjetoId,
        ambiente: ambiente.trim(),
        item_nome: itemNome.trim(),
        fabricante_fornecedor: fabricanteFornecedor.trim() || undefined,
        quantidade: Number(quantidade || 1),
        preco_unitario: Number(precoUnitario || 0),
        foto_url: fotoUrl.trim() || undefined,
        status_aprovacao: statusAprovacao,
        comentario_cliente: comentarioCliente.trim() || undefined
      });

      setIsModalOpen(false);
      loadSpecs();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao salvar especificação.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta especificação?')) return;
    try {
      setLoading(true);
      await officesService.deleteEspecificacao(id);
      setIsModalOpen(false);
      loadSpecs();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir especificação.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyClientLink = () => {
    if (!selectedProjetoId) return;
    const clientLink = `${window.location.origin}/especificacoes-cliente/${selectedProjetoId}`;
    navigator.clipboard.writeText(clientLink)
      .then(() => {
        alert('Link copiado para a área de transferência! Envie para o seu cliente via WhatsApp.');
      })
      .catch(err => {
        console.error('Erro ao copiar link:', err);
        alert('Não foi possível copiar o link automaticamente. Copie manualmente: ' + clientLink);
      });
  };

  const handleExportPDF = () => {
    if (!selectedProjetoId || especificacoes.length === 0) return;
    try {
      const activeProject = projetos.find(p => p.id === selectedProjetoId);
      const projName = activeProject ? activeProject.name : 'Projeto';
      const doc = new jsPDF();

      // Cabeçalho do PDF
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("MEMORIAL DESCRITIVO DE ESPECIFICAÇÕES", 14, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Projeto: ${projName}`, 14, 28);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

      const totalCost = especificacoes.reduce((sum, s) => sum + (s.quantidade * s.preco_unitario), 0);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(234, 88, 12); // orange-600
      doc.text(`Custo Total do Memorial: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}`, 14, 42);

      // Tabela de Itens
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
        headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
        styles: { fontSize: 8, cellPadding: 3 },
        margin: { top: 50 }
      });

      doc.save(`memorial-especificacoes-${projName.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao exportar PDF: ' + err.message);
    }
  };

  // Agrupar especificações por ambiente
  const specsPorAmbiente = React.useMemo(() => {
    const map: Record<string, OfficesEspecificacao[]> = {};
    especificacoes.forEach(spec => {
      const amb = spec.ambiente;
      if (!map[amb]) map[amb] = [];
      map[amb].push(spec);
    });
    return map;
  }, [especificacoes]);

  // Custo total do projeto
  const custoTotal = especificacoes.reduce((sum, s) => sum + (s.quantidade * s.preco_unitario), 0);

  return (
    <div className="p-5 flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">Especificador de Ambientes</h1>
          <p className="text-xs font-semibold text-slate-400">Detalhamento de mobiliário e acabamentos</p>
        </div>
        <button
          onClick={handleOpenNew}
          disabled={!selectedProjetoId}
          className="px-4 py-2 bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-950/20 active:scale-95 disabled:opacity-55"
        >
          + Especificar Item
        </button>
      </div>

      {/* Seletor de Projeto */}
      <div className="space-y-1 bg-slate-950/50 p-4 border border-slate-850 rounded-2xl">
        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Selecionar Projeto</label>
        <select
          value={selectedProjetoId}
          onChange={(e) => setSelectedProjetoId(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 mt-1"
        >
          {projetos.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        
        {selectedProjetoId && especificacoes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Custo Total Especificado:</span>
              <span className="text-sm font-black text-orange-500">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(custoTotal)}
              </span>
            </div>

            {/* Ações de Cliente e PDF */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                onClick={handleCopyClientLink}
                className="flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5 text-orange-500" />
                Link do Cliente
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95"
              >
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                Exportar PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {loading && especificacoes.length === 0 && (
        <div className="text-center py-10">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-400">Carregando especificações...</span>
        </div>
      )}

      {/* Listagem de Especificações por Ambiente */}
      {!loading && especificacoes.length === 0 && selectedProjetoId && (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
          Nenhum material ou móvel especificado para este projeto ainda.
        </div>
      )}

      <div className="space-y-6">
        {Object.keys(specsPorAmbiente).map(ambName => {
          const items = specsPorAmbiente[ambName];
          const totalAmbiente = items.reduce((sum, item) => sum + (item.quantidade * item.preco_unitario), 0);

          return (
            <div key={ambName} className="space-y-2.5">
              <div className="flex justify-between items-center bg-slate-950 px-4 py-2 border border-slate-850 rounded-2xl">
                <span className="text-xs font-black uppercase tracking-wider text-orange-400">🛋️ {ambName}</span>
                <span className="text-[10px] font-black text-slate-400">
                  Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmbiente)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {items.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenEdit(item)}
                    className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex flex-col gap-3 hover:bg-slate-950/80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3 max-w-[70%]">
                        {item.foto_url ? (
                          <img src={item.foto_url} alt={item.item_nome} className="w-10 h-10 object-cover rounded-lg border border-slate-800 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-xs shrink-0 text-slate-500">🖼️</div>
                        )}
                        <div className="space-y-0.5">
                          <span className="block font-black text-xs text-white truncate">{item.item_nome}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{item.fabricante_fornecedor || 'Fornecedor não informado'}</span>
                          <span className="block text-[9px] text-slate-500">
                            {item.quantidade}x de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco_unitario)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <span className="block font-black text-white text-xs">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.quantidade * item.preco_unitario)}
                        </span>
                        <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          item.status_aprovacao === 'APROVADO' ? 'bg-emerald-500/20 text-emerald-400' :
                          item.status_aprovacao === 'RECUSADO' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/40 text-slate-400'
                        }`}>
                          {item.status_aprovacao}
                        </span>
                      </div>
                    </div>

                    {/* Mostrar Feedback do Cliente se tiver sido recusado */}
                    {item.status_aprovacao === 'RECUSADO' && item.comentario_cliente && (
                      <div className="p-2.5 bg-red-950/20 border border-red-900/30 rounded-xl text-[10px] text-red-300 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
                        <span className="italic">"{item.comentario_cliente}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de cadastro/edição de Especificação */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-orange-500">
                {editingSpec ? 'Editar Especificação' : 'Nova Especificação de Material'}
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 text-lg hover:text-white"
              >
                ×
              </button>
            </div>

            {/* Aviso de Recusa se aplicável */}
            {editingSpec?.status_aprovacao === 'RECUSADO' && editingSpec?.comentario_cliente && (
              <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-2xl text-[10px] text-red-300 flex flex-col gap-1">
                <span className="font-bold uppercase tracking-wider block">Recusado pelo cliente:</span>
                <span className="italic">"{editingSpec.comentario_cliente}"</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Ambiente */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Ambiente</label>
                <input
                  type="text"
                  placeholder="Ex: Sala, Cozinha, Varanda Gourmet"
                  value={ambiente}
                  onChange={(e) => setAmbiente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Nome do Item */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Nome do Item / Material</label>
                <input
                  type="text"
                  placeholder="Ex: Porcelanato Portobello 90x90 ou Pendente Led"
                  value={itemNome}
                  onChange={(e) => setItemNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Fabricante / Fornecedor */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Fabricante ou Fornecedor</label>
                <input
                  type="text"
                  placeholder="Ex: Portobello, Leroy Merlin, Tok&Stok"
                  value={fabricanteFornecedor}
                  onChange={(e) => setFabricanteFornecedor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Quantidade */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Quantidade</label>
                  <input
                    type="number"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                    required
                    min="1"
                  />
                </div>

                {/* Preço Unitário */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Preço Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={precoUnitario}
                    onChange={(e) => setPrecoUnitario(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Foto URL */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Link da Imagem / Foto do Produto (opcional)</label>
                <input
                  type="text"
                  placeholder="Cole o link da foto do produto"
                  value={fotoUrl}
                  onChange={(e) => setFotoUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              {/* Status de Aprovação */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Aprovação do Cliente</label>
                <select
                  value={statusAprovacao}
                  onChange={(e) => setStatusAprovacao(e.target.value as OfficesAprovacaoStatus)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                >
                  <option value="PENDENTE">Pendente</option>
                  <option value="APROVADO">Aprovado pelo cliente</option>
                  <option value="RECUSADO">Recusado pelo cliente</option>
                </select>
              </div>

              {/* Comentário de Recusa ou Justificativa (editável pelo arquiteto também) */}
              {statusAprovacao === 'RECUSADO' && (
                <div className="space-y-1">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Motivo da Recusa / Ajuste</label>
                  <textarea
                    value={comentarioCliente}
                    onChange={(e) => setComentarioCliente(e.target.value)}
                    className="w-full h-20 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-orange-500 resize-none font-medium"
                    placeholder="Feedback do cliente sobre por que recusou este material..."
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              {editingSpec && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingSpec.id!)}
                  className="py-2.5 px-4 bg-red-950/50 hover:bg-red-900/40 text-red-400 font-bold text-xs rounded-xl border border-red-900/30 transition-colors"
                >
                  🗑️ Excluir
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-2.5 bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95"
              >
                💾 Salvar Espec.
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default OfficesEspecificador;
