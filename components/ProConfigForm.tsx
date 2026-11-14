import React, { useEffect, useState } from 'react';
import { proService } from '../services/proService';
import { ProConfig, ProPixKeyType } from '../types';
import { Loader2, Sparkles, User, Landmark, FileText, ChevronLeft, Plus, X, AlertCircle, Check, Save } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { normalizarChavePix, EXEMPLO_CHAVE_PIX } from '../utils/pixCopiaECola';

// Linguagem visual do app (§16/§17/§21/§32): cartão, campo (valor nunca cinza-claro), botões.
const CARTAO = 'bg-white p-4 border border-slate-200 rounded-[10px] space-y-3.5';
const TITULO_BLOCO = 'text-sm font-semibold text-slate-900 flex items-center gap-1.5';
const CAMPO_SEM_BORDA = 'w-full bg-white border rounded-[6px] px-3 h-11 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600 font-medium';
const CAMPO = `${CAMPO_SEM_BORDA} border-slate-300`;
const CAMPO_TEXTO = 'w-full bg-white border border-slate-300 rounded-[6px] px-3 py-2.5 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600 resize-none font-medium';
const BOTAO_SECUNDARIO = 'h-11 px-3 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors';
// Alvo de toque ≥ 44px no celular para os ícones de editar/excluir.
const ALVO_ICONE = 'w-11 h-11 flex items-center justify-center';

interface ProConfigFormProps {
  userId: string;
  onBack: () => void;
}

