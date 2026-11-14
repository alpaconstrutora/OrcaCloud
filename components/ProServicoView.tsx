import React from 'react';
import { proService } from '../services/proService';
import { ProServico, ProOSChecklistItem } from '../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { CheckCircle2, FileText, HandCoins, Loader2, MessageCircle } from 'lucide-react';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import {
  FORMAS_DE_PAGAMENTO,
  type FormaDePagamento,
  rotuloDaForma,
  mensagemDeCobranca,
  linkWhatsApp,
} from '../utils/proPainelResumo';
import {
  montarPixCopiaECola,
  formatarChavePixParaExibir,
  ROTULO_TIPO_CHAVE_PIX,
} from '../utils/pixCopiaECola';

// PIX: o payload vem de utils/pixCopiaECola.ts, montado pelo TIPO de chave cadastrado
// (até 14/11/2026 era por palpite aqui, e CPF com máscara virava telefone +55).
// O cadastro do Pro ainda não tem cidade; o campo 60 do BR Code é obrigatório e os
// bancos não o conferem com a chave. Ver docs/planos/2026-11-14-opura-pro-critica.md (passo 5).
const CIDADE_RECEBEDOR_PADRAO = 'BRASILIA';

// Assinatura: papel branco e tinta escura, gravados NO canvas (não no CSS) — a imagem
// salva vai para o cartão branco e para o PDF branco.
const COR_PAPEL_ASSINATURA = '#FFFFFF';
const COR_TINTA_ASSINATURA = '#1E293B';

interface ProServicoViewProps {
  userId: string;
  servicoId: string | null;
  /** Vindo do "Recebi" do painel: abre o formulário de recebimento ao carregar. */
  abrirRecebimento?: boolean;
  onBack: () => void;
  onSave: () => void;
}

