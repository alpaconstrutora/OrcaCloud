/**
 * Seed: Módulo Controle Operacional
 *
 * Executa com: npx ts-node supabase/seed/operational-control.ts
 *
 * Pré-requisito: org_id, project_id e employee/team IDs válidos no banco.
 * Preencha as constantes abaixo com IDs reais do ambiente de dev.
 */

import { createClient } from '@supabase/supabase-js'

// ─── CONFIGURE AQUI ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// IDs do banco de desenvolvimento — preencher com valores reais
const ORG_ID     = process.env.SEED_ORG_ID     ?? 'YOUR_ORG_ID'
const PROJECT_ID = process.env.SEED_PROJECT_ID ?? 'YOUR_PROJECT_ID'

// ─── DADOS DE REFERÊNCIA ─────────────────────────────────────────────────────

const PHASES = ['Fundação', 'Estrutura', 'Alvenaria', 'Cobertura', 'Instalações', 'Acabamento']

const CHECKLIST_TEMPLATES = [
  {
    name: 'Alvenaria — Padrão',
    service_type: 'Alvenaria',
    items: [
      { description: 'Verificar prumo e nível antes de iniciar', required: true, requires_photo: false, gate: 'pre_start', sort_order: 1 },
      { description: 'Confirmar traço da argamassa', required: true, requires_photo: false, gate: 'pre_start', sort_order: 2 },
      { description: 'Foto de progresso (a cada 50% executado)', required: false, requires_photo: true, gate: 'free', sort_order: 3 },
      { description: 'Verificar perpendicularidade dos cantos', required: true, requires_photo: true, gate: 'pre_completion', sort_order: 4 },
      { description: 'Foto da parede concluída', required: true, requires_photo: true, gate: 'pre_completion', sort_order: 5 },
    ],
  },
  {
    name: 'Concretagem — Padrão',
    service_type: 'Estrutura',
    items: [
      { description: 'Verificar fôrmas e escoramento', required: true, requires_photo: true, gate: 'pre_start', sort_order: 1 },
      { description: 'Confirmar posicionamento da armadura', required: true, requires_photo: true, gate: 'pre_start', sort_order: 2 },
      { description: 'Slump test documentado', required: true, requires_photo: true, gate: 'pre_start', sort_order: 3 },
      { description: 'Foto da concretagem em progresso', required: false, requires_photo: true, gate: 'free', sort_order: 4 },
      { description: 'Cura inicial confirmada (24h)', required: true, requires_photo: false, gate: 'pre_completion', sort_order: 5 },
    ],
  },
  {
    name: 'Instalação Hidráulica — Padrão',
    service_type: 'Instalações',
    items: [
      { description: 'Confirmar traçado conforme projeto', required: true, requires_photo: false, gate: 'pre_start', sort_order: 1 },
      { description: 'Foto das tubulações antes do fechamento', required: true, requires_photo: true, gate: 'pre_completion', sort_order: 2 },
      { description: 'Teste de pressão documentado', required: true, requires_photo: true, gate: 'pre_completion', sort_order: 3 },
    ],
  },
]

