import React from 'react';
import { proService } from '../services/proService';
import { ProServico, ProOSChecklistItem } from '../types';
import jsPDF from 'jspdf';

// Função auxiliar para calcular o CRC16 de validação do PIX (Polinômio 0x1021)
const calculateCRC16 = (str: string): string => {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((charCode >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc <<= 1;
      if (c15 !== bit) {
        crc ^= polynomial;
      }
    }
  }

  crc &= 0xFFFF;
  let crcStr = crc.toString(16).toUpperCase();
  while (crcStr.length < 4) {
    crcStr = '0' + crcStr;
  }
  return crcStr;
};

// Gerador de Payload oficial do Pix Copia e Cola no padrão EMV do BC
const generatePixCopiaECola = (chave: string, valor: number, prestadorNome: string) => {
  if (!chave) return '';

  let chaveFormatada = chave.trim();
  const apenasDigitos = chaveFormatada.replace(/\D/g, '');
  if (apenasDigitos.length === 11 && (chaveFormatada.includes('(') || chaveFormatada.includes('-') || chaveFormatada.startsWith('9') || chaveFormatada.startsWith('8'))) {
    chaveFormatada = `+55${apenasDigitos}`;
  } else if (apenasDigitos.length === 11) {
    chaveFormatada = apenasDigitos;
  } else if (apenasDigitos.length === 14) {
    chaveFormatada = apenasDigitos;
  }

  const formatTag = (id: string, value: string): string => {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const removeAccents = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, '');
  };

  let nomeLimpo = removeAccents(prestadorNome || 'OPURA PRO').toUpperCase().trim();
  if (nomeLimpo.length > 25) {
    nomeLimpo = nomeLimpo.substring(0, 25);
  } else if (nomeLimpo.length === 0) {
    nomeLimpo = 'PRESTADOR AUTONOMO';
  }

  const tag00 = formatTag('00', '01');
  const subTag00 = formatTag('00', 'br.gov.bcb.pix');
  const subTag01 = formatTag('01', chaveFormatada);
  const tag26 = formatTag('26', `${subTag00}${subTag01}`);

  const tag52 = formatTag('52', '0000');
  const tag53 = formatTag('53', '986');
  
  const valorFormatado = valor.toFixed(2);
  const tag54 = formatTag('54', valorFormatado);

  const tag58 = formatTag('58', 'BR');
  const tag59 = formatTag('59', nomeLimpo);
  const tag60 = formatTag('60', 'BRASILIA');

  const subTag62_05 = formatTag('05', '***');
  const tag62 = formatTag('62', subTag62_05);

  const rawPayload = `${tag00}${tag26}${tag52}${tag53}${tag54}${tag58}${tag59}${tag60}${tag62}6304`;
  const crc = calculateCRC16(rawPayload);
  
  return `${rawPayload}${crc}`;
};

interface ProServicoViewProps {
  userId: string;
  servicoId: string | null;
  onBack: () => void;
  onSave: () => void;
}

