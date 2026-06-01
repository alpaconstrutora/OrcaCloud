/**
 * Diagrama técnico de armadura — padrão prancha estrutural brasileira.
 * Linha de cota com setas, traço de barra em escala esquemática, fundo de
 * desenho técnico. Zero dependência externa.
 */
import React from 'react'

// ── Paleta por bitola ────────────────────────────────────────────────────────
const BITOLA_COLORS: [number, string][] = [
  [5,    '#2563EB'], // CA-60 Ø5  — azul
  [6.3,  '#16A34A'], // Ø6.3      — verde
  [8,    '#0D9488'], // Ø8        — teal
  [10,   '#D97706'], // Ø10       — âmbar
  [12.5, '#DC2626'], // Ø12.5     — vermelho
  [16,   '#7C3AED'], // Ø16       — violeta
  [20,   '#EA580C'], // Ø20       — laranja
]
function bitolaColor(mm: number): string {
  for (const [limit, color] of BITOLA_COLORS) if (mm <= limit) return color
  return '#DB2777' // Ø25+ — pink
}

// ── Seta de cota ─────────────────────────────────────────────────────────────
// Ponta de flecha horizontal para linha de cota (direção: 1 = direita, -1 = esquerda)
function Arrow({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  const d = dir * 5
  return <polygon points={`${x},${y} ${x + d},${y - 2.5} ${x + d},${y + 2.5}`} fill="#94A3B8" />
}

// Linha de cota horizontal completa com extensões verticais
function HorizDim({
  x1, x2, y,        // linha de cota
  barY,             // Y da barra (linha de extensão sobe até aqui)
  label,
}: {
  x1: number; x2: number; y: number; barY: number; label: string
}) {
  const mid = (x1 + x2) / 2
  return (
    <g>
      {/* Linha de extensão esquerda */}
      <line x1={x1} y1={barY + 2} x2={x1} y2={y + 1} stroke="#94A3B8" strokeWidth="0.75" strokeDasharray="2,1.5" />
      {/* Linha de extensão direita */}
      <line x1={x2} y1={barY + 2} x2={x2} y2={y + 1} stroke="#94A3B8" strokeWidth="0.75" strokeDasharray="2,1.5" />
      {/* Linha de cota */}
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#94A3B8" strokeWidth="0.9" />
      <Arrow x={x1} y={y} dir={1} />
      <Arrow x={x2} y={y} dir={-1} />
      {/* Texto da cota */}
      <text x={mid} y={y - 3} textAnchor="middle" fontSize="8" fill="#475569"
        fontFamily="ui-monospace,SFMono-Regular,monospace" fontWeight="700">
        {label}
      </text>
    </g>
  )
}

// ── Shapes ───────────────────────────────────────────────────────────────────

const VW = 130
const VH = 72
const PAD = 8       // margem interna
const BAR_SW = 3.5  // espessura da barra

// label de comprimento formatado (sem casas desnecessárias)
function fmtCm(cm: number) {
  return cm % 1 === 0 ? `${cm} cm` : `${cm.toFixed(1)} cm`
}

interface ShapeProps { color: string; label: string }

function Reta({ color, label }: ShapeProps) {
  const y = 28
  return (
    <>
      <line x1={PAD} y1={y} x2={VW - PAD} y2={y}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <HorizDim x1={PAD} x2={VW - PAD} y={y + 22} barY={y} label={label} />
    </>
  )
}

function ShapeL({ color, label }: ShapeProps) {
  const xLeft = 22; const yTop = PAD + 2; const yBot = 48; const xRight = VW - PAD
  return (
    <>
      <polyline points={`${xLeft},${yTop} ${xLeft},${yBot} ${xRight},${yBot}`}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <HorizDim x1={xLeft} x2={xRight} y={yBot + 16} barY={yBot} label={label} />
    </>
  )
}

function ShapeU({ color, label }: ShapeProps) {
  const xL = PAD; const xR = VW - PAD; const yTop = PAD + 4; const yBot = 46
  return (
    <>
      <polyline points={`${xL},${yTop} ${xL},${yBot} ${xR},${yBot} ${xR},${yTop}`}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <HorizDim x1={xL} x2={xR} y={yBot + 16} barY={yBot} label={label} />
    </>
  )
}

function EstriboClosed({ color, label }: ShapeProps) {
  const xL = PAD + 6; const xR = VW - PAD - 6
  const yTop = PAD + 8; const yBot = 46
  // Ganchos a 135° internos (pontas dobradas para dentro/baixo)
  const hookLen = 9
  const hx1 = xL + hookLen * 0.7; const hy1 = yTop + hookLen * 0.7
  const hx2 = xR - hookLen * 0.7; const hy2 = yTop + hookLen * 0.7
  return (
    <>
      {/* Retângulo */}
      <rect x={xL} y={yTop} width={xR - xL} height={yBot - yTop}
        stroke={color} strokeWidth={BAR_SW} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Ganchos 135° */}
      <line x1={xL} y1={yTop} x2={hx1} y2={hy1}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <line x1={xR} y1={yTop} x2={hx2} y2={hy2}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <HorizDim x1={xL} x2={xR} y={yBot + 16} barY={yBot} label={label} />
    </>
  )
}

