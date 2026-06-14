import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, FolderPlus, X, Search } from 'lucide-react';

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

const IMAGENS_INSPIRACAO: ReferenciaImagem[] = [
  { id: 'ref-1', titulo: 'Living Integrado Minimalista', categoria: 'MINIMALISTA', url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80', descricao: 'Concreto aparente, amplas aberturas de vidro e integração com a piscina externa.' },
  { id: 'ref-2', titulo: 'Cozinha Gourmet Industrial', categoria: 'INDUSTRIAL', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80', descricao: 'Mobiliário planejado preto metálico, tijolos de demolição e pendentes industriais cobre.' },
  { id: 'ref-3', titulo: 'Fachada Cobre & Concreto', categoria: 'CONTEMPORANEO', url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=600&q=80', descricao: 'Fachada com brises de metal cor de cobre, concreto ripado e iluminação cênica.' },
  { id: 'ref-4', titulo: 'Suíte Master Biofílica', categoria: 'BIOFILICO', url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80', descricao: 'Parede viva verde, teto em madeira freijó e aberturas para jardim interno.' },
  { id: 'ref-5', titulo: 'Residência Alto Padrão Iluminada', categoria: 'ALTO_PADRAO', url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=600&q=80', descricao: 'Casa de luxo com beirais pronunciados, revestimentos em pedra e projeto luminotécnico integrado.' },
  { id: 'ref-6', titulo: 'Banheiro Spa Contemporâneo', categoria: 'CONTEMPORANEO', url: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=600&q=80', descricao: 'Pisos e paredes revestidos em mármore, iluminação indireta e banheira de imersão.' },
  { id: 'ref-7', titulo: 'Living Loft Pé-Direito Duplo', categoria: 'INDUSTRIAL', url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80', descricao: 'Vidros amplos com caixilhos pretos, escada metálica e sofás modulares cinza.' },
  { id: 'ref-8', titulo: 'Varanda Integrada Biofílica', categoria: 'BIOFILICO', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80', descricao: 'Uso de plantas suspensas, móveis em fibra natural e revestimento amadeirado.' }
];

const CAT_LABELS: Record<string, string> = {
  TODOS: 'Todos', MINIMALISTA: 'Minimalista', INDUSTRIAL: 'Industrial',
  CONTEMPORANEO: 'Contemporâneo', BIOFILICO: 'Biofílico', ALTO_PADRAO: 'Alto Padrão'
};

export const OfficesBiblioteca: React.FC<OfficesBibliotecaProps> = ({ userId }) => {
  const [projetos, setProjetos] = useState<any[]>([]);
  const [referencias, setReferencias] = useState<ReferenciaImagem[]>(IMAGENS_INSPIRACAO);
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS');
  const [busca, setBusca] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaCat, setNovaCat] = useState('CONTEMPORANEO');
  const [novaUrl, setNovaUrl] = useState('');
  const [novaDesc, setNovaDesc] = useState('');

  const [imagemSelecionada, setImagemSelecionada] = useState<ReferenciaImagem | null>(null);
  const [projetoVinculoId, setProjetoVinculoId] = useState('');
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('opura_office_referencias');
    if (saved) {
      try { setReferencias([...IMAGENS_INSPIRACAO, ...JSON.parse(saved)]); } catch {}
    }
    const fetchProjetos = async () => {
      try {
        const { data } = await supabase.from('projects').select('id, name').order('name', { ascending: true });
        setProjetos(data || []);
        if (data?.length) setProjetoVinculoId(data[0].id);
      } catch {}
    };
    fetchProjetos();
  }, []);

  const saveCustomReferencias = (list: ReferenciaImagem[]) => {
    localStorage.setItem('opura_office_referencias', JSON.stringify(list.filter(r => r.isCustom)));
  };

  const handleAddReferencia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoTitulo.trim() || !novaUrl.trim()) { alert('Preencha título e URL.'); return; }
    const nova: ReferenciaImagem = {
      id: `custom-${Math.random().toString(36).substring(2, 9)}`,
      titulo: novoTitulo.trim(), categoria: novaCat,
      url: novaUrl.trim(), descricao: novaDesc.trim() || undefined, isCustom: true
    };
    const updated = [...referencias, nova];
    setReferencias(updated);
    saveCustomReferencias(updated);
    setNovoTitulo(''); setNovaUrl(''); setNovaDesc(''); setMostrarForm(false);
  };

  const handleDeleteReferencia = (id: string) => {
    if (!window.confirm('Excluir esta referência da biblioteca?')) return;
    const updated = referencias.filter(r => r.id !== id);
    setReferencias(updated);
    saveCustomReferencias(updated);
  };

  const handleVincularProjeto = async () => {
    if (!imagemSelecionada || !projetoVinculoId) return;
    try {
      setVinculando(true);
      const { data: proj, error: getErr } = await supabase.from('projects').select('settings').eq('id', projetoVinculoId).single();
      if (getErr) throw getErr;
      const settings = proj?.settings || {};
      const moodboard = settings.moodboard || [];
      if (moodboard.some((img: any) => img.url === imagemSelecionada.url)) {
        alert('Este projeto já possui esta imagem vinculada.');
        setImagemSelecionada(null); return;
      }
      moodboard.push({ url: imagemSelecionada.url, titulo: imagemSelecionada.titulo, descricao: imagemSelecionada.descricao || '', categoria: imagemSelecionada.categoria, vinculado_em: new Date().toISOString() });
      settings.moodboard = moodboard;
      const { error: updErr } = await supabase.from('projects').update({ settings }).eq('id', projetoVinculoId);
      if (updErr) throw updErr;
      alert('Imagem vinculada com sucesso ao projeto!');
      setImagemSelecionada(null);
    } catch (e: any) {
      alert('Erro ao vincular: ' + e.message);
    } finally {
      setVinculando(false);
    }
  };

  const imagensExibidas = referencias.filter(r => {
    const catOk = filtroCategoria === 'TODOS' || r.categoria === filtroCategoria;
    const buscaOk = !busca || r.titulo.toLowerCase().includes(busca.toLowerCase());
    return catOk && buscaOk;
  });

  return (
    <div className="p-6 space-y-6 bg-[#F3F7F9] text-slate-700 min-h-screen pb-24">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Moodboard & Referências</h1>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">ÒPURA Offices / Biblioteca de Inspirações</p>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-[#D47A55]/20 active:scale-[0.98] transition-all"
        >
          {mostrarForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {mostrarForm ? 'Cancelar' : 'Add Referência'}
        </button>
      </div>

      {/* ── Formulário Novo Item ──────────────────────────────────────────── */}
      {mostrarForm && (
        <form onSubmit={handleAddReferencia} className="bg-white border border-slate-200/50 p-5 rounded-[28px] space-y-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] max-w-2xl">
          <span className="block text-[10px] font-black uppercase tracking-widest text-[#D47A55]">Nova Inspiração</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Título</label>
              <input type="text" placeholder="Ex: Nicho de Madeira Iluminado" value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55]" required />
            </div>
            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Categoria</label>
              <select value={novaCat} onChange={e => setNovaCat(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55]">
                {Object.entries(CAT_LABELS).filter(([k]) => k !== 'TODOS').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Link da Imagem (URL)</label>
            <input type="url" placeholder="https://images.unsplash.com/..." value={novaUrl} onChange={e => setNovaUrl(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55]" required />
          </div>
          <div className="space-y-1">
            <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Descrição / Notas técnicas</label>
            <textarea rows={2} placeholder="Descreva materiais, paleta de cores ou marcenaria..." value={novaDesc} onChange={e => setNovaDesc(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55] resize-none" />
          </div>
          <button type="submit" className="w-full py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-md active:scale-95 transition-all">
            Salvar na Biblioteca
          </button>
        </form>
      )}

      {/* ── Filtros + Busca ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Filtros de categoria */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none flex-1">
          {Object.entries(CAT_LABELS).map(([cat, label]) => (
            <button
              key={cat}
              onClick={() => setFiltroCategoria(cat)}
              className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap border ${
                filtroCategoria === cat
                  ? 'bg-[#D47A55] text-white border-[#D47A55] shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-[#D47A55]/30 hover:text-[#D47A55]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Busca */}
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text" placeholder="Buscar referência..."
            value={busca} onChange={e => setBusca(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-[11px] text-slate-700 outline-none focus:border-[#D47A55] w-48"
          />
        </div>
      </div>

      {/* ── Grid Masonry estilo Pinterest ────────────────────────────────── */}
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {imagensExibidas.map(r => (
          <div
            key={r.id}
            className="break-inside-avoid bg-white border border-slate-200/50 rounded-[20px] overflow-hidden group shadow-[0_4px_16px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_30px_rgb(0,0,0,0.08)] hover:border-[#D47A55]/25 transition-all duration-300"
          >
            <div className="relative overflow-hidden w-full bg-slate-100">
              <img src={r.url} alt={r.titulo} className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
              {/* Overlay hover com ações */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                <div className="w-full flex justify-between items-center">
                  <button
                    onClick={() => setImagemSelecionada(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 text-[#D47A55] text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-white shadow-sm transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5" /> Vincular
                  </button>
                  {r.isCustom && (
                    <button
                      onClick={() => handleDeleteReferencia(r.id)}
                      className="p-1.5 bg-white/80 text-rose-500 rounded-lg hover:bg-white transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-[11px] text-slate-800 truncate">{r.titulo}</h3>
                <span className="text-[8px] font-black text-[#D47A55] bg-[#D47A55]/8 px-2 py-0.5 rounded-full shrink-0">
                  {CAT_LABELS[r.categoria] || r.categoria}
                </span>
              </div>
              {r.descricao && (
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{r.descricao}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {imagensExibidas.length === 0 && (
        <div className="text-center py-16 text-[11px] text-slate-400">
          Nenhuma referência encontrada para este filtro.
        </div>
      )}

      {/* ── Modal Vincular ao Projeto ─────────────────────────────────────── */}
      {imagemSelecionada && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200/60 rounded-[28px] p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[#D47A55] flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4" /> Vincular ao Projeto
              </span>
              <button onClick={() => setImagemSelecionada(null)} className="text-slate-400 text-xl hover:text-slate-700">×</button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/60">
              <img src={imagemSelecionada.url} alt={imagemSelecionada.titulo} className="w-12 h-12 rounded-xl object-cover" />
              <div>
                <span className="block text-xs font-black text-slate-800 truncate max-w-[200px]">{imagemSelecionada.titulo}</span>
                <span className="block text-[8px] font-bold text-slate-400 uppercase mt-0.5">{CAT_LABELS[imagemSelecionada.categoria]}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Selecione o Projeto</label>
              {projetos.length === 0 ? (
                <span className="block text-[10px] text-slate-400 italic">Nenhum projeto cadastrado no banco.</span>
              ) : (
                <select value={projetoVinculoId} onChange={e => setProjetoVinculoId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-[#D47A55]">
                  {projetos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setImagemSelecionada(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-500 font-bold text-xs rounded-xl hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleVincularProjeto}
                disabled={vinculando || projetos.length === 0}
                className="flex-1 py-2.5 bg-gradient-to-tr from-[#D47A55] to-[#C8643C] text-white font-black text-xs uppercase tracking-widest rounded-xl disabled:opacity-50 shadow-md active:scale-95 transition-all"
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
