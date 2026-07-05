const fs = require('fs');
let content = fs.readFileSync('components/BudgetEditor.tsx', 'utf-8');

if (!content.includes('import { DndContext')) {
  content = content.replace(
    "import { BudgetRow } from './BudgetRow';",
    "import { BudgetRow } from './BudgetRow';\nimport { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';\nimport { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';"
  );
}

if (!content.includes('const sensors = useSensors(')) {
  content = content.replace(
    'const [hasCPUChanges, setHasCPUChanges] = React.useState(false);',
    `const [hasCPUChanges, setHasCPUChanges] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = budget.findIndex((item) => item.id === active.id);
      const newIndex = budget.findIndex((item) => item.id === over?.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onUpdateBudget(arrayMove(budget, oldIndex, newIndex));
      }
    }
  };`
  );
}

if (!content.includes('<DndContext sensors={sensors}')) {
  // We should wrap the main div of the editor with DndContext
  // The first large wrapper div after return (
  content = content.replace(
    '<div className="h-full flex flex-col bg-white">',
    '<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>\n    <div className="h-full flex flex-col bg-white">'
  );
  content = content.replace(
    '  );\n};\n\nexport default BudgetEditor;',
    '      </DndContext>\n  );\n};\n\nexport default BudgetEditor;'
  );
}

if (!content.includes('<SortableContext items={items.map(i => i.id)}')) {
  // Wrap items mapping inside SubPhase
  content = content.replace(
    '{items.map((item, itemIndex) => (\\n\\s*<BudgetRow',
    '<SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>\n                                  {items.map((item, itemIndex) => (\n                                    <BudgetRow'
  );

  // We need to match the correct replacement without escaping hell
}

fs.writeFileSync('components/BudgetEditor_DndPatch.cjs', `
const fs = require('fs');
let content = fs.readFileSync('components/BudgetEditor.tsx', 'utf-8');

if (!content.includes('<SortableContext items={items.map(i => i.id)}')) {
  content = content.replace(
    /\{items\\.map\\(\\(item, itemIndex\\) => \\([\\s\\S]*?<BudgetRow/,
    '<SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>\\n                                  {items.map((item, itemIndex) => (\\n                                    <BudgetRow'
  );
  
  content = content.replace(
    /<BudgetRow[\\s\\S]*?\\/>[\\s\\S]*?\\)\\)[\\s\\S]*?<\\/div>/,
    (match) => {
       const replacement = match.replace(/\\)\\)$/, ')))}\\n                                  </SortableContext>');
       return replacement;
    }
  );
  // Manual string replacement since regex for closing is hard
  content = content.replace(
    'natureBreakdown={showNatureBreakdown ? getNatureBreakdown(item) : undefined}\n                                    />\n                                  ))\n                                )}',
    'natureBreakdown={showNatureBreakdown ? getNatureBreakdown(item) : undefined}\n                                    />\n                                  ))\n                                )} </SortableContext>'
  );
}
fs.writeFileSync('components/BudgetEditor.tsx', content, 'utf-8');
console.log('Successfully patched SortableContext in BudgetEditor');
`);

fs.writeFileSync('components/BudgetEditor.tsx', content, 'utf-8');
console.log('Successfully patched BudgetEditor.tsx for Drag and Drop');
