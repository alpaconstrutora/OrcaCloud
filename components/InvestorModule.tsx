import React, { Suspense, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { ProjectSettings, BudgetEntry } from '../types'
import type { Investor } from '../services/investorService'

const InvestorList      = React.lazy(() => import('./InvestorList'))
const InvestorDashboard = React.lazy(() => import('./InvestorDashboard'))

interface Props {
  organizationId?: string
  profile: { group: string; role: string; email?: string }
  settings: ProjectSettings
  budget?: BudgetEntry[]
}

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
)

const InvestorModule: React.FC<Props> = ({ organizationId, profile, settings, budget = [] }) => {
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null)

  if (selectedInvestor) {
    return (
      <div className="space-y-0">
        <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-100">
          <button
            onClick={() => setSelectedInvestor(null)}
            className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-blue-600 uppercase tracking-widest transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Meus Investidores
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-xs font-black text-blue-700 uppercase tracking-widest">{selectedInvestor.name}</span>
        </div>
        <Suspense fallback={<Spinner />}>
          <InvestorDashboard
            settings={settings}
            organizationId={organizationId}
            budget={budget}
            profile={profile}
            investorProfile={selectedInvestor}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <Suspense fallback={<Spinner />}>
      <InvestorList
        organizationId={organizationId}
        onSelectInvestor={setSelectedInvestor}
      />
    </Suspense>
  )
}

export default InvestorModule