export const ProConfigForm: React.FC<ProConfigFormProps> = ({ userId, onBack }) => {
  const confirm = useConfirm();
  const { localToast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados dos campos de configuração
  const [templateHeader, setTemplateHeader] = useState('');
  const [cidade, setCidade] = useState('');
  // Rótulo ↔ campo (htmlFor/id): leitor de tela lê o rótulo, e tocar no rótulo foca o campo.
  const idForm = React.useId();
  const [profissao, setProfissao] = useState('AR_CONDICIONADO');
  const [pixKeyType, setPixKeyType] = useState<ProPixKeyType>('CPF');
  const [pixKey, setPixKey] = useState('');
  // Chave conferida pelo tipo (utils/pixCopiaECola.ts): chave errada aqui vira QR recusado na frente do cliente.
  const [erroChavePix, setErroChavePix] = useState('');
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
          setCidade(data.cidade || '');
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

  const conferirChavePix = (tipo: ProPixKeyType = pixKeyType, chave: string = pixKey): boolean => {
    if (!chave.trim()) { setErroChavePix(''); return true; }
    const r = normalizarChavePix(tipo, chave);
    setErroChavePix(r.ok ? '' : r.motivo);
    return r.ok;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conferirChavePix()) {
      showToast('Revise a chave Pix antes de salvar.', 'error');
      return;
    }
    try {
      setSaving(true);
      await proService.saveConfig({
        user_id: userId,
        template_header: templateHeader.trim(),
        cidade: cidade.trim(),
        profissao,
        pix_key_type: pixKeyType,
        pix_key: pixKey.trim(),
        template_footer: templateFooter.trim(),
        templates_custom: templatesCustom,
        created_at: new Date().toISOString()
      });
      showToast('Configurações salvas com sucesso!', 'success');
      setTimeout(onBack, 800);
    } catch (err: any) {
      console.error('Erro ao salvar configurações:', err);
      showToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddOrUpdateTemplate = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!tempTitulo.trim() || !tempDescricao.trim()) {
      showToast('Preencha o título e a descrição do modelo.', 'error');
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

  const handleDeleteTemplate = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!await confirm({ title: 'Excluir modelo?', message: 'Tem certeza que deseja excluir este modelo?', variant: 'danger' })) return;
    setTemplatesCustom(prev => prev.filter(t => t.id !== id));
    if (tempId === id) {
      setTempId(null);
      setTempTitulo('');
      setTempDescricao('');
      setTempValor('');
      setTempUnidade('');
      setTempQuantidade('');
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
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-600" aria-hidden />
        <span className="text-sm text-slate-600">Carregando configurações…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col text-slate-800">
      {/* Header — no computador quem mostra é a casca (ProModule) */}
      <div className="flex items-center gap-3 mb-6 md:hidden">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="w-11 h-11 flex items-center justify-center rounded-[6px] text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
        </button>
        <div>
          <h1 className="text-base font-black text-slate-900">Configurações do perfil</h1>
          <p className="text-xs font-semibold text-slate-600">ÒPURA Pro</p>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSave} className="space-y-4 flex-1">

        {/* Bloco: Identidade Fantasia */}
        <div className={CARTAO}>
          <h2 className={TITULO_BLOCO}>
            <User className="w-4 h-4 text-slate-600" aria-hidden />
            Dados do profissional
          </h2>

          <div className="space-y-1.5">
            <label htmlFor={`${idForm}-nome`} className="block text-xs font-semibold text-slate-500">Nome comercial / fantasia</label>
            <input id={`${idForm}-nome`}
              type="text"
              placeholder="Ex: Alpa Refrigeração & Climatização"
              value={templateHeader}
              onChange={(e) => setTemplateHeader(e.target.value)}
              className={CAMPO}
              required
            />
            <span className="block text-xs text-slate-600">Este nome aparecerá em destaque no cabeçalho do PDF dos seus orçamentos.</span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${idForm}-cidade`} className="block text-xs font-semibold text-slate-500">Cidade</label>
            <input id={`${idForm}-cidade`}
              type="text"
              placeholder="Ex: Cuiabá"
              autoComplete="address-level2"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className={CAMPO}
            />
            <span className="block text-xs text-slate-600">Vai no código Pix: aparece no comprovante de quem paga.</span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${idForm}-profissao`} className="block text-xs font-semibold text-slate-500">Profissão principal</label>
            <select id={`${idForm}-profissao`}
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              className={CAMPO}
            >
              <option value="AR_CONDICIONADO">Ar-condicionado e Refrigeração</option>
              <option value="ELETRICISTA">Eletricista / Instalações Elétricas</option>
              <option value="ENCANADOR">Encanador / Sistemas Hidráulicos</option>
              <option value="PINTOR">Pintor / Acabamentos</option>
            </select>
            <span className="block text-xs text-slate-600">Determina quais os modelos de orçamento padrão serão sugeridos.</span>
          </div>
        </div>

        {/* Bloco: Dados de Faturamento PIX */}
        <div className={CARTAO}>
          <h2 className={TITULO_BLOCO}>
            <Landmark className="w-4 h-4 text-slate-600" aria-hidden />
            Faturamento & Pix
          </h2>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-1 space-y-1.5">
              <label htmlFor={`${idForm}-tipo-pix`} className="block text-xs font-semibold text-slate-500">Tipo de chave</label>
              <select id={`${idForm}-tipo-pix`}
                value={pixKeyType}
                onChange={(e) => {
                  const tipo = e.target.value as ProPixKeyType;
                  setPixKeyType(tipo);
                  if (erroChavePix) conferirChavePix(tipo);
                }}
                className={`${CAMPO_SEM_BORDA} border-slate-300`}
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="EMAIL">E-mail</option>
                <option value="CELULAR">Celular</option>
                <option value="ALEATORIA">Aleatória</option>
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <label htmlFor={`${idForm}-chave-pix`} className="block text-xs font-semibold text-slate-500">Chave Pix</label>
              <input id={`${idForm}-chave-pix`}
                type="text"
                placeholder={EXEMPLO_CHAVE_PIX[pixKeyType]}
                inputMode={pixKeyType === 'CPF' || pixKeyType === 'CELULAR' ? 'numeric' : pixKeyType === 'EMAIL' ? 'email' : 'text'}
                autoCapitalize="off"
                value={pixKey}
                onChange={(e) => { setPixKey(e.target.value); if (erroChavePix) setErroChavePix(''); }}
                onBlur={() => conferirChavePix()}
                aria-invalid={!!erroChavePix}
                aria-describedby={erroChavePix ? 'erro-chave-pix' : undefined}
                className={`${CAMPO_SEM_BORDA} ${erroChavePix ? 'border-red-400' : 'border-slate-300'}`}
              />
              {erroChavePix && (
                <p id="erro-chave-pix" className="text-xs text-red-600" role="alert">{erroChavePix}</p>
              )}
            </div>
          </div>
          <span className="block text-xs text-slate-600">Utilizada para gerar o QR Code Dinâmico e o código Copia e Cola ao concluir um serviço.</span>
        </div>

        {/* Bloco: Layout de Documentos */}
        <div className={CARTAO}>
          <h2 className={TITULO_BLOCO}>
            <FileText className="w-4 h-4 text-slate-600" aria-hidden />
            Textos do documento
          </h2>

          <div className="space-y-1.5">
            <label htmlFor={`${idForm}-rodape`} className="block text-xs font-semibold text-slate-500">Mensagem / rodapé do PDF</label>
            <textarea id={`${idForm}-rodape`}
              rows={2}
              placeholder="Ex: Obrigado pela preferência! Garantia de 90 dias conforme CDC."
              value={templateFooter}
              onChange={(e) => setTemplateFooter(e.target.value)}
              className={CAMPO_TEXTO}
            />
          </div>
        </div>

        {/* Bloco: Modelos Customizados */}
        <div className={CARTAO}>
          <h2 className={TITULO_BLOCO}>
            <Sparkles className="w-4 h-4 text-slate-600" aria-hidden />
            Modelos de orçamentos customizados
          </h2>

          {/* Form inline para cadastrar/editar template */}
          <div className="bg-slate-50 p-3.5 rounded-[10px] border border-slate-200 space-y-2.5">
            <span className="block text-xs font-semibold text-slate-600">
              {tempId ? 'Editar modelo' : 'Adicionar novo modelo rápido'}
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor={`${idForm}-modelo-titulo`} className="block text-xs font-semibold text-slate-500">Título do modelo</label>
                <input id={`${idForm}-modelo-titulo`}
                  type="text"
                  placeholder="Ex: Instalação de Ar-condicionado de Janela"
                  value={tempTitulo}
                  onChange={(e) => setTempTitulo(e.target.value)}
                  className={CAMPO}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idForm}-modelo-valor`} className="block text-xs font-semibold text-slate-500">Valor unitário / estimado (R$)</label>
                <input id={`${idForm}-modelo-valor`}
                  type="text"
                  placeholder="Ex: 350,00"
                  value={tempValor}
                  onChange={(e) => setTempValor(e.target.value)}
                  className={`${CAMPO} tabular-nums`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor={`${idForm}-modelo-unidade`} className="block text-xs font-semibold text-slate-500">Unidade de medida</label>
                <input id={`${idForm}-modelo-unidade`}
                  type="text"
                  placeholder="Ex: Área (m2), metro, unidade"
                  value={tempUnidade}
                  onChange={(e) => setTempUnidade(e.target.value)}
                  className={CAMPO}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idForm}-modelo-qtd`} className="block text-xs font-semibold text-slate-500">Quantidade padrão</label>
                <input id={`${idForm}-modelo-qtd`}
                  type="number"
                  placeholder="Ex: 100"
                  value={tempQuantidade}
                  onChange={(e) => setTempQuantidade(e.target.value)}
                  className={`${CAMPO} tabular-nums`}
                />
              </div>
            </div>

            {/* Cálculo do Total Estimado */}
            {tempValor && tempQuantidade && (
              <div className="bg-white p-2.5 rounded-[6px] border border-slate-200 flex justify-between items-center text-xs font-semibold text-slate-600">
                <span>Cálculo do total estimado:</span>
                <span className="text-sm text-slate-900 font-semibold tabular-nums">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    (parseFloat(tempValor.replace(/[^\d.,]/g, '').replace(',', '.')) || 0) * (parseFloat(tempQuantidade) || 0)
                  )}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <label htmlFor={`${idForm}-modelo-descricao`} className="block text-xs font-semibold text-slate-500">Descrição detalhada do serviço</label>
              <textarea id={`${idForm}-modelo-descricao`}
                rows={2}
                placeholder="Descreva o que está incluso no serviço..."
                value={tempDescricao}
                onChange={(e) => setTempDescricao(e.target.value)}
                className={CAMPO_TEXTO}
              />
            </div>
            <div className="flex gap-2 justify-end">
              {tempId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className={BOTAO_SECUNDARIO}
                >
                  <X className="w-4 h-4" aria-hidden />
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={handleAddOrUpdateTemplate}
                className={BOTAO_SECUNDARIO}
              >
                {tempId ? <Check className="w-4 h-4" aria-hidden /> : <Plus className="w-4 h-4" aria-hidden />}
                {tempId ? 'Salvar modelo' : 'Adicionar'}
              </button>
            </div>
          </div>

          {/* Lista de templates cadastrados */}
          {templatesCustom.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 rounded-[10px] border border-dashed border-slate-300">
              <p className="text-sm text-slate-600">Nenhum modelo customizado cadastrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-600">Seus modelos ({templatesCustom.length})</h3>
              <div className="divide-y divide-slate-100 bg-white rounded-[10px] border border-slate-200 overflow-hidden">
                {templatesCustom.map((t) => {
                  const hasUnitInfo = t.unidade && t.quantidade;
                  const totalCalculated = hasUnitInfo ? t.valor * (t.quantidade || 0) : t.valor;
                  return (
                    <div key={t.id} className="p-3 flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="block text-sm font-semibold text-slate-900">{t.titulo}</span>
                        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs tabular-nums">
                          <span className="font-medium text-slate-700">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                            {t.unidade ? ` / ${t.unidade}` : ''}
                          </span>
                          {hasUnitInfo && (
                            <span className="font-semibold text-slate-900">
                              Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCalculated)} ({t.quantidade} un)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">{t.descricao}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ActionIconButton kind="edit" title="Editar modelo" aria-label="Editar modelo" className={ALVO_ICONE} onClick={(e) => handleEditTemplate(e, t)} />
                        <ActionIconButton kind="delete" title="Excluir modelo" aria-label="Excluir modelo" className={ALVO_ICONE} onClick={(e) => handleDeleteTemplate(e, t.id)} />
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
            className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                Salvando…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" aria-hidden />
                Salvar configurações
              </>
            )}
          </button>
        </div>
      </form>

      {localToast && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          localToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {localToast.message}
        </div>
      )}
    </div>
  );
};

export default ProConfigForm;
