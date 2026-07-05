import fs from 'fs';
import path from 'path';

const componentsDir = 'c:/D/ORÇACLOUD/orçacloud-saas/components';

function scanDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (fullPath.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allTsxFiles = scanDirectory(componentsDir);

let totalFilesWithTable = 0;
let filesUsingTableUtils = 0;
let filesWithNativeTable = 0;
let filesWithDivAsTable = 0;

const tableFiles = [];

for (const file of allTsxFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let hasNativeTable = content.includes('<table');
  let hasTableUtils = content.includes('TableUtils') || content.includes('SortableHeader') || content.includes('useTableColumns');
  let hasDivGrid = content.includes('className="grid') && (content.includes('grid-cols') || content.includes('table'));
  
  if (hasNativeTable || hasTableUtils || hasDivGrid) {
    tableFiles.push({
      file: path.basename(file),
      hasNativeTable,
      hasTableUtils,
      hasDivGrid
    });
    
    if (hasNativeTable) filesWithNativeTable++;
    if (hasTableUtils) filesUsingTableUtils++;
    if (hasDivGrid) filesWithDivAsTable++;
  }
}

console.log(JSON.stringify({
  totalAnalyzed: allTsxFiles.length,
  totalFilesWithTable: tableFiles.length,
  filesWithNativeTable,
  filesUsingTableUtils,
  filesWithDivAsTable,
  details: tableFiles
}, null, 2));
