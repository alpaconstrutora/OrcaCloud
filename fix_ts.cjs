const fs = require('fs');
const path = 'components/OpuraDocsModule.tsx';
let content = fs.readFileSync(path, 'utf8');
let modified = false;

// Fix 1: import supabase
if (!content.includes("import { supabase }")) {
    content = content.replace("import { partnerService } from '../services/partnerService';", "import { partnerService } from '../services/partnerService';\nimport { supabase } from '../lib/supabase';");
    modified = true;
}

// Fix 2: extractDiscipline
const searchDisc = "extractDiscipline(d.nome) === disc.code";
const replaceDisc = "(extractTokenFromFileName(d.nome, folder.naming_mask || '', '[DISCIPLINA]')?.toUpperCase() === disc.code.toUpperCase() || d.nome.toUpperCase().includes(disc.code.toUpperCase()))";
if (content.includes(searchDisc)) {
    content = content.replace(searchDisc, replaceDisc);
    modified = true;
}

// Fix 3: setShareDocId(null) to setShareDocIds([]) where missed
const searchOldSet = "setShareDocId(null);";
const replaceOldSet = "setShareDocIds([]);";
if (content.includes(searchOldSet)) {
    content = content.replace(new RegExp(searchOldSet.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&'), 'g'), replaceOldSet);
    modified = true;
}

if (modified) {
    fs.writeFileSync(path, content, 'utf8');
    console.log("[OK] Fixed TS errors");
} else {
    console.log("[FAIL] No changes made");
}
