import React from 'react';
import { proService } from '../services/proService';
import { ProCliente, ProOrcamento } from '../types';
import jsPDF from 'jspdf';

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

  const [config, setConfig] = React.useState<any>(null);

  // Estados da Fase 2 (Voz & Templates)
  const [isListening, setIsListening] = React.useState(false);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = React.useState('');

  // Lógica de Reconhecimento de Voz (Web Speech API)
  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador não suporta reconhecimento de voz nativo. Experimente usar o Google Chrome ou Safari Mobile.');
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
      alert('Não foi possível capturar sua voz. Tente novamente.');
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      parseVoiceText(speechToText);
    };

    recognition.start();
  };

  const parseVoiceText = (text: string) => {
    const textLower = text.toLowerCase();
    
    // 1. Extração de Valor: procura algo como "X reais" ou "R$ X" ou apenas números
    let extractedValor = '';
    const valorMatch = textLower.match(/(\d+(?:[\.,]\d+)?)\s*(?:reais|real)/) || textLower.match(/r\$\s*(\d+(?:[\.,]\d+)?)/);
    if (valorMatch) {
      extractedValor = valorMatch[1].replace(',', '.');
    }

    // 2. Extração de Cliente: procura "para o cliente X" ou "para a cliente X" ou "para X"
    let extractedClienteId = '';
    const clienteMatch = textLower.match(/para\s+(?:o|a)?\s*cliente\s+([a-zA-Z\s]+)/) || textLower.match(/para\s+([a-zA-Z\s]+)/);
    if (clienteMatch) {
      const nomeBuscado = clienteMatch[1].trim().toLowerCase();
      // Tenta encontrar na lista de clientes existentes
      const found = clientes.find(c => c.nome.toLowerCase().includes(nomeBuscado));
      if (found) {
        extractedClienteId = found.id;
        setIsNovoCliente(false);
      } else {
        // Se não achar, preenche o campo de novo cliente com o nome extraído!
        setIsNovoCliente(true);
        setNovoClienteNome(clienteMatch[1].trim());
      }
    }

    // 3. Descrição: o restante do texto ou a frase completa limpando o valor e o cliente
    let extractedDesc = text;
    // Limpa o padrão de valor do texto
    if (valorMatch) {
      extractedDesc = extractedDesc.replace(valorMatch[0], '');
    }
    // Limpa o padrão de cliente do texto
    if (clienteMatch) {
      extractedDesc = extractedDesc.replace(clienteMatch[0], '');
    }
    // Remove espaços extras e limpa termos comuns de início
    extractedDesc = extractedDesc.replace(/crie um orçamento de|orçamento de|criar orçamento para/gi, '').trim();
    // Capitaliza a primeira letra
    if (extractedDesc) {
      extractedDesc = extractedDesc.charAt(0).toUpperCase() + extractedDesc.slice(1);
    }

    if (extractedValor) setValor(extractedValor);
    if (extractedClienteId) setClienteId(extractedClienteId);
    if (extractedDesc) setDescricao(extractedDesc);
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
  const generatePDF = (clientName: string, clientPhone: string, savedOrc: ProOrcamento) => {
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
    if (novoClienteEndereco) {
      doc.text(`Endereço: ${novoClienteEndereco}`, 110, 73);
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

    // Ajustar Y baseado no tamanho da descrição
    const descHeight = splitDesc.length * 5;
    let currentY = 97 + descHeight + 15;

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
      alert('Por favor, preencha a descrição e o valor do orçamento.');
      return;
    }

    try {
      setLoading(true);

      let targetClienteId = clienteId;
      let targetClienteNome = '';
      let targetClienteTelefone = '';

      // Se for um novo cliente, salvamos ele primeiro
      if (isNovoCliente) {
        if (!novoClienteNome || !novoClienteTelefone) {
          alert('Por favor, informe o nome e telefone do novo cliente.');
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
      } else {
        const selClient = clientes.find(c => c.id === clienteId);
        targetClienteNome = selClient?.nome || 'Cliente';
        targetClienteTelefone = selClient?.telefone || '';
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
        generatePDF(targetClienteNome, targetClienteTelefone, savedOrc);

        // Mensagem de WhatsApp rápida
        const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
        const message = `Olá, ${targetClienteNome}! Acabo de gerar o orçamento para o seu serviço:\n\n*Descrição:* ${descricao}\n*Valor:* ${formattedVal}\n*Validade:* ${validadeDias} dias\n*Garantia:* ${garantiaDias} dias\n\nEstou lhe enviando o orçamento em PDF. Fico no aguardo do seu retorno para agendarmos!`;
        const encoded = encodeURIComponent(message);
        const cleanPhone = targetClienteTelefone.replace(/\D/g, '');
        // Adiciona DDI Brasil (55) se não houver
        const targetPhone = cleanPhone.length === 11 || cleanPhone.length === 10 ? `55${cleanPhone}` : cleanPhone;
        const waUrl = `https://wa.me/${targetPhone}?text=${encoded}`;
        window.open(waUrl, '_blank');
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
      alert('Não foi possível salvar o orçamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 flex flex-col h-full bg-slate-900 text-slate-100 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-lg">
          ←
        </button>
        <h1 className="text-lg font-black text-white">
          {orcamentoId ? 'Editar Orçamento' : 'Novo Orçamento Rápido'}
        </h1>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-400">Processando...</span>
        </div>
      )}

      {!loading && (
        <div className="space-y-4 flex-1">
          {/* Modelos Rápidos por Profissão */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Carregar Modelo Rápido</label>
            <select
              value={selectedTemplateIndex}
              onChange={(e) => {
                const idx = e.target.value;
                setSelectedTemplateIndex(idx);
                if (idx !== '') {
                  const templates = proService.getTemplatesPadrao(config?.profissao || 'AR_CONDICIONADO');
                  const t = templates[Number(idx)];
                  if (t) {
                    setDescricao(t.descricao);
                    setValor(t.valor.toString());
                  }
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
            >
              <option value="">Selecione um modelo padrão...</option>
              {proService.getTemplatesPadrao(config?.profissao || 'AR_CONDICIONADO').map((t, index) => (
                <option key={index} value={index}>{t.titulo} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)})</option>
              ))}
            </select>
          </div>

          {/* Seletor de Cliente */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</label>
            <select
              value={isNovoCliente ? 'NOVO' : clienteId}
              onChange={(e) => {
                if (e.target.value === 'NOVO') {
                  setIsNovoCliente(true);
                  setClienteId('');
                } else {
                  setIsNovoCliente(false);
                  setClienteId(e.target.value);
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
            >
              <option value="">Selecione um cliente...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
              <option value="NOVO">+ Cadastrar Novo Cliente</option>
            </select>
          </div>

          {/* Form Novo Cliente Inline */}
          {isNovoCliente && (
            <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl space-y-3">
              <span className="block text-[9px] font-black uppercase tracking-widest text-orange-500">Dados do Novo Cliente</span>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nome completo do cliente"
                  value={novoClienteNome}
                  onChange={(e) => setNovoClienteNome(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                />
                <input
                  type="tel"
                  placeholder="Telefone (com DDD)"
                  value={novoClienteTelefone}
                  onChange={(e) => setNovoClienteTelefone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                />
                <input
                  type="text"
                  placeholder="Endereço de execução (opcional)"
                  value={novoClienteEndereco}
                  onChange={(e) => setNovoClienteEndereco(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}

          {/* Descrição do Serviço */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Serviço a ser realizado</label>
              <button
                type="button"
                onClick={handleVoiceInput}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                  isListening
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                    : 'bg-slate-850 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-750'
                }`}
              >
                {isListening ? '🛑 Ouvindo...' : '🎙️ Ditar por Voz'}
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="Ex: Instalação de ar-condicionado Split 12000 BTUs com fornecimento de fiação e tubulação de cobre até 3m."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 resize-none"
            />
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Valor Cobrado (R$)</label>
            <input
              type="number"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Validade */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Validade (dias)</label>
              <input
                type="number"
                value={validadeDias}
                onChange={(e) => setValidadeDias(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
              />
            </div>

            {/* Garantia */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Garantia (dias)</label>
              <input
                type="number"
                value={garantiaDias}
                onChange={(e) => setGarantiaDias(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Observações adicionais</label>
            <textarea
              rows={2}
              placeholder="Ex: Não incluso quebra de alvenaria. Chave Pix para pagamento no rodapé do documento."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 resize-none"
            />
          </div>

          {/* Ações do Formulário */}
          <div className="pt-4 flex flex-col gap-3">
            <button
              onClick={() => handleSave('ENVIADO')}
              className="w-full py-3 bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-950/30 active:scale-[0.98]"
            >
              🚀 Salvar e Enviar via WhatsApp
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleSave('RASCUNHO')}
                className="py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl border border-slate-800/80 transition-colors"
              >
                💾 Rascunho
              </button>
              <button
                onClick={() => handleSave('APROVADO')}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors"
              >
                ✅ Direto p/ Serviço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProOrcamentoForm;
