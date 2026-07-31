import React from 'react';
import { createRoot } from 'react-dom/client';
import { Stage, Layer, Line, Rect, Group } from 'react-konva';

const App = () => {
  const wallThick = 20;
  const dist = 100;
  return (
    <Stage width={400} height={400}>
      <Layer>
        {/* Wall outer */}
        <Line points={[50, 200, 350, 200]} stroke="#1e293b" strokeWidth={wallThick} lineCap="square" />
        {/* Wall inner */}
        <Line points={[50, 200, 350, 200]} stroke="#ffffff" strokeWidth={wallThick - 4} lineCap="square" />
        
        <Group x={150} y={200} rotation={0}>
          {/* Mask */}
          <Line points={[0, 0, dist, 0]} stroke="#f8fafc" strokeWidth={wallThick + 2} />
          {/* Caps */}
          <Line points={[2, -wallThick/2, 2, wallThick/2]} stroke="#475569" strokeWidth={4} />
          <Line points={[dist-2, -wallThick/2, dist-2, wallThick/2]} stroke="#475569" strokeWidth={4} />
          {/* Door leaf */}
          <Line points={[0, 0, 0, -dist]} stroke="#0f172a" strokeWidth={3} />
        </Group>
      </Layer>
    </Stage>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
