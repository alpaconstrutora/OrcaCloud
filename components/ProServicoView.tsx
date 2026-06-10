import React from 'react';
import { proService } from '../services/proService';
import { ProServico, ProOSChecklistItem } from '../types';
import jsPDF from 'jspdf';

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

  // Estados de Assinatura
  const [assinaturaNome, setAssinaturaNome] = React.useState('');
  const [assinaturaImagem, setAssinaturaImagem] = React.useState('');
  const [mostrarAssinatura, setMostrarAssinatura] = React.useState(false);

  // Referência do Canvas
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawingRef = React.useRef(false);

  React.useEffect(() => {
    const loadData = async () => {
      if (!servicoId) return;
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
        recorrencia_meses: recorrenciaMeses ? Number(recorrenciaMeses) : undefined
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900 text-slate-100">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Serviço...</span>
      </div>
    );
  }

  if (!servico) {
    return (
      <div className="flex-1 p-5 text-center text-slate-400 bg-slate-900 h-full">
        Serviço não encontrado.
      </div>
    );
  }

  const orc = servico.pro_orcamentos;
  const cli = orc?.pro_clientes;

  // Gerador de Pix Copia e Cola Simplificado
  const pixKey = config?.pix_key || 'Chave PIX não cadastrada nas configurações.';
  const valor = orc?.valor || 0;
  const qrCodeUrl = config?.pix_key
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`key=${pixKey}&amount=${valor}`)}`
    : '';

  return (
    <div className="p-5 flex flex-col h-full bg-slate-900 text-slate-100 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-lg">
          ←
        </button>
        <h1 className="text-lg font-black text-white">Executar Serviço</h1>
      </div>

      {/* Cartão de Informações */}
      <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-2">
        <span className="block text-[9px] font-black uppercase tracking-widest text-orange-500">Cliente & Local</span>
        <div className="space-y-0.5">
          <span className="block font-black text-base text-white">{cli?.nome}</span>
          <span className="block text-xs text-slate-400">{cli?.telefone}</span>
          <span className="block text-xs text-orange-400">📍 {cli?.endereco || 'Endereço não informado'}</span>
        </div>
        <div className="pt-2 border-t border-slate-800/80 mt-2">
          <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Descrição do Trabalho</span>
          <p className="text-xs text-slate-300 mt-1">{orc?.descricao}</p>
        </div>
      </div>

      {/* Checklist Touch */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Etapas do Serviço</h2>
        <div className="space-y-2 bg-slate-950/40 p-4 border border-slate-850 rounded-2xl">
          {checklist.map(item => (
            <div
              key={item.id}
              onClick={() => toggleChecklistItem(item.id)}
              className="flex items-center gap-3 py-1 cursor-pointer select-none"
            >
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                item.completed ? 'bg-orange-500 border-orange-600 text-white' : 'border-slate-700 bg-slate-900'
              }`}>
                {item.completed && '✓'}
              </div>
              <span className={`text-xs ${item.completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Fotos Antes / Depois */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Fotos de Registro</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Antes</span>
            {antesFoto ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-800 aspect-video">
                <img src={antesFoto} alt="Antes" className="w-full h-full object-cover" />
                <button onClick={() => setAntesFoto('')} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/80 text-white text-xs flex items-center justify-center">×</button>
              </div>
            ) : (
              <button
                onClick={() => setAntesFoto('https://images.unsplash.com/photo-1581094288338-2314dddb7eed?w=400')}
                className="w-full h-20 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-500 flex flex-col items-center justify-center text-[10px] uppercase font-bold"
              >
                📸 Adicionar
              </button>
            )}
          </div>
          <div className="space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Depois</span>
            {depoisFoto ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-800 aspect-video">
                <img src={depoisFoto} alt="Depois" className="w-full h-full object-cover" />
                <button onClick={() => setDepoisFoto('')} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/80 text-white text-xs flex items-center justify-center">×</button>
              </div>
            ) : (
              <button
                onClick={() => setDepoisFoto('https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400')}
                className="w-full h-20 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-500 flex flex-col items-center justify-center text-[10px] uppercase font-bold"
              >
                📸 Adicionar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Assinatura Digital Touch */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Assinatura de Aceite</h2>
        {assinaturaImagem ? (
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col items-center gap-2">
            <img src={assinaturaImagem} alt="Assinatura" className="h-16 w-auto border-b border-slate-850 pb-2" />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Assinado por: {assinaturaNome}</span>
            <button onClick={() => { setAssinaturaImagem(''); setAssinaturaNome(''); }} className="text-[9px] font-black uppercase tracking-widest text-red-500 mt-1">Refazer Assinatura</button>
          </div>
        ) : (
          <button
            onClick={() => setMostrarAssinatura(true)}
            className="w-full py-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-300"
          >
            ✍ Colher Assinatura Touch
          </button>
        )}
      </div>

      {/* Modal Assinatura Digital Canvas */}
      {mostrarAssinatura && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-orange-500">Assine na Tela</span>
              <button onClick={() => setMostrarAssinatura(false)} className="text-slate-400 text-lg">×</button>
            </div>

            <input
              type="text"
              placeholder="Nome de quem está assinando"
              value={assinaturaNome}
              onChange={(e) => setAssinaturaNome(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
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
              className="bg-slate-950 border border-slate-800 rounded-2xl cursor-crosshair touch-none w-full"
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={clearCanvas}
                className="flex-1 py-2 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl border border-slate-750"
              >
                Limpar
              </button>
              <button
                onClick={saveSignature}
                disabled={!assinaturaNome}
                className="flex-1 py-2 bg-orange-600 text-white font-bold text-xs rounded-xl disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cobrança PIX - Copiar Código e QR Code */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Cobrança PIX</h2>
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col items-center text-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Receber Pagamento</span>
          {qrCodeUrl ? (
            <>
              <img src={qrCodeUrl} alt="QR Code PIX" className="w-40 h-40 bg-white p-2 rounded-xl" />
              <div className="space-y-1">
                <span className="block text-[10px] text-slate-400">Chave PIX: {pixKey}</span>
                <span className="block font-black text-white text-base">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                </span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(pixKey);
                  alert('Chave PIX copiada para a área de transferência.');
                }}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-300 text-xs font-bold rounded-xl transition-colors active:scale-95"
              >
                📋 Copiar Chave PIX
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-500 italic">Configure sua chave Pix no seu cadastro para gerar cobranças.</span>
          )}
        </div>
      </div>

      {/* Ações Finais */}
      <div className="pt-4 flex flex-col gap-3">
        {status !== 'CONCLUIDO' && (
          <>
            {/* Campo de Programar Recorrência */}
            <div className="space-y-1 bg-slate-950 p-3.5 border border-slate-850 rounded-2xl">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Programar Próxima Revisão / Limpeza</label>
              <select
                value={recorrenciaMeses}
                onChange={(e) => setRecorrenciaMeses(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 mt-1"
              >
                <option value="">Não programar recorrência</option>
                <option value="1">Daqui a 1 mês (Mensal)</option>
                <option value="3">Daqui a 3 meses (Trimestral)</option>
                <option value="6">Daqui a 6 meses (Semestral)</option>
                <option value="12">Daqui a 12 meses (Anual)</option>
              </select>
              <span className="block text-[8px] text-slate-500 mt-0.5">O sistema avisará no painel quando estiver na hora de refazer o serviço.</span>
            </div>

            <button
              onClick={() => handleUpdate('CONCLUIDO')}
              className="w-full py-3 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-950/20 transition-all active:scale-[0.98]"
            >
              🏁 Finalizar e Concluir Serviço
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleUpdate(status === 'EM_ANDAMENTO' ? 'PENDENTE' : 'EM_ANDAMENTO')}
                className="py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl border border-slate-800 transition-colors"
              >
                {status === 'EM_ANDAMENTO' ? '⏸ Pausar' : '▶ Iniciar Trabalho'}
              </button>
              <button
                onClick={() => handleUpdate('BLOQUEADO')}
                className="py-2.5 bg-red-650/20 hover:bg-red-650/40 text-red-400 font-bold text-xs rounded-xl border border-red-900/30 transition-colors"
              >
                ⚠️ Bloqueado / Parado
              </button>
            </div>
          </>
        )}
        {status === 'CONCLUIDO' && (
          <div className="space-y-3">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-center rounded-2xl">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Serviço Concluído</span>
              <p className="text-[10px] text-slate-400 mt-1">Todas as etapas foram finalizadas e o Pix de cobrança foi gerado.</p>
            </div>
            <button
              onClick={generateComprovantePDF}
              className="w-full py-3 bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-orange-950/30 flex items-center justify-center gap-1.5 active:scale-95"
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
