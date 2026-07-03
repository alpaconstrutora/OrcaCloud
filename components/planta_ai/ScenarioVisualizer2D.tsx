import React from 'react';

interface GeometryData {
  terrainWidth: number;
  terrainDepth: number;
  buildingWidth: number;
  buildingDepth: number;
  frontSetback: number;
  leftSetback: number;
}

interface Props {
  geometryData?: GeometryData;
}

export default function ScenarioVisualizer2D({ geometryData }: Props) {
  if (!geometryData) {
    return <div className="h-40 bg-gray-100 rounded flex items-center justify-center text-sm text-gray-500">Sem preview</div>;
  }

  const { terrainWidth, terrainDepth, buildingWidth, buildingDepth, frontSetback, leftSetback } = geometryData;

  // Escala para caber num viewBox de 300x300
  const maxDim = Math.max(terrainWidth, terrainDepth) || 1;
  const scale = 200 / maxDim; // Margem
  const widthScaled = terrainWidth * scale;
  const heightScaled = terrainDepth * scale;

  return (
    <div className="w-full flex justify-center bg-gray-50 rounded-t-lg border-b border-gray-200">
      <svg width="100%" height="160" viewBox="-50 -50 300 300" className="max-w-[200px] mt-4">
        {/* Terreno */}
        <rect 
          x={0} 
          y={0} 
          width={widthScaled} 
          height={heightScaled} 
          fill="#e5e7eb" 
          stroke="#9ca3af" 
          strokeWidth="2" 
        />
        
        {/* Building Footprint */}
        <rect 
          x={leftSetback * scale} 
          y={frontSetback * scale} 
          width={buildingWidth * scale} 
          height={buildingDepth * scale} 
          fill="#6366f1" 
          fillOpacity="0.8"
          stroke="#4f46e5" 
          strokeWidth="2" 
        />
        
        {/* Texts */}
        <text x={widthScaled / 2} y="-15" textAnchor="middle" fontSize="16" fill="#6b7280" fontWeight="bold">Rua</text>
      </svg>
    </div>
  );
}
