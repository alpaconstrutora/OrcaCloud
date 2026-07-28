with open('types/electrical.ts', 'a', encoding='utf-8') as f:
    f.write('''

export interface OpuraElectricalElement {
    id: string;
    organizationId: string;
    planId: string;
    type: string;
    points: any;
    properties?: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}
''')

import re
with open('services/electricalProjectService.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("OpuraElectricalWall,", "OpuraElectricalWall,\n  OpuraElectricalElement,")
with open('services/electricalProjectService.ts', 'w', encoding='utf-8') as f:
    f.write(content)

with open('components/electrical/ElectricalEditorView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
if "import { Stage, Layer, Image, Line, Circle as KonvaCircle, Group, Arc, Rect } from 'react-konva';" not in content:
    content = content.replace("import { Stage, Layer, Image, Line, Circle as KonvaCircle, Group } from 'react-konva';", "import { Stage, Layer, Image, Line, Circle as KonvaCircle, Group, Arc, Rect } from 'react-konva';")
    content = content.replace("import { Stage, Layer, Image, Line, Circle as KonvaCircle, Group, Rect } from 'react-konva';", "import { Stage, Layer, Image, Line, Circle as KonvaCircle, Group, Rect, Arc } from 'react-konva';")

with open('components/electrical/ElectricalEditorView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

with open('components/electrical/PointToolbox.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r"tool: 'select' \|.*?=> void;", "tool: string;\n    setTool: (tool: any) => void;", content, flags=re.DOTALL)
with open('components/electrical/PointToolbox.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
