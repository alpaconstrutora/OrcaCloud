const fs = require('fs');
const path = 'components/OpuraDocsModule.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /const docsInFolder = filteredDocuments\.filter\(d => d\.folder_id === folder\.id\);\s*openShareModal\(docsInFolder\.map\(d => d\.id\)\);/m,
  `let folderDocs = documents.filter(d => d.folder_id === folder.id);
                if (folderDocs.length === 0) {
                  documentService.listDocuments(activeOrganizationId || undefined, { folderId: folder.id }).then(data => {
                    openShareModal(data.map(d => d.id));
                  }).catch(console.error);
                } else {
                  openShareModal(folderDocs.map(d => d.id));
                }`
);

content = content.replace(
  /const docsInDisc = filteredDocuments\.filter\(d => d\.folder_id === folder\.id &&[^{]*\);\s*openShareModal\(docsInDisc\.map\(d => d\.id\)\);/m,
  `let folderDocs = documents.filter(d => d.folder_id === folder.id);
                        const filterDisc = (docs: OpuraDocument[]) => docs.filter(d => 
                          (extractTokenFromFileName(d.nome, folder.naming_mask || '', '[DISCIPLINA]')?.toUpperCase() === disc.code.toUpperCase() || d.nome.toUpperCase().includes(disc.code.toUpperCase()))
                        );
                        if (folderDocs.length === 0) {
                          documentService.listDocuments(activeOrganizationId || undefined, { folderId: folder.id }).then(data => {
                            openShareModal(filterDisc(data).map(d => d.id));
                          }).catch(console.error);
                        } else {
                          openShareModal(filterDisc(folderDocs).map(d => d.id));
                        }`
);

fs.writeFileSync(path, content, 'utf8');
console.log("[OK] Scripts replaced via regex");
