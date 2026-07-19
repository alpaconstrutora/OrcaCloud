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
      className={`flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full ${className}`}
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
      className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
        active
          ? 'bg-white text-blue-600 shadow-sm'
          : 'text-gray-400 hover:text-gray-600'
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
