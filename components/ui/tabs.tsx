import React, { createContext, useContext, useState } from 'react'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>')
  return ctx
}

interface TabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ defaultValue = '', value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? value! : internal
  const set = controlled ? (onValueChange ?? (() => {})) : (v: string) => { setInternal(v); onValueChange?.(v) }

  return (
    <TabsContext.Provider value={{ value: current, onValueChange: set }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center bg-gray-100/80 p-1.5 rounded-[1.5rem] backdrop-blur-sm border border-gray-200/50 ${className}`}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string }) {
  const { value: current, onValueChange } = useTabs()
  const active = current === value
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onValueChange(value)}
      className={`px-6 py-2.5 rounded-2xl text-sm font-normal uppercase tracking-widest transition-all duration-300 ${
        active
          ? 'bg-white text-blue-600 shadow-md scale-[1.02]'
          : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string }) {
  const { value: current } = useTabs()
  if (current !== value) return null
  return <div role="tabpanel" className={className}>{children}</div>
}