// Work orders de exemplo: cobrem todos os status e fluxos
const WORK_ORDERS_TEMPLATE = [
  {
    title: 'Fundação — Radier Bloco A',
    phase: 'Fundação',
    type: 'own',
    status: 'closed',
    priority: 'normal',
    plannedStartDate: '2026-04-01',
    plannedEndDate: '2026-04-15',
    actualStartDate: '2026-04-01',
    actualEndDate: '2026-04-14',
    measurementUnit: 'm³',
    plannedQuantity: 45,
    executedQuantity: 45,
    completionPct: 100,
    plannedCost: 18500,
    actualLaborCost: 17200,
    actualMaterialCost: 0,
    actualTotalCost: 17200,
    description: 'Execução do radier de fundação do Bloco A',
    budgetItemRef: {
      id: 'ref-001',
      description: 'Concreto estrutural fck=25MPa',
      unit: 'm³',
      unitCost: 411.11,
      phase: 'Fundação',
    },
  },
  {
    title: 'Estrutura — Pilares Térreo',
    phase: 'Estrutura',
    type: 'own',
    status: 'measured',
    priority: 'high',
    plannedStartDate: '2026-04-16',
    plannedEndDate: '2026-05-10',
    actualStartDate: '2026-04-18',
    actualEndDate: null,
    measurementUnit: 'm³',
    plannedQuantity: 12.8,
    executedQuantity: 12.8,
    completionPct: 100,
    plannedCost: 9800,
    actualLaborCost: 8900,
    actualMaterialCost: 0,
    actualTotalCost: 8900,
    description: 'Concretagem dos pilares do pavimento térreo',
  },
  {
    title: 'Estrutura — Laje Térreo',
    phase: 'Estrutura',
    type: 'own',
    status: 'approved',
    priority: 'high',
    plannedStartDate: '2026-05-01',
    plannedEndDate: '2026-05-20',
    actualStartDate: '2026-05-05',
    actualEndDate: null,
    measurementUnit: 'm²',
    plannedQuantity: 210,
    executedQuantity: 210,
    completionPct: 100,
    plannedCost: 32000,
    actualLaborCost: 28500,
    actualMaterialCost: 0,
    actualTotalCost: 28500,
    description: 'Concretagem da laje do pavimento térreo',
    checklist_template_idx: 1, // Concretagem
  },
  {
    title: 'Alvenaria — Bloco A Térreo',
    phase: 'Alvenaria',
    type: 'own',
    status: 'in_progress',
    priority: 'normal',
    plannedStartDate: '2026-05-12',
    plannedEndDate: '2026-06-10',
    actualStartDate: '2026-05-14',
    actualEndDate: null,
    measurementUnit: 'm²',
    plannedQuantity: 380,
    executedQuantity: 190,
    completionPct: 50,
    plannedCost: 22800,
    actualLaborCost: 10400,
    actualMaterialCost: 0,
    actualTotalCost: 10400,
    description: 'Execução da alvenaria de vedação do Bloco A — pavimento térreo',
    checklist_template_idx: 0, // Alvenaria
  },
  {
    title: 'Alvenaria — Bloco B Térreo',
    phase: 'Alvenaria',
    type: 'own',
    status: 'blocked',
    priority: 'normal',
    plannedStartDate: '2026-05-15',
    plannedEndDate: '2026-06-15',
    actualStartDate: null,
    actualEndDate: null,
    measurementUnit: 'm²',
    plannedQuantity: 320,
    executedQuantity: 0,
    completionPct: 0,
    plannedCost: 19200,
    actualLaborCost: 0,
    actualMaterialCost: 0,
    actualTotalCost: 0,
    description: 'Alvenaria Bloco B bloqueada — aguardando liberação de projeto revisado',
    statusBeforeBlock: 'released',
  },
  {
    title: 'Instalação Hidráulica — Prumadas Bloco A',
    phase: 'Instalações',
    type: 'subcontracted',
    status: 'released',
    priority: 'normal',
    plannedStartDate: '2026-06-01',
    plannedEndDate: '2026-06-30',
    actualStartDate: null,
    actualEndDate: null,
    measurementUnit: 'm',
    plannedQuantity: 85,
    executedQuantity: 0,
    completionPct: 0,
    plannedCost: 14500,
    actualLaborCost: 0,
    actualMaterialCost: 0,
    actualTotalCost: 0,
    description: 'Prumadas hidráulicas do Bloco A — subempreiteiro Hidro Sul',
    checklist_template_idx: 2, // Hidráulica
  },
  {
    title: 'Cobertura — Estrutura Metálica',
    phase: 'Cobertura',
    type: 'subcontracted',
    status: 'planned',
    priority: 'critical',
    plannedStartDate: '2026-07-01',
    plannedEndDate: '2026-07-31',
    actualStartDate: null,
    actualEndDate: null,
    measurementUnit: 'kg',
    plannedQuantity: 4800,
    executedQuantity: 0,
    completionPct: 0,
    plannedCost: 68000,
    actualLaborCost: 0,
    actualMaterialCost: 0,
    actualTotalCost: 0,
    description: 'Fornecimento e montagem de estrutura metálica da cobertura',
    priority_note: 'crítico para não atrasar vedação no período de chuvas',
  },
  {
    title: 'Acabamento — Revestimento Cerâmico Banheiros',
    phase: 'Acabamento',
    type: 'own',
    status: 'planned',
    priority: 'normal',
    plannedStartDate: '2026-08-01',
    plannedEndDate: '2026-08-30',
    actualStartDate: null,
    actualEndDate: null,
    measurementUnit: 'm²',
    plannedQuantity: 145,
    executedQuantity: 0,
    completionPct: 0,
    plannedCost: 18500,
    actualLaborCost: 0,
    actualMaterialCost: 0,
    actualTotalCost: 0,
    description: 'Assentamento de cerâmica nos banheiros — Bloco A e B',
  },
]

