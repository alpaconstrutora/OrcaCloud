import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useOrgWriteTarget } from '../hooks/useOrgContext';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Label, Text as KonvaText, Group } from 'react-konva';
import {
  Calculator, Layers, Ruler, Plus, Trash2, Edit, Save, FileText, ChevronRight,
  ChevronLeft, ZoomIn, ZoomOut, Maximize, RefreshCw, Upload, Download, Eye, EyeOff, Lock, Unlock, Play, FileSpreadsheet, Check, CheckSquare
} from 'lucide-react';
import Button from './ui/Button';
import { measureService } from '../services/measureService';
import { proService } from '../services/proService';
import { projectService } from '../services/projectService';
import {
  MeasureProject,
  MeasureFile,
  MeasureLayer,
  MeasureLibraryItem,
  MeasureShape,
  Point2D,
  BudgetEntry
} from '../types';
import * as pdfjsLib from 'pdfjs-dist';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface MeasureAIModuleProps {
  userId: string;
  activeOrganizationId?: string | null;
}

export const MeasureAIModule: React.FC<MeasureAIModuleProps> = ({ userId, activeOrganizationId }) => {
  // Seletor do topo como autoridade: com uma organização escolhida usa ela sem
  // perguntar; em "Todas" abre o modal. Mesmo padrão do BlueprintModule.
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  // --- Estados do Projeto e Arquivos ---
  const [projects, setProjects] = useState<MeasureProject[]>([]);
  const [activeProject, setActiveProject] = useState<MeasureProject | null>(null);
  const [files, setFiles] = useState<MeasureFile[]>([]);
  const [activeFile, setActiveFile] = useState<MeasureFile | null>(null);
  const [layers, setLayers] = useState<MeasureLayer[]>([]);
  const [activeLayer, setActiveLayer] = useState<MeasureLayer | null>(null);
  const [libraryItems, setLibraryItems] = useState<MeasureLibraryItem[]>([]);
  const [activeLibraryItem, setActiveLibraryItem] = useState<MeasureLibraryItem | null>(null);
  const [shapes, setShapes] = useState<MeasureShape[]>([]);

  // --- UI e Fluxo ---
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [selectedOrcamentoId, setSelectedOrcamentoId] = useState<string>('');
  const [engineeringProjects, setEngineeringProjects] = useState<any[]>([]);
  const [selectedAssociatedProjectId, setSelectedAssociatedProjectId] = useState<string>('');
  const [linkType, setLinkType] = useState<'PRO' | 'ENGENHARIA'>('ENGENHARIA');
  const [linkedProject, setLinkedProject] = useState<any | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pdfRendering, setPdfRendering] = useState(false);
  
  // --- Canvas e Desenho ---
  const [tool, setTool] = useState<'PAN' | 'SCALE' | 'POLYGON' | 'LINE' | 'POINT'>('PAN');
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  
  // Coordenadas temporárias de desenho
  const [tempPoints, setTempPoints] = useState<Point2D[]>([]);
  const [mousePos, setMousePos] = useState<Point2D>({ x: 0, y: 0 });
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point2D[]>([]);
  const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
  const [realDistanceInput, setRealDistanceInput] = useState('1.0');

  // --- Modais auxiliares ---
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Arquitetura');
  const [newItemUnit, setNewItemUnit] = useState<'M2' | 'M' | 'UN'>('M2');
  const [newItemValue, setNewItemValue] = useState('0.00');
  const [newItemReferenciaId, setNewItemReferenciaId] = useState<string>('');

  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Efeitos Iniciais ---
  useEffect(() => {
    loadProjects();
    loadProOrcamentos();
    loadEngineeringProjects();
  }, [userId, activeOrganizationId]);

  // Resetar item_referencia_id ao abrir modal de biblioteca
  useEffect(() => {
    if (isLibraryModalOpen) {
      setNewItemReferenciaId('');
    }
  }, [isLibraryModalOpen]);

  const loadProjects = async () => {
    try {
      const data = await measureService.listProjects(activeOrganizationId ?? null);
      setProjects(data);
      if (data.length > 0 && !activeProject) {
        selectProject(data[0]);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao carregar projetos de medição: ${err.message || JSON.stringify(err)}`);
    }
  };

  const loadProOrcamentos = async () => {
    try {
      const data = await proService.listOrcamentos(userId);
      setOrcamentos(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadEngineeringProjects = async () => {
    try {
      // Medição opera sobre obra E orçamento. Era um filtro inline com
      // comparação literal de classification — agora é opção do service
      // (CLAUDE.md regra #3: o corte vive em utils/projectClassification.ts).
      const filtered = await projectService.listProjects({
        organizationId: activeOrganizationId || undefined,
        classifications: ['OBRA', 'ORCAMENTO'],
      });
      setEngineeringProjects(filtered);
    } catch (err) {
      console.error('Erro ao carregar projetos de engenharia:', err);
    }
  };

  const selectProject = async (project: MeasureProject) => {
    setActiveProject(project);
    try {
      // Carregar arquivos
      const filesData = await measureService.listFiles(project.id);
      setFiles(filesData);
      
      // Carregar camadas (auto-cria se não existirem)
      let layersData = await measureService.listLayers(project.id);
      if (layersData.length === 0) {
        try {
          layersData = await measureService.createDefaultLayers(project.id);
        } catch (layerErr) {
          console.error('Erro ao auto-criar camadas padrão:', layerErr);
        }
      }
      setLayers(layersData);
      if (layersData.length > 0) {
        setActiveLayer(layersData[0]);
      } else {
        setActiveLayer(null);
      }

      // Carregar biblioteca (auto-cria se não existir)
      let libData = await measureService.listLibraryItems(project.id);
      if (libData.length === 0) {
        try {
          libData = await measureService.createDefaultLibraryItems(project.id);
        } catch (libErr) {
          console.error('Erro ao auto-criar itens padrão da biblioteca:', libErr);
        }
      }
      setLibraryItems(libData);
      if (libData.length > 0) {
        setActiveLibraryItem(libData[0]);
      } else {
        setActiveLibraryItem(null);
      }

      // Carregar obra associada se houver
      if (project.associated_project_id) {
        try {
          const lProj = await projectService.loadProject(project.associated_project_id);
          setLinkedProject(lProj);
        } catch (projErr) {
          console.error('Erro ao carregar projeto de engenharia associado:', projErr);
          setLinkedProject(null);
        }
      } else {
        setLinkedProject(null);
      }

      // Resetar arquivo ativo se mudar de projeto
      if (filesData.length > 0) {
        selectFile(filesData[0]);
      } else {
        setActiveFile(null);
        setImageObj(null);
        setShapes([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectFile = async (file: MeasureFile) => {
    setActiveFile(file);
    setImageObj(null);
    setShapes([]);
    
    setPdfRendering(true);
    let url = '';
    let fileBlob: Blob;
    try {
      fileBlob = await measureService.downloadPlantFile(file.storage_path);
      url = URL.createObjectURL(fileBlob);
    } catch (err: any) {
      console.error('Erro ao baixar arquivo da planta:', err);
      alert(`Erro ao baixar a planta do storage: ${err.message || JSON.stringify(err)}. Verifique as políticas do bucket.`);
      setPdfRendering(false);
      return;
    }
    
    if (file.nome.toLowerCase().endsWith('.pdf')) {
      try {
        // Converte o blob em ArrayBuffer para ler na memória e evitar a violação de CSP (connect-src blob:)
        const arrayBuffer = await fileBlob.arrayBuffer();
        const pdfData = new Uint8Array(arrayBuffer);
        
        // Renderizar PDF com PDF.js passando os bytes em memória
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(file.current_page || 1);
        
        // Fator de escala ideal para resolução nítida
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          const dataUrl = canvas.toDataURL();
          
          const img = new window.Image();
          img.src = dataUrl;
          img.onload = () => {
            setImageObj(img);
            setPdfRendering(false);
          };
          img.onerror = (imageErr) => {
            console.error('Erro ao processar imagem renderizada do PDF:', imageErr);
            alert('Erro ao processar a renderização do PDF no visualizador.');
            setPdfRendering(false);
          };
        }
      } catch (err: any) {
        console.error('Erro ao renderizar PDF:', err);
        alert(`Erro ao processar o PDF: ${err.message || JSON.stringify(err)}`);
        setPdfRendering(false);
      }
    } else {
      // É imagem normal
      const img = new window.Image();
      img.src = url;
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setImageObj(img);
        setPdfRendering(false);
      };
      img.onerror = (imageErr) => {
        console.error('Erro ao processar imagem da planta:', imageErr);
        alert('Erro ao carregar a imagem da planta no visualizador.');
        setPdfRendering(false);
      };
    }

    // Carregar formas desenhadas
    try {
      const shapesData = await measureService.listShapesByFile(file.id);
      setShapes(shapesData);
    } catch (err) {
      console.error(err);
    }
  };

  // --- Ações de Projeto ---
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      // A organização vem do seletor do topo, que é a autoridade. Sem ela o
      // levantamento nasceria órfão — foi exatamente isso que prendeu o acervo
      // antigo à pessoa que o criou.
      const alvo = await resolveWriteOrg('single');
      if (!alvo) return;
      const organizationId = alvo.kind === 'org' ? alvo.orgId : alvo.orgIds[0];

      const proj = await measureService.createProject({
        user_id: userId,
        organization_id: organizationId,
        nome: newProjectName,
        status: 'RASCUNHO',
        orcamento_id: linkType === 'PRO' ? (selectedOrcamentoId || null) : null,
        associated_project_id: linkType === 'ENGENHARIA' ? (selectedAssociatedProjectId || null) : null
      });
      setNewProjectName('');
      setSelectedOrcamentoId('');
      setSelectedAssociatedProjectId('');
      setIsCreatingProject(false);
      loadProjects();
      selectProject(proj);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao criar projeto de medição: ${err.message || JSON.stringify(err)}`);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Deseja realmente excluir este projeto e todas as suas medições?')) return;
    try {
      await measureService.deleteProject(id);
      if (activeProject?.id === id) {
        setActiveProject(null);
        setActiveFile(null);
        setImageObj(null);
      }
      loadProjects();
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao excluir projeto: ${err.message || JSON.stringify(err)}`);
    }
  };

  // --- Upload de Arquivo ---
  const handleUploadClick = () => {
    if (!activeProject) {
      alert('Por favor, crie ou selecione um projeto de medição no topo da barra lateral antes de fazer o upload de uma planta.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const storagePath = `${activeProject.id}/${crypto.randomUUID()}.${fileExt}`;
      
      // Upload para Supabase Storage
      await measureService.uploadPlantFile(file, storagePath);
      
      // Registrar no Banco de dados
      const newFile = await measureService.addFile({
        project_id: activeProject.id,
        nome: file.name,
        storage_path: storagePath,
        pages_count: file.name.toLowerCase().endsWith('.pdf') ? 1 : 1, // PDF.js atualizará
        current_page: 1,
        scale: null,
        width: 1000,
        height: 1000,
        metadata: {}
      });

      // Recarregar arquivos
      const filesData = await measureService.listFiles(activeProject.id);
      setFiles(filesData);
      selectFile(newFile);
    } catch (err: any) {
      console.error(err);
      const errMsg = err?.message || err?.error_description || JSON.stringify(err);
      alert(`Erro ao carregar o arquivo: ${errMsg}`);
    } finally {
      setIsUploading(false);
    }
  };

  // --- Biblioteca de Itens ---
  const handleCreateLibraryItem = async () => {
    if (!newItemName.trim() || !activeProject) return;

    try {
      const item = await measureService.saveLibraryItem({
        project_id: activeProject.id,
        nome: newItemName,
        categoria: newItemCategory,
        unidade: newItemUnit,
        valor_unitario: parseFloat(newItemValue) || 0,
        item_referencia_id: newItemReferenciaId || null
      });
      
      const libData = await measureService.listLibraryItems(activeProject.id);
      setLibraryItems(libData);
      setActiveLibraryItem(item);
      setNewItemName('');
      setNewItemValue('0.00');
      setNewItemReferenciaId('');
      setIsLibraryModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLibraryItem = async (id: string) => {
    if (!confirm('Deseja excluir este item da biblioteca?')) return;
    try {
      await measureService.deleteLibraryItem(id);
      if (activeLibraryItem?.id === id) {
        setActiveLibraryItem(null);
      }
      if (activeProject) {
        const libData = await measureService.listLibraryItems(activeProject.id);
        setLibraryItems(libData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Lógica de Zoom e Pan ---
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.15;
    const oldScale = stageScale;
    
    // Zoom em direção ao cursor do mouse
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stageX) / oldScale,
      y: (pointer.y - stageY) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    // Limites de zoom
    const boundedScale = Math.min(Math.max(newScale, 0.05), 15);

    setStageScale(boundedScale);
    setStageX(pointer.x - mousePointTo.x * boundedScale);
    setStageY(pointer.y - mousePointTo.y * boundedScale);
  };

  // --- Algoritmos Geométricos e de Medição ---
  
  // Cálculo de área por algoritmo de Shoelace
  const calculateShoelaceArea = (points: Point2D[], scale: number): number => {
    if (points.length < 3) return 0;
    let totalArea = 0;
    
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      totalArea += (points[j].x + points[i].x) * (points[j].y - points[i].y);
    }
    
    // Área em pixels quadrados
    const areaPixels = Math.abs(totalArea / 2);
    // Converter para metros quadrados usando a escala (scale = pixels/metro)
    return areaPixels / (scale * scale);
  };

  // Cálculo de distância total (comprimento)
  const calculateLineLength = (points: Point2D[], scale: number): number => {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      length += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
    return length / scale;
  };

  // Obter coordenadas relativas ao Canvas/Plant Image
  const getRelativePointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    
    // Converter coordenadas de tela em coordenadas relativas da imagem baseado no zoom/pan atual
    return {
      x: (pointer.x - stageX) / stageScale,
      y: (pointer.y - stageY) / stageScale
    };
  };

  // --- Handlers de Desenho no Canvas ---
  const handleStageMouseDown = (e: any) => {
    if (tool === 'PAN') return;
    
    const clickPos = getRelativePointerPosition();
    if (!clickPos) return;

    // 1. Calibração de Escala
    if (tool === 'SCALE') {
      if (e.evt.button !== 0) return; // Apenas clique esquerdo
      const newPoints = [...calibrationPoints, clickPos];
      setCalibrationPoints(newPoints);
      
      if (newPoints.length === 2) {
        setIsScaleModalOpen(true);
      }
      return;
    }

    // Validação geral para ferramentas de desenho
    if (!activeFile || !activeLayer || !activeLibraryItem) {
      alert('Selecione uma planta, uma camada e um item na biblioteca (na barra lateral direita) antes de desenhar.');
      setTool('PAN');
      setTempPoints([]);
      return;
    }

    // 2. Desenho de Ponto de Contagem
    if (tool === 'POINT') {
      if (e.evt.button !== 0) return; // Apenas clique esquerdo
      saveNewShape([clickPos], 'POINT', 1);
      return;
    }

    // 3. Desenho de Polígono ou Linha
    const isCloseToFirstPoint = tempPoints.length > 0 && 
      Math.hypot(clickPos.x - tempPoints[0].x, clickPos.y - tempPoints[0].y) < (15 / stageScale);

    if (tool === 'POLYGON' && isCloseToFirstPoint && tempPoints.length >= 3) {
      if (e.evt.button !== 0) return; // Apenas clique esquerdo fecha clicando no primeiro ponto
      // Fechar polígono
      finishDrawing(tempPoints, 'POLYGON');
    } else if (tool === 'LINE' && tempPoints.length > 0 && e.evt.button === 2) {
      // Botão direito do mouse fecha linha
      e.evt.preventDefault();
      finishDrawing(tempPoints, 'LINE');
    } else if (e.evt.button === 0) {
      // Adicionar novo vértice (apenas botão esquerdo)
      setTempPoints([...tempPoints, clickPos]);
    }
  };

  const handleStageMouseMove = () => {
    const pos = getRelativePointerPosition();
    if (pos) {
      setMousePos(pos);
    }
  };

  // --- Persistir Desenho no Supabase ---
  const saveNewShape = async (points: Point2D[], type: 'POLYGON' | 'LINE' | 'POINT', value: number) => {
    if (!activeFile || !activeLayer || !activeLibraryItem) return;

    try {
      const newShape = await measureService.saveShape({
        file_id: activeFile.id,
        layer_id: activeLayer.id,
        item_id: activeLibraryItem.id,
        page_number: activeFile.current_page || 1,
        nome_ambiente: activeLibraryItem.nome,
        tipo: type,
        pontos: points,
        valor_calculado: value
      });

      setShapes(prev => [...prev, newShape]);
    } catch (err) {
      console.error('Erro ao salvar desenho:', err);
    }
  };

  // Concluir e salvar o desenho atual (Área ou Linha)
  const finishDrawing = (pointsToSave: Point2D[], activeTool: 'POLYGON' | 'LINE' | 'PAN' | 'SCALE' | 'POINT') => {
    if (!activeFile) {
      alert('Selecione uma planta antes de concluir.');
      return;
    }
    if (!activeLayer) {
      alert('Selecione uma camada ativa antes de concluir.');
      return;
    }
    if (!activeLibraryItem) {
      alert('Crie ou selecione um item na biblioteca (na barra lateral direita) antes de concluir.');
      return;
    }
    const scaleVal = activeFile.scale || 100;
    
    if (activeTool === 'POLYGON') {
      if (pointsToSave.length < 3) {
        alert('Um polígono de área necessita de pelo menos 3 pontos.');
        return;
      }
      const calculatedArea = calculateShoelaceArea(pointsToSave, scaleVal);
      saveNewShape(pointsToSave, 'POLYGON', calculatedArea);
      setTempPoints([]);
    } else if (activeTool === 'LINE') {
      if (pointsToSave.length < 2) {
        alert('Uma medição linear necessita de pelo menos 2 pontos.');
        return;
      }
      const calculatedLength = calculateLineLength(pointsToSave, scaleVal);
      saveNewShape(pointsToSave, 'LINE', calculatedLength);
      setTempPoints([]);
    }
  };

  // Escuta atalhos de teclado para cancelar (Esc) ou concluir (Enter) a medição ativa
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTempPoints([]);
        setCalibrationPoints([]);
        if (tool === 'SCALE') setTool('PAN');
      } else if (e.key === 'Enter') {
        if (tempPoints.length > 0) {
          finishDrawing(tempPoints, tool);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tempPoints, tool, activeFile, activeLayer, activeLibraryItem]);

  const handleDeleteShape = async (id: string) => {
    try {
      await measureService.deleteShape(id);
      setShapes(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // --- Calibrar Escala ---
  const handleSaveScale = async () => {
    if (!activeFile || calibrationPoints.length !== 2) return;

    const realDist = parseFloat(realDistanceInput);
    if (isNaN(realDist) || realDist <= 0) {
      alert('Insira um número válido maior que zero.');
      return;
    }

    const p1 = calibrationPoints[0];
    const p2 = calibrationPoints[1];
    const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const calculatedScale = pixelDist / realDist; // pixels por metro

    try {
      const updated = await measureService.updateFile(activeFile.id, {
        scale: calculatedScale
      });
      setActiveFile(updated);
      setFiles(files.map(f => f.id === updated.id ? updated : f));
      
      // Recalcular geometrias existentes se escala mudar
      recalculateAllShapes(calculatedScale);
      
      // Limpar estado
      setCalibrationPoints([]);
      setTool('PAN');
      setIsScaleModalOpen(false);
      alert(`Escala calibrada com sucesso: ${calculatedScale.toFixed(2)} pixels por metro.`);
    } catch (err) {
      console.error(err);
    }
  };

  const recalculateAllShapes = async (newScale: number) => {
    const updatedShapes = await Promise.all(shapes.map(async (shape) => {
      let newValue = 0;
      if (shape.tipo === 'POLYGON') {
        newValue = calculateShoelaceArea(shape.pontos, newScale);
      } else if (shape.tipo === 'LINE') {
        newValue = calculateLineLength(shape.pontos, newScale);
      } else {
        newValue = 1;
      }
      
      const updated = await measureService.saveShape({
        ...shape,
        valor_calculado: newValue
      });
      return updated;
    }));

    setShapes(updatedShapes);
  };

  // --- Resumo de Quantitativos Agrupados ---
  const itemQuantitativos = useMemo(() => {
    const summary: Record<string, { item: MeasureLibraryItem; total: number }> = {};
    
    // Inicializa todos da biblioteca
    libraryItems.forEach(item => {
      summary[item.id] = { item, total: 0 };
    });

    // Soma os desenhos
    shapes.forEach(shape => {
      if (shape.item_id && summary[shape.item_id]) {
        summary[shape.item_id].total += Number(shape.valor_calculado);
      }
    });

    return Object.values(summary);
  }, [shapes, libraryItems]);

  // Exportar para Orçamento do ÒPURA Pro
  const handleExportToOrcamento = async () => {
    if (!activeProject?.orcamento_id) {
      alert('Este projeto de medição não possui um orçamento associado no ÒPURA Pro.');
      return;
    }

    try {
      const orcamento = await proService.getOrcamentoById(activeProject.orcamento_id);
      if (!orcamento) {
        alert('Orçamento associado não encontrado.');
        return;
      }

      // Vamos criar novos serviços preenchidos no orçamento baseados nos quantitativos calculados
      // Para o MVP, agregamos os quantitativos em forma de itens do orçamento
      let totalOrcamento = 0;
      const templates = itemQuantitativos
        .filter(q => q.total > 0)
        .map(q => {
          const valorFinal = q.total * q.item.valor_unitario;
          totalOrcamento += valorFinal;
          return {
            titulo: q.item.nome,
            descricao: `Quantitativo extraído de planta via Medição Inteligente: ${q.total.toFixed(2)} ${q.item.unidade}.`,
            valor: q.item.valor_unitario,
            unidade: q.item.unidade === 'M2' ? 'm²' : (q.item.unidade === 'M' ? 'm' : 'un'),
            quantidade: Math.round(q.total * 100) / 100
          };
        });

      // Salvar nos templates custom da configuração ou atualizar o orçamento
      const serviceData = await proService.getServicoByOrcamentoId(activeProject.orcamento_id);
      
      const existingChecklist = serviceData?.checklist ? JSON.parse(JSON.stringify(serviceData.checklist)) : [];
      const updatedChecklist = [...existingChecklist, ...templates];

      await proService.saveServico({
        id: serviceData?.id,
        orcamento_id: activeProject.orcamento_id,
        checklist: updatedChecklist,
        status: serviceData?.status || 'PENDENTE',
        fotos_antes: serviceData?.fotos_antes || [],
        fotos_depois: serviceData?.fotos_depois || [],
        recorrencia_meses: serviceData?.recorrencia_meses ?? undefined,
        proximo_agendamento: serviceData?.proximo_agendamento ?? undefined,
        data_agendamento: serviceData?.data_agendamento ?? undefined
      });

      // Atualizar o valor global do orçamento
      await proService.saveOrcamento({
        ...orcamento,
        valor: Number(orcamento.valor) + totalOrcamento
      });

      alert('Quantitativos integrados ao orçamento do ÒPURA Pro com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar quantitativos para o orçamento.');
    }
  };

  // Exportar para Orçamento de Engenharia (projects.budget)
  const handleExportToEngineeringProject = async () => {
    if (!activeProject?.associated_project_id) return;

    try {
      const projectData = await projectService.loadProject(activeProject.associated_project_id);
      if (!projectData) {
        alert('Projeto de Engenharia associado não encontrado.');
        return;
      }

      const currentBudget: BudgetEntry[] = Array.isArray(projectData.budget) ? [...projectData.budget] : [];
      const itemsToExport = itemQuantitativos.filter(q => q.total > 0);

      let updatedCount = 0;
      let addedCount = 0;

      itemsToExport.forEach(q => {
        let budgetItemIndex = -1;
        if (q.item.item_referencia_id) {
          budgetItemIndex = currentBudget.findIndex(b => b.id === q.item.item_referencia_id);
        }

        if (budgetItemIndex === -1) {
          budgetItemIndex = currentBudget.findIndex(b => b.sinapiItem?.description?.trim().toLowerCase() === q.item.nome.trim().toLowerCase());
        }

        if (budgetItemIndex !== -1) {
          currentBudget[budgetItemIndex] = {
            ...currentBudget[budgetItemIndex],
            quantity: Math.round(q.total * 100) / 100
          };
          updatedCount++;
        } else {
          const newEntry: BudgetEntry = {
            id: crypto.randomUUID(),
            sinapiItem: {
              code: `MED-${Math.floor(1000 + Math.random() * 9000)}`,
              description: q.item.nome,
              unit: q.item.unidade === 'M2' ? 'm²' : (q.item.unidade === 'M' ? 'm' : 'un'),
              price: q.item.valor_unitario,
              type: 'INPUT' as any,
              category: q.item.categoria || 'Medições Inteligentes',
              source: 'Própria'
            },
            quantity: Math.round(q.total * 100) / 100,
            phase: q.item.categoria || 'Medições Inteligentes',
            group: 'Medições Inteligentes'
          };
          currentBudget.push(newEntry);
          addedCount++;
        }
      });

      await projectService.saveProject({
        ...projectData,
        budget: currentBudget
      });

      setLinkedProject({
        ...projectData,
        budget: currentBudget
      });

      alert(`Exportação concluída com sucesso!\n- ${updatedCount} itens atualizados\n- ${addedCount} novos itens adicionados ao orçamento da obra.`);
    } catch (err: any) {
      console.error('Erro ao exportar para o orçamento de Engenharia:', err);
      alert(`Erro ao exportar quantitativos: ${err.message || JSON.stringify(err)}`);
    }
  };

  const handleExport = async () => {
    if (activeProject?.orcamento_id) {
      await handleExportToOrcamento();
    } else if (activeProject?.associated_project_id) {
      await handleExportToEngineeringProject();
    } else {
      alert('Este projeto de medição não possui um orçamento ou obra associada.');
    }
  };

  // --- Auxiliares de Visualização no Canvas ---
  const renderShapes = () => {
    return shapes.map((shape) => {
      const layer = layers.find(l => l.id === shape.layer_id);
      if (layer && !layer.is_visible) return null;

      const strokeColor = layer?.cor_hex || '#3B82F6';
      const pointsArray = shape.pontos.flatMap(p => [p.x, p.y]);

      return (
        <Group key={shape.id}>
          {shape.tipo === 'POLYGON' && (
            <Line
              points={pointsArray}
              fill={`${strokeColor}22`}
              stroke={strokeColor}
              strokeWidth={3 / stageScale}
              closed
            />
          )}
          {shape.tipo === 'LINE' && (
            <Line
              points={pointsArray}
              stroke={strokeColor}
              strokeWidth={4 / stageScale}
            />
          )}
          {shape.tipo === 'POINT' && (
            <Circle
              x={shape.pontos[0].x}
              y={shape.pontos[0].y}
              radius={8 / stageScale}
              fill={strokeColor}
              stroke="#white"
              strokeWidth={2 / stageScale}
            />
          )}
          {/* Rótulo da Medição */}
          {shape.pontos.length > 0 && (
            <Group x={shape.pontos[0].x} y={shape.pontos[0].y - (15 / stageScale)}>
              <KonvaText
                text={`${shape.nome_ambiente || ''}: ${shape.valor_calculado.toFixed(2)} ${shape.tipo === 'POLYGON' ? 'm²' : (shape.tipo === 'LINE' ? 'm' : 'un')}`}
                fontSize={12 / stageScale}
                fontStyle="bold"
                fill="#ffffff"
                align="center"
                verticalAlign="middle"
                shadowColor="#000000"
                shadowBlur={4}
                shadowOffset={{ x: 1, y: 1 }}
              />
            </Group>
          )}
        </Group>
      );
    });
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden bg-slate-900 text-slate-100 rounded-3xl border border-slate-800 shadow-2xl">
      {/* Modal de escolha de organização, para quando o topo está em "Todas". */}
      {orgTargetModal}
      {/* ── BARRA LATERAL ESQUERDA: Projetos, Arquivos e Camadas ── */}
      <aside className="w-80 border-r border-slate-800 bg-slate-950 flex flex-col shrink-0">
        
        {/* Cabeçalho do Projeto */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-500 animate-pulse" />
            <span className="font-black tracking-wider uppercase text-xs text-slate-400">ÒPURA Takeoff</span>
          </div>
          <button
            onClick={() => setIsCreatingProject(true)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-blue-400 transition-colors"
            title="Novo Projeto"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Inline: Criar Projeto */}
        {isCreatingProject && (
          <form onSubmit={handleCreateProject} className="p-4 bg-slate-900 border-b border-slate-800 space-y-3">
            <div>
              <label className="text-xs uppercase font-bold text-slate-500">Nome do Projeto</label>
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="Ex: Residência Unifamiliar"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
              />
            </div>
            <div>
              <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Tipo de Vínculo</label>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setLinkType('ENGENHARIA')}
                  className={`flex-1 py-1 rounded text-xs font-bold transition-all ${linkType === 'ENGENHARIA' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Engenharia
                </button>
                <button
                  type="button"
                  onClick={() => setLinkType('PRO')}
                  className={`flex-1 py-1 rounded text-xs font-bold transition-all ${linkType === 'PRO' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  ÒPURA Pro
                </button>
              </div>
            </div>

            {linkType === 'ENGENHARIA' ? (
              <div>
                <label className="text-xs uppercase font-bold text-slate-500">Obra / Orçamento Principal</label>
                <select
                  value={selectedAssociatedProjectId}
                  onChange={e => setSelectedAssociatedProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
                >
                  <option value="">Nenhum</option>
                  {engineeringProjects.map(ep => (
                    <option key={ep.id} value={ep.id}>{ep.name} ({ep.code || 'Sem Código'})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs uppercase font-bold text-slate-500">Orçamento Standalone Pro</label>
                <select
                  value={selectedOrcamentoId}
                  onChange={e => setSelectedOrcamentoId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
                >
                  <option value="">Nenhum</option>
                  {orcamentos.map(o => (
                    <option key={o.id} value={o.id}>{o.descricao} ({o.pro_clientes?.nome})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsCreatingProject(false)}
                className="px-3 py-1.5 bg-slate-800 rounded-lg text-slate-400 font-bold hover:bg-slate-700"
              >
                Cancelar
              </button>
              <Button
                type="submit"
                size="sm"
              >
                Criar
              </Button>
            </div>
          </form>
        )}

        {/* Seletor de Projetos Existentes */}
        <div className="p-3 bg-slate-900/40 border-b border-slate-800/80">
          <select
            value={activeProject?.id || ''}
            onChange={(e) => {
              const proj = projects.find(p => p.id === e.target.value);
              if (proj) selectProject(proj);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-form-input font-semibold text-white focus:outline-none focus:border-blue-500"
          >
            {projects.length === 0 && <option>Nenhum projeto encontrado</option>}
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>

        {/* Lista de Arquivos (Plantas) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase font-bold text-slate-500 tracking-wider">
              <span>Plantas & Desenhos</span>
              <button
                onClick={handleUploadClick}
                disabled={isUploading}
                className="flex items-center gap-1.5 text-blue-500 hover:text-blue-400 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg"
            />

            <div className="space-y-1.5">
              {files.map(f => (
                <div
                  key={f.id}
                  className={`w-full p-1 rounded-xl border text-form-label flex items-center justify-between group transition-all duration-200
                    ${activeFile?.id === f.id
                      ? 'bg-blue-600/10 border-blue-500 text-white font-bold'
                      : 'bg-slate-900 border-slate-800/60 hover:bg-slate-850 hover:border-slate-700 text-slate-300'}`}
                >
                  <button
                    onClick={() => selectFile(f)}
                    className="flex-1 text-left p-1.5 flex items-center gap-2 truncate cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{f.nome}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      measureService.deleteFile(f.id).then(() => {
                        if (activeProject) selectProject(activeProject);
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {files.length === 0 && (
                <p className="text-slate-500 text-xs italic text-center py-4">Faça upload de uma planta em PDF ou imagem para começar.</p>
              )}
            </div>
          </div>

          {/* Seção de Camadas (Layers) */}
          <div className="space-y-2 border-t border-slate-900 pt-4">
            <div className="text-xs uppercase font-bold text-slate-500 tracking-wider">
              <span>Camadas de Medição</span>
            </div>
            <div className="space-y-1">
              {layers.map(l => (
                <div
                  key={l.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-button cursor-pointer hover:bg-slate-900
                    ${activeLayer?.id === l.id ? 'bg-slate-900 text-white font-semibold' : 'text-slate-400'}`}
                  onClick={() => setActiveLayer(l)}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: l.cor_hex }} />
                    <span>{l.nome}</span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        measureService.updateLayer(l.id, { is_visible: !l.is_visible }).then(() => {
                          if (activeProject) selectProject(activeProject);
                        });
                      }}
                      title="Ocultar/Exibir"
                    >
                      {l.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-500" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        measureService.updateLayer(l.id, { is_locked: !l.is_locked }).then(() => {
                          if (activeProject) selectProject(activeProject);
                        });
                      }}
                      title="Bloquear/Desbloquear"
                    >
                      {l.is_locked ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer com exclusão do projeto */}
        {activeProject && (
          <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
            <button
              onClick={() => handleDeleteProject(activeProject.id)}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-bold uppercase tracking-wider"
            >
              <Trash2 className="w-3 h-3" /> Excluir Projeto
            </button>
          </div>
        )}
      </aside>

      {/* ── ÁREA CENTRAL: Visualizador Gráfico da Planta ── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-900 relative">
        
        {/* Barra de Ferramentas Superior */}
        <header className="h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-2">
            
            {/* Botão PAN/Mover */}
            <button
              onClick={() => { setTool('PAN'); setTempPoints([]); }}
              className={`p-2 rounded-xl transition-all ${tool === 'PAN' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'hover:bg-slate-800 text-slate-400'}`}
              title="Mover e Navegar (Pan)"
            >
              <Maximize className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-slate-800" />

            {/* Escala */}
            <button
              onClick={() => { setTool('SCALE'); setCalibrationPoints([]); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold transition-all
                ${tool === 'SCALE' ? 'bg-red-600 text-white shadow-lg shadow-red-500/25' : 'hover:bg-slate-800 text-slate-400'}`}
              title="Calibrar Escala (Manual)"
            >
              <Ruler className="w-4 h-4" />
              <span>Calibrar Escala</span>
            </button>

            {/* Mostrar escala ativa */}
            {activeFile?.scale && (
              <span className="text-xs text-slate-400 font-mono bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                1m = {Number(activeFile.scale).toFixed(1)} px
              </span>
            )}

            <div className="h-6 w-px bg-slate-800" />

            {/* Desenho: Área (Polígono) */}
            <button
              onClick={() => { setTool('POLYGON'); setTempPoints([]); }}
              disabled={!activeFile?.scale}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold transition-all disabled:opacity-40
                ${tool === 'POLYGON' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'hover:bg-slate-800 text-slate-400'}`}
              title="Medir Área (Polígono)"
            >
              <Layers className="w-4 h-4" />
              <span>Área</span>
            </button>

            {/* Desenho: Linear (Segmentos de Reta) */}
            <button
              onClick={() => { setTool('LINE'); setTempPoints([]); }}
              disabled={!activeFile?.scale}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold transition-all disabled:opacity-40
                ${tool === 'LINE' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'hover:bg-slate-800 text-slate-400'}`}
              title="Medir Comprimento Linear"
            >
              <Ruler className="w-4 h-4" />
              <span>Linear</span>
            </button>

            {/* Desenho: Contagem */}
            <button
              onClick={() => { setTool('POINT'); setTempPoints([]); }}
              disabled={!activeFile?.scale}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-bold transition-all disabled:opacity-40
                ${tool === 'POINT' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'hover:bg-slate-800 text-slate-400'}`}
              title="Contar Elementos (Cliques)"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Contagem</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Controles de Zoom */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setStageScale(s => Math.max(s / 1.25, 0.1))}
                className="p-1.5 hover:bg-slate-800 text-slate-400 border-r border-slate-800"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono font-bold text-slate-300">{Math.round(stageScale * 100)}%</span>
              <button
                onClick={() => setStageScale(s => Math.min(s * 1.25, 10))}
                className="p-1.5 hover:bg-slate-800 text-slate-400 border-l border-slate-800"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Botão de resetar visualização */}
            <button
              onClick={() => { setStageScale(1); setStageX(0); setStageY(0); }}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-400"
              title="Resetar Zoom"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Canvas do Visualizador */}
        <div className="flex-1 overflow-hidden relative cursor-crosshair">
          {pdfRendering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-30">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm font-bold text-slate-300">Processando e renderizando planta PDF...</p>
            </div>
          )}

          {activeFile && imageObj ? (
            <Stage
              ref={stageRef}
              width={1600}
              height={1000}
              scaleX={stageScale}
              scaleY={stageScale}
              x={stageX}
              y={stageY}
              draggable={tool === 'PAN'}
              onDragEnd={(e) => {
                setStageX(e.target.x());
                setStageY(e.target.y());
              }}
              onWheel={handleWheel}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onContextMenu={(e) => e.evt.preventDefault()}
              className="bg-slate-950"
            >
              <Layer>
                {/* 1. Imagem de Fundo (Planta PDF renderizada ou PNG) */}
                <KonvaImage image={imageObj} />

                {/* 2. Formas Desenhadas */}
                {renderShapes()}

                {/* 3. Desenho Temporário de Linha / Polígono */}
                {tempPoints.length > 0 && (
                  <Group>
                    <Line
                      points={tempPoints.flatMap(p => [p.x, p.y]).concat([mousePos.x, mousePos.y])}
                      stroke={activeLayer?.cor_hex || '#3B82F6'}
                      strokeWidth={2 / stageScale}
                      dash={[5, 5]}
                    />
                    {tempPoints.map((p, idx) => (
                      <Circle
                        key={idx}
                        x={p.x}
                        y={p.y}
                        radius={6 / stageScale}
                        fill="#ffffff"
                        stroke={activeLayer?.cor_hex || '#3B82F6'}
                        strokeWidth={2 / stageScale}
                      />
                    ))}
                  </Group>
                )}

                {/* 4. Linha Temporária de Calibração */}
                {tool === 'SCALE' && calibrationPoints.length > 0 && (
                  <Group>
                    <Line
                      points={calibrationPoints.flatMap(p => [p.x, p.y]).concat(calibrationPoints.length === 1 ? [mousePos.x, mousePos.y] : [])}
                      stroke="#EF4444"
                      strokeWidth={3 / stageScale}
                      dash={[4, 4]}
                    />
                    {calibrationPoints.map((p, idx) => (
                      <Circle
                        key={idx}
                        x={p.x}
                        y={p.y}
                        radius={7 / stageScale}
                        fill="#EF4444"
                      />
                    ))}
                  </Group>
                )}
              </Layer>
            </Stage>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-slate-950 text-slate-400">
              <Calculator className="w-16 h-16 text-slate-800 mb-4 animate-bounce" />
              <h3 className="text-lg font-bold text-slate-300">Medição Inteligente de Plantas</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">Selecione ou faça upload de um arquivo de planta à esquerda para iniciar a medição e extração de quantitativos.</p>
            </div>
          )}

          {/* Controle flutuante para concluir/cancelar desenho ativo */}
          {tempPoints.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-blue-500/30 px-4 py-3 rounded-2xl flex items-center gap-3 z-20 shadow-2xl shadow-blue-500/10 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">
                  {tool === 'POLYGON' ? 'Desenhando Área' : 'Desenhando Linha'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {tempPoints.length} {tempPoints.length === 1 ? 'ponto' : 'pontos'} inseridos
                </span>
              </div>
              <div className="h-6 w-px bg-slate-800" />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTempPoints([]);
                  }}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Cancelar (Esc)
                </button>
                <Button
                  onClick={() => {
                    finishDrawing(tempPoints, tool);
                  }}
                  disabled={(tool === 'POLYGON' && tempPoints.length < 3) || (tool === 'LINE' && tempPoints.length < 2)}
                  size="sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Concluir (Enter)</span>
                </Button>
              </div>
            </div>
          )}

          {/* Dica flutuante do Canvas */}
          {activeFile && (
            <div className="absolute bottom-4 left-4 bg-slate-950/90 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-400 font-medium z-10 pointer-events-none max-w-xs shadow-xl">
              {tool === 'PAN' && '💡 Arraste a tela para navegar. Use o scroll do mouse para Zoom.'}
              {tool === 'SCALE' && '💡 Clique em dois pontos com distância conhecida para configurar a escala real da planta.'}
              {tool === 'POLYGON' && '💡 Clique nos vértices para desenhar. Feche clicando no primeiro ponto, pressionando Enter ou no botão flutuante.'}
              {tool === 'LINE' && '💡 Clique para formar os pontos da linha. Clique com botão direito, pressione Enter ou use o botão flutuante para concluir.'}
              {tool === 'POINT' && '💡 Clique em qualquer lugar para contar elementos (ex: tomadas, luminárias).'}
            </div>
          )}
        </div>
      </main>

      {/* ── BARRA LATERAL DIREITA: Biblioteca e Quantitativos ── */}
      <aside className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col shrink-0">
        
        {/* Biblioteca de Itens */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="font-black tracking-wider uppercase text-xs text-slate-400">Biblioteca de Itens</span>
          </div>
          <button
            onClick={() => setIsLibraryModalOpen(true)}
            disabled={!activeProject}
            className="p-1 hover:bg-slate-800 rounded-lg text-blue-400 transition-colors disabled:opacity-40"
            title="Adicionar Item"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Modal de Criação de Item da Biblioteca */}
        {isLibraryModalOpen && (
          <div className="p-4 bg-slate-900 border-b border-slate-800 space-y-3">
            {linkedProject && linkedProject.budget && (
              <div>
                <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Associar a Item do Orçamento</label>
                <select
                  value={newItemReferenciaId}
                  onChange={e => {
                    const refId = e.target.value;
                    setNewItemReferenciaId(refId);
                    
                    if (refId) {
                      const budgetItem = linkedProject.budget.find((b: any) => b.id === refId);
                      if (budgetItem) {
                        setNewItemName(budgetItem.sinapiItem?.description || '');
                        const uni = budgetItem.sinapiItem?.unit?.toUpperCase() || 'UN';
                        const mappedUnit = uni.includes('M²') || uni.includes('M2') ? 'M2' : (uni.includes('M') ? 'M' : 'UN');
                        setNewItemUnit(mappedUnit);
                        setNewItemValue(String(budgetItem.sinapiItem?.price || '0.00'));
                      }
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
                >
                  <option value="">Novo Item (Criar no Orçamento)</option>
                  {linkedProject.budget.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.sinapiItem?.description} ({b.sinapiItem?.unit} - R$ {b.sinapiItem?.price})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs uppercase font-bold text-slate-500">Nome do Item</label>
              <input
                type="text"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="Ex: Porcelanato 60x60"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs uppercase font-bold text-slate-500">Unidade</label>
                <select
                  value={newItemUnit}
                  onChange={e => setNewItemUnit(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
                >
                  <option value="M2">m²</option>
                  <option value="M">metros</option>
                  <option value="UN">unidade</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs uppercase font-bold text-slate-500">Preço Unit. (R$)</label>
                <input
                  type="text"
                  value={newItemValue}
                  onChange={e => setNewItemValue(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-form-input text-white focus:outline-none focus:border-blue-500 mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsLibraryModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 rounded-lg text-slate-400 font-bold hover:bg-slate-700"
              >
                Cancelar
              </button>
              <Button
                type="button"
                onClick={handleCreateLibraryItem}
                size="sm"
              >
                Salvar
              </Button>
            </div>
          </div>
        )}

        {/* Seleção do Item de Biblioteca Ativo */}
        <div className="p-4 border-b border-slate-800">
          <label className="text-xs uppercase font-bold text-slate-500 block mb-1.5">Medindo Item</label>
          <select
            value={activeLibraryItem?.id || ''}
            onChange={(e) => {
              const item = libraryItems.find(i => i.id === e.target.value);
              if (item) setActiveLibraryItem(item);
            }}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-form-input font-semibold text-white focus:outline-none focus:border-blue-500"
          >
            {libraryItems.length === 0 && <option value="">Nenhum item cadastrado</option>}
            {libraryItems.map(i => (
              <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>
            ))}
          </select>
        </div>

        {/* Resumo de Quantitativos Extraídos */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          <div className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-3">
            <span>Quantitativos do Projeto</span>
          </div>

          <div className="flex-1 space-y-2">
            {itemQuantitativos.map(q => (
              <div
                key={q.item.id}
                className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-center justify-between text-xs transition-colors hover:border-slate-800 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-200 truncate">{q.item.nome}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Preço Unit: R$ {Number(q.item.valor_unitario).toFixed(2)}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-slate-100 text-sm">{q.total.toFixed(2)}</span>
                  <span className="text-xs text-slate-500 uppercase ml-1 font-bold">
                    {q.item.unidade === 'M2' ? 'm²' : (q.item.unidade === 'M' ? 'm' : 'un')}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteLibraryItem(q.item.id)}
                  className="opacity-0 group-hover:opacity-100 ml-2 p-1 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {itemQuantitativos.length === 0 && (
              <p className="text-slate-500 text-xs italic text-center py-8">A biblioteca de itens está vazia. Adicione itens para associar às medições.</p>
            )}
          </div>

          {/* Integração com Orçamentos (Pro ou Engenharia) */}
          {itemQuantitativos.some(q => q.total > 0) && (activeProject?.orcamento_id || activeProject?.associated_project_id) && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <button
                onClick={handleExportToOrcamento}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-button font-black uppercase tracking-wider py-3 px-4 rounded-xl shadow-xl shadow-blue-500/10 transition-all hover:scale-[1.02] active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Enviar para Orçamento</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── MODAL: Configurar Escala Manual (Linha de Calibração) ── */}
      {isScaleModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[99999] p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 p-2 rounded-xl text-red-500">
                <Ruler className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-black text-slate-100">Configurar Escala Real</h4>
                <p className="text-xs text-slate-500 font-medium">Informe o comprimento real do segmento selecionado.</p>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-slate-500 block mb-1">Distância em Metros (m)</label>
              <input
                type="number"
                step="0.01"
                value={realDistanceInput}
                onChange={e => setRealDistanceInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-red-500"
                placeholder="Ex: 5.0"
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold pt-2">
              <button
                onClick={() => {
                  setCalibrationPoints([]);
                  setTool('PAN');
                  setIsScaleModalOpen(false);
                }}
                className="px-4 py-2.5 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <Button
                onClick={handleSaveScale}
                variant="danger"
              >
                Salvar Escala
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeasureAIModule;
