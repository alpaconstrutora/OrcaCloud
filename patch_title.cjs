const fs = require('fs');
const path = 'components/OpuraDocsModule.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /<h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Compartilhar com Parceiro<\/h3>\s*<\/div>\s*<button\s*onClick=\{[^}]*setShareModalOpen\(false\);\s*setShareDocId\(null\);\s*\}\}/m;

const replace = `<h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">
                    Compartilhar com Parceiro {shareDocIds.length > 1 && \`(\${shareDocIds.length} arquivos)\`}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShareModalOpen(false);
                    setShareDocIds([]);
                  }}`;

if (regex.test(content)) {
    content = content.replace(regex, replace);
    fs.writeFileSync(path, content, 'utf8');
    console.log("[OK] Modal title patched");
} else {
    console.log("[FAIL] Modal title not found");
}
