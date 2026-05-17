
import { SinapiItem, SinapiType, BudgetEntry, ProjectSettings } from './types';

// Mock SINAPI Database (Simplified for prototype)
export const MOCK_SINAPI_DB: SinapiItem[] = [
  {
    code: '87529',
    description: 'MASSA ÚNICA, PARA RECEBIMENTO DE PINTURA, EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO COM BETONEIRA 400L, APLICADA MANUALMENTE EM FACES INTERNAS DE PAREDES, ESPESSURA DE 20MM, COM EXECUÇÃO DE TALISCAS',
    unit: 'm²',
    price: 38.50,
    type: SinapiType.COMPOSITION,
    category: 'Revestimentos',
    composition: [
      { code: '88309', description: 'PEDREIRO COM ENCARGOS COMPLEMENTARES', unit: 'H', price: 25.80, type: SinapiType.COMPOSITION, quantity: 0.8 },
      { code: '88316', description: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unit: 'H', price: 19.40, type: SinapiType.COMPOSITION, quantity: 0.4 },
      { code: '87292', description: 'ARGAMASSA TRAÇO 1:2:8 (EM VOLUME DE CIMENTO, CAL E AREIA MÉDIA ÚMIDA) PARA EMBOÇO/MASSA ÚNICA/ASSENTAMENTO DE ALVENARIA DE VEDAÇÃO, PREPARO MECÂNICO COM BETONEIRA 400 L', unit: 'm³', price: 460.00, type: SinapiType.COMPOSITION, quantity: 0.024 }
    ]
  },
  { code: '98546', description: 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19CM', unit: 'm²', price: 85.40, type: SinapiType.COMPOSITION, category: 'Alvenaria' },
  { code: '95544', description: 'PINTURA COM TINTA LÁTEX ACRÍLICA EM PAREDES, DUAS DEMÃOS', unit: 'm²', price: 28.90, type: SinapiType.COMPOSITION, category: 'Pintura' },
  { code: '92988', description: 'CABO DE COBRE FLEXÍVEL ISOLADO, 2,5 MM², ANTI-CHAMA', unit: 'm', price: 4.50, type: SinapiType.INPUT, category: 'Elétrica' },
  { code: '93358', description: 'ESCAVAÇÃO MANUAL DE VALA PARA VIGA BALDRAME', unit: 'm³', price: 65.10, type: SinapiType.COMPOSITION, category: 'Fundações' },
  { code: '96541', description: 'ARMADURA DE BLOCO DE FUNDAÇÃO UTILIZANDO AÇO CA-50 DE 10MM', unit: 'kg', price: 14.20, type: SinapiType.COMPOSITION, category: 'Estrutura' },
  { code: '97899', description: 'CONCRETO USINADO BOMBEÁVEL FCK=25MPA', unit: 'm³', price: 480.00, type: SinapiType.INPUT, category: 'Estrutura' },
  { code: '88264', description: 'ELETRICISTA COM ENCARGOS COMPLEMENTARES', unit: 'h', price: 26.50, type: SinapiType.COMPOSITION, category: 'Mão de Obra' },
  { code: '88309', description: 'PEDREIRO COM ENCARGOS COMPLEMENTARES', unit: 'h', price: 25.80, type: SinapiType.COMPOSITION, category: 'Mão de Obra' },
  { code: '88316', description: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unit: 'h', price: 19.40, type: SinapiType.COMPOSITION, category: 'Mão de Obra' }
];

// Base CUB Rates per State (R$/m² - Reference Padrão Normal R8-N)
// ALERT: These values need to be updated to official current rates.
export const BASE_CUB_RATES: Record<string, number> = {
  'AC': 2380.00,
  'AL': 2180.00,
  'AP': 2320.00,
  'AM': 2400.00,
  'BA': 2100.00,
  'CE': 2080.00,
  'DF': 2200.00,
  'ES': 2290.00,
  'GO': 2250.00,
  'MA': 2120.00,
  'MT': 2310.00,
  'MS': 2280.00,
  'MG': 2300.00,
  'PA': 2240.00,
  'PB': 2160.00,
  'PR': 2350.00,
  'PE': 2150.00,
  'PI': 2110.00,
  'RJ': 2550.00,
  'RN': 2140.00,
  'RS': 2580.00,
  'RO': 2270.00,
  'RR': 2390.00,
  'SC': 2600.00,
  'SP': 2450.00,
  'SE': 2130.00,
  'TO': 2220.00
};

// CUB Standards and their cost multipliers relative to R8-N
export const CUB_STANDARDS_DATA: Record<string, { label: string, multiplier: number }> = {
  'R1-B': { label: 'Residência Unifamiliar - Padrão Baixo (R1-B)', multiplier: 0.88 },
  'R1-N': { label: 'Residência Unifamiliar - Padrão Normal (R1-N)', multiplier: 1.09 },
  'R1-A': { label: 'Residência Unifamiliar - Padrão Alto (R1-A)', multiplier: 1.35 },
  'RP1Q': { label: 'Residência Popular (RP1Q)', multiplier: 0.80 },
  'PIS': { label: 'Residência Multifamiliar - Projeto de Interesse Social (PIS)', multiplier: 0.75 },
  'PP-B': { label: 'Prédio Popular - Padrão Baixo (PP-B)', multiplier: 0.85 },
  'PP-N': { label: 'Prédio Popular - Padrão Normal (PP-N)', multiplier: 0.92 },
  'R8-B': { label: 'Residência Multifamiliar - Padrão Baixo (R8-B)', multiplier: 0.82 },
  'R8-N': { label: 'Residência Multifamiliar - Padrão Normal (R8-N)', multiplier: 1.00 },
  'R8-A': { label: 'Residência Multifamiliar - Padrão Alto (R8-A)', multiplier: 1.28 },
  'R16-N': { label: 'Residência Multifamiliar - Padrão Normal (R16-N)', multiplier: 0.98 },
  'R16-A': { label: 'Residência Multifamiliar - Padrão Alto (R16-A)', multiplier: 1.25 },
  'CSL8-N': { label: 'Edificação Comercial - Salas e Lojas - Padrão Normal (CSL8-N)', multiplier: 1.05 },
  'CSL8-A': { label: 'Edificação Comercial - Salas e Lojas - Padrão Alto (CSL8-A)', multiplier: 1.30 },
  'CSL16-N': { label: 'Edificação Comercial - Salas e Lojas - Padrão Normal (CSL16-N)', multiplier: 1.02 },
  'CSL16-A': { label: 'Edificação Comercial - Salas e Lojas - Padrão Alto (CSL16-A)', multiplier: 1.28 },
  'CAL8-N': { label: 'Edificação Comercial - Andares Livres - Padrão Normal (CAL8-N)', multiplier: 1.10 },
  'CAL8-A': { label: 'Edificação Comercial - Andares Livres - Padrão Alto (CAL8-A)', multiplier: 1.40 },
  'GI': { label: 'Galpão Industrial (GI)', multiplier: 0.65 }
};

export const INITIAL_PROJECT_SETTINGS: ProjectSettings = {
  name: 'Residencial Horizonte',
  client: 'Construtora Viver Bem',
  location: 'SP',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: 'SP',
  zipCode: '',
  notes: '',
  standard: 'R8-N',
  cubRate: 2450.00,
  area: 250,
  bdi: 25.0, // 25%
  ls: 86.0, // 86%
  cpuViewMode: 'modal',
  autoSave: true,
  database: 'SINAPI',
  referenceMonth: '01/2025',
  socialChargesMode: 'Com Desoneração',
  classification: 'ORCAMENTO',
  lastCubUpdate: new Date('2024-03-15'),
  customCubRates: {},
  // Default WBS Structure
  wbs: [
    {
      id: '01',
      name: '01. Execução da Obra',
      phases: [
        {
          id: '01.01',
          name: '01.01. Serviços Preliminares',
          subPhases: ['01.01.01. Instalação de Canteiro', '01.01.02. Projetos e Taxas']
        },
        {
          id: '01.02',
          name: '01.02. Estrutura',
          subPhases: ['01.02.01. Fundações', '01.02.02. Superestrutura', '01.02.03. Lajes']
        },
        {
          id: '01.03',
          name: '01.03. Alvenaria e Vedação',
          subPhases: ['01.03.01. Paredes Externas', '01.03.02. Paredes Internas']
        },
        {
          id: '01.04',
          name: '01.04. Acabamentos',
          subPhases: ['01.04.01. Pisos e Revestimentos', '01.04.02. Pintura']
        }
      ]
    }
  ],
  versions: [],
  budgetStatus: 'Em Andamento',
  obraStatus: 'Não Iniciado',
  budgetType: 'ANALYTIC',
  diaryEntries: [],
  financialInfo: {
    totalValue: 0,
    paymentMethod: 'Parcelamento Próprio',
    installments: [],
    webhookUrl: '',
    billingWebhookUrl: '',
    contractWebhookUrl: '',
    transactions: []
  },
  documents: [],

  // Portal Defaults
  obraProgress: 5.4,
  obraPhase: 'Fundação e Subsolo',
  clientDocuments: [
    { name: 'projeto_arquitetonico.pdf', category: 'PDF Original', date: '10/01/2024' },
    { name: 'contrato_prestacao_servicos.pdf', category: 'Documento Jurídico', date: '12/01/2024' },
    { name: 'alvara_obra_prefeitura.pdf', category: 'Documento Técnico', date: '15/01/2024' }
  ],
  investorData: {
    summary: {
      equity: 'R$ 450.000,00',
      monthlyYield: 'R$ 8.420,00',
      activeWorks: 3,
      totalCotas: 12
    },
    performance: [
      { month: 'Jan', yield: 1200, percent: 1.2 },
      { month: 'Fev', yield: 1500, percent: 1.4 },
      { month: 'Mar', yield: 1300, percent: 1.1 },
      { month: 'Abr', yield: 1800, percent: 1.6 },
      { month: 'Mai', yield: 2100, percent: 1.8 },
      { month: 'Jun', yield: 2400, percent: 2.1 }
    ],
    holdings: [
      { name: 'Residencial Sky', cota: '4x', equity: 'R$ 120.000,00', status: 'Em Fundação', yield: '12%', progress: 15 },
      { name: 'Edifício Central', cota: '6x', equity: 'R$ 250.000,00', status: 'Revestimento', yield: '14.5%', progress: 65 }
    ],
    opportunities: [
      { title: 'Moriah Corporate', subtitle: 'Centro empresarial triple A', yield: '18.5%', link: '#' }
    ],
    reports: [
      { name: 'Informe de Rendimentos - 2025', date: '01/02/2026', type: 'PDF' },
      { name: 'Relatório de Performance - Janeiro 2026', date: '05/02/2026', type: 'PDF' }
    ]
  }
};

export const INITIAL_BUDGET: BudgetEntry[] = [
  { id: '1', group: '01. Execução da Obra', phase: '01.01. Serviços Preliminares', subPhase: '01.01.02. Projetos e Taxas', sinapiItem: MOCK_SINAPI_DB[4], quantity: 45 },
  { id: '2', group: '01. Execução da Obra', phase: '01.02. Estrutura', subPhase: '01.02.01. Fundações', sinapiItem: MOCK_SINAPI_DB[6], quantity: 120 },
  { id: '3', group: '01. Execução da Obra', phase: '01.02. Estrutura', subPhase: '01.02.01. Fundações', sinapiItem: MOCK_SINAPI_DB[5], quantity: 2500 },
  { id: '4', group: '01. Execução da Obra', phase: '01.03. Alvenaria e Vedação', subPhase: '01.03.01. Paredes Externas', sinapiItem: MOCK_SINAPI_DB[0], quantity: 850 },
  { id: '5', group: '01. Execução da Obra', phase: '01.04. Acabamentos', subPhase: '01.04.02. Pintura', sinapiItem: MOCK_SINAPI_DB[2], quantity: 1200 },
];

// Parametric Budgeting Weights (Approximate Industry Standards)
// Represents the percentage of the total construction cost for each phase
export const PARAMETRIC_WEIGHTS: Record<string, number> = {
  '01.01.01': 1.5, // Instalação de Canteiro
  '01.01.02': 2.0, // Projetos e Taxas
  '01.02.01': 5.0, // Fundações
  '01.02.02': 14.0, // Superestrutura
  '01.02.03': 3.5, // Lajes
  '01.03.01': 6.0, // Paredes Externas
  '01.03.02': 5.0, // Paredes Internas
  '01.04.01': 10.0, // Pisos e Revestimentos
  '01.04.02': 4.0, // Pintura
  // ... future phases
};