const ProServicoView: React.FC<ProServicoViewProps> = ({
  userId,
  servicoId,
  abrirRecebimento = false,
  onBack,
  onSave
}) => {
  const [loading, setLoading] = React.useState(true);
  const [servico, setServico] = React.useState<any | null>(null);
  const [config, setConfig] = React.useState<any>(null);

  // Estados locais da execução
  const [checklist, setChecklist] = React.useState<ProOSChecklistItem[]>([]);
  const [status, setStatus] = React.useState<any>('PENDENTE');
  const confirm = useConfirm();
  const { showToast } = useToast();
  // Gravação em andamento NÃO esconde a tela (antes, `loading` trocava tudo pelo spinner).
  const [salvando, setSalvando] = React.useState(false);
  const [concluidoEm, setConcluidoEm] = React.useState<string | null>(null);
  const [pagoEm, setPagoEm] = React.useState<string | null>(null);
  const [formaPagamento, setFormaPagamento] = React.useState<string | null>(null);
  // Formulário "Recebi": aberto na própria tela, forma + data (hoje por padrão).
  const [registrandoRecebimento, setRegistrandoRecebimento] = React.useState(false);
  const [formaEscolhida, setFormaEscolhida] = React.useState<FormaDePagamento>('PIX');
  const [dataRecebimento, setDataRecebimento] = React.useState('');
  const secaoFechamentoRef = React.useRef<HTMLElement | null>(null);
  // Ao abrir o "Recebi" vindo do painel, leva a pessoa até o formulário (fica no fim da tela).
  React.useEffect(() => {
    if (registrandoRecebimento && abrirRecebimento) {
      secaoFechamentoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [registrandoRecebimento, abrirRecebimento]);
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
  // Um traço por vez: guarda o dedo/caneta que começou; um segundo dedo é ignorado.
  const ponteiroAtivoRef = React.useRef<number | null>(null);
  const [temTraco, setTemTraco] = React.useState(false);
  const [qrPix, setQrPix] = React.useState('');

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
          setConcluidoEm(servData.concluido_em || null);
          setPagoEm(servData.pago_em || null);
          setFormaPagamento(servData.forma_pagamento || null);
          if (abrirRecebimento && servData.status === 'CONCLUIDO' && !servData.pago_em) {
            setFormaEscolhida('PIX');
            setDataRecebimento(hojeISODate());
            setRegistrandoRecebimento(true);
          }
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

  // Lógica de Assinatura (HTML5 Canvas + Pointer Events: dedo, caneta e mouse)
  // Pinta o papel branco no próprio canvas — é o que vai para a imagem gravada.
  const prepararQuadro = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = COR_PAPEL_ASSINATURA;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ponteiroAtivoRef.current = null;
    setTemTraco(false);
  }, []);

  React.useEffect(() => {
    if (!mostrarAssinatura) return;
    prepararQuadro();
    // Trocar de app no meio do traço não pode deixar a caneta "presa" no quadro.
    const soltar = () => { ponteiroAtivoRef.current = null; };
    window.addEventListener('blur', soltar);
    return () => window.removeEventListener('blur', soltar);
  }, [mostrarAssinatura, prepararQuadro]);

  // O canvas tem 320×160 internos, mas é exibido com a largura do cartão:
  // converte a posição na tela para a posição no desenho.
  const pontoNoQuadro = (e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const iniciarTraco = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ponteiroAtivoRef.current !== null) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    ponteiroAtivoRef.current = e.pointerId;

    ctx.strokeStyle = COR_TINTA_ASSINATURA;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = pontoNoQuadro(e, canvas);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y); // um toque também deixa marca
    ctx.stroke();
    setTemTraco(true);
  };

  const continuarTraco = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ponteiroAtivoRef.current !== e.pointerId) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    e.preventDefault();
    const p = pontoNoQuadro(e, canvas);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const encerrarTraco = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (ponteiroAtivoRef.current !== e.pointerId) return;
    ponteiroAtivoRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !temTraco || !assinaturaNome.trim()) return;
    const imgData = canvas.toDataURL('image/png');
    setAssinaturaImagem(imgData);
    setMostrarAssinatura(false);
  };

  const motivoAssinaturaIncompleta = !assinaturaNome.trim()
    ? 'Escreva o nome de quem está assinando.'
    : !temTraco
      ? 'Peça para o cliente assinar no quadro.'
      : '';

  // PIX — calculado antes dos retornos antecipados (regra dos hooks).
  const pix = React.useMemo(() => {
    if (!servico || !config?.pix_key) return null;
    return montarPixCopiaECola({
      tipo: config.pix_key_type,
      chave: config.pix_key,
      valor: Number(servico.pro_orcamentos?.valor || 0),
      nome: config.template_header || '',
      cidade: CIDADE_RECEBEDOR_PADRAO,
    });
  }, [servico, config]);

  // QR gerado no aparelho: a chave e o valor não saem para serviço de terceiros,
  // e o QR aparece mesmo sem sinal na obra.
  React.useEffect(() => {
    let vivo = true;
    if (!pix?.ok) {
      setQrPix('');
      return;
    }
    QRCode.toDataURL(pix.payload, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { if (vivo) setQrPix(url); })
      .catch(err => {
        console.error('Erro ao gerar o QR Code do Pix:', err);
        if (vivo) setQrPix('');
      });
    return () => { vivo = false; };
  }, [pix]);

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
    if (!servicoId || salvando) return;
    try {
      setSalvando(true);
      const nextStatus = newStatus || status;

      const salvo = await proService.saveServico({
        id: servicoId,
        orcamento_id: servico.orcamento_id,
        checklist,
        fotos_antes: antesFoto ? [antesFoto] : [],
        fotos_depois: depoisFoto ? [depoisFoto] : [],
        assinatura_nome: assinaturaNome || undefined,
        assinatura_data: assinaturaImagem ? new Date().toISOString() : undefined,
        assinatura_imagem: assinaturaImagem || undefined,
        status: nextStatus,
        concluido_em: concluidoEm,
        recorrencia_meses: recorrenciaMeses ? Number(recorrenciaMeses) : undefined,
        data_agendamento: dataAgendamento ? new Date(dataAgendamento).toISOString() : undefined
      });

      setStatus(nextStatus);
      setConcluidoEm(salvo?.concluido_em ?? concluidoEm);
      // Concluir NÃO sai da tela: o fechamento (cobrar, comprovante, recebi) acontece aqui.
      showToast(nextStatus === 'CONCLUIDO' ? 'Serviço concluído. Agora é cobrar e registrar o recebimento.' : 'Serviço salvo.');
    } catch (error: any) {
      console.error('Erro ao atualizar serviço:', error);
      showToast(`Não foi possível salvar o serviço: ${error?.message || 'verifique a conexão e tente de novo.'}`, 'error');
    } finally {
      setSalvando(false);
    }
  };

  // "Finalizar" mostra o resumo antes: nada se conclui com um toque só, e o que falta é dito.
  const finalizar = async () => {
    const feitas = checklist.filter(c => c.completed).length;
    const faltaEtapa = feitas < checklist.length;
    const semAssinatura = !assinaturaImagem;
    const comPendencia = faltaEtapa || semAssinatura;
    const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(servico?.pro_orcamentos?.valor || 0));
    const ok = await confirm({
      title: comPendencia ? 'Concluir com pendência?' : 'Concluir o serviço?',
      message: (
        <ul className="space-y-1 text-left">
          <li className={faltaEtapa ? 'text-amber-700' : 'text-gray-700'}>
            Etapas feitas: {feitas} de {checklist.length}{faltaEtapa ? ' (faltam etapas)' : ''}
          </li>
          <li className={semAssinatura ? 'text-amber-700' : 'text-gray-700'}>
            Assinatura do cliente: {semAssinatura ? 'não colhida' : `colhida (${assinaturaNome})`}
          </li>
          <li className="text-gray-700">Valor: {valorFmt}</li>
        </ul>
      ),
      confirmLabel: comPendencia ? 'Concluir mesmo assim' : 'Concluir',
      cancelLabel: 'Voltar',
      variant: comPendencia ? 'warning' : 'default',
    });
    if (ok) await handleUpdate('CONCLUIDO');
  };

  const hojeISODate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const abrirRecebi = () => {
    setFormaEscolhida('PIX');
    setDataRecebimento(hojeISODate());
    setRegistrandoRecebimento(true);
  };

  const confirmarRecebimento = async () => {
    if (!servicoId || salvando || !dataRecebimento) return;
    try {
      setSalvando(true);
      // Meio-dia local: a data escolhida não "volta um dia" ao virar UTC.
      const pagoEmISO = new Date(`${dataRecebimento}T12:00:00`).toISOString();
      const salvo = await proService.registrarRecebimento(servicoId, pagoEmISO, formaEscolhida);
      setPagoEm(salvo?.pago_em ?? pagoEmISO);
      setFormaPagamento(salvo?.forma_pagamento ?? formaEscolhida);
      setRegistrandoRecebimento(false);
      showToast('Recebimento registrado.');
    } catch (error: any) {
      console.error('Erro ao registrar recebimento:', error);
      showToast(`Não foi possível registrar o recebimento: ${error?.message || 'tente de novo.'}`, 'error');
    } finally {
      setSalvando(false);
    }
  };

  const desfazerRecebimento = async () => {
    if (!servicoId || salvando) return;
    const ok = await confirm({
      title: 'Desfazer o recebimento?',
      message: 'O serviço volta para "aguardando pagamento" e sai do Recebido no mês.',
      confirmLabel: 'Desfazer',
      cancelLabel: 'Manter',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      setSalvando(true);
      await proService.desfazerRecebimento(servicoId);
      setPagoEm(null);
      setFormaPagamento(null);
      showToast('Recebimento desfeito.');
    } catch (error: any) {
      console.error('Erro ao desfazer recebimento:', error);
      showToast(`Não foi possível desfazer: ${error?.message || 'tente de novo.'}`, 'error');
    } finally {
      setSalvando(false);
    }
  };

  const cobrarNoWhatsApp = () => {
    const orcObj = servico?.pro_orcamentos;
    const msg = mensagemDeCobranca({
      cliente: orcObj?.pro_clientes?.nome || '',
      descricao: orcObj?.descricao || '',
      valor: Number(orcObj?.valor || 0),
      pixCopiaECola: pix?.ok ? pix.payload : '',
    });
    window.open(linkWhatsApp(orcObj?.pro_clientes?.telefone, msg), '_blank');
  };

  const copiarPix = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      showToast('Código Pix copiado.');
    } catch {
      showToast('Não foi possível copiar. Selecione o código e copie à mão.', 'error');
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
    // "assinado digitalmente" só quando houve assinatura de fato.
    const message = `Olá, ${cliObj?.nome}! Serviço de *${orcObj?.descricao}* concluído${assinaturaImagem ? ' e assinado digitalmente' : ''}.\n\n*Valor:* ${formattedVal}\n*Garantia:* ${orcObj?.garantia_dias || 90} dias\n\nEstou lhe enviando o comprovante de execução em PDF por aqui. Agradeço a confiança!`;
    window.open(linkWhatsApp(cliObj?.telefone, message), '_blank');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-800">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Serviço...</span>
      </div>
    );
  }

  if (!servico) {
    return (
      <div className="flex-1 p-5 text-center text-slate-600">
        Serviço não encontrado.
      </div>
    );
  }

  const orc = servico.pro_orcamentos;
  const cli = orc?.pro_clientes;

  const valor = Number(orc?.valor || 0);

  return (
    <div className="flex flex-col text-slate-800 space-y-5">
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
              className="w-full bg-slate-50 border border-slate-200 rounded-[6px] px-3 h-9 text-form-input text-slate-700 outline-none focus:border-teal-500"
            />
          </div>
          <button
            onClick={() => handleUpdate()}
            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Checklist Touch */}
      <div className="space-y-3">
        <h2 className="text-xs font-black text-slate-500">Etapas do Serviço</h2>
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
        <h2 className="text-xs font-black text-slate-500">Fotos de Registro</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Antes</span>
            {antesFoto ? (
              <div className="relative rounded-[18px] overflow-hidden border border-slate-200 aspect-video shadow-sm">
                <img src={antesFoto} alt="Antes" className="w-full h-full object-cover" />
                <button onClick={() => setAntesFoto('')} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 text-white text-button flex items-center justify-center">×</button>
              </div>
            ) : (
              <label className="w-full h-20 rounded-[18px] bg-white border border-slate-200/60 hover:border-slate-300 text-slate-400 flex flex-col items-center justify-center text-xs font-bold cursor-pointer transition-all active:scale-[0.98] shadow-sm">
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
                <button onClick={() => setDepoisFoto('')} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 text-white text-button flex items-center justify-center">×</button>
              </div>
            ) : (
              <label className="w-full h-20 rounded-[18px] bg-white border border-slate-200/60 hover:border-slate-300 text-slate-400 flex flex-col items-center justify-center text-xs font-bold cursor-pointer transition-all active:scale-[0.98] shadow-sm">
                📸 Adicionar
                <input type="file" accept="image/*" className="hidden" onChange={handleFotoDepoisUpload} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Assinatura Digital Touch */}
      <div className="space-y-3">
        <h2 className="text-xs font-black text-slate-500">Assinatura de Aceite</h2>
        {assinaturaImagem ? (
          <div className="bg-white border border-slate-200/40 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col items-center gap-2">
            <img src={assinaturaImagem} alt="Assinatura" className="h-16 w-auto border-b border-slate-100 pb-2" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Assinado por: {assinaturaNome}</span>
            <button onClick={() => { setAssinaturaImagem(''); setAssinaturaNome(''); }} className="text-[9px] font-black uppercase tracking-widest text-red-500 mt-1">Refazer Assinatura</button>
          </div>
        ) : (
          <button
            onClick={() => setMostrarAssinatura(true)}
            className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50/50 rounded-2xl font-black text-button uppercase tracking-widest text-slate-600 shadow-sm transition-colors active:scale-98"
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
              className="w-full bg-slate-50 border border-slate-200 rounded-[6px] px-3 h-9 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500"
            />

            <canvas
              ref={canvasRef}
              width={320}
              height={160}
              aria-label="Quadro de assinatura: assine com o dedo"
              onPointerDown={iniciarTraco}
              onPointerMove={continuarTraco}
              onPointerUp={encerrarTraco}
              onPointerCancel={encerrarTraco}
              onLostPointerCapture={encerrarTraco}
              className="bg-white border border-slate-300 rounded-2xl cursor-crosshair touch-none w-full"
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={prepararQuadro}
                className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold text-button rounded-xl border border-slate-200 transition-colors hover:bg-slate-200"
              >
                Limpar
              </button>
              <button
                onClick={saveSignature}
                disabled={!!motivoAssinaturaIncompleta}
                title={motivoAssinaturaIncompleta || undefined}
                className="flex-1 py-2 bg-teal-500 text-white font-bold text-button rounded-xl disabled:opacity-50 transition-colors hover:bg-teal-600"
              >
                Confirmar
              </button>
            </div>
            {motivoAssinaturaIncompleta && (
              <p className="text-xs text-slate-600" role="status">{motivoAssinaturaIncompleta}</p>
            )}
          </div>
        </div>
      )}

      {/* Cobrança PIX - Copiar Código e QR Code (some depois de recebido) */}
      {!pagoEm && (
      <div className="space-y-3">
        <h2 className="text-xs font-black text-slate-500">Cobrança PIX</h2>
        <div className="bg-white border border-slate-200/40 p-4 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)] flex flex-col items-center text-center gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-teal-600">Receber Pagamento</span>
          {pix?.ok ? (
            <>
              <p className="w-full text-left text-xs text-slate-600">
                Você vai receber na chave{' '}
                <span className="font-semibold text-slate-800">
                  {ROTULO_TIPO_CHAVE_PIX[config.pix_key_type as keyof typeof ROTULO_TIPO_CHAVE_PIX] ?? 'Pix'}{' '}
                  {formatarChavePixParaExibir(config.pix_key_type, pix.chave)}
                </span>
              </p>
              {qrPix ? (
                <img src={qrPix} alt="QR Code do Pix para o cliente pagar" className="w-40 h-40 bg-white p-2 rounded-xl border border-slate-100" />
              ) : (
                <div className="w-40 h-40 rounded-xl bg-slate-100 animate-pulse" aria-label="Gerando QR Code" />
              )}
              <div className="space-y-1 w-full px-2">
                <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Valor a Receber</span>
                <span className="block font-black text-slate-800 text-base">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                </span>
                
                <div className="pt-2">
                  <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400 text-left mb-1">Pix Copia e Cola</span>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-[9px] font-mono text-slate-600 text-left break-all select-all max-h-12 overflow-y-auto">
                    {pix.payload}
                  </div>
                </div>
              </div>
              <button
                onClick={() => copiarPix(pix.payload)}
                className="w-full py-2.5 bg-teal-500 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-teal-600 transition-colors shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
              >
                📋 Copiar Pix Copia e Cola
              </button>
            </>
          ) : pix && !pix.ok ? (
            <p className="text-xs text-red-600" role="alert">
              Não dá para gerar o Pix: {pix.motivo} Corrija a chave em Ajustes.
            </p>
          ) : (
            <span className="text-xs text-slate-400 italic">Configure sua chave Pix nas configurações do perfil para gerar o código Copia e Cola e o QR Code.</span>
          )}
        </div>
      </div>
      )}

      {/* Ações Finais */}
      <div className="pt-4 flex flex-col gap-3">
        {status !== 'CONCLUIDO' && (
          <>
            {/* Campo de Programar Recorrência */}
            <div className="space-y-1 bg-white p-3.5 border border-slate-200/40 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
              <label className="block text-xs font-semibold text-slate-500">Programar Próxima Revisão / Limpeza</label>
              <select
                value={recorrenciaMeses}
                onChange={(e) => setRecorrenciaMeses(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-[6px] px-3 h-9 text-form-input text-slate-700 outline-none focus:border-teal-500 mt-1"
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
              onClick={finalizar}
              disabled={salvando}
              className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle2 className="w-4 h-4" aria-hidden />}
              Finalizar serviço
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleUpdate(status === 'EM_ANDAMENTO' ? 'PENDENTE' : 'EM_ANDAMENTO')}
                disabled={salvando}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-button rounded-xl border border-slate-200 transition-colors"
              >
                {status === 'EM_ANDAMENTO' ? '⏸ Pausar' : '▶ Iniciar Trabalho'}
              </button>
              <button
                onClick={() => handleUpdate('BLOQUEADO')}
                disabled={salvando}
                className="py-2.5 bg-red-50 hover:bg-red-100 text-red-500 font-bold text-button rounded-xl border border-red-200/50 transition-colors"
              >
                ⚠️ Bloqueado / Parado
              </button>
            </div>
          </>
        )}
        {status === 'CONCLUIDO' && (
          <section ref={secaoFechamentoRef} aria-labelledby="titulo-fechamento" className="bg-white border border-slate-200 rounded-[10px] p-4 space-y-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${pagoEm ? 'text-emerald-600' : 'text-amber-600'}`} aria-hidden />
              <div className="min-w-0">
                <h2 id="titulo-fechamento" className="text-sm font-semibold text-slate-900">
                  Serviço concluído{concluidoEm ? ` em ${new Date(concluidoEm).toLocaleDateString('pt-BR')}` : ''}
                </h2>
                <p className="text-sm text-slate-700 mt-0.5" role="status">
                  {pagoEm
                    ? `Recebido em ${new Date(pagoEm).toLocaleDateString('pt-BR')} · ${rotuloDaForma(formaPagamento)}`
                    : `Aguardando pagamento de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}.`}
                </p>
              </div>
            </div>

            {!pagoEm && !registrandoRecebimento && (
              <div className="space-y-2">
                <button
                  onClick={cobrarNoWhatsApp}
                  className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98]"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden />
                  Cobrar no WhatsApp
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={abrirRecebi}
                    className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
                  >
                    <HandCoins className="w-4 h-4" aria-hidden />
                    Recebi
                  </button>
                  <button
                    onClick={generateComprovantePDF}
                    className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
                  >
                    <FileText className="w-4 h-4" aria-hidden />
                    Comprovante
                  </button>
                </div>
              </div>
            )}

            {!pagoEm && registrandoRecebimento && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-semibold text-slate-500">Como o cliente pagou?</legend>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
                    {FORMAS_DE_PAGAMENTO.map(f => (
                      <button
                        key={f.valor}
                        type="button"
                        role="radio"
                        aria-checked={formaEscolhida === f.valor}
                        onClick={() => setFormaEscolhida(f.valor)}
                        className={`h-11 rounded-[6px] border text-sm font-medium transition-colors ${
                          formaEscolhida === f.valor
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        {f.rotulo}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-1.5">
                  <label htmlFor="data-recebimento" className="text-xs font-semibold text-slate-500">Recebido em</label>
                  <input
                    id="data-recebimento"
                    type="date"
                    value={dataRecebimento}
                    max={hojeISODate()}
                    onChange={(e) => setDataRecebimento(e.target.value)}
                    className="w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-sm text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegistrandoRecebimento(false)}
                    disabled={salvando}
                    className="h-11 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarRecebimento}
                    disabled={salvando || !dataRecebimento}
                    title={!dataRecebimento ? 'Escolha a data do recebimento.' : undefined}
                    className="h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors disabled:opacity-60"
                  >
                    {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                    Confirmar recebimento
                  </button>
                </div>
              </div>
            )}

            {pagoEm && (
              <div className="space-y-2">
                <button
                  onClick={generateComprovantePDF}
                  className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98]"
                >
                  <FileText className="w-4 h-4" aria-hidden />
                  Enviar comprovante
                </button>
                <button
                  onClick={desfazerRecebimento}
                  disabled={salvando}
                  className="w-full h-11 text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4"
                >
                  Desfazer recebimento
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default ProServicoView;
