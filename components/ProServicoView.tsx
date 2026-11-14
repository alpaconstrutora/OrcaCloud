import React from 'react';
import { proService } from '../services/proService';
import { ProServico, ProOSChecklistItem } from '../types';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Eraser,
  FileText,
  HandCoins,
  Loader2,
  MapPin,
  MessageCircle,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { useConfirm } from './ui/confirm';
import { comprimirFoto } from '../utils/comprimirFoto';
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
// A cidade vem de Ajustes (pro_config.cidade); vazia cai neste padrão, porque o campo 60
// do BR Code é obrigatório (os bancos não o conferem com a chave).
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
  // Falha de rede ≠ serviço inexistente: antes as duas viravam "Serviço não encontrado", sem saída.
  const [erroCarga, setErroCarga] = React.useState<string | null>(null);
  const [tentativa, setTentativa] = React.useState(0);
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
        setErroCarga(null);
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
      } catch (error: any) {
        console.error('Erro ao buscar serviço:', error);
        setErroCarga(error?.message || 'Sem conexão.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [userId, servicoId, tentativa]);

  // Função auxiliar de listagem individual do serviço
  // O erro SOBE: quem chama distingue falha de rede de serviço inexistente.
  const supabaseListIndividualServico = async (id: string) => {
    const data = await proService.listServicos(userId);
    return data.find((s: any) => s.id === id) || null;
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
      cidade: config.cidade || CIDADE_RECEBEDOR_PADRAO,
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

  // Foto da câmera tem 3–12 MB e ia inteira, em base64, para o banco e de volta a cada
  // abertura da OS. Passa pelo mesmo `comprimirFoto` do Diário (2048 px, JPEG, EXIF certo,
  // HEIC → JPEG); se não der para comprimir, sobe o arquivo como veio.
  const lerFoto = async (file: File): Promise<string> => {
    const pronta = await comprimirFoto(file);
    return new Promise((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result || ''));
      leitor.onerror = () => falha(leitor.error);
      leitor.readAsDataURL(pronta);
    });
  };

  const receberFoto = async (e: React.ChangeEvent<HTMLInputElement>, guardar: (url: string) => void) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      guardar(await lerFoto(file));
    } catch (err) {
      console.error('Erro ao ler a foto:', err);
      showToast('Não foi possível ler a foto. Tente outra.', 'error');
    }
  };

  const handleFotoAntesUpload = (e: React.ChangeEvent<HTMLInputElement>) => receberFoto(e, setAntesFoto);
  const handleFotoDepoisUpload = (e: React.ChangeEvent<HTMLInputElement>) => receberFoto(e, setDepoisFoto);

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
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" aria-hidden />
        <span className="text-sm text-slate-600" role="status">Carregando serviço…</span>
      </div>
    );
  }

  if (erroCarga || !servico) {
    return (
      <div className="bg-white border border-slate-200 rounded-[10px] p-4 space-y-3" role={erroCarga ? 'alert' : undefined}>
        <div className="flex items-start gap-2.5">
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${erroCarga ? 'text-red-700' : 'text-amber-700'}`} aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              {erroCarga ? 'Não foi possível abrir o serviço' : 'Serviço não encontrado'}
            </h2>
            <p className="text-sm text-slate-700 mt-0.5">
              {erroCarga
                ? 'Confira a internet e tente de novo.'
                : 'Ele pode ter sido excluído junto com o orçamento ou o cliente.'}
            </p>
          </div>
        </div>
        <div className={`grid gap-2 ${erroCarga ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={onBack}
            className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden />
            Voltar à agenda
          </button>
          {erroCarga && (
            <button
              type="button"
              onClick={() => setTentativa(t => t + 1)}
              className="h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden />
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    );
  }

  const orc = servico.pro_orcamentos;
  const cli = orc?.pro_clientes;

  const valor = Number(orc?.valor || 0);

  return (
    <div className="flex flex-col text-slate-800 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="w-11 h-11 -ml-2 flex items-center justify-center rounded-[6px] text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <ChevronLeft className="w-5 h-5" aria-hidden />
        </button>
        <h1 className="text-lg font-black text-slate-900">Executar serviço</h1>
      </div>

      {/* Cartão de Informações */}
      <div className="bg-white border border-slate-200 rounded-[10px] p-4 space-y-2">
        <span className="block text-xs font-semibold text-slate-600">Cliente & local</span>
        <div className="space-y-0.5">
          <span className="block font-semibold text-base text-slate-900">{cli?.nome}</span>
          <span className="block text-sm text-slate-600">{cli?.telefone}</span>
          <span className="flex items-start gap-1.5 text-sm text-slate-700">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-slate-600" aria-hidden />
            {cli?.endereco || 'Endereço não informado'}
          </span>
        </div>
        <div className="pt-2 border-t border-slate-100 mt-2">
          <span className="block text-xs font-semibold text-slate-600">Descrição do trabalho</span>
          <p className="text-sm text-slate-700 mt-1">{orc?.descricao}</p>
        </div>
      </div>

      {/* Agendamento */}
      <div className="bg-white border border-slate-200 rounded-[10px] p-4 space-y-2">
        <label htmlFor="data-agendamento" className="block text-xs font-semibold text-slate-500">Data e hora do serviço</label>
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            <input
              id="data-agendamento"
              type="datetime-local"
              value={dataAgendamento}
              onChange={(e) => setDataAgendamento(e.target.value)}
              className="w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={() => handleUpdate()}
            className="h-11 px-4 shrink-0 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
          >
            <Save className="w-4 h-4" aria-hidden />
            Salvar
          </button>
        </div>
      </div>

      {/* Checklist Touch */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Etapas do serviço</h2>
        <div className="bg-white border border-slate-200 rounded-[10px] p-2">
          {checklist.map(item => (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={!!item.completed}
              onClick={() => toggleChecklistItem(item.id)}
              className="w-full min-h-11 flex items-center gap-3 px-2 py-2 text-left rounded-[6px] select-none hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <span
                aria-hidden
                className={`w-5 h-5 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors ${
                  item.completed ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-400 bg-white'
                }`}
              >
                {item.completed && <Check className="w-4 h-4" aria-hidden />}
              </span>
              <span className={`text-sm ${item.completed ? 'line-through text-slate-600' : 'text-slate-800'}`}>
                {item.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Fotos Antes / Depois */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Fotos de registro</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-slate-600">Antes</span>
            {antesFoto ? (
              <div className="relative rounded-[10px] overflow-hidden border border-slate-200 aspect-video">
                <img src={antesFoto} alt="Antes" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setAntesFoto('')}
                  aria-label="Remover foto de antes"
                  className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <span className="w-8 h-8 flex items-center justify-center rounded-[6px] bg-white/90 border border-red-300 text-red-700" aria-hidden>
                    <X className="w-4 h-4" aria-hidden />
                  </span>
                </button>
              </div>
            ) : (
              <label className="w-full h-20 rounded-[10px] bg-white border border-dashed border-slate-300 hover:bg-slate-50 text-slate-700 flex flex-col items-center justify-center gap-1 text-sm font-medium cursor-pointer transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-blue-600">
                <Camera className="w-4 h-4" aria-hidden />
                Adicionar
                <input type="file" accept="image/*" className="sr-only" aria-label="Adicionar foto de antes" onChange={handleFotoAntesUpload} />
              </label>
            )}
          </div>
          <div className="space-y-1">
            <span className="block text-xs font-semibold text-slate-600">Depois</span>
            {depoisFoto ? (
              <div className="relative rounded-[10px] overflow-hidden border border-slate-200 aspect-video">
                <img src={depoisFoto} alt="Depois" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setDepoisFoto('')}
                  aria-label="Remover foto de depois"
                  className="absolute top-0 right-0 w-11 h-11 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <span className="w-8 h-8 flex items-center justify-center rounded-[6px] bg-white/90 border border-red-300 text-red-700" aria-hidden>
                    <X className="w-4 h-4" aria-hidden />
                  </span>
                </button>
              </div>
            ) : (
              <label className="w-full h-20 rounded-[10px] bg-white border border-dashed border-slate-300 hover:bg-slate-50 text-slate-700 flex flex-col items-center justify-center gap-1 text-sm font-medium cursor-pointer transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-blue-600">
                <Camera className="w-4 h-4" aria-hidden />
                Adicionar
                <input type="file" accept="image/*" className="sr-only" aria-label="Adicionar foto de depois" onChange={handleFotoDepoisUpload} />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Assinatura Digital Touch */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Assinatura de aceite</h2>
        {assinaturaImagem ? (
          <div className="bg-white border border-slate-200 rounded-[10px] p-4 flex flex-col items-center gap-2">
            <img src={assinaturaImagem} alt="Assinatura" className="h-16 w-auto border-b border-slate-100 pb-2" />
            <span className="text-sm text-slate-700">Assinado por: {assinaturaNome}</span>
            <button
              type="button"
              onClick={() => { setAssinaturaImagem(''); setAssinaturaNome(''); }}
              className="inline-flex items-center gap-1 min-h-11 px-2 text-sm font-medium text-red-700 hover:text-red-800"
            >
              <RotateCcw className="w-4 h-4" aria-hidden />
              Refazer assinatura
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMostrarAssinatura(true)}
            className="w-full h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
          >
            <PenLine className="w-4 h-4" aria-hidden />
            Colher assinatura
          </button>
        )}
      </div>

      {/* Modal Assinatura Digital Canvas */}
      {mostrarAssinatura && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-assinatura"
            className="bg-white border border-slate-200 rounded-[10px] p-5 w-full max-w-sm space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 id="titulo-assinatura" className="font-black text-slate-900 text-lg">Assine na tela</h3>
              <button
                type="button"
                onClick={() => setMostrarAssinatura(false)}
                aria-label="Fechar"
                className="w-11 h-11 -mr-2 flex items-center justify-center rounded-[6px] text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <input
              type="text"
              placeholder="Nome de quem está assinando"
              aria-label="Nome de quem está assinando"
              value={assinaturaNome}
              onChange={(e) => setAssinaturaNome(e.target.value)}
              className="w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600"
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
              className="bg-white border border-slate-300 rounded-[6px] cursor-crosshair touch-none w-full"
            />

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={prepararQuadro}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
              >
                <Eraser className="w-4 h-4" aria-hidden />
                Limpar
              </button>
              <button
                type="button"
                onClick={saveSignature}
                disabled={!!motivoAssinaturaIncompleta}
                title={motivoAssinaturaIncompleta || undefined}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
              >
                <Check className="w-4 h-4" aria-hidden />
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
        <h2 className="text-sm font-semibold text-slate-900">Cobrança Pix</h2>
        <div className="bg-white border border-slate-200 rounded-[10px] p-4 flex flex-col items-center text-center gap-3">
          <span className="text-xs font-semibold text-slate-600">Receber pagamento</span>
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
                <img src={qrPix} alt="QR Code do Pix para o cliente pagar" className="w-40 h-40 bg-white p-2 rounded-[6px] border border-slate-200" />
              ) : (
                <div className="w-40 h-40 rounded-[6px] bg-slate-100 animate-pulse" aria-label="Gerando QR Code" />
              )}
              <div className="space-y-1 w-full px-2">
                <span className="block text-xs font-semibold text-slate-600">Valor a receber</span>
                <span className="block font-semibold text-slate-900 text-base tabular-nums">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}
                </span>

                <div className="pt-2">
                  <span className="block text-xs font-semibold text-slate-600 text-left mb-1">Pix Copia e Cola</span>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-[6px] p-2 text-xs font-mono text-slate-700 text-left break-all select-all max-h-16 overflow-y-auto">
                    {pix.payload}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copiarPix(pix.payload)}
                className="w-full h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
              >
                <Copy className="w-4 h-4" aria-hidden />
                Copiar Pix Copia e Cola
              </button>
            </>
          ) : pix && !pix.ok ? (
            <p className="text-sm text-red-700" role="alert">
              Não dá para gerar o Pix: {pix.motivo} Corrija a chave em Ajustes.
            </p>
          ) : (
            <span className="text-sm text-slate-600">Configure sua chave Pix nas configurações do perfil para gerar o código Copia e Cola e o QR Code.</span>
          )}
        </div>
      </div>
      )}

      {/* Ações Finais */}
      <div className="pt-4 flex flex-col gap-3">
        {status !== 'CONCLUIDO' && (
          <>
            {/* Campo de Programar Recorrência */}
            <div className="space-y-1 bg-white border border-slate-200 rounded-[10px] p-4">
              <label htmlFor="recorrencia-meses" className="block text-xs font-semibold text-slate-500">Programar próxima revisão / limpeza</label>
              <select
                id="recorrencia-meses"
                value={recorrenciaMeses}
                onChange={(e) => setRecorrenciaMeses(e.target.value)}
                className="w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-form-input text-slate-900 outline-none focus:border-blue-600 focus:ring-blue-600 mt-1"
              >
                <option value="">Não programar recorrência</option>
                <option value="1">Daqui a 1 mês (Mensal)</option>
                <option value="3">Daqui a 3 meses (Trimestral)</option>
                <option value="6">Daqui a 6 meses (Semestral)</option>
                <option value="12">Daqui a 12 meses (Anual)</option>
              </select>
              <span className="block text-xs text-slate-600 mt-1">O sistema avisará no painel quando estiver na hora de refazer o serviço.</span>
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
                type="button"
                onClick={() => handleUpdate(status === 'EM_ANDAMENTO' ? 'PENDENTE' : 'EM_ANDAMENTO')}
                disabled={salvando}
                className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors disabled:opacity-60"
              >
                {status === 'EM_ANDAMENTO'
                  ? <><Pause className="w-4 h-4" aria-hidden />Pausar</>
                  : <><Play className="w-4 h-4" aria-hidden />Iniciar trabalho</>}
              </button>
              <button
                type="button"
                onClick={() => handleUpdate('BLOQUEADO')}
                disabled={salvando}
                className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 border border-red-300 text-red-700 rounded-[6px] font-medium text-sm transition-colors disabled:opacity-60"
              >
                <AlertTriangle className="w-4 h-4" aria-hidden />
                Bloqueado / parado
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
