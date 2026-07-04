import React, { useEffect, useRef, useState } from 'react';
import { 
  X, Pencil, Square, Type, RotateCcw, Save, 
  Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { documentService } from '../../services/documentService';
import { OpuraDocument, OpuraDocumentMarkup } from '../../types';
import * as pdfjsLib from 'pdfjs-dist';

// Configuração do Worker do PDF.js usando um CDN público estável compatível com a versão instalada
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

interface Props {
  document: OpuraDocument;
  userEmail: string;
  onClose: () => void;
}

interface MarkupItem {
  type: 'free' | 'rect' | 'text';
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
  width: number;
}

export function DocumentMarkupViewer({ document: doc, userEmail, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.2);
  
  // Estados de Desenho
  const [tool, setTool] = useState<'pencil' | 'rect' | 'text'>('pencil');
  const [color, setColor] = useState('#ef4444'); // Vermelho padrão de revisão
  const [lineWidth, setLineWidth] = useState(2);
  const [markups, setMarkups] = useState<MarkupItem[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState('');
  
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Carregar PDF e Markup existente
  useEffect(() => {
    let active = true;

    async function loadPdfAndMarkups() {
      if (!doc.active_version?.storage_path) {
        alert('Este documento não possui arquivos enviados.');
        onClose();
        return;
      }

      setLoading(true);
      try {
        // 1. Carregar URLs assinadas do Supabase Storage
        const signedUrl = await documentService.generateDownloadUrl(
          doc.active_version.storage_path,
          doc.organization_id
        );

        if (!active) return;

        // 2. Carregar PDF
        const loadingTask = pdfjsLib.getDocument(signedUrl);
        const pdf = await loadingTask.promise;
        if (!active) return;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);

        // 3. Carregar marcações salvas
        const savedMarkups = await documentService.listDocumentMarkups(doc.id, doc.active_version.id);
        if (!active) return;
        if (savedMarkups.length > 0) {
          // Reunir todos os itens de markups
          const items: MarkupItem[] = [];
          savedMarkups.forEach(m => {
            if (Array.isArray(m.markup_data)) {
              items.push(...m.markup_data);
            }
          });
          setMarkups(items);
        }
      } catch (err: any) {
        console.error('[DocumentMarkupViewer] Erro ao carregar PDF/marcações:', err);
        alert('Erro ao carregar visualizador de PDF: ' + err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPdfAndMarkups();
    return () => { active = false; };
  }, [doc, onClose]);

  // Renderizar a página do PDF no Canvas de Fundo
  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return;

    let renderTask: pdfjsLib.RenderTask | null = null;

    async function renderPage() {
      try {
        const page = await pdfDoc!.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        const canvas = pdfCanvasRef.current!;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Redimensionar também o canvas de desenho superior
        if (drawingCanvasRef.current) {
          drawingCanvasRef.current.width = viewport.width;
          drawingCanvasRef.current.height = viewport.height;
        }

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        });
        await renderTask.promise;
        
        // Redesenhar marcações após carregar a página
        redrawMarkups();
      } catch (err) {
        console.error('[DocumentMarkupViewer] Erro ao renderizar página do PDF:', err);
      }
    }

    renderPage();

    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNum, scale]);

  // Redesenhar todas as marcações no Canvas de desenho
  const redrawMarkups = () => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Limpar tela superior
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desenhar marcações finalizadas
    markups.forEach((item) => {
      drawSingleMarkup(ctx, item);
    });

    // Desenhar rascunho em andamento
    if (isDrawing && tool === 'pencil' && currentPoints.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      }
      ctx.stroke();
    }
  };

  const drawSingleMarkup = (ctx: CanvasRenderingContext2D, item: MarkupItem) => {
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.type === 'free' && item.points && item.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y);
      }
      ctx.stroke();
    } else if (item.type === 'rect' && item.x !== undefined && item.y !== undefined && item.w !== undefined && item.h !== undefined) {
      // Retângulo com estilo pontilhado de nuvem de revisão
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(item.x, item.y, item.w, item.h);
      ctx.restore();
    } else if (item.type === 'text' && item.x !== undefined && item.y !== undefined && item.text) {
      ctx.font = '14px sans-serif';
      ctx.fillText(item.text, item.x, item.y);
    }
  };

  // Atualizar redraws sempre que as marcações mudarem
  useEffect(() => {
    redrawMarkups();
  }, [markups, isDrawing, currentPoints]);

  // Capturar coordenadas relativas ao Canvas
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textInput) return; // Aguardando input de texto
    const coords = getCanvasCoords(e);
    setIsDrawing(true);

    if (tool === 'pencil') {
      setCurrentPoints([coords]);
    } else if (tool === 'rect') {
      setRectStart(coords);
    } else if (tool === 'text') {
      setTextInput(coords);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    if (tool === 'pencil') {
      setCurrentPoints((prev) => [...prev, coords]);
    } else if (tool === 'rect' && rectStart) {
      const canvas = drawingCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      redrawMarkups();

      // Desenhar rascunho de retângulo pontilhado
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rectStart.x, rectStart.y, coords.x - rectStart.x, coords.y - rectStart.y);
      ctx.restore();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const coords = getCanvasCoords(e);

    if (tool === 'pencil' && currentPoints.length > 1) {
      setMarkups((prev) => [
        ...prev,
        {
          type: 'free',
          points: currentPoints,
          color,
          width: lineWidth
        }
      ]);
      setCurrentPoints([]);
    } else if (tool === 'rect' && rectStart) {
      setMarkups((prev) => [
        ...prev,
        {
          type: 'rect',
          x: rectStart.x,
          y: rectStart.y,
          w: coords.x - rectStart.x,
          h: coords.y - rectStart.y,
          color,
          width: lineWidth
        }
      ]);
      setRectStart(null);
    }
  };

  const handleAddText = () => {
    if (textInput && textVal.trim()) {
      setMarkups((prev) => [
        ...prev,
        {
          type: 'text',
          x: textInput.x,
          y: textInput.y,
          text: textVal.trim(),
          color,
          width: lineWidth
        }
      ]);
    }
    setTextInput(null);
    setTextVal('');
  };

  const handleUndo = () => {
    setMarkups((prev) => prev.slice(0, -1));
  };

  const handleSave = async () => {
    if (!doc.active_version?.id) return;
    setLoading(true);
    try {
      await documentService.saveDocumentMarkup(
        doc.id,
        doc.active_version.id,
        userEmail,
        markups
      );
      alert('Anotações salvas com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar anotações: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col">
      {/* Barra Superior */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-white">
        <div className="space-y-0.5">
          <h3 className="font-black uppercase tracking-wider text-sm">{doc.nome}</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            Anotações de PDF • Revisão V{doc.active_version?.version_number || 1}
          </p>
        </div>

        {/* Toolbar de Ferramentas */}
        <div className="flex items-center bg-slate-800/80 border border-slate-700/60 p-1 rounded-xl gap-1">
          <button
            onClick={() => setTool('pencil')}
            className={`p-2 rounded-lg transition-all ${
              tool === 'pencil' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Desenho Livre (Lápis)"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('rect')}
            className={`p-2 rounded-lg transition-all ${
              tool === 'rect' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Nuvem de Revisão (Retângulo)"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('text')}
            className={`p-2 rounded-lg transition-all ${
              tool === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Adicionar Nota de Texto"
          >
            <Type className="w-4 h-4" />
          </button>

          <span className="w-px h-6 bg-slate-700 mx-1" />

          {/* Seletores de Cor */}
          {['#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map((hex) => (
            <button
              key={hex}
              onClick={() => setColor(hex)}
              className={`w-5 h-5 rounded-full border-2 transition-all ${
                color === hex ? 'border-white scale-110 shadow-md' : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>

        {/* Navegação de Páginas e Zoom */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-800/80 p-1 border border-slate-700 rounded-xl">
            <button
              disabled={pageNum <= 1}
              onClick={() => setPageNum(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black uppercase px-2 tracking-widest">
              {pageNum} / {totalPages}
            </span>
            <button
              disabled={pageNum >= totalPages}
              onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-800/80 p-1 border border-slate-700 rounded-xl">
            <button
              onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold px-1 w-10 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={markups.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Desfazer
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar
          </button>
          <button
            onClick={onClose}
            className="p-2 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visualizador de PDF e Layer de Desenho */}
      <div className="flex-1 overflow-auto p-8 flex justify-center bg-slate-950/20">
        {loading && !pdfDoc ? (
          <div className="flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Carregando planta técnica...</p>
          </div>
        ) : (
          <div className="relative shadow-2xl border border-slate-800 bg-white">
            {/* Canvas de Fundo (PDF) */}
            <canvas ref={pdfCanvasRef} className="block" />

            {/* Canvas de Desenho Superior (Anotações) */}
            <canvas
              ref={drawingCanvasRef}
              className="absolute inset-0 z-10 cursor-crosshair touch-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />

            {/* Caixa de Texto Dinâmica */}
            {textInput && (
              <div 
                className="absolute z-20 bg-slate-900 border border-slate-700/80 p-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in zoom-in-95 duration-100"
                style={{ left: textInput.x, top: textInput.y - 45 }}
              >
                <input
                  type="text"
                  required
                  placeholder="Escreva seu comentário..."
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddText();
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                />
                <button
                  onClick={handleAddText}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-lg hover:bg-blue-700 transition-all"
                >
                  OK
                </button>
                <button
                  onClick={() => setTextInput(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
