import React, { useEffect, useState } from 'react';
import { proService } from '../services/proService';
import { ProConfig, ProPixKeyType } from '../types';
import { Loader2, Sparkles, User, Landmark, FileText, ChevronLeft } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <Loader2 className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3 text-orange-500" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Configurações...</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full bg-slate-900 text-slate-100 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-black text-white">Configurações do Perfil</h1>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">ÒPURA Pro</p>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSave} className="space-y-4 flex-1">
        
        {/* Bloco: Identidade Fantasia */}
        <div className="bg-[#070913] p-4 border border-white/5 rounded-2xl space-y-3.5 shadow-xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
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
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 font-medium"
              required
            />
            <span className="block text-[8px] text-slate-500">Este nome aparecerá em destaque no cabeçalho do PDF dos seus orçamentos.</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Profissão Principal</label>
            <select
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 font-medium"
            >
              <option value="AR_CONDICIONADO">Ar-condicionado e Refrigeração</option>
              <option value="ELETRICISTA">Eletricista / Instalações Elétricas</option>
              <option value="ENCANADOR">Encanador / Sistemas Hidráulicos</option>
              <option value="PINTOR">Pintor / Acabamentos</option>
            </select>
            <span className="block text-[8px] text-slate-500">Determina quais os modelos de orçamento padrão serão sugeridos.</span>
          </div>
        </div>

        {/* Bloco: Dados de Faturamento PIX */}
        <div className="bg-[#070913] p-4 border border-white/5 rounded-2xl space-y-3.5 shadow-xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5" />
            Faturamento & Pix
          </span>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-1 space-y-1.5">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo de Chave</label>
              <select
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value as ProPixKeyType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2.5 text-xs text-white outline-none focus:border-orange-500 font-medium"
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 font-medium"
                required
              />
            </div>
          </div>
          <span className="block text-[8px] text-slate-500">Utilizada para gerar o QR Code Dinâmico e o código Copia e Cola ao concluir um serviço.</span>
        </div>

        {/* Bloco: Layout de Documentos */}
        <div className="bg-[#070913] p-4 border border-white/5 rounded-2xl space-y-3.5 shadow-xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
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
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 resize-none font-medium"
            />
          </div>
        </div>

        {/* Ações */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
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
