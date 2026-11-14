import React from 'react';
import { proService } from '../services/proService';
import { interpretarDitado } from '../utils/proDitado';
import { ProCliente, ProOrcamento } from '../types';
import ClientSelect from './ClientSelect';
import jsPDF from 'jspdf';
import MoneyCentsInput from './ui/MoneyCentsInput';
import { CheckCircle2, ChevronLeft, Mic, Plus, Save, Send, Square } from 'lucide-react';
import { useToast } from '../hooks/useToast';

// Campo de uma linha no celular: alvo de 44px, valor em slate-900 (§32), foco azul do app.
const CAMPO = 'w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600';
const CAMPO_TEXTO = 'w-full bg-white border border-slate-300 rounded-[6px] px-3 py-2.5 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600 resize-none';

interface ProOrcamentoFormProps {
  userId: string;
  orcamentoId: string | null;
  onBack: () => void;
  onSave: () => void;
}

const ProOrcamentoForm: React.FC<ProOrcamentoFormProps> = ({
  userId,
  orcamentoId,
  onBack,
  onSave
}) => {
  const { showToast } = useToast();
  const idCampo = React.useId();
  const [loading, setLoading] = React.useState(false);
  const [clientes, setClientes] = React.useState<ProCliente[]>([]);

  // Estados dos campos
  const [clienteId, setClienteId] = React.useState('');
  const [isNovoCliente, setIsNovoCliente] = React.useState(false);
  const [novoClienteNome, setNovoClienteNome] = React.useState('');
  const [novoClienteTelefone, setNovoClienteTelefone] = React.useState('');
  const [novoClienteEndereco, setNovoClienteEndereco] = React.useState('');

  const [descricao, setDescricao] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [validadeDias, setValidadeDias] = React.useState('15');
  const [garantiaDias, setGarantiaDias] = React.useState('90');
  const [observacoes, setObservacoes] = React.useState('');

  const [unidade, setUnidade] = React.useState('');
  const [quantidade, setQuantidade] = React.useState('');
  const [valorUnitario, setValorUnitario] = React.useState('');

  const [config, setConfig] = React.useState<any>(null);

  // Estados da Fase 2 (Voz & Templates)
  const [isListening, setIsListening] = React.useState(false);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = React.useState('');

  const getTodosTemplates = () => {
    const padrao = proService.getTemplatesPadrao(config?.profissao || 'AR_CONDICIONADO').map(t => ({
      ...t,
      tipo: 'PADRAO' as const
    }));
    const custom = (config?.templates_custom || []).map((t: any) => ({
      ...t,
      tipo: 'CUSTOM' as const
    }));
    return [...padrao, ...custom];
  };

  // Lógica de Reconhecimento de Voz (Web Speech API)
  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Seu navegador não suporta reconhecimento de voz nativo. Experimente usar o Google Chrome ou Safari Mobile.', 'error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Erro no reconhecimento de voz:', event.error);
      setIsListening(false);
      showToast('Não foi possível capturar sua voz. Tente novamente.', 'error');
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      parseVoiceText(speechToText);
    };

    recognition.start();
  };

  // Leitura do ditado em utils/proDitado.ts (testado): nomes com acento e "para" solto
  // só vira cliente se casar com um cadastrado.
  const parseVoiceText = (text: string) => {
    const d = interpretarDitado(text, clientes);
    if (d.valor) setValor(d.valor);
    if (d.clienteId) {
      setIsNovoCliente(false);
      setClienteId(d.clienteId);
    } else if (d.novoClienteNome) {
      setIsNovoCliente(true);
      setNovoClienteNome(d.novoClienteNome);
    }
    if (d.descricao) setDescricao(d.descricao);
  };

  React.useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [clientesData, configData] = await Promise.all([
          proService.listClientes(userId),
          proService.getConfig(userId)
        ]);
        setClientes(clientesData);
        setConfig(configData);

        if (orcamentoId) {
          const orc = await proService.getOrcamentoById(orcamentoId);
          if (orc) {
            setClienteId(orc.cliente_id);
            setDescricao(orc.descricao);
            setValor(orc.valor.toString());
            setValidadeDias(orc.validade_dias.toString());
            setGarantiaDias((orc.garantia_dias || 0).toString());
            setObservacoes(orc.observacoes || '');
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados do orçamento:', error);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [userId, orcamentoId]);

  // Função para gerar o PDF Premium (Stripe/Linear Style)
  const generatePDF = (clientName: string, clientPhone: string, clientAddress: string, savedOrc: ProOrcamento) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Paleta de cores escura e elegante
    const primaryColor = [15, 23, 42]; // #0F172A (Deep Slate)
    const accentColor = [249, 115, 22]; // #F97316 (Orange)
    const textColor = [51, 65, 85]; // #334155 (Slate 700)

    // Cabeçalho / Branding
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(config?.template_header || 'ÒPURA Pro', 15, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Orçamento de Prestação de Serviços', 15, 28);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Nº ${savedOrc.id.substring(0, 8).toUpperCase()}`, 195, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emissão: ${new Date(savedOrc.created_at).toLocaleDateString('pt-BR')}`, 195, 28, { align: 'right' });

    // Detalhes do Profissional (Emissor)
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PRESTADOR:', 15, 58);
    doc.setFont('helvetica', 'normal');
    doc.text('Profissional Autônomo Parceiro ÒPURA Pro', 15, 63);
    if (config?.pix_key) {
      doc.text(`PIX: ${config.pix_key} (${config.pix_key_type})`, 15, 68);
    }

    // Detalhes do Cliente
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', 110, 58);
    doc.setFont('helvetica', 'normal');
    doc.text(clientName, 110, 63);
    doc.text(`Telefone: ${clientPhone}`, 110, 68);
    if (clientAddress) {
      doc.text(`Endereço: ${clientAddress}`, 110, 73);
    }

    // Linha divisória
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 80, 195, 80);

    // Descrição do Serviço
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DESCRITIVO DOS SERVIÇOS', 15, 90);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const splitDesc = doc.splitTextToSize(descricao, 180);
    doc.text(splitDesc, 15, 97);

    // Ajustar Y baseado no tamanho da descrição e medições
    const descHeight = splitDesc.length * 5;
    let currentY = 97 + descHeight;

    if (unidade && quantidade && valorUnitario) {
      currentY += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(13, 148, 136); // Teal 600
      const formattedUnitVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valorUnitario));
      const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
      doc.text(`Medição: ${quantidade} ${unidade} x ${formattedUnitVal} = Total de ${formattedTotal}`, 15, currentY);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]); // Restaurar cor do texto
      currentY += 7;
    }

    currentY += 15;

    // Resumo de Prazos e Garantias
    doc.setFillColor(248, 250, 252);
    doc.rect(15, currentY, 180, 20, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, currentY, 180, 20, 'S');

    doc.setFont('helvetica', 'bold');
    doc.text('Validade da Proposta:', 20, currentY + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${validadeDias} dias`, 65, currentY + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('Garantia Oferecida:', 20, currentY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${garantiaDias} dias`, 65, currentY + 14);

    if (observacoes) {
      currentY += 28;
      doc.setFont('helvetica', 'bold');
      doc.text('OBSERVAÇÕES:', 15, currentY);
      doc.setFont('helvetica', 'normal');
      const splitObs = doc.splitTextToSize(observacoes, 180);
      doc.text(splitObs, 15, currentY + 7);
      currentY += (splitObs.length * 5) + 5;
    } else {
      currentY += 28;
    }

    // Valor Total
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(120, currentY, 75, 15, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('VALOR TOTAL:', 125, currentY + 9);
    doc.setFontSize(13);
    doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor)), 190, currentY + 10, { align: 'right' });

    // Rodapé
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(config?.template_footer || 'Enviado com ÒPURA Pro — Tecnologia de campo.', 105, 285, { align: 'center' });

    // Salvar e fazer download do arquivo
    const filename = `orcamento_${clientName.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
  };

  const handleSave = async (status: 'RASCUNHO' | 'ENVIADO' | 'APROVADO') => {
    if (!descricao || !valor) {
      showToast('Por favor, preencha a descrição e o valor do orçamento.', 'error');
      return;
    }

    // O Safari do iPhone bloqueia `window.open` que acontece depois de um `await` (deixa de
    // contar como toque do usuário). A aba nasce aqui, vazia, e recebe o link do WhatsApp
    // depois de salvar; se salvar falhar, ela fecha.
    const janelaWhatsApp = status === 'ENVIADO' ? window.open('', '_blank') : null;

    try {
      setLoading(true);

      let targetClienteId = clienteId;
      let targetClienteNome = '';
      let targetClienteTelefone = '';
      let targetClienteEndereco = '';

      // Se for um novo cliente, salvamos ele primeiro
      if (isNovoCliente) {
        if (!novoClienteNome || !novoClienteTelefone) {
          showToast('Por favor, informe o nome e telefone do novo cliente.', 'error');
          janelaWhatsApp?.close();
          setLoading(false);
          return;
        }

        const newClient = await proService.saveCliente({
          user_id: userId,
          nome: novoClienteNome,
          telefone: novoClienteTelefone,
          endereco: novoClienteEndereco || undefined,
          observacoes: 'Criado a partir de orçamento rápido.'
        });

        targetClienteId = newClient.id;
        targetClienteNome = newClient.nome;
        targetClienteTelefone = newClient.telefone;
        targetClienteEndereco = newClient.endereco || novoClienteEndereco || '';
      } else {
        const selClient = clientes.find(c => c.id === clienteId);
        targetClienteNome = selClient?.nome || 'Cliente';
        targetClienteTelefone = selClient?.telefone || '';
        targetClienteEndereco = selClient?.endereco || '';
      }

      // Salva o orçamento
      const savedOrc = await proService.saveOrcamento({
        id: orcamentoId || undefined,
        user_id: userId,
        cliente_id: targetClienteId,
        descricao,
        valor: Number(valor),
        fotos: [],
        observacoes: observacoes || undefined,
        validade_dias: Number(validadeDias),
        garantia_dias: Number(garantiaDias),
        status: status
      });

      // Se o status for ENVIADO, gera o PDF e abre o WhatsApp
      if (status === 'ENVIADO') {
        generatePDF(targetClienteNome, targetClienteTelefone, targetClienteEndereco, savedOrc);

        // Mensagem de WhatsApp rápida
        const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
        const message = `Olá, ${targetClienteNome}! Acabo de gerar o orçamento para o seu serviço:\n\n*Descrição:* ${descricao}\n*Valor:* ${formattedVal}\n*Validade:* ${validadeDias} dias\n*Garantia:* ${garantiaDias} dias\n\nEstou lhe enviando o orçamento em PDF. Fico no aguardo do seu retorno para agendarmos!`;
        const encoded = encodeURIComponent(message);
        const cleanPhone = targetClienteTelefone.replace(/\D/g, '');
        // Adiciona DDI Brasil (55) se não houver
        const targetPhone = cleanPhone.length === 11 || cleanPhone.length === 10 ? `55${cleanPhone}` : cleanPhone;
        const waUrl = `https://wa.me/${targetPhone}?text=${encoded}`;
        if (janelaWhatsApp) janelaWhatsApp.location.href = waUrl;
        else window.open(waUrl, '_blank');
      }

      // Se o status for APROVADO, já cria automaticamente o Serviço (OS) correspondente
      if (status === 'APROVADO') {
        // Verifica se já não existe uma OS para este orçamento
        const existingOS = await proService.getServicoByOrcamentoId(savedOrc.id);
        if (!existingOS) {
          await proService.saveServico({
            orcamento_id: savedOrc.id,
            checklist: [
              { id: '1', text: 'Preparação do ambiente', completed: false },
              { id: '2', text: 'Execução do serviço principal', completed: false },
              { id: '3', text: 'Limpeza e acabamento', completed: false }
            ],
            fotos_antes: [],
            fotos_depois: [],
            status: 'PENDENTE'
          });
        }
      }

      onSave();
    } catch (error) {
      console.error('Erro ao salvar orçamento:', error);
      janelaWhatsApp?.close();
      showToast('Não foi possível salvar o orçamento. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col text-slate-800">
      {/* Header */}
      <div className="flex items-center gap-1 mb-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="w-11 h-11 -ml-2 flex items-center justify-center rounded-[6px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <h1 className="text-lg font-black text-slate-900">
          {orcamentoId ? 'Editar orçamento' : 'Novo orçamento rápido'}
        </h1>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-sm text-slate-600">Processando...</span>
        </div>
      )}

      {!loading && (
        <div className="space-y-4 flex-1">
          {/* Modelos Rápidos por Profissão */}
          <div className="space-y-1.5">
            <label htmlFor={`${idCampo}-modelo`} className="block text-xs font-semibold text-slate-500">Carregar modelo rápido</label>
            <select
              id={`${idCampo}-modelo`}
              value={selectedTemplateIndex}
              onChange={(e) => {
                const idx = e.target.value;
                setSelectedTemplateIndex(idx);
                if (idx !== '') {
                  const templates = getTodosTemplates();
                  const t = templates[Number(idx)] as any;
                  if (t) {
                    setDescricao(t.descricao);

                    let detectedUnidade = t.unidade || '';
                    let detectedQuantidade = t.quantidade !== undefined && t.quantidade !== null ? t.quantidade.toString() : '';
                    let detectedValorUnitario = '';

                    // Autodetecta unidade do título do template (ex: se contiver m²)
                    if (!detectedUnidade && t.titulo && t.titulo.toLowerCase().includes('(m²)')) {
                      detectedUnidade = 'm²';
                    }

                    // Preenche o valor unitário se houver medição ativa
                    if (detectedUnidade || detectedQuantidade) {
                      detectedValorUnitario = t.valor.toString();
                    }

                    setUnidade(detectedUnidade);
                    setQuantidade(detectedQuantidade);
                    setValorUnitario(detectedValorUnitario);

                    // Calcula o valor total
                    if (detectedQuantidade && detectedValorUnitario) {
                      setValor((parseFloat(detectedValorUnitario) * parseFloat(detectedQuantidade)).toFixed(2));
                    } else {
                      setValor(t.valor.toString());
                    }
                  }
                }
              }}
              className={CAMPO}
            >
              <option value="">Selecione um modelo...</option>
              {/* O value continua sendo o índice na lista completa (padrão + meus); o grupo
                  "Meus modelos" substitui o ✨ que marcava o modelo próprio. */}
              {(() => {
                const opcoes = getTodosTemplates().map((t: any, index) => (
                  <option key={index} value={index}>
                    {t.titulo} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}{t.unidade ? `/${t.unidade}` : ''})
                  </option>
                ));
                const todos = getTodosTemplates();
                const padrao = opcoes.filter((_, i) => todos[i].tipo !== 'CUSTOM');
                const meus = opcoes.filter((_, i) => todos[i].tipo === 'CUSTOM');
                if (meus.length === 0) return padrao;
                return (
                  <>
                    <optgroup label="Modelos padrão">{padrao}</optgroup>
                    <optgroup label="Meus modelos">{meus}</optgroup>
                  </>
                );
              })()}
            </select>
          </div>

          {/* Seletor de Cliente */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-500">Cliente</label>
            {/* Drawer padrão do app; "Cadastrar novo" deixou de ser uma <option> disfarçada
                e virou o botão ao lado, que abre o formulário inline abaixo. */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ClientSelect
                  clients={clientes.map(c => ({ id: c.id, name: c.nome }))}
                  value={isNovoCliente ? '' : clienteId}
                  onChange={(id) => { setIsNovoCliente(false); setClienteId(id); }}
                  placeholder={isNovoCliente ? 'Novo cliente (preencha abaixo)' : 'Selecione um cliente...'}
                  icon={null}
                  triggerClassName="w-full h-11 bg-white border border-slate-300 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={() => { setIsNovoCliente(v => !v); setClienteId(''); }}
                className={`h-11 inline-flex items-center gap-1 px-3 rounded-[6px] text-sm font-medium border transition-colors shrink-0 ${isNovoCliente ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}
              >
                {isNovoCliente ? 'Cancelar novo' : (
                  <>
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Novo cliente
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Form Novo Cliente Inline */}
          {isNovoCliente && (
            <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-4 space-y-3">
              <span className="block text-xs font-semibold text-slate-600">Dados do novo cliente</span>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor={`${idCampo}-cli-nome`} className="block text-xs font-semibold text-slate-500">Nome</label>
                  <input
                    id={`${idCampo}-cli-nome`}
                    type="text"
                    placeholder="Nome completo do cliente"
                    value={novoClienteNome}
                    onChange={(e) => setNovoClienteNome(e.target.value)}
                    className={CAMPO}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${idCampo}-cli-telefone`} className="block text-xs font-semibold text-slate-500">Telefone</label>
                  <input
                    id={`${idCampo}-cli-telefone`}
                    type="tel"
                    placeholder="Telefone (com DDD)"
                    value={novoClienteTelefone}
                    onChange={(e) => setNovoClienteTelefone(e.target.value)}
                    className={CAMPO}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${idCampo}-cli-endereco`} className="block text-xs font-semibold text-slate-500">Endereço de execução</label>
                  <input
                    id={`${idCampo}-cli-endereco`}
                    type="text"
                    placeholder="Endereço de execução (opcional)"
                    value={novoClienteEndereco}
                    onChange={(e) => setNovoClienteEndereco(e.target.value)}
                    className={CAMPO}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Descrição do Serviço */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`${idCampo}-descricao`} className="block text-xs font-semibold text-slate-500">Serviço a ser realizado</label>
              <button
                type="button"
                onClick={handleVoiceInput}
                className={`h-11 px-3 flex items-center justify-center gap-1.5 rounded-[6px] font-medium text-sm border transition-colors shrink-0 ${
                  isListening
                    ? 'bg-white hover:bg-red-50 border-red-300 text-red-700'
                    : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                {isListening ? (
                  <>
                    <Square className="w-4 h-4 animate-pulse" aria-hidden="true" />
                    Ouvindo...
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" aria-hidden="true" />
                    Ditar por voz
                  </>
                )}
              </button>
            </div>
            <textarea
              id={`${idCampo}-descricao`}
              rows={3}
              placeholder="Ex: Instalação de ar-condicionado Split 12000 BTUs com fornecimento de fiação e tubulação de cobre até 3m."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={CAMPO_TEXTO}
            />
          </div>

          {/* Cálculo por Unidade (Opcional) */}
          <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-4 space-y-2.5">
            <span className="block text-xs font-semibold text-slate-600">
              Cálculo por unidade de medida (opcional)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label htmlFor={`${idCampo}-unidade`} className="block text-xs font-semibold text-slate-500">Unidade</label>
                <input
                  id={`${idCampo}-unidade`}
                  type="text"
                  placeholder="Ex: m², un, h"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  className={`${CAMPO} px-2.5`}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={`${idCampo}-quantidade`} className="block text-xs font-semibold text-slate-500">Qtd</label>
                <input
                  id={`${idCampo}-quantidade`}
                  type="number"
                  placeholder="Ex: 100"
                  value={quantidade}
                  onChange={(e) => {
                    const q = e.target.value;
                    setQuantidade(q);
                    const qNum = parseFloat(q);
                    const uNum = parseFloat(valorUnitario);
                    if (!isNaN(qNum) && !isNaN(uNum)) {
                      setValor((qNum * uNum).toFixed(2));
                    }
                  }}
                  className={`${CAMPO} px-2.5 tabular-nums`}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500">Unitário (R$)</label>
                <MoneyCentsInput
                  placeholder="Ex: 200,00"
                  value={valorUnitario}
                  onChange={(u) => {
                    setValorUnitario(u);
                    const qNum = parseFloat(quantidade);
                    const uNum = parseFloat(u);
                    if (!isNaN(qNum) && !isNaN(uNum)) {
                      setValor((qNum * uNum).toFixed(2));
                    }
                  }}
                  className="w-full h-11 bg-white border border-slate-300 rounded-[6px] px-2.5 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600 tabular-nums"
                />
              </div>
            </div>
            {quantidade && valorUnitario && !isNaN(parseFloat(quantidade)) && !isNaN(parseFloat(valorUnitario)) && (
              <div className="bg-white p-2.5 rounded-[6px] border border-slate-200 flex justify-between items-center gap-2 text-xs font-medium text-slate-600">
                <span>Cálculo do Total:</span>
                <span className="text-slate-700 font-semibold tabular-nums text-right">
                  {quantidade} x R$ {parseFloat(valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = R$ {((parseFloat(quantidade) || 0) * (parseFloat(valorUnitario) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-500">Valor cobrado (R$)</label>
            <MoneyCentsInput
              placeholder="0,00"
              value={valor}
              onChange={(v) => setValor(v)}
              className="w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600 tabular-nums"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Validade */}
            <div className="space-y-1.5">
              <label htmlFor={`${idCampo}-validade`} className="block text-xs font-semibold text-slate-500">Validade (dias)</label>
              <input
                id={`${idCampo}-validade`}
                type="number"
                value={validadeDias}
                onChange={(e) => setValidadeDias(e.target.value)}
                className={`${CAMPO} tabular-nums`}
              />
            </div>

            {/* Garantia */}
            <div className="space-y-1.5">
              <label htmlFor={`${idCampo}-garantia`} className="block text-xs font-semibold text-slate-500">Garantia (dias)</label>
              <input
                id={`${idCampo}-garantia`}
                type="number"
                value={garantiaDias}
                onChange={(e) => setGarantiaDias(e.target.value)}
                className={`${CAMPO} tabular-nums`}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <label htmlFor={`${idCampo}-observacoes`} className="block text-xs font-semibold text-slate-500">Observações adicionais</label>
            <textarea
              id={`${idCampo}-observacoes`}
              rows={2}
              placeholder="Ex: Não incluso quebra de alvenaria. Chave Pix para pagamento no rodapé do documento."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className={CAMPO_TEXTO}
            />
          </div>

          {/* Ações do Formulário */}
          <div className="pt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleSave('ENVIADO')}
              className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Salvar e enviar no WhatsApp
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSave('RASCUNHO')}
                className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                Rascunho
              </button>
              <button
                type="button"
                onClick={() => handleSave('APROVADO')}
                className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                Direto para serviço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProOrcamentoForm;