function EstriboOpen({ color, label }: ShapeProps) {
  const xL = PAD; const xR = VW - PAD
  const yTop = PAD + 6; const yBot = 46
  const hookLen = 9
  return (
    <>
      <polyline points={`${xL},${yTop} ${xL},${yBot} ${xR},${yBot} ${xR},${yTop}`}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Ganchos nas pontas superiores */}
      <line x1={xL} y1={yTop} x2={xL + hookLen * 0.7} y2={yTop + hookLen * 0.7}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <line x1={xR} y1={yTop} x2={xR - hookLen * 0.7} y2={yTop + hookLen * 0.7}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <HorizDim x1={xL} x2={xR} y={yBot + 16} barY={yBot} label={label} />
    </>
  )
}

function Gancho({ color, label }: ShapeProps) {
  const y = 30; const xL = PAD; const xR = VW - PAD - 10
  // Gancho 135° na ponta direita
  const hLen = 14
  const hx = xR - hLen * 0.7; const hy = y - hLen * 0.7
  return (
    <>
      <line x1={xL} y1={y} x2={xR} y2={y}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <line x1={xR} y1={y} x2={hx} y2={hy}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" />
      <HorizDim x1={xL} x2={xR} y={y + 24} barY={y} label={label} />
    </>
  )
}

function Unknown({ color, label }: ShapeProps) {
  const y = 28
  return (
    <>
      <line x1={PAD} y1={y} x2={VW - PAD} y2={y}
        stroke={color} strokeWidth={BAR_SW} strokeLinecap="round" strokeDasharray="6,3" />
      <text x={VW / 2} y={y + 18} textAnchor="middle" fontSize="8" fill="#94A3B8"
        fontFamily="ui-monospace,monospace">{label}</text>
    </>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

interface Props {
  formato: string
  comprimentoCm: number
  bitolaMm: number
  size?: number
}

export const RebarShapeSvg: React.FC<Props> = ({
  formato, comprimentoCm, bitolaMm, size = 110,
}) => {
  const color = bitolaColor(bitolaMm)
  const label = fmtCm(comprimentoCm)

  const shapeProps: ShapeProps = { color, label }

  let shape: React.ReactNode
  switch (formato) {
    case 'reta':            shape = <Reta {...shapeProps} />;          break
    case 'L':               shape = <ShapeL {...shapeProps} />;        break
    case 'U':               shape = <ShapeU {...shapeProps} />;        break
    case 'estribo_fechado': shape = <EstriboClosed {...shapeProps} />; break
    case 'estribo_aberto':  shape = <EstriboOpen {...shapeProps} />;   break
    case 'gancho':          shape = <Gancho {...shapeProps} />;        break
    default:                shape = <Unknown {...shapeProps} />;       break
  }

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width={size}
      height={Math.round(size * VH / VW)}
      className="block"
      aria-label={`${formato} — ${label}`}
    >
      {/* Fundo de desenho técnico */}
      <rect width={VW} height={VH} rx="3" fill="#F8FAFC" />
      <rect width={VW} height={VH} rx="3" fill="none" stroke="#E2E8F0" strokeWidth="0.75" />
      {shape}
    </svg>
  )
}

export default RebarShapeSvg
