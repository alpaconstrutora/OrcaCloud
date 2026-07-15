import React, { useEffect, useState } from 'react';
import { proService } from '../services/proService';
import { ProConfig, ProPixKeyType } from '../types';
import { Loader2, Sparkles, User, Landmark, FileText, ChevronLeft, Plus, X } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';

interface ProConfigFormProps {
  userId: string;
  onBack: () => void;
}

export const ProConfigForm: React.FC<ProConfigFormProps> = ({ userId, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados dos campos de configuração
  const [templateHeader, setTemplateHeader] = useState('');
  const [profissao, setProfissao] = useState('AR_CONDICIONADO');
  const [pixKeyType, setPixKeyType] = useState<ProPixKeyType>('CPF');
  const [pixKey, setPixKey] = useState('');
  const [templateFooter, setTemplateFooter] = useState('');

  // Estados para templates customizados
  const [templatesCustom, setTemplatesCustom] = useState<{ id: string; titulo: string; descricao: string; valor: number; unidade?: string; quantidade?: number }[]>([]);
  const [tempId, setTempId] = useState<string | null>(null);
  const [tempTitulo, setTempTitulo] = useState('');
  const [tempDescricao, setTempDescricao] = useState('');
  const [tempValor, setTempValor] = useState('');
  const [tempUnidade, setTempUnidade] = useState('');
  const [tempQuantidade, setTempQuantidade] = useState('');

  // Carrega as configurações existentes no mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const data = await proService.getConfig(userId);
        if (data) {
          setTemplateHeader(data.template_header || '');
          setProfissao(data.profissao || 'AR_CONDICIONADO');
          setPixKeyType(data.pix_key_type || 'CPF');
          setPixKey(data.pix_key || '');
          setTemplateFooter(data.template_footer || '');
          setTemplatesCustom(data.templates_custom || []);
        }
      } catch (err) {
        console.error('Erro ao buscar configurações:', err);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      loadConfig();
    }
  }, [userId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await proService.saveConfig({
        user_id: userId,
        template_header: templateHeader.trim(),
        profissao,
        pix_key_type: pixKeyType,
        pix_key: pixKey.trim(),
        template_footer: templateFooter.trim(),
        templates_custom: templatesCustom,
        created_at: new Date().toISOString()
      });
      alert('Configurações salvas com sucesso!');
      onBack();
    } catch (err: any) {
      console.error('Erro ao salvar configurações:', err);
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddOrUpdateTemplate = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!tempTitulo.trim() || !tempDescricao.trim()) {
      alert('Por favor, preencha o título e a descrição do modelo.');
      return;
    }

    const valorNum = parseFloat(tempValor.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    const qtdNum = tempQuantidade ? parseFloat(tempQuantidade) : undefined;
    const unidadeStr = tempUnidade.trim() || undefined;

    if (tempId) {
      // Editar existente
      setTemplatesCustom(prev =>
        prev.map(t => (t.id === tempId ? { 
          ...t, 
          titulo: tempTitulo.trim(), 
          descricao: tempDescricao.trim(), 
          valor: valorNum,
          unidade: unidadeStr,
          quantidade: qtdNum
        } : t))
      );
      setTempId(null);
    } else {
      // Adicionar novo
      const newTemplate = {
        id: Math.random().toString(36).substring(2, 9),
        titulo: tempTitulo.trim(),
        descricao: tempDescricao.trim(),
        valor: valorNum,
        unidade: unidadeStr,
        quantidade: qtdNum
      };
      setTemplatesCustom(prev => [...prev, newTemplate]);
    }

    // Limpar campos
    setTempTitulo('');
    setTempDescricao('');
    setTempValor('');
    setTempUnidade('');
    setTempQuantidade('');
  };

  const handleEditTemplate = (e: React.MouseEvent, t: { id: string; titulo: string; descricao: string; valor: number; unidade?: string; quantidade?: number }) => {
    e.preventDefault();
    setTempId(t.id);
    setTempTitulo(t.titulo);
    setTempDescricao(t.descricao);
    setTempValor(t.valor.toString());
    setTempUnidade(t.unidade || '');
    setTempQuantidade(t.quantidade ? t.quantidade.toString() : '');
  };

  const handleDeleteTemplate = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      setTemplatesCustom(prev => prev.filter(t => t.id !== id));
      if (tempId === id) {
        setTempId(null);
        setTempTitulo('');
        setTempDescricao('');
        setTempValor('');
        setTempUnidade('');
        setTempQuantidade('');
      }
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    setTempId(null);
    setTempTitulo('');
    setTempDescricao('');
    setTempValor('');
    setTempUnidade('');
    setTempQuantidade('');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px] bg-[#F3F7F9]">
        <Loader2 className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3 text-teal-500" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Configurações...</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full bg-[#F3F7F9] text-slate-800 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-black text-slate-800">Configurações do Perfil</h1>
          <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">ÒPURA Pro</p>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSave} className="space-y-4 flex-1">
        
        {/* Bloco: Identidade Fantasia */}
        <div className="bg-white p-4 border border-slate-200/40 rounded-[24px] space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <span className="text-xs font-black uppercase tracking-widest text-teal-600 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Dados do Profissional
          </span>

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Nome Comercial / Fantasia</label>
            <input
              type="text"
              placeholder="Ex: Alpa Refrigeração & Climatização"
              value={templateHeader}
              onChange={(e) => setTemplateHeader(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500 font-medium"
              required
            />
            <span className="block text-[8px] text-slate-400">Este nome aparecerá em destaque no cabeçalho do PDF dos seus orçamentos.</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Profissão Principal</label>
            <select
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500 font-medium"
            >
              <option value="AR_CONDICIONADO">Ar-condicionado e Refrigeração</option>
              <option value="ELETRICISTA">Eletricista / Instalações Elétricas</option>
              <option value="ENCANADOR">Encanador / Sistemas Hidráulicos</option>
              <option value="PINTOR">Pintor / Acabamentos</option>
            </select>
            <span className="block text-[8px] text-slate-400">Determina quais os modelos de orçamento padrão serão sugeridos.</span>
          </div>
        </div>

        {/* Bloco: Dados de Faturamento PIX */}
        <div className="bg-white p-4 border border-slate-200/40 rounded-[24px] space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <span className="text-xs font-black uppercase tracking-widest text-teal-600 flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5" />
            Faturamento & Pix
          </span>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-1 space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo de Chave</label>
              <select
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value as ProPixKeyType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500 font-medium"
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">E-mail</option>
                <option value="CELULAR">Celular</option>
                <option value="ALEATORIA">Aleatória</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Chave PIX</label>
              <input
                type="text"
                placeholder="Insira a chave pix"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500 font-medium"
                required
              />
            </div>
          </div>
          <span className="block text-[8px] text-slate-400">Utilizada para gerar o QR Code Dinâmico e o código Copia e Cola ao concluir um serviço.</span>
        </div>

        {/* Bloco: Layout de Documentos */}
        <div className="bg-white p-4 border border-slate-200/40 rounded-[24px] space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <span className="text-xs font-black uppercase tracking-widest text-teal-600 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Textos do Documento
          </span>

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Mensagem / Rodapé do PDF</label>
            <textarea
              rows={2}
              placeholder="Ex: Obrigado pela preferência! Garantia de 90 dias conforme CDC."
              value={templateFooter}
              onChange={(e) => setTemplateFooter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500 resize-none font-medium"
            />
          </div>
        </div>

        {/* Bloco: Modelos Customizados */}
        <div className="bg-white p-4 border border-slate-200/40 rounded-[24px] space-y-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <span className="text-xs font-black uppercase tracking-widest text-teal-600 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Modelos de Orçamentos Customizados
          </span>

          {/* Form inline para cadastrar/editar template */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/50 space-y-2.5">
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">
              {tempId ? 'Editar Modelo' : 'Adicionar Novo Modelo Rápido'}
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Título do Modelo</label>
                <input
                  type="text"
                  placeholder="Ex: Instalação de Ar-condicionado de Janela"
                  value={tempTitulo}
                  onChange={(e) => setTempTitulo(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-form-input text-slate-700 outline-none focus:border-teal-500 font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Valor Unitário / Estimado (R$)</label>
                <input
                  type="text"
                  placeholder="Ex: 350,00"
                  value={tempValor}
                  onChange={(e) => setTempValor(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-form-input text-slate-700 outline-none focus:border-teal-500 font-medium"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Unidade de Medida</label>
                <input
                  type="text"
                  placeholder="Ex: Área (m2), metro, unidade"
                  value={tempUnidade}
                  onChange={(e) => setTempUnidade(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-form-input text-slate-700 outline-none focus:border-teal-500 font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Quantidade Padrão</label>
                <input
                  type="number"
                  placeholder="Ex: 100"
                  value={tempQuantidade}
                  onChange={(e) => setTempQuantidade(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-form-input text-slate-700 outline-none focus:border-teal-500 font-medium"
                />
              </div>
            </div>

            {/* Cálculo do Total Estimado */}
            {tempValor && tempQuantidade && (
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/50 flex justify-between items-center text-xs font-bold text-slate-500">
                <span>Cálculo do Total Estimado:</span>
                <span className="text-teal-600 font-black">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    (parseFloat(tempValor.replace(/[^\d.,]/g, '').replace(',', '.')) || 0) * (parseFloat(tempQuantidade) || 0)
                  )}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Descrição Detalhada do Serviço</label>
              <textarea
                rows={2}
                placeholder="Descreva o que está incluso no serviço..."
                value={tempDescricao}
                onChange={(e) => setTempDescricao(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-form-input text-slate-700 outline-none focus:border-teal-500 resize-none font-medium"
              />
            </div>
            <div className="flex gap-2 justify-end">
              {tempId && (
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Cancelar
                </button>
              )}
              <button
                onClick={handleAddOrUpdateTemplate}
                className="px-3 py-1.5 bg-teal-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-teal-600 transition-colors flex items-center gap-1"
              >
                {tempId ? <Sparkles className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {tempId ? 'Salvar Modelo' : 'Adicionar'}
              </button>
            </div>
          </div>

          {/* Lista de templates cadastrados */}
          {templatesCustom.length === 0 ? (
            <div className="text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-xs font-medium text-slate-400">Nenhum modelo customizado cadastrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Seus Modelos ({templatesCustom.length})</label>
              <div className="divide-y divide-slate-100 bg-slate-50/30 rounded-2xl border border-slate-200/40 overflow-hidden animate-fadeIn">
                {templatesCustom.map((t) => {
                  const hasUnitInfo = t.unidade && t.quantidade;
                  const totalCalculated = hasUnitInfo ? t.valor * (t.quantidade || 0) : t.valor;
                  return (
                    <div key={t.id} className="p-3 flex items-start justify-between gap-3 hover:bg-slate-50/80 transition-colors">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-700">{t.titulo}</span>
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/40">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                            {t.unidade ? ` / ${t.unidade}` : ''}
                          </span>
                          {hasUnitInfo && (
                            <span className="text-[9px] font-black text-teal-600 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-150">
                              Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCalculated)} ({t.quantidade} un)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium line-clamp-2">{t.descricao}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <ActionIconButton kind="edit" size="sm" title="Editar modelo" onClick={(e) => handleEditTemplate(e, t)} />
                        <ActionIconButton kind="delete" size="sm" title="Excluir modelo" onClick={(e) => handleDeleteTemplate(e, t.id)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-gradient-to-tr from-teal-500 to-cyan-400 text-white text-button font-black uppercase tracking-widest rounded-full transition-all shadow-md shadow-teal-500/10 active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProConfigForm;
