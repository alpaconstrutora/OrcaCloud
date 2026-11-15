import React, { Suspense, useState } from 'react'
import { BarChart3, TrendingUp, BookOpen, Construction, Building2, BookMarked } from 'lucide-react'
import { TabsBar } from './ui/TabsBar'
import { useOrgContext } from '../hooks/useOrgContext'
import { useEscopoControladoria } from './controladoria/escopo'

const DREReport                  = React.lazy(() => import('./DREReport'))
const CashFlowDashboard          = React.lazy(() => import('./CashFlowDashboard'))
const BalanceteReport            = React.lazy(() => import('./BalanceteReport'))
const WIPReport                  = React.lazy(() => import('./WIPReport'))
const DRESPEReport               = React.lazy(() => import('./DRESPEReport'))
const DiarioReport               = React.lazy(() => import('./DiarioReport'))

export type { ControladoriaTab } from '../constants/controladoríaTabs'
export { VIEW_TO_CONTROLADORIA_TAB } from '../constants/controladoríaTabs'
import type { ControladoriaTab } from '../constants/controladoríaTabs'

interface Props {
    defaultTab?: ControladoriaTab
}

// Ordem das abas = ordem de leitura de uma controladoria: resultado → por empresa →
// obras em andamento → contas → caixa → lançamentos.
const TABS: Array<{ id: ControladoriaTab; label: string; icon: React.ElementType }> = [
    { id: 'dre',       label: 'DRE',             icon: BarChart3    },
    { id: 'dre_spe',   label: 'DRE por SPE',     icon: Building2    },
    { id: 'wip',       label: 'WIP',             icon: Construction },
    { id: 'balancete', label: 'Balancete',       icon: BookOpen     },
    { id: 'fluxo',     label: 'Fluxo de caixa',  icon: TrendingUp   },
    { id: 'diario',    label: 'Diário contábil', icon: BookMarked   },
]

// Título e subtítulo mudam com a aba (guia §19.1/§20): a aba troca o assunto
// inteiro, e um <h1> fixo mentiria. Antes três abas não tinham título nenhum.
const CABECALHO: Record<ControladoriaTab, { titulo: string; subtitulo: string }> = {
    dre:       { titulo: 'DRE',             subtitulo: 'Demonstrativo de resultado do período: receita, custos, despesas e resultado.' },
    dre_spe:   { titulo: 'DRE por SPE',     subtitulo: 'O resultado de cada empresa (SPE), lado a lado, pelas obras ligadas a ela.' },
    wip:       { titulo: 'WIP',             subtitulo: 'Obras em andamento: recebido, pago e saldo de contrato até a data escolhida.' },
    balancete: { titulo: 'Balancete',       subtitulo: 'Créditos, débitos e saldo de cada conta do plano no período.' },
    fluxo:     { titulo: 'Fluxo de caixa',  subtitulo: 'Entradas e saídas realizadas e previstas no período.' },
    diario:    { titulo: 'Diário contábil', subtitulo: 'Lançamentos em partida dobrada gerados automaticamente.' },
}

const Carregando = () => (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Carregando">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
)

/**
 * Controladoria: título da aba → abas → [aba: barra de escopo → KPIs → tabela].
 * O escopo (período, regime, obra) é UM para as seis abas e vive aqui; cada aba
 * desenha a mesma barra (BarraDeEscopo) com os próprios extras à direita — o
 * `chromeSlot` do guia §19.4, com o estado no pai.
 *
 * A organização vem do topo (useOrgContext, REGRA #5), não de prop.
 */
const ControladoriaModule: React.FC<Props> = ({ defaultTab = 'dre' }) => {
    const [activeTab, setActiveTab] = useState<ControladoriaTab>(defaultTab)
    const { orgId } = useOrgContext()
    const escopo = useEscopoControladoria(orgId)
    const { titulo, subtitulo } = CABECALHO[activeTab]

    const props = { organizationId: orgId, escopo }

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{titulo}</h1>
                <p className="text-gray-500 text-sm mt-1.5 font-medium">{subtitulo}</p>
            </div>

            <TabsBar
                tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: <t.icon className="w-3.5 h-3.5" aria-hidden="true" /> }))}
                value={activeTab}
                onChange={setActiveTab}
            />

            <div role="tabpanel" aria-label={titulo}>
                <Suspense fallback={<Carregando />}>
                    {activeTab === 'dre'       && <DREReport {...props} />}
                    {activeTab === 'dre_spe'   && <DRESPEReport {...props} />}
                    {activeTab === 'wip'       && <WIPReport {...props} onVerDREDaObra={id => { escopo.setObra(id); setActiveTab('dre') }} />}
                    {activeTab === 'balancete' && <BalanceteReport {...props} />}
                    {activeTab === 'fluxo'     && <CashFlowDashboard {...props} />}
                    {activeTab === 'diario'    && <DiarioReport {...props} />}
                </Suspense>
            </div>
        </div>
    )
}

export default ControladoriaModule
