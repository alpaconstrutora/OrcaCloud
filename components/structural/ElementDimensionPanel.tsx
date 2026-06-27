import React, { useState, useEffect } from 'react'
import {
  ArrowLeft, Save, RefreshCw, Layers, Calculator,
  CheckCircle2, AlertTriangle, XCircle, FileText, ShoppingCart
} from 'lucide-react'
import { structuralService } from '../../services/structuralService'
import { projectService } from '../../services/projectService'
import { quotationService } from '../../services/quotationService'
import {
  dimensionarViga,
  dimensionarPilar,
  dimensionarLaje,
  dimensionarSapata,
  dimensionarVigaContinua,
  DimensionResult
} from '../../utils/structuralMath'
import type {
  OpuraStructuralProject,
  OpuraStructuralDimensionElement
} from '../../types/structural'
import { generateMemorialPDF } from '../../services/pdfMemorialService'

interface Props {
  element: OpuraStructuralDimensionElement
  project: OpuraStructuralProject
  onBack: () => void
}

const ElementDimensionPanel: React.FC<Props> = ({ element, project, onBack }) => {
  const [geometria, setGeometria] = useState<Record<string, any>>(element.geometria)
  const [cargas, setCargas] = useState<Record<string, any>>(element.cargas)
  const [result, setResult] = useState<DimensionResult | null>(null)
  const [isContinua, setIsContinua] = useState<boolean>(Number(element.geometria?.isContinua ?? 0) === 1)
  
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [scStatus, setScStatus] = useState<string | null>(null)

  // 1. Executa o cálculo estrutural normativo NBR 6118 em tempo real
  const calcular = () => {
    try {
      let calcRes: DimensionResult

      if (element.tipo === 'VIGA') {
        if (isContinua) {
          calcRes = dimensionarVigaContinua({
            bCm: Number(geometria.bCm ?? 15),
            hCm: Number(geometria.hCm ?? 40),
            L1M: Number(geometria.L1M ?? 4.0),
            L2M: Number(geometria.L2M ?? 4.0),
            fckMpa: Number(geometria.fckMpa ?? 25),
            caa: project.caa,
            q1Knm: Number(cargas.q1Knm ?? 15),
            q2Knm: Number(cargas.q2Knm ?? 15),
            deltaRed: Number(geometria.deltaRed ?? 0.90),
            bitolaLongitudinalMm: Number(geometria.bitolaLongitudinalMm ?? 10),
            bitolaEstriboMm: Number(geometria.bitolaEstriboMm ?? 5.0)
          })
        } else {
          calcRes = dimensionarViga({
            bCm: Number(geometria.bCm ?? 15),
            hCm: Number(geometria.hCm ?? 40),
            comprimentoVaoM: Number(geometria.comprimentoVaoM ?? 4.0),
            fckMpa: Number(geometria.fckMpa ?? 25),
            caa: project.caa,
            mkKnm: Number(cargas.mkKnm ?? 10),
            vkKn: Number(cargas.vkKn ?? 15),
            bitolaLongitudinalMm: Number(geometria.bitolaLongitudinalMm ?? 10),
            bitolaEstriboMm: Number(geometria.bitolaEstriboMm ?? 5.0)
          })
        }
      } else if (element.tipo === 'PILAR') {
        calcRes = dimensionarPilar({
          bCm: Number(geometria.bCm ?? 20),
          hCm: Number(geometria.hCm ?? 20),
          comprimentoLivreM: Number(geometria.comprimentoLivreM ?? 2.8),
          fckMpa: Number(geometria.fckMpa ?? 25),
          caa: project.caa,
          nkKn: Number(cargas.nkKn ?? 250),
          bitolaLongitudinalMm: Number(geometria.bitolaLongitudinalMm ?? 10)
        })
      } else if (element.tipo === 'LAJE') {
        calcRes = dimensionarLaje({
          lxM: Number(geometria.lxM ?? 3.5),
          lyM: Number(geometria.lyM ?? 4.0),
          hCm: Number(geometria.hCm ?? 10),
          fckMpa: Number(geometria.fckMpa ?? 25),
          caa: project.caa,
          cargaRevestimentoKnm2: Number(cargas.cargaRevestimentoKnm2 ?? 1.0),
          cargaVariavelKnm2: Number(cargas.cargaVariavelKnm2 ?? 1.5)
        })
      } else {
        // SAPATA
        calcRes = dimensionarSapata({
          fckMpa: Number(geometria.fckMpa ?? 25),
          caa: project.caa,
          nkKn: Number(cargas.nkKn ?? 300),
          sigmaSoloMpa: Number(cargas.sigmaSoloMpa ?? 0.2),
          aPilarCm: Number(geometria.aPilarCm ?? 20),
          bPilarCm: Number(geometria.bPilarCm ?? 20)
        })
      }

      setResult(calcRes)
    } catch (err) {
      console.error('Erro no cálculo estrutural:', err)
    }
  }

  // Recalcula sempre que inputs mudam
  useEffect(() => {
    calcular()
  }, [geometria, cargas, isContinua])

  // 2. Handler de Mudança de Geometria/Cargas
  const updateGeometria = (k: string, v: number) => {
    setGeometria(prev => ({ ...prev, [k]: v }))
  }

  const updateCarga = (k: string, v: number) => {
    setCargas(prev => ({ ...prev, [k]: v }))
  }

  // 3. Otimizador "Sugerir Seção"
  const handleSugerirSeçao = () => {
    if (element.tipo === 'VIGA') {
      // Varre hCm de 20 a 80 (passo 5) e bCm de 12 a 30 (passo 2)
      for (let h = 20; h <= 80; h += 5) {
        for (let b = 12; b <= 30; b += 2) {
          const res = isContinua ? dimensionarVigaContinua({
            bCm: b,
            hCm: h,
            L1M: Number(geometria.L1M ?? 4.0),
            L2M: Number(geometria.L2M ?? 4.0),
            fckMpa: Number(geometria.fckMpa ?? 25),
            caa: project.caa,
            q1Knm: Number(cargas.q1Knm ?? 15),
            q2Knm: Number(cargas.q2Knm ?? 15),
            deltaRed: Number(geometria.deltaRed ?? 0.90),
            bitolaLongitudinalMm: Number(geometria.bitolaLongitudinalMm ?? 10),
            bitolaEstriboMm: Number(geometria.bitolaEstriboMm ?? 5.0)
          }) : dimensionarViga({
            bCm: b,
            hCm: h,
            comprimentoVaoM: Number(geometria.comprimentoVaoM ?? 4.0),
            fckMpa: Number(geometria.fckMpa ?? 25),
            caa: project.caa,
            mkKnm: Number(cargas.mkKnm ?? 10),
            vkKn: Number(cargas.vkKn ?? 15),
            bitolaLongitudinalMm: Number(geometria.bitolaLongitudinalMm ?? 10),
            bitolaEstriboMm: Number(geometria.bitolaEstriboMm ?? 5.0)
          })
          if (res.status === 'OK') {
            setGeometria(prev => ({ ...prev, bCm: b, hCm: h }))
            return
          }
        }
      }
      alert('Não foi encontrada seção viável nos limites convencionais. Aumente o fck do concreto.')
    } else if (element.tipo === 'PILAR') {
      // Varre seções simétricas
      for (let dim = 15; dim <= 50; dim += 5) {
        const res = dimensionarPilar({
          bCm: dim,
          hCm: dim,
          comprimentoLivreM: Number(geometria.comprimentoLivreM ?? 2.8),
          fckMpa: Number(geometria.fckMpa ?? 25),
          caa: project.caa,
          nkKn: Number(cargas.nkKn ?? 250),
          bitolaLongitudinalMm: Number(geometria.bitolaLongitudinalMm ?? 10)
        })
        if (res.status === 'OK') {
          setGeometria(prev => ({ ...prev, bCm: dim, hCm: dim }))
          return
        }
      }
      alert('Não foi encontrada seção viável. Reduza a carga ou aumente o fck.')
    } else if (element.tipo === 'LAJE') {
      // Varre h de 7cm a 25cm
      for (let h = 7; h <= 25; h += 1) {
        const res = dimensionarLaje({
          lxM: Number(geometria.lxM ?? 3.5),
          lyM: Number(geometria.lyM ?? 4.0),
          hCm: h,
          fckMpa: Number(geometria.fckMpa ?? 25),
          caa: project.caa,
          cargaRevestimentoKnm2: Number(cargas.cargaRevestimentoKnm2 ?? 1.0),
          cargaVariavelKnm2: Number(cargas.cargaVariavelKnm2 ?? 1.5)
        })
        if (res.status === 'OK') {
          setGeometria(prev => ({ ...prev, hCm: h }))
          return
        }
      }
    }
  }

  // 4. Salvar Dimensionamento e Gravar no Histórico (Imutável)
  const handleSaveDimension = async () => {
    if (!result) return
    setSaving(true)
    try {
      // 4.1 Atualiza elemento com novos inputs e status
      await structuralService.upsertStructuralDimensionElement({
        id: element.id,
        organizationId: element.organization_id,
        projectId: element.project_id,
        tipo: element.tipo,
        pavimento: element.pavimento,
        tag: element.tag,
        geometria,
        cargas,
        resultadoCalculo: result,
        statusVerificacao: result.status,
        structuralElementId: element.structural_element_id
      })

      // 4.2 Cria revisão imutável de cálculo
      await structuralService.createCalculationRevision({
        organization_id: element.organization_id,
        project_id: element.project_id,
        revisao: project.revisao_atual,
        elemento_tag: element.tag,
        tipo_elemento: element.tipo,
        geometria_calculada: geometria,
        cargas_calculadas: cargas,
        resultado_verificacao: result.diagnosticos,
        armadura_calculada: result.armaduraSugerida,
        calculado_por: project.responsavel_tecnico
      })

      // 4.3 Sincroniza armaduras com a tabela de ferragem armada do elemento se vinculado
      if (element.structural_element_id) {
        await structuralService.syncCalculatedRebars(
          element.organization_id,
          element.structural_element_id,
          element.tipo,
          geometria,
          result
        )
      }

      alert('Dimensionamento e armaduras da obra salvos com sucesso!')
    } catch (err) {
      console.error('Erro ao salvar:', err)
      alert('Erro ao salvar rodada de dimensionamento.')
    } finally {
      setSaving(false)
    }
  }

  // 5. Gera Memorial em PDF
  const handleExportPDF = () => {
    if (!result) return
    try {
      generateMemorialPDF(project, element, geometria, cargas, result)
    } catch (err) {
      console.error('Erro ao exportar PDF:', err)
      alert('Erro ao exportar memorial em PDF.')
    }
  }

  // 6. Integração com Compras e Ferragem Armada (Cria SC de Rascunho)
  const handleExportToCompras = async () => {
    if (!result) return
    setExporting(true)
    setScStatus('Processando...')
    try {
      // 1. Busca os projetos da organização do elemento
      const orgProjects = await projectService.listProjects(undefined, element.organization_id)
      
      // Encontra a primeira obra ativa da organização
      const targetObra = orgProjects?.find((p: any) => p.settings?.classification === 'OBRA')
      const targetProjectId = targetObra?.id

      if (!targetProjectId) {
        throw new Error('Nenhuma obra ativa encontrada na organização para vincular a Solicitação de Compra.')
      }

      // 2. Prepara os itens baseados nos quantitativos calculados
      const items = []
      
      // Volume de Concreto
      const volConcreto = result.detalhesTecnicos.volumeConcretoM3 ?? 0
      if (volConcreto > 0) {
        items.push({
          code: `CONC-${element.tipo}-${geometria.fckMpa ?? 25}`,
          description: `Concreto Usinado C${geometria.fckMpa ?? 25} para ${element.tipo} ${element.tag} (Vão/Comp: ${geometria.comprimentoVaoM ?? geometria.comprimentoLivreM ?? 0}m)`,
          unit: 'm³',
          quantity: Number(volConcreto.toFixed(3))
        })
      }

      // Peso de Aço Estimado
      const pesoAco = result.detalhesTecnicos.pesoAcoKg ?? 0
      if (pesoAco > 0) {
        items.push({
          code: `ACO-CA50-ESTIMADO`,
          description: `Massa de aço CA-50 estimado para armadura do elemento ${element.tag} (${element.tipo})`,
          unit: 'kg',
          quantity: Number(pesoAco.toFixed(1))
        })
      }

      if (items.length === 0) {
        throw new Error('Não há materiais quantificados neste cálculo para exportar.')
      }

      // 3. Cria a solicitação real de cotação/compra
      await quotationService.createRequest({
        projectId: targetProjectId,
        title: `Materiais: ${element.tipo} ${element.tag} [ÒPURA Dimensionamento]`,
        description: `Solicitação gerada automaticamente pelo módulo ÒPURA a partir do cálculo analítico normativo do elemento ${element.tag} no pavimento ${element.pavimento}.`,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 dias de prazo
        status: 'Aberta',
        items,
        invitedSupplierIds: []
      })

      setScStatus('Solicitação de Compra Gerada com sucesso!')
      alert(`Payload enviado! Solicitação de Compra (Rascunho de Cotação) criada com sucesso na obra "${targetObra.name}".`)
    } catch (err: any) {
      console.error('Erro ao exportar para compras:', err)
      setScStatus('Falha ao exportar.')
      alert(err.message || 'Erro ao gerar Solicitação de Compra.')
    } finally {
      setExporting(false)
    }
  }

  // Visualização de semáforo do cabeçalho
  const getBannerHeaderStyle = () => {
    if (!result) return 'bg-slate-800 text-white'
    switch (result.status) {
      case 'OK': return 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
      case 'ATENCAO': return 'bg-amber-500/10 text-amber-800 border-amber-500/20'
      case 'REPROVADO': return 'bg-rose-500/10 text-rose-800 border-rose-500/20'
      default: return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho de Ações e Título */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Dimensionamento: {element.tag} ({element.tipo})
            </h2>
            <p className="text-xs font-semibold text-slate-400 mt-1">
              Pavimento: {element.pavimento} | Obra: {project.nome}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveDimension}
            disabled={saving || !result}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:bg-slate-300"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Cálculo'}
          </button>
        </div>
      </div>

      {/* Banner de Status Geral */}
      <div className={`p-4 rounded-2xl border text-sm font-bold flex justify-between items-center ${getBannerHeaderStyle()}`}>
        <div className="flex items-center gap-2">
          {result?.status === 'OK' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {result?.status === 'ATENCAO' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
          {result?.status === 'REPROVADO' && <XCircle className="w-5 h-5 text-rose-500" />}
          <span>
            Status Geral: {result?.status === 'OK' ? 'Aprovado conforme NBR 6118' : result?.status === 'ATENCAO' ? 'Atenção necessária' : 'Reprovado nos critérios normativos'}
          </span>
        </div>
        <div className="text-xs font-black uppercase">
          ART {project.numero_art || 'Pendente'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Painel de Inputs (Geometria e Cargas) */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-5">
          <h3 className="font-black text-slate-800 text-sm border-b border-slate-50 pb-2 flex items-center gap-2">
            <Layers className="w-4.5 h-4.5 text-blue-500" /> Parâmetros de Entrada
          </h3>

          {/* Form Dinâmico com base no tipo */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-black text-slate-500 space-y-1">
                Classe Concreto (fck)
                <select
                  value={geometria.fckMpa ?? 25}
                  onChange={e => updateGeometria('fckMpa', Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                >
                  <option value={20}>C20 (20 MPa)</option>
                  <option value={25}>C25 (25 MPa)</option>
                  <option value={30}>C30 (30 MPa)</option>
                  <option value={35}>C35 (35 MPa)</option>
                  <option value={40}>C40 (40 MPa)</option>
                  <option value={50}>C50 (50 MPa)</option>
                </select>
              </label>

              {element.tipo === 'VIGA' && (
                <div className="col-span-2 space-y-3">
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Configuração de Vão
                    <select
                      value={isContinua ? 'continua' : 'biapoiada'}
                      onChange={e => {
                        const val = e.target.value === 'continua'
                        setIsContinua(val)
                        updateGeometria('isContinua', val ? 1 : 0)
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    >
                      <option value="biapoiada">Vão Único (Biapoiada)</option>
                      <option value="continua">Viga Contínua (2 Vãos)</option>
                    </select>
                  </label>

                  {isContinua ? (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs font-black text-slate-500 space-y-1">
                        Vão L1 (m)
                        <input
                          type="number" step="0.1" value={geometria.L1M ?? 4.0}
                          onChange={e => updateGeometria('L1M', Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                        />
                      </label>
                      <label className="block text-xs font-black text-slate-500 space-y-1">
                        Vão L2 (m)
                        <input
                          type="number" step="0.1" value={geometria.L2M ?? 4.0}
                          onChange={e => updateGeometria('L2M', Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="block text-xs font-black text-slate-500 space-y-1">
                      Vão da Viga (m)
                      <input
                        type="number" step="0.1" value={geometria.comprimentoVaoM ?? 4.0}
                        onChange={e => updateGeometria('comprimentoVaoM', Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                      />
                    </label>
                  )}
                </div>
              )}
              {element.tipo === 'PILAR' && (
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Comprimento (m)
                  <input
                    type="number" step="0.1" value={geometria.comprimentoLivreM ?? 2.8}
                    onChange={e => updateGeometria('comprimentoLivreM', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              )}
            </div>

            {/* Geometria de Vigas e Pilares */}
            {(element.tipo === 'VIGA' || element.tipo === 'PILAR') && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Largura b (cm)
                  <input
                    type="number" value={geometria.bCm ?? 15}
                    onChange={e => updateGeometria('bCm', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Altura h (cm)
                  <input
                    type="number" value={geometria.hCm ?? 40}
                    onChange={e => updateGeometria('hCm', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              </div>
            )}

            {/* Geometria de Lajes */}
            {element.tipo === 'LAJE' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Vão Menor Lx (m)
                    <input
                      type="number" step="0.1" value={geometria.lxM ?? 3.5}
                      onChange={e => updateGeometria('lxM', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Vão Maior Ly (m)
                    <input
                      type="number" step="0.1" value={geometria.lyM ?? 4.0}
                      onChange={e => updateGeometria('lyM', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    />
                  </label>
                </div>
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Espessura h (cm)
                  <input
                    type="number" value={geometria.hCm ?? 10}
                    onChange={e => updateGeometria('hCm', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              </>
            )}

            {/* Bitolas Adotadas */}
            {(element.tipo === 'VIGA' || element.tipo === 'PILAR') && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Aço Longitudinal
                  <select
                    value={geometria.bitolaLongitudinalMm ?? 10}
                    onChange={e => updateGeometria('bitolaLongitudinalMm', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white cursor-pointer"
                  >
                    <option value={8.0}>Ø 8.0 mm</option>
                    <option value={10.0}>Ø 10.0 mm</option>
                    <option value={12.5}>Ø 12.5 mm</option>
                    <option value={16.0}>Ø 16.0 mm</option>
                    <option value={20.0}>Ø 20.0 mm</option>
                  </select>
                </label>

                {element.tipo === 'VIGA' && (
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Bitola Estribo
                    <select
                      value={geometria.bitolaEstriboMm ?? 5.0}
                      onChange={e => updateGeometria('bitolaEstriboMm', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white cursor-pointer"
                    >
                      <option value={5.0}>Ø 5.0 mm</option>
                      <option value={6.3}>Ø 6.3 mm</option>
                      <option value={8.0}>Ø 8.0 mm</option>
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* Geometria de Sapatas */}
            {element.tipo === 'SAPATA' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Lado Pilar A (cm)
                  <input
                    type="number" value={geometria.aPilarCm ?? 20}
                    onChange={e => updateGeometria('aPilarCm', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Lado Pilar B (cm)
                  <input
                    type="number" value={geometria.bPilarCm ?? 20}
                    onChange={e => updateGeometria('bPilarCm', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              </div>
            )}

            {/* Seção Cargas */}
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 mt-4 mb-2">Esforços de Cálculo (NBR 6120)</h4>

            {element.tipo === 'VIGA' && (
              isContinua ? (
                <div className="space-y-4 col-span-2">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-black text-slate-500 space-y-1">
                      Carga Vão L1 (kN/m)
                      <input
                        type="number" value={cargas.q1Knm ?? 15}
                        onChange={e => updateCarga('q1Knm', Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                      />
                    </label>
                    <label className="block text-xs font-black text-slate-500 space-y-1">
                      Carga Vão L2 (kN/m)
                      <input
                        type="number" value={cargas.q2Knm ?? 15}
                        onChange={e => updateCarga('q2Knm', Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Redistribuição de Momentos (δ)
                    <select
                      value={geometria.deltaRed ?? 0.90}
                      onChange={e => updateGeometria('deltaRed', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    >
                      <option value={1.00}>1.00 (Sem Redistribuição)</option>
                      <option value={0.95}>0.95 (5% Redução)</option>
                      <option value={0.90}>0.90 (10% Redução)</option>
                      <option value={0.85}>0.85 (15% Redução)</option>
                      <option value={0.80}>0.80 (20% Redução)</option>
                      <option value={0.75}>0.75 (25% Redução Máxima)</option>
                    </select>
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 col-span-2">
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Momento Mk (kNm)
                    <input
                      type="number" value={cargas.mkKnm ?? 10}
                      onChange={e => updateCarga('mkKnm', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    />
                  </label>
                  <label className="block text-xs font-black text-slate-500 space-y-1">
                    Cisalham. Vk (kN)
                    <input
                      type="number" value={cargas.vkKn ?? 15}
                      onChange={e => updateCarga('vkKn', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                    />
                  </label>
                </div>
              )
            )}

            {element.tipo === 'PILAR' && (
              <label className="block text-xs font-black text-slate-500 space-y-1">
                Força Normal Nk (kN)
                <input
                  type="number" value={cargas.nkKn ?? 250}
                  onChange={e => updateCarga('nkKn', Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                />
              </label>
            )}

            {element.tipo === 'LAJE' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Revestimento (kN/m²)
                  <input
                    type="number" step="0.1" value={cargas.cargaRevestimentoKnm2 ?? 1.0}
                    onChange={e => updateCarga('cargaRevestimentoKnm2', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Sobrecarga NBR (kN/m²)
                  <input
                    type="number" step="0.1" value={cargas.cargaVariavelKnm2 ?? 1.5}
                    onChange={e => updateCarga('cargaVariavelKnm2', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              </div>
            )}

            {element.tipo === 'SAPATA' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Força Normal Nk (kN)
                  <input
                    type="number" value={cargas.nkKn ?? 300}
                    onChange={e => updateCarga('nkKn', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
                <label className="block text-xs font-black text-slate-500 space-y-1">
                  Solo σ_adm (MPa)
                  <input
                    type="number" step="0.05" value={cargas.sigmaSoloMpa ?? 0.2}
                    onChange={e => updateCarga('sigmaSoloMpa', Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Botão de Sugerir Seção */}
          {element.tipo !== 'SAPATA' && (
            <button
              onClick={handleSugerirSeçao}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white hover:bg-slate-700 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Sugerir Seção Ideal
            </button>
          )}
        </div>

        {/* Tabela de Diagnóstico Normativo (2 Colunas no Grid) */}
        <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-50 pb-2">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <Calculator className="w-4.5 h-4.5 text-blue-500" /> Verificações NBR 6118:2023
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPDF}
                disabled={!result}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                <FileText className="w-4 h-4" /> Memorial PDF
              </button>
              <button
                onClick={handleExportToCompras}
                disabled={exporting || !result}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4" /> Enviar p/ Compras
              </button>
            </div>
          </div>

          {/* Status de Compras */}
          {scStatus && (
            <div className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
              {scStatus}
            </div>
          )}

          {/* Listagem de Diagnósticos */}
          <div className="space-y-3">
            {result?.diagnosticos.map((diag, index) => (
              <div
                key={index}
                className="border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/30"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 text-sm">{diag.criterio}</span>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                      {diag.referenciaNormativa}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-semibold">{diag.mensagem}</p>
                </div>

                <div className="flex items-center gap-4 justify-between md:justify-end">
                  <div className="text-right text-xs font-medium">
                    <div className="text-slate-500 font-bold">{diag.valorCalculado}</div>
                    <div className="text-slate-300">Limite: {diag.valorLimite}</div>
                  </div>
                  <div>
                    {diag.status === 'OK' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-black uppercase">OK</span>}
                    {diag.status === 'ATENCAO' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase">ATENÇÃO</span>}
                    {diag.status === 'REPROVADO' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[10px] font-black uppercase">REPROVADO</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detalhes Técnicos Derivados */}
          {result && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Quantitativos Extraídos do Cálculo</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Volume Concreto</div>
                  <div className="text-sm font-black text-slate-800 mt-1">
                    {result.detalhesTecnicos.volumeConcretoM3?.toFixed(3)} m³
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Área de Fôrma</div>
                  <div className="text-sm font-black text-slate-800 mt-1">
                    {result.detalhesTecnicos.areaFormaM2?.toFixed(2)} m²
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Estimativa de Aço</div>
                  <div className="text-sm font-black text-slate-800 mt-1">
                    {result.detalhesTecnicos.pesoAcoKg?.toFixed(1)} kg
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Armadura Sugerida</div>
                  <div className="text-[11px] font-bold text-blue-600 mt-1.5 truncate">
                    {element.tipo === 'VIGA' && (
                      isContinua ? (
                        <div className="text-[9px] text-left leading-normal font-semibold">
                          <div>Vão 1: {result.armaduraSugerida.longitudinalVao1.quantidade}Ø{result.armaduraSugerida.longitudinalVao1.bitolaMm} ({result.armaduraSugerida.longitudinalVao1.areaCalculadaCm2.toFixed(2)} cm²)</div>
                          <div>Apoio: {result.armaduraSugerida.longitudinalApoio.quantidade}Ø{result.armaduraSugerida.longitudinalApoio.bitolaMm} ({result.armaduraSugerida.longitudinalApoio.areaCalculadaCm2.toFixed(2)} cm²)</div>
                          <div>Vão 2: {result.armaduraSugerida.longitudinalVao2.quantidade}Ø{result.armaduraSugerida.longitudinalVao2.bitolaMm} ({result.armaduraSugerida.longitudinalVao2.areaCalculadaCm2.toFixed(2)} cm²)</div>
                          <div>Estribo: c/{result.armaduraSugerida.transversal.espaçamentoCm} cm</div>
                        </div>
                      ) : (
                        `${result.armaduraSugerida.longitudinal.quantidade} barras Ø${result.armaduraSugerida.longitudinal.bitolaMm} / estribo c/${result.armaduraSugerida.transversal.espaçamentoCm}`
                      )
                    )}
                    {element.tipo === 'PILAR' && `${result.armaduraSugerida.longitudinal.quantidade} barras Ø${result.armaduraSugerida.longitudinal.bitolaMm}`}
                    {element.tipo === 'LAJE' && `Ø${result.armaduraSugerida.flexao.bitolaMm} c/${result.armaduraSugerida.flexao.espaçamentoCm}`}
                    {element.tipo === 'SAPATA' && `${result.armaduraSugerida.direcaoA.quantidade}Ø${result.armaduraSugerida.direcaoA.bitolaMm} + ${result.armaduraSugerida.direcaoB.quantidade}Ø${result.armaduraSugerida.direcaoB.bitolaMm}`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ElementDimensionPanel
