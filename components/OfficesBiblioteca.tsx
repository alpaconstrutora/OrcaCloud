import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sparkles, Plus, Trash2, FolderPlus, X, Image as ImageIcon } from 'lucide-react';

interface OfficesBibliotecaProps {
  userId: string;
}

interface ReferenciaImagem {
  id: string;
  titulo: string;
  categoria: string;
  url: string;
  descricao?: string;
  isCustom?: boolean;
}

// Imagens padrão de inspiração arquitetônica curadas do Unsplash
const IMAGENS_INSPIRACAO: ReferenciaImagem[] = [
  {
    id: 'ref-1',
    titulo: 'Living Integrado Minimalista',
    categoria: 'MINIMALISTA',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80',
    descricao: 'Concreto aparente, amplas aberturas de vidro e integração com a piscina externa.'
  },
  {
    id: 'ref-2',
    titulo: 'Cozinha Gourmet Industrial',
    categoria: 'INDUSTRIAL',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80',
    descricao: 'Mobiliário planejado preto metálico, tijolos de demolição e pendentes industriais cobre.'
  },
  {
    id: 'ref-3',
    titulo: 'Fachada Cobre & Concreto',
    categoria: 'CONTEMPORANEO',
    url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=600&q=80',
    descricao: 'Fachada com brises de metal cor de cobre, concreto ripado e iluminação cênica.'
  },
  {
    id: 'ref-4',
    titulo: 'Suíte Master Biofílica',
    categoria: 'BIOFILICO',
    url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80',
    descricao: 'Parede viva verde, teto em madeira freijó e aberturas para jardim interno.'
  },
  {
    id: 'ref-5',
    titulo: 'Residência Alto Padrão Iluminada',
    categoria: 'ALTO_PADRAO',
    url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80',
    descricao: 'Casa de luxo com beirais pronunciados, revestimentos em pedra e projeto luminotécnico integrado.'
  },
  {
    id: 'ref-6',
    titulo: 'Banheiro Spa contemporâneo',
    categoria: 'CONTEMPORANEO',
    url: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=600&q=80',
    descricao: 'Pisos e paredes revestidos em mármore, iluminação indireta e banheira de imersão.'
  },
  {
    id: 'ref-7',
    titulo: 'Living Loft Pé-Direito Duplo',
    categoria: 'INDUSTRIAL',
    url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80',
    descricao: 'Vidros amplos com caixilhos pretos, escada metálica e sofás modulares cinza.'
  },
  {
    id: 'ref-8',
    titulo: 'Varanda Integrada Biofílica',
    categoria: 'BIOFILICO',
    url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80',
    descricao: 'Uso de plantas suspensas, móveis em fibra natural e revestimento amadeirado.'
  }
];

