import React from 'react';
import { Line, Text, Group } from 'react-konva';
import { OpuraElectricalConduit, OpuraElectricalPoint } from '../../types/electrical';

interface ConduitRendererProps {
  conduit: OpuraElectricalConduit;
  points: OpuraElectricalPoint[];
  isSelected: boolean;
  onSelect: (e: any) => void;
  scaleFactor: number;
}

export default function ConduitRenderer({ conduit, points, isSelected, onSelect, scaleFactor }: ConduitRendererProps) {
  const source = points.find(p => p.id === conduit.sourceId);
  const target = points.find(p => p.id === conduit.targetId);

  if (!source || !target || source.canvasX == null || source.canvasY == null || target.canvasX == null || target.canvasY == null) {
    return null;
  }

  const sx = source.canvasX * scaleFactor;
  const sy = source.canvasY * scaleFactor;
  const tx = target.canvasX * scaleFactor;
  const ty = target.canvasY * scaleFactor;

  // Calculate curve
  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return null;

  const nx = -dy / length;
  const ny = dx / length;
  
  // Offset to make it a slight curve. Alternate side based on some deterministic value if needed, 
  // but let's just use positive offset for now.
  const offset = length * 0.15; 
  const cx = sx + dx / 2 + nx * offset;
  const cy = sy + dy / 2 + ny * offset;

  // Style based on type
  const isDashed = conduit.type === 'parede';
  const isDotted = conduit.type === 'piso';
  const strokeColor = isSelected ? '#3b82f6' : '#64748b'; // blue if selected, slate otherwise
  
  // Wire symbols logic
  const renderWires = () => {
    // Find midpoint of the curve (approximate using quadratic bezier formula for t=0.5)
    // B(t) = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
    // For t=0.5 -> 0.25*P0 + 0.5*P1 + 0.25*P2
    const midX = 0.25 * sx + 0.5 * cx + 0.25 * tx;
    const midY = 0.25 * sy + 0.5 * cy + 0.25 * ty;

    // Derivative at t=0.5 to find tangent angle
    // B'(t) = 2*(1-t)*(P1-P0) + 2*t*(P2-P1)
    // B'(0.5) = (P1-P0) + (P2-P1) = P2 - P0
    const dX = tx - sx;
    const dY = ty - sy;
    let angle = Math.atan2(dY, dX) * (180 / Math.PI);
    
    // We want the strokes to be perpendicular to the tangent
    const perpAngle = angle + 90;

    const elements: React.ReactNode[] = [];
    const SYMBOL_GAP = 12; // Gap between symbols along the curve
    
    // Count total symbols to center them
    let totalSymbols = 0;
    conduit.wires.forEach(w => {
      totalSymbols += (w.phase || 0) + (w.neutral || 0) + (w.ground || 0) + (w.returns?.length || 0);
    });

    if (totalSymbols === 0) return null;

    const startOffset = -((totalSymbols - 1) * SYMBOL_GAP) / 2;
    let currentIndex = 0;

    const addSymbol = (type: string, label: string) => {
      // Calculate position along the tangent near the midpoint
      const tOffsetX = Math.cos(angle * Math.PI / 180) * (startOffset + currentIndex * SYMBOL_GAP);
      const tOffsetY = Math.sin(angle * Math.PI / 180) * (startOffset + currentIndex * SYMBOL_GAP);
      const posX = midX + tOffsetX;
      const posY = midY + tOffsetY;

      // Draw stroke
      const length = 16;
      const halfLen = length / 2;
      
      let points: number[] = [];
      if (type === 'fase') {
        points = [0, -halfLen, 0, halfLen]; // Straight line
      } else if (type === 'neutro') {
        points = [0, -halfLen, 0, halfLen, -halfLen/2, halfLen]; // L shape
      } else if (type === 'retorno') {
        points = [0, 0, 0, halfLen]; // Half line
      } else if (type === 'terra') {
        points = [0, -halfLen, 0, halfLen, -halfLen/2, -halfLen, halfLen/2, -halfLen]; // T shape
      }

      elements.push(
        <Group key={`${type}-${currentIndex}`} x={posX} y={posY} rotation={perpAngle}>
          <Line
            points={points}
            stroke={strokeColor}
            strokeWidth={1.5}
            lineCap="round"
            lineJoin="round"
          />
          {label && (
            <Text
              text={label}
              fontSize={10}
              fill={strokeColor}
              x={6}
              y={-12}
              rotation={-perpAngle} // Keep text horizontal? Or follow angle? Let's keep it un-rotated relative to screen
            />
          )}
        </Group>
      );
      
      currentIndex++;
    };

    conduit.wires.forEach(w => {
      for(let i=0; i<(w.phase||0); i++) addSymbol('fase', i===0 ? w.circuit : '');
      for(let i=0; i<(w.neutral||0); i++) addSymbol('neutro', '');
      w.returns?.forEach((ret, i) => addSymbol('retorno', ret));
      for(let i=0; i<(w.ground||0); i++) addSymbol('terra', '');
    });

    return elements;
  };

  return (
    <Group 
      onClick={onSelect}
      onTap={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <Line
        points={[sx, sy, cx, cy, tx, ty]}
        tension={0.5}
        stroke={strokeColor}
        strokeWidth={2}
        dash={isDashed ? [5, 5] : isDotted ? [2, 4] : []}
        hitStrokeWidth={15} // Make it easier to click
        lineCap="round"
      />
      {renderWires()}
    </Group>
  );
}
