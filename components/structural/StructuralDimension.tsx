import React, { useState, useEffect } from 'react'
import {
  Layers, Plus, Trash2, ChevronRight, Settings, FileText, FileSpreadsheet,
  User, Shield, Activity, ArrowLeft, Building2, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Loader2
} from 'lucide-react'
import Button from '../ui/Button'
import { structuralService } from '../../services/structuralService'
import type {
  OpuraStructuralProject,
  OpuraStructuralDimensionElement,
  UpsertStructuralProjectInput
} from '../../types/structural'
import ElementDimensionPanel from './ElementDimensionPanel'
import { generateConsolidatedMemorialPDF } from '../../services/pdfMemorialService'
import { supabase } from '../../lib/supabase'

interface Props {
  activeOrganizationId?: string
  onChangeView?: (view: string) => void
}

const StructuralDimension: React.FC<Props> = ({ activeOrganizationId }) => {
  const [projects, setProjects] = useState<OpuraStructuralProject[]>([])
  const [selectedProject, setSelectedProject] = useState<OpuraStructuralProject | null>(null)
  const [elements, setElements] = useState<OpuraStructuralDimensionElement[]>([])
  const [activePavimento, setActivePavimento] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [exportingExcel, setExportingExcel] = useState<boolean>(false)
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null)

  // Modais
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [isNewElementModalOpen, setIsNewElementModalOpen] = useState(false)
  
  // States de Formulário de Projeto
  const [projNome, setProjNome] = useState('')
  const [projRT, setProjRT] = useState('')
  const [projART, setProjART] = useState('')
  const [projCAA, setProjCAA] = useState<'I' | 'II' | 'III' | 'IV'>('II')

  // States de Formulário de Elemento
  const [elTag, setElTag] = useState('')
  const [elTipo, setElTipo] = useState<'VIGA' | 'PILAR' | 'LAJE' | 'SAPATA'>('VIGA')
  const [elPavimentoInput, setElPavimentoInput] = useState('')

  // Elemento atualmente em edição no painel de dimensionamento
  const [editingElement, setEditingElement] = useState<OpuraStructuralDimensionElement | null>(null)

  const [exportingPDF, setExportingPDF] = useState<boolean>(false)

  // 0. Exportar Caderno de Memoriais PDF unificado
  const handleExportConsolidatedPDF = async () => {
    if (!selectedProject || elements.length === 0) return
    setExportingPDF(true)
    try {
      generateConsolidatedMemorialPDF(selectedProject, elements)
    } catch (err) {
      console.error('Erro ao exportar memorial consolidado:', err)
      alert('Erro ao gerar o caderno consolidado.')
    } finally {
      setExportingPDF(false)
    }
  }

  // 0. Exportar quantitativos em planilha consolidada
  const handleExportConsolidatedExcel = async () => {
    if (!selectedProject || elements.length === 0) return
    setExportingExcel(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const { saveAs } = await import('file-saver')

      const wb = new ExcelJS.Workbook()
      
      // ABA 1: RESUMO DO PROJETO E TOTAIS
      const wsResumo = wb.addWorksheet('Resumo do Projeto')
      
      wsResumo.mergeCells('A1:E1')
      const rTitle = wsResumo.getCell('A1')
      rTitle.value = `Memorial de Quantitativos Consolidados`
      rTitle.font = { bold: true, size: 14 }
      rTitle.alignment = { horizontal: 'left' }
      
      wsResumo.addRow([])
      wsResumo.addRow(['Projeto:', selectedProject.nome])
      wsResumo.addRow(['Responsável Técnico:', selectedProject.responsavel_tecnico])
      wsResumo.addRow(['Número ART:', selectedProject.numero_art || 'Pendente'])
      wsResumo.addRow(['Classe Agressividade:', `CAA ${selectedProject.caa}`])
      wsResumo.addRow(['Revisão Atual:', `R${String(selectedProject.revisao_atual).padStart(2, '0')}`])
      wsResumo.addRow([])

      const headerRes = wsResumo.addRow(['Tipo de Elemento', 'Qtd Elementos', 'Volume Concreto (m³)', 'Área de Fôrma (m²)', 'Peso Aço (kg)'])
      headerRes.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
        cell.alignment = { horizontal: 'center' }
      })

      const tipos = ['VIGA', 'PILAR', 'LAJE', 'SAPATA', 'VIGA_BALDRAME']
      let totalConcreto = 0
      let totalForma = 0
      let totalAco = 0

      for (const t of tipos) {
        const list = elements.filter(el => el.tipo === t)
        if (list.length === 0) continue

        let conc = 0
        let forma = 0
        let aco = 0

        for (const el of list) {
          if (el.resultado_calculo) {
            conc += Number(el.resultado_calculo.volumeConcretoM3 ?? 0)
            forma += Number(el.resultado_calculo.areaFormaM2 ?? 0)
            aco += Number(el.resultado_calculo.pesoAcoKg ?? 0)
          }
        }

        totalConcreto += conc
        totalForma += forma
        totalAco += aco

        wsResumo.addRow([
          t.replace('_', ' '),
          list.length,
          conc.toFixed(3),
          forma.toFixed(2),
          aco.toFixed(1)
        ])
      }

      wsResumo.addRow([])
      const totalRow = wsResumo.addRow([
        'TOTAL GERAL',
        elements.length,
        totalConcreto.toFixed(3),
        totalForma.toFixed(2),
        totalAco.toFixed(1)
      ])
      totalRow.font = { bold: true }
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

      wsResumo.columns = [
        { width: 22 }, { width: 16 }, { width: 22 }, { width: 22 }, { width: 18 }
      ]

      // ABA 2: DETALHAMENTO DE TODOS OS ELEMENTOS
      const wsDetalhes = wb.addWorksheet('Lista de Elementos')
      
      wsDetalhes.mergeCells('A1:G1')
      const dTitle = wsDetalhes.getCell('A1')
      dTitle.value = `Detalhamento dos Elementos Estruturais`
      dTitle.font = { bold: true, size: 12 }
      
      wsDetalhes.addRow([])
      
      const headerDet = wsDetalhes.addRow([
        'Pavimento', 'Tag', 'Tipo', 'Status NBR', 'Vol. Concreto (m³)', 'Área Fôrma (m²)', 'Peso Aço (kg)'
      ])
      headerDet.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
        cell.alignment = { horizontal: 'center' }
      })

      const sortedElements = [...elements].sort((a, b) => {
        const pavComp = a.pavimento.localeCompare(b.pavimento)
        if (pavComp !== 0) return pavComp
        return a.tag.localeCompare(b.tag)
      })

      for (const el of sortedElements) {
        const conc = el.resultado_calculo ? Number(el.resultado_calculo.volumeConcretoM3 ?? 0) : 0
        const forma = el.resultado_calculo ? Number(el.resultado_calculo.areaFormaM2 ?? 0) : 0
        const aco = el.resultado_calculo ? Number(el.resultado_calculo.pesoAcoKg ?? 0) : 0

        wsDetalhes.addRow([
          el.pavimento,
          el.tag,
          el.tipo.replace('_', ' '),
          el.status_verificacao === 'NAO_CALCULADO' ? 'Sem cálculo' : el.status_verificacao,
          conc.toFixed(3),
          forma.toFixed(2),
          aco.toFixed(1)
        ])
      }

      wsDetalhes.columns = [
        { width: 20 }, { width: 12 }, { width: 18 }, { width: 16 },
        { width: 20 }, { width: 20 }, { width: 16 }
      ]

      const buf = await wb.xlsx.writeBuffer()
      saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `consolidado-${selectedProject.nome.replace(/\s+/g, '-')}-R${selectedProject.revisao_atual}.xlsx`)
    } catch (err) {
      console.error('Erro ao exportar consolidado para excel:', err)
      alert('Ocorreu um erro ao gerar a planilha consolidada.')
    } finally {
      setExportingExcel(false)
    }
  }

  // Resolução da Organização ativa ou Fallback
  useEffect(() => {
    const resolveOrg = async () => {
      if (activeOrganizationId) {
        setResolvedOrgId(activeOrganizationId)
      } else {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data } = await supabase
              .from('organization_members')
              .select('organization_id')
              .eq('email', user.email)
              .limit(1)
              .maybeSingle()
            if (data?.organization_id) {
              setResolvedOrgId(data.organization_id)
            }
          }
        } catch (err) {
          console.error('Erro ao buscar organização de fallback:', err)
        }
      }
    }
    resolveOrg()
  }, [activeOrganizationId])

  // 1. Carrega projetos
  const loadProjects = async () => {
    if (!resolvedOrgId) return
    setLoading(true)
    try {
      const data = await structuralService.listStructuralProjects(resolvedOrgId)
      setProjects(data)
    } catch (err) {
      console.error('Erro ao listar projetos estruturais:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [resolvedOrgId])

  // 2. Carrega elementos do projeto selecionado
  const loadElements = async (projectId: string) => {
    try {
      const data = await structuralService.listStructuralDimensionElements(projectId)
      setElements(data)
      
      // Auto-seleciona o primeiro pavimento encontrado
      if (data.length > 0) {
        const pavimentos = Array.from(new Set(data.map(e => e.pavimento)))
        if (pavimentos.length > 0 && !pavimentos.includes(activePavimento)) {
          setActivePavimento(pavimentos[0])
        }
      }
    } catch (err) {
      console.error('Erro ao listar elementos:', err)
    }
  }

  useEffect(() => {
    if (selectedProject) {
      loadElements(selectedProject.id)
    }
  }, [selectedProject])

  // 3. Cria Novo Projeto
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resolvedOrgId) {
      alert('Nenhuma organização ativa encontrada para o seu usuário. Por favor, selecione uma organização no topo da página ou na barra lateral para criar o projeto.')
      return
    }
    if (!projNome || !projRT) {
      alert('Por favor, preencha o Nome do Projeto e o Responsável Técnico.')
      return
    }
    
    try {
      const input: UpsertStructuralProjectInput = {
        organizationId: resolvedOrgId,
        nome: projNome,
        responsavelTecnico: projRT,
        numeroArt: projART || null,
        caa: projCAA,
        status: 'EM_ANDAMENTO',
        revisaoAtual: 0
      }
      
      const newProj = await structuralService.upsertStructuralProject(input)
      setProjects(prev => [newProj, ...prev])
      setSelectedProject(newProj)
      setIsNewProjectModalOpen(false)
      
      // Reset forms
      setProjNome('')
      setProjRT('')
      setProjART('')
      setProjCAA('II')
    } catch (err) {
      console.error('Erro ao criar projeto:', err)
      alert('Erro ao criar projeto estrutural.')
    }
  }

  // 4. Deleta Projeto
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Deseja realmente excluir este projeto estrutural? Todos os cálculos serão apagados.')) return
    
    try {
      await structuralService.deleteStructuralProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      if (selectedProject?.id === id) {
        setSelectedProject(null)
        setElements([])
      }
    } catch (err) {
      console.error('Erro ao excluir projeto:', err)
    }
  }

  // 5. Cria Novo Elemento
  const handleCreateElement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProject || !resolvedOrgId || !elTag || !elPavimentoInput) return
    
    try {
      // Define geometrias default simplificadas com base no tipo
      let geometria: Record<string, any> = {}
      let cargas: Record<string, any> = {}

      if (elTipo === 'VIGA') {
        geometria = { bCm: 15, hCm: 40, comprimentoVaoM: 4.0, bitolaLongitudinalMm: 10, bitolaEstriboMm: 5.0 }
        cargas = { mkKnm: 10, vkKn: 15 }
      } else if (elTipo === 'PILAR') {
        geometria = { bCm: 20, hCm: 20, comprimentoLivreM: 2.8, bitolaLongitudinalMm: 10 }
        cargas = { nkKn: 250 }
      } else if (elTipo === 'LAJE') {
        geometria = { lxM: 3.5, lyM: 4.0, hCm: 10 }
        cargas = { cargaRevestimentoKnm2: 1.0, cargaVariavelKnm2: 1.5 }
      } else if (elTipo === 'SAPATA') {
        geometria = { aPilarCm: 20, bPilarCm: 20 }
        cargas = { nkKn: 300, sigmaSoloMpa: 0.2 }
      }

      const newEl = await structuralService.upsertStructuralDimensionElement({
        organizationId: resolvedOrgId,
        projectId: selectedProject.id,
        tipo: elTipo,
        pavimento: elPavimentoInput,
        tag: elTag,
        geometria,
        cargas,
        statusVerificacao: 'NAO_CALCULADO'
      })

      setElements(prev => [...prev, newEl])
      setActivePavimento(elPavimentoInput)
      setIsNewElementModalOpen(false)
      setElTag('')
    } catch (err) {
      console.error('Erro ao criar elemento:', err)
      alert('Erro ao criar elemento.')
    }
  }

  // 6. Deleta Elemento
  const handleDeleteElement = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Excluir este elemento estrutural?')) return
    
    try {
      await structuralService.deleteStructuralDimensionElement(id)
      setElements(prev => prev.filter(el => el.id !== id))
    } catch (err) {
      console.error('Erro ao excluir elemento:', err)
    }
  }

  // Filtros de pavimentos únicos
  const pavimentosUnicos = Array.from(new Set(elements.map(e => e.pavimento)))
  const elementosFiltrados = elements.filter(e => e.pavimento === activePavimento)

  // Helper de semáforo visual
  const getSemaforoPill = (status: 'OK' | 'ATENCAO' | 'REPROVADO' | 'NAO_CALCULADO') => {
    switch (status) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> OK
          </span>
        )
      case 'ATENCAO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" /> Atenção
          </span>
        )
      case 'REPROVADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Reprovado
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-400 border border-slate-200">
            <HelpCircle className="w-3.5 h-3.5" /> S/ cálculo
          </span>
        )
    }
  }

  // Se estiver editando um elemento, renderiza a ficha de dimensionamento
  if (editingElement && selectedProject) {
    return (
      <ElementDimensionPanel
        element={editingElement}
        project={selectedProject}
        onBack={() => {
          setEditingElement(null)
          loadElements(selectedProject.id)
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* ── SELEÇÃO DE PROJETO E CABEÇALHO ── */}
      {!selectedProject ? (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">Dimensionamento NBR 6118</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Projetos estruturais da organização para cálculo analítico normativo convencional.
              </p>
            </div>
            <Button
              onClick={() => setIsNewProjectModalOpen(true)}
            >
              <Plus className="w-4 h-4" /> Novo Projeto
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center py-16 bg-white border border-dashed border-slate-200 rounded-3xl text-slate-300">
              <Building2 className="w-12 h-12 mb-3 opacity-40 text-slate-400" />
              <p className="text-sm font-bold text-slate-400">Nenhum cálculo cadastrado nesta organização.</p>
              <button
                onClick={() => setIsNewProjectModalOpen(true)}
                className="mt-3 text-button font-black text-blue-600 hover:underline uppercase tracking-wider"
              >
                Criar o primeiro projeto estrutural
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProject(p)}
                  className="bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex justify-between items-start"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800 text-base truncate">{p.nome}</h3>
                      <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${
                        p.status === 'VERIFICADO' || p.status === 'EMITIDO' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                      }`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs font-medium text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{p.responsavel_tecnico}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>ART: {p.numero_art || 'N/D'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        <span>CAA {p.caa}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 shrink-0" />
                        <span>Revisão: R{String(p.revisao_atual).padStart(2, '0')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={(e) => handleDeleteProject(p.id, e)}
                      variant="ghost"
                      size="icon"
                      className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── INTERFACE DO PROJETO SELECIONADO ── */
        <div className="space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setSelectedProject(null)}
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-xl font-black text-slate-900">{selectedProject.nome}</h2>
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 mt-1">
                  <span>RT: {selectedProject.responsavel_tecnico}</span>
                  <span>ART: {selectedProject.numero_art || 'Pendente'}</span>
                  <span>Agressividade: CAA {selectedProject.caa}</span>
                  <span>Revisão: R{String(selectedProject.revisao_atual).padStart(2, '0')}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportConsolidatedPDF}
                disabled={exportingPDF || elements.length === 0}
                variant="secondary"
              >
                {exportingPDF ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <FileText className="w-4.5 h-4.5" />}
                Caderno PDF
              </Button>

              <Button
                onClick={handleExportConsolidatedExcel}
                disabled={exportingExcel || elements.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white"
              >
                {exportingExcel ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <FileSpreadsheet className="w-4.5 h-4.5" />}
                Planilha (.xlsx)
              </Button>

              <Button
                onClick={() => setIsNewElementModalOpen(true)}
              >
                <Plus className="w-4 h-4" /> Novo Elemento
              </Button>
            </div>
          </div>

          {/* Controle e Seletor de Pavimentos */}
          <div className="flex gap-2 items-center overflow-x-auto pb-1 scrollbar-hide border-b border-slate-100">
            {pavimentosUnicos.length === 0 ? (
              <span className="text-sm font-semibold text-slate-400 py-2">Sem pavimentos. Cadastre um elemento para iniciar.</span>
            ) : (
              pavimentosUnicos.map(pav => (
                <button
                  key={pav}
                  onClick={() => setActivePavimento(pav)}
                  className={`px-4 py-2 text-button font-black uppercase tracking-wider rounded-xl transition-all ${
                    activePavimento === pav
                      ? 'bg-slate-800 text-white shadow-md'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {pav}
                </button>
              ))
            )}
          </div>

          {/* Listagem de Elementos do Pavimento selecionado */}
          {elements.length === 0 ? (
            <div className="flex flex-col items-center py-16 bg-white border border-dashed border-slate-200 rounded-3xl text-slate-300">
              <Layers className="w-12 h-12 mb-3 opacity-40 text-slate-400" />
              <p className="text-sm font-bold text-slate-400">Nenhum elemento adicionado para cálculo.</p>
              <button
                onClick={() => setIsNewElementModalOpen(true)}
                className="mt-3 text-button font-black text-blue-600 hover:underline uppercase tracking-wider"
              >
                Cadastrar primeiro elemento
              </button>
            </div>
          ) : elementosFiltrados.length === 0 ? (
            <div className="py-10 text-center text-sm font-bold text-slate-400">Selecione outro pavimento acima.</div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-4">Elemento (Tag)</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Seção e fck</th>
                    <th className="px-6 py-4">Cargas (Normativa NBR)</th>
                    <th className="px-6 py-4">Semáforo de Status</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {elementosFiltrados.map(el => {
                    // Detalhes técnicos formatados com base no tipo
                    let detailSecao = ''
                    let detailCarga = ''
                    if (el.tipo === 'VIGA') {
                      detailSecao = `${el.geometria.bCm ?? 15}×${el.geometria.hCm ?? 40} cm | C${el.geometria.fckMpa ?? 25}`
                      detailCarga = `Mk: ${el.cargas.mkKnm ?? 0} kNm | Vk: ${el.cargas.vkKn ?? 0} kN`
                    } else if (el.tipo === 'PILAR') {
                      detailSecao = `${el.geometria.bCm ?? 20}×${el.geometria.hCm ?? 20} cm | C${el.geometria.fckMpa ?? 25}`
                      detailCarga = `Nk: ${el.cargas.nkKn ?? 0} kN`
                    } else if (el.tipo === 'LAJE') {
                      detailSecao = `h = ${el.geometria.hCm ?? 10} cm | C${el.geometria.fckMpa ?? 25}`
                      detailCarga = `Var: ${el.cargas.cargaVariavelKnm2 ?? 0} kN/m²`
                    } else if (el.tipo === 'SAPATA') {
                      detailSecao = `Arranc: ${el.geometria.aPilarCm ?? 20}×${el.geometria.bPilarCm ?? 20} cm`
                      detailCarga = `Nk: ${el.cargas.nkKn ?? 0} kN | Solo: ${el.cargas.sigmaSoloMpa ?? 0.2} MPa`
                    }

                    return (
                      <tr key={el.id} className="text-slate-700 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-800">{el.tag}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-black bg-slate-100 text-slate-600">
                            {el.tipo}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-table-body font-semibold text-slate-500">{detailSecao}</td>
                        <td className="px-6 py-4 text-table-body text-slate-400">{detailCarga}</td>
                        <td className="px-6 py-4">{getSemaforoPill(el.status_verificacao)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingElement(el)}
                              className="px-3 py-1.5 text-button font-black uppercase bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-all"
                            >
                              Dimensionar
                            </button>
                            <button
                              onClick={(e) => handleDeleteElement(el.id, e)}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: NOVO PROJETO ── */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-black text-lg text-slate-800">Novo Projeto Estrutural</h3>
              <Button onClick={() => setIsNewProjectModalOpen(false)} variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </Button>
            </div>
            
            <form onSubmit={handleCreateProject} className="space-y-4">
              <label className="block text-form-label font-black text-slate-500 space-y-1">
                Nome da Obra / Projeto
                <input
                  type="text" required value={projNome} onChange={e => setProjNome(e.target.value)}
                  placeholder="Ex: Sobrado Residencial Ricardo"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white"
                />
              </label>

              <label className="block text-form-label font-black text-slate-500 space-y-1">
                Responsável Técnico (RT)
                <input
                  type="text" required value={projRT} onChange={e => setProjRT(e.target.value)}
                  placeholder="Ex: Eng. Ricardo da Silva"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-form-label font-black text-slate-500 space-y-1">
                  Número da ART (Opcional)
                  <input
                    type="text" value={projART} onChange={e => setProjART(e.target.value)}
                    placeholder="Ex: ART-2026154"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>

                <label className="block text-form-label font-black text-slate-500 space-y-1">
                  Agressividade (CAA)
                  <select
                    value={projCAA} onChange={e => setProjCAA(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white cursor-pointer"
                  >
                    <option value="I">CAA I (Rural)</option>
                    <option value="II">CAA II (Urbano)</option>
                    <option value="III">CAA III (Marinho)</option>
                    <option value="IV">CAA IV (Industrial)</option>
                  </select>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-50">
                <Button
                  type="button" onClick={() => setIsNewProjectModalOpen(false)}
                  variant="ghost"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                >
                  Criar Cálculo
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: NOVO ELEMENTO ESTRUTURAL ── */}
      {isNewElementModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-black text-lg text-slate-800">Adicionar Elemento</h3>
              <Button onClick={() => setIsNewElementModalOpen(false)} variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </Button>
            </div>
            
            <form onSubmit={handleCreateElement} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-form-label font-black text-slate-500 space-y-1">
                  Pavimento
                  <input
                    type="text" required value={elPavimentoInput} onChange={e => setElPavimentoInput(e.target.value)}
                    placeholder="Ex: Baldrame, Térreo"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>

                <label className="block text-form-label font-black text-slate-500 space-y-1">
                  Tag do Elemento
                  <input
                    type="text" required value={elTag} onChange={e => setElTag(e.target.value)}
                    placeholder="Ex: V1, P4, S15"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              </div>

              <label className="block text-form-label font-black text-slate-500 space-y-1">
                Tipo do Elemento
                <select
                  value={elTipo} onChange={e => setElTipo(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-800 bg-white cursor-pointer"
                >
                  <option value="VIGA">VIGA</option>
                  <option value="PILAR">PILAR</option>
                  <option value="LAJE">LAJE MACIÇA</option>
                  <option value="SAPATA">SAPATA ISOLADA</option>
                </select>
              </label>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-50">
                <Button
                  type="button" onClick={() => setIsNewElementModalOpen(false)}
                  variant="ghost"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                >
                  Adicionar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default StructuralDimension