export const OfficesBiblioteca: React.FC<OfficesBibliotecaProps> = ({ userId }) => {
  const [loading, setLoading] = useState(false);
  const [projetos, setProjetos] = useState<any[]>([]);
  const [referencias, setReferencias] = useState<ReferenciaImagem[]>(IMAGENS_INSPIRACAO);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODOS');

  // Estado para cadastro de nova imagem
  const [mostrarForm, setMostrarForm] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaCat, setNovaCat] = useState('CONTEMPORANEO');
  const [novaUrl, setNovaUrl] = useState('');
  const [novaDesc, setNovaDesc] = useState('');

  // Estado de vinculação a projeto
  const [imagemSelecionada, setImagemSelecionada] = useState<ReferenciaImagem | null>(null);
  const [projetoVinculoId, setProjetoVinculoId] = useState('');
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    // Carrega referências salvas do localStorage
    const saved = localStorage.getItem('opura_office_referencias');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setReferencias([...IMAGENS_INSPIRACAO, ...parsed]);
      } catch (e) {
        console.error('Erro ao ler referências locais:', e);
      }
    }

    // Carrega projetos do banco
    const fetchProjetos = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) throw error;
        setProjetos(data || []);
        if (data && data.length > 0) {
          setProjetoVinculoId(data[0].id);
        }
      } catch (e) {
        console.error('Erro ao carregar projetos para vinculação:', e);
      }
    };

    fetchProjetos();
  }, []);

  const saveCustomReferencias = (customList: ReferenciaImagem[]) => {
    localStorage.setItem('opura_office_referencias', JSON.stringify(customList));
  };

  const handleAddReferencia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTitulo.trim() || !novaUrl.trim()) {
      alert('Preencha pelo menos o título e a URL da imagem.');
      return;
    }

    const novaRef: ReferenciaImagem = {
      id: `custom-${Math.random().toString(36).substring(2, 9)}`,
      titulo: novoTitulo.trim(),
      categoria: novaCat,
      url: novaUrl.trim(),
      descricao: novaDesc.trim() || undefined,
      isCustom: true
    };

    const updatedList = [...referencias, novaRef];
    setReferencias(updatedList);

    // Salva apenas os customizados no localStorage
    const customOnly = updatedList.filter(r => r.isCustom);
    saveCustomReferencias(customOnly);

    // Reset formulário
    setNovoTitulo('');
    setNovaUrl('');
    setNovaDesc('');
    setMostrarForm(false);
  };

  const handleDeleteReferencia = (id: string) => {
    if (!window.confirm('Excluir esta referência conceitual da sua biblioteca?')) return;

    const updatedList = referencias.filter(r => r.id !== id);
    setReferencias(updatedList);

    const customOnly = updatedList.filter(r => r.isCustom);
    saveCustomReferencias(customOnly);
  };

  const handleVincularProjeto = async () => {
    if (!imagemSelecionada || !projetoVinculoId) return;

    try {
      setVinculando(true);

      // Busca o projeto e suas configurações
      const { data: proj, error: getErr } = await supabase
        .from('projects')
        .select('settings')
        .eq('id', projetoVinculoId)
        .single();

      if (getErr) throw getErr;

      const currentSettings = proj?.settings || {};
      const moodboard = currentSettings.moodboard || [];
      
      // Verifica se a imagem já não está vinculada
      if (moodboard.some((img: any) => img.url === imagemSelecionada.url)) {
        alert('Este projeto já possui esta imagem vinculada.');
        setImagemSelecionada(null);
        return;
      }

      moodboard.push({
        url: imagemSelecionada.url,
        titulo: imagemSelecionada.titulo,
        descricao: imagemSelecionada.descricao || '',
        categoria: imagemSelecionada.categoria,
        vinculado_em: new Date().toISOString()
      });

      currentSettings.moodboard = moodboard;

      const { error: updErr } = await supabase
        .from('projects')
        .update({ settings: currentSettings })
        .eq('id', projetoVinculoId);

      if (updErr) throw updErr;

      alert(`Imagem vinculada com sucesso ao projeto!`);
      setImagemSelecionada(null);
    } catch (e: any) {
      console.error(e);
      alert('Erro ao vincular imagem: ' + e.message);
    } finally {
      setVinculando(false);
    }
  };

  // Filtrar imagens da biblioteca
  const imagensExibidas = filtroCategoria === 'TODOS'
    ? referencias
    : referencias.filter(r => r.categoria === filtroCategoria);

  return (
    <div className="p-5 flex flex-col h-full bg-[#121315] text-slate-100 min-h-screen pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">Biblioteca de Referências</h1>
          <p className="text-xs font-semibold text-slate-400">Seu moodboard de inspirações (Pinterest Style)</p>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="px-4 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
        >
          {mostrarForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {mostrarForm ? 'Cancelar' : 'Add Referência'}
        </button>
      </div>

      {/* Formulário Novo Item */}
      {mostrarForm && (
        <form onSubmit={handleAddReferencia} className="bg-[#1E2022] border border-white/5 p-4 rounded-[28px] space-y-3 shadow-xl max-w-lg">
          <span className="block text-[10px] font-black uppercase tracking-widest text-[#D47A55]">Nova Inspiração</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Título</label>
              <input
                type="text"
                placeholder="Ex: Nicho de Madeira Iluminado"
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Categoria</label>
              <select
                value={novaCat}
                onChange={(e) => setNovaCat(e.target.value)}
                className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]"
              >
                <option value="MINIMALISTA">Minimalista</option>
                <option value="INDUSTRIAL">Industrial</option>
                <option value="CONTEMPORANEO">Contemporâneo</option>
                <option value="BIOFILICO">Biofílico</option>
                <option value="ALTO_PADRAO">Alto Padrão</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Link da Imagem (URL)</label>
            <input
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={novaUrl}
              onChange={(e) => setNovaUrl(e.target.value)}
              className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55]"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Descrição / Notas técnicas</label>
            <textarea
              rows={2}
              placeholder="Descreva detalhes como materiais usados, paleta de cores ou marcenaria..."
              value={novaDesc}
              onChange={(e) => setNovaDesc(e.target.value)}
              className="w-full bg-[#121315] border border-white/5 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D47A55] resize-none"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
          >
            Salvar na Biblioteca
          </button>
        </form>
      )}

      {/* Categorias / Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {['TODOS', 'MINIMALISTA', 'INDUSTRIAL', 'CONTEMPORANEO', 'BIOFILICO', 'ALTO_PADRAO'].map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltroCategoria(cat)}
            className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap border ${
              filtroCategoria === cat
                ? 'bg-[#D47A55] text-white border-[#D47A55]'
                : 'bg-[#1E2022] text-slate-400 border-white/5 hover:text-white'
            }`}
          >
            {cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Pinterest-like Grid Masonry */}
      <div className="columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4">
        {imagensExibidas.map((r) => (
          <div
            key={r.id}
            className="break-inside-avoid bg-[#1E2022] border border-white/5 rounded-[24px] overflow-hidden group shadow-lg hover:shadow-2xl hover:border-white/10 transition-all duration-300 relative flex flex-col"
          >
            {/* Imagem */}
            <div className="relative overflow-hidden w-full bg-slate-950">
              <img
                src={r.url}
                alt={r.titulo}
                className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                <div className="w-full flex justify-between items-center">
                  <button
                    onClick={() => setImagemSelecionada(r)}
                    className="p-2 bg-[#D47A55] text-white rounded-xl hover:bg-[#C8643C] transition-colors shadow-lg"
                    title="Vincular ao Projeto"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                  {r.isCustom && (
                    <button
                      onClick={() => handleDeleteReferencia(r.id)}
                      className="p-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/40 hover:text-white transition-colors border border-red-500/25"
                      title="Excluir da Biblioteca"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Metadados */}
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-xs text-white truncate">{r.titulo}</h3>
                <span className="text-[8px] font-black text-[#D47A55] bg-[#D47A55]/10 px-2 py-0.5 rounded-full border border-[#D47A55]/10">
                  {r.categoria}
                </span>
              </div>
              {r.descricao && (
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{r.descricao}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Vincular ao Projeto */}
      {imagemSelecionada && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#17181A] border border-white/5 rounded-[28px] p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4" />
                Vincular ao Projeto
              </span>
              <button
                onClick={() => setImagemSelecionada(null)}
                className="text-slate-400 text-lg hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="flex items-center gap-3 p-3 bg-[#1E2022] rounded-2xl border border-white/5">
                <img src={imagemSelecionada.url} alt={imagemSelecionada.titulo} className="w-12 h-12 rounded-lg object-cover" />
                <div>
                  <span className="block text-xs font-black text-white truncate max-w-[200px]">{imagemSelecionada.titulo}</span>
                  <span className="block text-[8px] font-bold text-slate-500 uppercase">{imagemSelecionada.categoria}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-500">Selecione o Projeto</label>
                {projetos.length === 0 ? (
                  <span className="block text-[10px] text-slate-500 italic">Nenhum projeto cadastrado no banco.</span>
                ) : (
                  <select
                    value={projetoVinculoId}
                    onChange={(e) => setProjetoVinculoId(e.target.value)}
                    className="w-full bg-[#1E2022] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D47A55]"
                  >
                    {projetos.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setImagemSelecionada(null)}
                className="flex-1 py-2 bg-slate-800 text-slate-400 font-bold text-xs rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleVincularProjeto}
                disabled={vinculando || projetos.length === 0}
                className="flex-1 py-2 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl disabled:opacity-50 transition-all shadow-md active:scale-95"
              >
                {vinculando ? 'Vinculando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficesBiblioteca;
