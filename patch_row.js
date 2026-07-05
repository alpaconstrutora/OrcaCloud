const fs = require('fs');
let content = fs.readFileSync('components/BudgetRow.tsx', 'utf-8');

if (!content.includes('import { useSortable }')) {
  content = content.replace('import { Layers', "import { useSortable } from '@dnd-kit/sortable';\nimport { CSS } from '@dnd-kit/utilities';\nimport { GripVertical } from 'lucide-react';\nimport { Layers");
}

const exportRegex = /export const BudgetRow: React\.FC<BudgetRowProps> = \(\{\s*([\s\S]*?)\s*\}\) => \{/;
if (!content.includes('const { attributes, listeners')) {
  content = content.replace(exportRegex, `export const BudgetRow: React.FC<BudgetRowProps> = ({
  $1
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };`);
}

if (!content.includes('<div ref={setNodeRef}')) {
  content = content.replace(
    '<div className="border-t border-gray-50 hover:bg-blue-50/20 group">',
    '<div ref={setNodeRef} style={style} className={`border-t border-gray-50 hover:bg-blue-50/20 group ${isDragging ? \'z-50 relative bg-white shadow-xl ring-2 ring-blue-500\' : \'\'}`}>'
  );
}

if (!content.includes('<GripVertical')) {
  content = content.replace(
    '<div className="text-xs font-mono font-black text-gray-400 flex items-center gap-1.5">',
    `                <div className="flex items-center gap-1 pr-1">
                    <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0">
                        <GripVertical className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="text-xs font-mono font-black text-gray-400 flex items-center gap-1.5">`
  );
}

if (content.includes('grid-cols-[0.8fr_')) {
  content = content.replaceAll('grid-cols-[0.8fr_', 'grid-cols-[20px_0.8fr_');
}

fs.writeFileSync('components/BudgetRow.tsx', content, 'utf-8');
console.log('Successfully patched BudgetRow.tsx for Drag and Drop');