// ─── RUNNER ─────────────────────────────────────────────────────────────────

async function run() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
  }
  if (ORG_ID === 'YOUR_ORG_ID' || PROJECT_ID === 'YOUR_PROJECT_ID') {
    throw new Error('Configure SEED_ORG_ID e SEED_PROJECT_ID como variáveis de ambiente')
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  console.log('→ Criando templates de checklist...')
  const templateIds: string[] = []

  for (const tmpl of CHECKLIST_TEMPLATES) {
    const { data: template, error: tmplError } = await sb
      .from('oe_checklist_templates')
      .insert({ org_id: ORG_ID, name: tmpl.name, service_type: tmpl.service_type })
      .select()
      .single()

    if (tmplError) throw tmplError

    const { error: itemsError } = await sb
      .from('oe_checklist_items')
      .insert(tmpl.items.map(item => ({ ...item, template_id: template.id })))

    if (itemsError) throw itemsError

    templateIds.push(template.id)
    console.log(`  ✓ Template: ${tmpl.name}`)
  }

  console.log('→ Criando ordens de execução...')

  for (const wo of WORK_ORDERS_TEMPLATE) {
    const checklistTemplateId = wo.checklist_template_idx !== undefined
      ? templateIds[wo.checklist_template_idx]
      : null

    // Gerar código OE
    const { data: code } = await sb
      .rpc('generate_work_order_code', { p_project_id: PROJECT_ID })

    const { data: order, error: woError } = await sb
      .from('work_orders')
      .insert({
        org_id: ORG_ID,
        project_id: PROJECT_ID,
        code: code as string,
        title: wo.title,
        description: wo.description ?? null,
        phase: wo.phase,
        type: wo.type,
        status: wo.status,
        status_before_block: (wo as { statusBeforeBlock?: string }).statusBeforeBlock ?? null,
        priority: wo.priority,
        planned_start_date: wo.plannedStartDate,
        planned_end_date: wo.plannedEndDate,
        actual_start_date: wo.actualStartDate ?? null,
        actual_end_date: wo.actualEndDate ?? null,
        baseline_start: wo.status !== 'planned' ? wo.plannedStartDate : null,
        baseline_end: wo.status !== 'planned' ? wo.plannedEndDate : null,
        measurement_unit: wo.measurementUnit,
        planned_quantity: wo.plannedQuantity,
        executed_quantity: wo.executedQuantity,
        completion_pct: wo.completionPct,
        planned_cost: wo.plannedCost,
        actual_labor_cost: wo.actualLaborCost,
        actual_material_cost: wo.actualMaterialCost,
        actual_total_cost: wo.actualTotalCost,
        checklist_template_id: checklistTemplateId,
        budget_item_ref: (wo as { budgetItemRef?: object }).budgetItemRef ?? null,
      })
      .select()
      .single()

    if (woError) throw woError

    // Registrar status inicial no histórico
    await sb.from('work_order_status_log').insert({
      work_order_id: order.id,
      previous_status: null,
      new_status: wo.status,
      reason: 'Seed inicial',
    })

    // Inicializar checklist se houver template
    if (checklistTemplateId) {
      const { data: items } = await sb
        .from('oe_checklist_items')
        .select('id')
        .eq('template_id', checklistTemplateId)

      if (items?.length) {
        await sb.from('oe_checklist_responses').insert(
          items.map(item => ({
            work_order_id: order.id,
            item_id: item.id,
            completed: wo.completionPct >= 100,
          }))
        )
      }
    }

    // Não-conformidade de exemplo na OE em execução
    if (wo.status === 'in_progress') {
      await sb.from('non_conformances').insert({
        work_order_id: order.id,
        description: 'Juntas de argamassa fora da espessura padrão (trecho NE)',
        severity: 'minor',
        status: 'open',
        due_date: '2026-06-05',
      })
    }

    console.log(`  ✓ ${code} — ${wo.title} [${wo.status}]`)
  }

  // Gerar diário de hoje
  console.log('→ Gerando diário de obra do dia...')
  const today = new Date().toISOString().split('T')[0]
  await sb.from('site_diary').upsert({
    project_id: PROJECT_ID,
    diary_date: today,
    weather: 'sunny',
    field_condition: 'normal',
    workers_present: 12,
    auto_generated: true,
  }, { onConflict: 'project_id,diary_date' })
  console.log(`  ✓ Diário ${today}`)

  console.log('\nSeed concluído com sucesso.')
}

run().catch(err => {
  console.error('Erro no seed:', err)
  process.exit(1)
})
