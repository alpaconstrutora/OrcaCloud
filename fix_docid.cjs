const fs = require('fs');
const path = 'components/OpuraDocsModule.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /const sharings = await partnerService\.listSharingsForDocument\(docId\);/m;
const replace = `if (docIds.length === 1) {
          const sharings = await partnerService.listSharingsForDocument(docIds[0]);
          setDocAlreadySharedWith(sharings);
        }`;

if (regex.test(content)) {
    // We also need to replace the setDocAlreadySharedWith(sharings) after it if we wrap it in if
    content = content.replace(/const sharings = await partnerService\.listSharingsForDocument\(docId\);\s*setDocAlreadySharedWith\(sharings\);/m, replace);
    fs.writeFileSync(path, content, 'utf8');
    console.log("[OK] docId fixed via regex");
} else {
    console.log("[FAIL] docId regex not found");
}
