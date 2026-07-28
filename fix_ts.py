import re

with open('components/electrical/ElectricalEditorView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the tool type definition
old_type = "type Tool = 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect';"
new_type = "type Tool = 'select' | 'draw_room' | 'add_point' | 'calibrate' | 'draw_wall' | 'draw_wall_rect' | 'draw_wall_l' | 'draw_wall_u' | 'draw_wall_t';"
content = content.replace(old_type, new_type)

# 2. Fix the remaining finishWallRect reference
# Let's just find and replace finishWallRect with finishWallShape globally (since we already replaced the definition)
content = content.replace("finishWallRect(", "finishWallShape(tool, ")

with open('components/electrical/ElectricalEditorView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
