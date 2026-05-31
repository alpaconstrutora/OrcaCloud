/**
 * Diagrama esquemático 2D de uma armadura (barra ou estribo).
 * Renderiza a forma a partir de `formato_dobra` + comprimento desenvolvido.
 * Zero dependência externa — SVG puro.
 *
 * Formatos suportados: reta | L | U | estribo_fechado | estribo_aberto | gancho
 * Cor automática por bitola (código de cores de prancha de armação).
 */
import React from 'react'

// ── Paleta por bitola (convenção visual de pranchas) ────────────────────────

const BITOLA_COLORS: [number, string][] = [
  [5,    '#3B82F6'], // blue-500   — CA-60 Ø5
  [6.3,  '#22C55E'], // green-500  — Ø6.3
  [8,    '#14B8A6'], // teal-500   — Ø8
  [10,   '#F59E0B'], // amber-500  — Ø10
  [12.5, '#EF4444'], // red-500    — Ø12.5
  [16,   '#8B5CF6'], // violet-500 — Ø16
  [20,   '#F97316'], // orange-500 — Ø20
]

function bitolaColor(mm: number): string {
  for (const [limit, color] of BITOLA_COLORS) {
    if (mm <= limit) return color
  }
  return '#EC4899' // pink-500 — Ø25+
}

// ── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  formato: string
  comprimentoCm: number
  bitolaMm: number
  /** Largura renderizada em px (altura calculada pela proporção do viewBox). */
  size?: number
}

// ── Constantes do viewBox ───────────────────────────────────────────────────

const VW = 90   // largura do viewBox
const VH = 52   // altura do viewBox
const SW = 2.5  // stroke-width
const LABEL_Y = 49

// ── Utilitário de props de traço ─────────────────────────────────────────────

const lp = (color: string): React.SVGProps<SVGPolylineElement> => ({
  stroke: color,
  strokeWidth: SW,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
})

// ── Formas ──────────────────────────────────────────────────────────────────

function Reta({ color }: { color: string }) {
  return <polyline points="4,22 86,22" {...lp(color)} />
}

function ShapeL({ color }: { color: string }) {
  return <polyline points="18,4 18,36 86,36" {...lp(color)} />
}

function ShapeU({ color }: { color: string }) {
  return <polyline points="4,4 4,36 86,36 86,4" {...lp(color)} />
}

function EstriboClosed({ color }: { color: string }) {
  return (
    <>
      {/* Retângulo do estribo */}
      <polyline points="4,12 86,12 86,38 4,38 4,12" {...lp(color)} />
      {/* Ganchos a 135° dobrando para dentro no topo */}
      <polyline points="4,12 14,24"  {...lp(color)} />
      <polyline points="86,12 76,24" {...lp(color)} />
    </>
  )
}

function EstriboOpen({ color }: { color: string }) {
  return (
    <>
      {/* U aberto */}
      <polyline points="4,4 4,38 86,38 86,4" {...lp(color)} />
      {/* Ganchos nas extremidades superiores */}
      <polyline points="4,4  16,14" {...lp(color)} />
      <polyline points="86,4 74,14" {...lp(color)} />
    </>
  )
}

function Gancho({ color }: { color: string }) {
  return (
    <>
      {/* Barra + gancho 135° na ponta direita */}
      <polyline points="4,24 72,24"   {...lp(color)} />
      <polyline points="72,24 60,8"   {...lp(color)} />
    </>
  )
}

function Unknown({ color }: { color: string }) {
  return (
    <polyline
      points="4,22 86,22"
      stroke={color}
      strokeWidth={SW}
      strokeDasharray="6 3"
      strokeLinecap="round"
      fill="none"
    />
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export const RebarShapeSvg: React.FC<Props> = ({
  formato,
  comprimentoCm,
  bitolaMm,
  size = 80,
}) => {
  const color = bitolaColor(bitolaMm)
  const label = `C=${comprimentoCm.toFixed(1)}`

  let shape: React.ReactNode
  switch (formato) {
    case 'reta':           shape = <Reta color={color} />;          break
    case 'L':              shape = <ShapeL color={color} />;        break
    case 'U':              shape = <ShapeU color={color} />;        break
    case 'estribo_fechado': shape = <EstriboClosed color={color} />; break
    case 'estribo_aberto': shape = <EstriboOpen color={color} />;   break
    case 'gancho':         shape = <Gancho color={color} />;        break
    default:               shape = <Unknown color={color} />;       break
  }

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width={size}
      height={Math.round(size * VH / VW)}
      className="block"
      aria-label={`${formato} — ${label} cm`}
    >
      {shape}
      <text
        x={VW / 2}
        y={LABEL_Y}
        textAnchor="middle"
        fontSize="9"
        fill="#64748B"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fontWeight="600"
      >
        {label}
      </text>
    </svg>
  )
}

export default RebarShapeSvg