const ProServicoView: React.FC<ProServicoViewProps> = ({
  userId,
  servicoId,
  onBack,
  onSave
}) => {
  const [loading, setLoading] = React.useState(true);
  const [servico, setServico] = React.useState<any | null>(null);
  const [config, setConfig] = React.useState<any>(null);

  // Estados locais da execução
  const [checklist, setChecklist] = React.useState<ProOSChecklistItem[]>([]);
  const [status, setStatus] = React.useState<any>('PENDENTE');
  const [antesFoto, setAntesFoto] = React.useState<string>('');
  const [depoisFoto, setDepoisFoto] = React.useState<string>('');
  const [recorrenciaMeses, setRecorrenciaMeses] = React.useState<string>('');
  const [dataAgendamento, setDataAgendamento] = React.useState<string>('');

  // Estados de Assinatura
  const [assinaturaNome, setAssinaturaNome] = React.useState('');
  const [assinaturaImagem, setAssinaturaImagem] = React.useState('');
  const [mostrarAssinatura, setMostrarAssinatura] = React.useState(false);

  // Referência do Canvas
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawingRef = React.useRef(false);

  // Converte data ISO UTC para local formatado para datetime-local input (YYYY-MM-DDTHH:mm)
  const formatISOToLocalDatetime = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      const tzOffset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  React.useEffect(() => {
    const loadData = async () => {
      if (!servicoId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [servData, configData] = await Promise.all([
          supabaseListIndividualServico(servicoId),
          proService.getConfig(userId)
        ]);

        if (servData) {
          setServico(servData);
          setChecklist(servData.checklist || []);
          setStatus(servData.status);
          setAntesFoto(servData.fotos_antes?.[0] || '');
          setDepoisFoto(servData.fotos_depois?.[0] || '');
          setAssinaturaNome(servData.assinatura_nome || '');
          setAssinaturaImagem(servData.assinatura_imagem || '');
          setRecorrenciaMeses(servData.recorrencia_meses?.toString() || '');
          setDataAgendamento(formatISOToLocalDatetime(servData.data_agendamento));
        }
        setConfig(configData);
      } catch (error) {
        console.error('Erro ao buscar serviço:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [userId, servicoId]);

  // Função auxiliar de listagem individual do serviço
  const supabaseListIndividualServico = async (id: string) => {
    try {
      const data = await proService.listServicos(userId);
      return data.find((s: any) => s.id === id) || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  // Lógica de Assinatura Touch (HTML5 Canvas)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    drawingRef.current = true;

    // Obter coordenadas
    const coords = getEventCoords(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getEventCoords(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    e.preventDefault();
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  const getEventCoords = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png');
    setAssinaturaImagem(imgData);
    setMostrarAssinatura(false);
  };

  const handleFotoAntesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAntesFoto(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFotoDepoisUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setDepoisFoto(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Lógica do Checklist
  const toggleChecklistItem = (itemId: string) => {
    const updated = checklist.map(item =>
      item.id === itemId ? { ...item, completed: !item.completed } : item
    );
    setChecklist(updated);
  };

  // Salvar alterações
  const handleUpdate = async (newStatus?: string) => {
    if (!servicoId) return;
    try {
      setLoading(true);
      const nextStatus = newStatus || status;

      await proService.saveServico({
        id: servicoId,
        orcamento_id: servico.orcamento_id,
        checklist,
        fotos_antes: antesFoto ? [antesFoto] : [],
        fotos_depois: depoisFoto ? [depoisFoto] : [],
        assinatura_nome: assinaturaNome || undefined,
        assinatura_data: assinaturaImagem ? new Date().toISOString() : undefined,
        assinatura_imagem: assinaturaImagem || undefined,
        status: nextStatus,
        recorrencia_meses: recorrenciaMeses ? Number(recorrenciaMeses) : undefined,
        data_agendamento: dataAgendamento ? new Date(dataAgendamento).toISOString() : undefined
      });

      setStatus(nextStatus);
      alert('Serviço atualizado com sucesso.');
      if (nextStatus === 'CONCLUIDO') {
        onSave();
      }
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error);
      alert('Erro ao salvar as atualizações.');
    } finally {
      setLoading(false);
    }
  };

  const generateComprovantePDF = () => {
    if (!servico) return;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [15, 23, 42]; // #0F172A (Deep Slate)
    const accentColor = [16, 185, 129]; // #10B981 (Emerald/Green)
    const textColor = [51, 65, 85]; // #334155 (Slate 700)

    const orcObj = servico.pro_orcamentos;
    const cliObj = orcObj?.pro_clientes;

    // Cabeçalho / Branding
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 45, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(config?.template_header || 'ÒPURA Pro', 15, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Comprovante de Conclusão de Serviço (OS)', 15, 28);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`OS Nº ${servico.id.substring(0, 8).toUpperCase()}`, 195, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Finalizado em: ${new Date(servico.assinatura_data || new Date()).toLocaleDateString('pt-BR')}`, 195, 28, { align: 'right' });

    // Detalhes do Cliente
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', 15, 58);
    doc.setFont('helvetica', 'normal');
    doc.text(cliObj?.nome || 'Cliente', 15, 63);
    doc.text(`Telefone: ${cliObj?.telefone || ''}`, 15, 68);
    if (cliObj?.endereco) {
      doc.text(`Local: ${cliObj.endereco}`, 15, 73);
    }

    // Linha divisória
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 80, 195, 80);

    // Descrição do Serviço
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DETALHES DO SERVIÇO REALIZADO', 15, 90);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const splitDesc = doc.splitTextToSize(orcObj?.descricao || '', 180);
    doc.text(splitDesc, 15, 97);

    let currentY = 97 + (splitDesc.length * 5) + 10;

    // Etapas Realizadas (Checklist)
    doc.setFont('helvetica', 'bold');
    doc.text('ETAPAS EXECUTADAS:', 15, currentY);
    currentY += 7;

    doc.setFont('helvetica', 'normal');
    checklist.forEach(item => {
      const statusIcon = item.completed ? '[x] ' : '[ ] ';
      doc.text(`${statusIcon} ${item.text}`, 20, currentY);
      currentY += 6;
    });

    currentY += 5;

    // Assinatura de Aceite
    if (assinaturaImagem) {
      doc.setFont('helvetica', 'bold');
      doc.text('ASSINATURA DE ACEITE DO CLIENTE:', 15, currentY);
      currentY += 5;
      try {
        doc.addImage(assinaturaImagem, 'PNG', 15, currentY, 50, 20);
      } catch (e) {
        console.error('Erro ao adicionar assinatura ao PDF:', e);
      }
      currentY += 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Assinado por: ${assinaturaNome}`, 15, currentY);
      currentY += 10;
    }

    // Valor Total
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.rect(120, currentY - 5, 75, 15, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('VALOR TOTAL:', 125, currentY + 4);
    doc.setFontSize(13);
    doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcObj?.valor || 0), 190, currentY + 5, { align: 'right' });

    // Registro Fotográfico na segunda página (se houver fotos)
    if (antesFoto || depoisFoto) {
      doc.addPage();
      
      // Cabeçalho da página 2
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 210, 20, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('REGISTRO FOTOGRÁFICO DO SERVIÇO', 15, 13);
      
      // Resetar cor do texto
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      
      let photoY = 35;
      
      const getImageFormat = (base64Str: string): 'JPEG' | 'PNG' => {
        if (base64Str.startsWith('data:image/png')) return 'PNG';
        return 'JPEG';
      };

      if (antesFoto && depoisFoto) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('FOTO ANTES DA EXECUÇÃO', 15, photoY);
        doc.text('FOTO DEPOIS DA EXECUÇÃO', 110, photoY);
        
        photoY += 5;
        try {
          doc.addImage(antesFoto, getImageFormat(antesFoto), 15, photoY, 85, 60);
        } catch (e) {
          console.error('Erro ao adicionar foto antes no PDF:', e);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.text('[Erro ao carregar imagem]', 15, photoY + 20);
        }

        try {
          doc.addImage(depoisFoto, getImageFormat(depoisFoto), 110, photoY, 85, 60);
        } catch (e) {
          console.error('Erro ao adicionar foto depois no PDF:', e);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.text('[Erro ao carregar imagem]', 110, photoY + 20);
        }
      } else if (antesFoto) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('FOTO ANTES DA EXECUÇÃO', 15, photoY);
        
        photoY += 5;
        try {
          doc.addImage(antesFoto, getImageFormat(antesFoto), 15, photoY, 120, 90);
        } catch (e) {
          console.error('Erro ao adicionar foto antes no PDF:', e);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.text('[Erro ao carregar imagem]', 15, photoY + 20);
        }
      } else if (depoisFoto) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('FOTO DEPOIS DA EXECUÇÃO', 15, photoY);
        
        photoY += 5;
        try {
          doc.addImage(depoisFoto, getImageFormat(depoisFoto), 15, photoY, 120, 90);
        } catch (e) {
          console.error('Erro ao adicionar foto depois no PDF:', e);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.text('[Erro ao carregar imagem]', 15, photoY + 20);
        }
      }
    }

    // Rodapé
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Comprovante emitido via ÒPURA Pro — Tecnologia de campo.', 105, 285, { align: 'center' });

    try {
      const filename = `comprovante_servico_${(cliObj?.nome || 'cliente').replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Erro ao salvar PDF do comprovante:', err);
    }

    // Mensagem de WhatsApp rápida
    const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(orcObj?.valor || 0));
    const message = `Olá, ${cliObj?.nome}! Serviço de *${orcObj?.descricao}* concluído com sucesso e assinado digitalmente.\n\n*Valor:* ${formattedVal}\n*Garantia:* ${orcObj?.garantia_dias || 90} dias\n\nEstou lhe enviando o comprovante oficial de execução em PDF por aqui. Agradeço a confiança!`;
    const encoded = encodeURIComponent(message);
    const cleanPhone = (cliObj?.telefone || '').replace(/\D/g, '');
    const targetPhone = cleanPhone.length === 11 || cleanPhone.length === 10 ? `55${cleanPhone}` : cleanPhone;
    const waUrl = `https://wa.me/${targetPhone}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F3F7F9] text-slate-800">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Serviço...</span>
      </div>
    );
  }

  if (!servico) {
    return (
      <div className="flex-1 p-5 text-center text-slate-500 bg-[#F3F7F9] h-full">
        Serviço não encontrado.
      </div>
    );
  }

  const orc = servico.pro_orcamentos;
  const cli = orc?.pro_clientes;

  // Gerador de Pix Copia e Cola Real (Padrão EMV BR Code)
  const prestadorNome = config?.template_header || 'OPURA PRO';
  const valor = orc?.valor || 0;
  const pixCopiaECola = config?.pix_key
    ? generatePixCopiaECola(config.pix_key, valor, prestadorNome)
    : '';

  const qrCodeUrl = pixCopiaECola
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCopiaECola)}`
    : '';

  return (
    <div className="p-5 flex flex-col h-full bg-[#F3F7F9] text-slate-800 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-750 text-lg">
          ←
        </button>
        <h1 className="text-lg font-black text-slate-800">Executar Serviço</h1>
      </div>

      {/* Cartão de Informações */}
      <div className="bg-white border border-slate-200/40 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-2">
        <span className="block text-[9px] font-black uppercase tracking-widest text-teal-600">Cliente & Local</span>
        <div className="space-y-0.5">
          <span className="block font-black text-base text-slate-800">{cli?.nome}</span>
          <span className="block text-xs text-slate-500">{cli?.telefone}</span>
          <span className="block text-xs text-teal-600 font-semibold">📍 {cli?.endereco || 'Endereço não informado'}</span>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          <span className="block text-[9px] font-black uppercase tracking-widest text-slate-450">Descrição do Trabalho</span>
          <p className="text-xs text-slate-650 mt-1 font-medium">{orc?.descricao}</p>
        </div>
      </div>

      {/* Agendamento */}
      <div className="bg-white border border-slate-200/40 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] space-y-2">
        <span className="block text-[9px] font-black uppercase tracking-widest text-teal-600">Data e Hora do Serviço</span>
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <input
              type="datetime-local"
              value={dataAgendamento}
              onChange={(e) => setDataAgendamento(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-teal-500"
            />
          </div>
          <button
            onClick={() => handleUpdate()}
            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Checklist Touch */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Etapas do Serviço</h2>
        <div className="space-y-2.5 bg-white p-4 border border-slate-200/40 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          {checklist.map(item => (
            <div
              key={item.id}
              onClick={() => toggleChecklistItem(item.id)}
              className="flex items-center gap-3 py-1 cursor-pointer select-none"
            >
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                item.completed ? 'bg-teal-500 border-teal-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50'
              }`}>
                {item.completed && '✓'}
              </div>
              <span className={`text-xs font-medium ${item.completed ? 'line-through text-slate-400' : 'text-slate-650'}`}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Fotos Antes / Depois */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Fotos de Registro</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Antes</span>
            {antesFoto ? (
              <div className="relative rounded-[18px] overflow-hidden border border-slate-200 aspect-video shadow-sm">
                <img src={antesFoto} alt="Antes" className="w-full h-full object-cover" />
                <button onClick={() => setAntesFoto('')} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 text-white text-xs flex items-center justify-center">×</button>
              </div>
            ) : (
              <label className="w-full h-20 rounded-[18px] bg-white border border-slate-200/60 hover:border-slate-300 text-slate-400 flex flex-col items-center justify-center text-[10px] uppercase font-bold cursor-pointer transition-all active:scale-[0.98] shadow-sm">
                📸 Adicionar
                <input type="file" accept="image/*" className="hidden" onChange={handleFotoAntesUpload} />
              </label>
            )}
          </div>
          <div className="space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Depois</span>
            {depoisFoto ? (
              <div className="relative rounded-[18px] overflow-hidden border border-slate-200 aspect-video shadow-sm">
                <img src={depoisFoto} alt="Depois" className="w-full h-full object-cover" />
                <button onClick={() => setDepoisFoto('')} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 text-white text-xs flex items-center justify-center">×</button>
              </div>
            ) : (
              <label className="w-full h-20 rounded-[18px] bg-white border border-slate-200/60 hover:border-slate-300 text-slate-400 flex flex-col items-center justify-center text-[10px] uppercase font-bold cursor-pointer transition-all active:scale-[0.98] shadow-sm">
                📸 Adicionar
                <input type="file" accept="image/*" className="hidden" onChange={handleFotoDepoisUpload} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Assinatura Digital Touch */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Assinatura de Aceite</h2>
        {assinaturaImagem ? (
          <div className="bg-white border border-slate-200/40 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col items-center gap-2">
            <img src={assinaturaImagem} alt="Assinatura" className="h-16 w-auto border-b border-slate-100 pb-2" />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assinado por: {assinaturaNome}</span>
            <button onClick={() => { setAssinaturaImagem(''); setAssinaturaNome(''); }} className="text-[9px] font-black uppercase tracking-widest text-red-500 mt-1">Refazer Assinatura</button>
          </div>
        ) : (
          <button
            onClick={() => setMostrarAssinatura(true)}
            className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50/50 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 shadow-sm transition-colors active:scale-98"
          >
            ✍ Colher Assinatura Touch
          </button>
        )}
      </div>

      {/* Modal Assinatura Digital Canvas */}
      {mostrarAssinatura && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-[28px] p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-teal-600">Assine na Tela</span>
              <button onClick={() => setMostrarAssinatura(false)} className="text-slate-400 text-lg hover:text-slate-650">×</button>
            </div>

            <input
              type="text"
              placeholder="Nome de quem está assinando"
              value={assinaturaNome}
              onChange={(e) => setAssinaturaNome(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500"
            />

            <canvas
              ref={canvasRef}
              width={320}
              height={160}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="bg-slate-800 border border-slate-700 rounded-2xl cursor-crosshair touch-none w-full"
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={clearCanvas}
                className="flex-1 py-2 bg-slate-100 text-slate-505 font-bold text-xs rounded-xl border border-slate-200 transition-colors hover:bg-slate-200"
              >
                Limpar
              </button>
              <button
                onClick={saveSignature}
                disabled={!assinaturaNome}
                className="flex-1 py-2 bg-teal-500 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors hover:bg-teal-600"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cobrança PIX - Copiar Código e QR Code */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Cobrança PIX</h2>
        <div className="bg-white border border-slate-200/40 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col items-center text-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-teal-600">Receber Pagamento</span>
          {pixCopiaECola ? (
            <>
              <img src={qrCodeUrl} alt="QR Code PIX" className="w-40 h-40 bg-white p-2 rounded-xl border border-slate-100" />
              <div className="space-y-1 w-full px-2">
                <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Valor a Receber</span>
                <span className="block font-black text-slate-800 text-base">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                </span>
                
                <div className="pt-2">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 text-left mb-1">Pix Copia e Cola</span>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-[9px] font-mono text-slate-600 text-left break-all select-all max-h-12 overflow-y-auto">
                    {pixCopiaECola}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(pixCopiaECola);
                  alert('Código Pix Copia e Cola copiado com sucesso!');
                }}
                className="w-full py-2.5 bg-teal-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
              >
                📋 Copiar Pix Copia e Cola
              </button>
              <span className="text-[8px] text-slate-400">Chave cadastrada: {config.pix_key} ({config.pix_key_type})</span>
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">Configure sua chave Pix nas configurações do perfil para gerar o código Copia e Cola e o QR Code.</span>
          )}
        </div>
      </div>

      {/* Ações Finais */}
      <div className="pt-4 flex flex-col gap-3">
        {status !== 'CONCLUIDO' && (
          <>
            {/* Campo de Programar Recorrência */}
            <div className="space-y-1 bg-white p-3.5 border border-slate-200/40 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Programar Próxima Revisão / Limpeza</label>
              <select
                value={recorrenciaMeses}
                onChange={(e) => setRecorrenciaMeses(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-teal-500 mt-1"
              >
                <option value="">Não programar recorrência</option>
                <option value="1">Daqui a 1 mês (Mensal)</option>
                <option value="3">Daqui a 3 meses (Trimestral)</option>
                <option value="6">Daqui a 6 meses (Semestral)</option>
                <option value="12">Daqui a 12 meses (Anual)</option>
              </select>
              <span className="block text-[8px] text-slate-400 mt-0.5">O sistema avisará no painel quando estiver na hora de refazer o serviço.</span>
            </div>

            <button
              onClick={() => handleUpdate('CONCLUIDO')}
              className="w-full py-3.5 bg-gradient-to-tr from-teal-500 to-cyan-400 hover:from-teal-600 hover:to-cyan-500 text-white font-black text-xs uppercase tracking-widest rounded-full shadow-md shadow-teal-500/10 transition-all active:scale-[0.98]"
            >
              🏁 Finalizar e Concluir Serviço
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleUpdate(status === 'EM_ANDAMENTO' ? 'PENDENTE' : 'EM_ANDAMENTO')}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition-colors"
              >
                {status === 'EM_ANDAMENTO' ? '⏸ Pausar' : '▶ Iniciar Trabalho'}
              </button>
              <button
                onClick={() => handleUpdate('BLOQUEADO')}
                className="py-2.5 bg-red-50 hover:bg-red-100 text-red-500 font-bold text-xs rounded-xl border border-red-200/50 transition-colors"
              >
                ⚠️ Bloqueado / Parado
              </button>
            </div>
          </>
        )}
        {status === 'CONCLUIDO' && (
          <div className="space-y-3">
            <div className="p-4 bg-emerald-50 border border-emerald-100 text-center rounded-[20px] text-emerald-700">
              <span className="text-xs font-black uppercase tracking-widest">Serviço Concluído</span>
              <p className="text-[10px] text-slate-500 mt-1">Todas as etapas foram finalizadas e o Pix de cobrança foi gerado.</p>
            </div>
            <button
              onClick={generateComprovantePDF}
              className="w-full py-3.5 bg-gradient-to-tr from-teal-500 to-cyan-400 hover:from-teal-600 hover:to-cyan-500 text-white font-black text-xs uppercase tracking-widest rounded-full transition-all shadow-md shadow-teal-500/10 flex items-center justify-center gap-1.5 active:scale-95"
            >
              📄 Enviar Comprovante via WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProServicoView;
