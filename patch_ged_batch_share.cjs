const fs = require('fs');
const path = 'components/OpuraDocsModule.tsx';
let content = fs.readFileSync(path, 'utf8');
let modified = false;

function replaceSafe(search, replace, tag) {
    if (content.includes(search)) {
        content = content.replace(search, replace);
        console.log("[OK] " + tag);
        modified = true;
    } else {
        console.log("[FAIL] " + tag);
    }
}

function replaceRegexSafe(regex, replace, tag) {
    if (regex.test(content)) {
        content = content.replace(regex, replace);
        console.log("[OK] " + tag);
        modified = true;
    } else {
        console.log("[FAIL] " + tag);
    }
}

// 1. Rename shareDocId to shareDocIds
replaceSafe(
    'const [shareDocId, setShareDocId] = React.useState<string | null>(null);',
    'const [shareDocIds, setShareDocIds] = React.useState<string[]>([]);',
    'State shareDocIds'
);

// 2. shareTargetSupplierId
const targetSupplierOld = `  const shareTargetSupplierId = React.useMemo(
    () => documents.find((d) => d.id === shareDocId)?.supplier_id || null,
    [documents, shareDocId]
  );`;
const targetSupplierNew = `  const shareTargetSupplierId = React.useMemo(
    () => (shareDocIds.length > 0 ? documents.find((d) => d.id === shareDocIds[0])?.supplier_id || null : null),
    [documents, shareDocIds]
  );`;
replaceSafe(targetSupplierOld, targetSupplierNew, 'shareTargetSupplierId');

// 3. openShareModal
const openModalOld = `  // Abrir modal de compartilhamento com parceiro, carregando workspaces ativos sob demanda
  const openShareModal = async (docId: string) => {
    setShareDocId(docId);
    setSelectedShareWorkspaceId('');
    setDocAlreadySharedWith([]);
    setShareModalOpen(true);`;
const openModalNew = `  // Abrir modal de compartilhamento em lote ou unitário com parceiro
  const openShareModal = async (docIds: string[]) => {
    if (docIds.length === 0) {
      alert("Nenhum documento encontrado nesta pasta/disciplina.");
      return;
    }
    setShareDocIds(docIds);
    setSelectedShareWorkspaceId('');
    setDocAlreadySharedWith([]);
    setShareModalOpen(true);`;
replaceSafe(openModalOld, openModalNew, 'openShareModal');

// 4. openShareModal call for existing individual share
const singleShareCall = /openShareModal\(doc\.id\)/g;
content = content.replace(singleShareCall, 'openShareModal([doc.id])');

// 5. In openShareModal, skip loading docAlreadySharedWith if multiple IDs
const loadAlreadySharedOld = `      try {
        const { data: sharings, error } = await supabase
          .from('partner_shared_documents')
          .select('*, workspace:opura_partner_workspaces(supplier_name)')
          .eq('document_id', docId);

        if (error) throw error;
        setDocAlreadySharedWith(sharings);
      } catch (err) {`;
const loadAlreadySharedNew = `      try {
        if (docIds.length === 1) {
          const { data: sharings, error } = await supabase
            .from('partner_shared_documents')
            .select('*, workspace:opura_partner_workspaces(supplier_name)')
            .eq('document_id', docIds[0]);

          if (error) throw error;
          setDocAlreadySharedWith(sharings);
        }
      } catch (err) {`;
replaceSafe(loadAlreadySharedOld, loadAlreadySharedNew, 'loadAlreadyShared');

// 6. handleShareWithPartner
const handleShareOld = `  const handleShareWithPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareDocId || !selectedShareWorkspaceId) return;
    const chosenWorkspace = partnerWorkspaces.find((w) => w.id === selectedShareWorkspaceId);
    setSharingSubmitting(true);
    try {
      await partnerService.shareDocument(
        selectedShareWorkspaceId,
        shareDocId,
        currentProfile?.email || 'sistema'
      );
      setShareModalOpen(false);
      setShareDocId(null);
      alert(\`Documento compartilhado com \${chosenWorkspace?.supplier_name || 'o parceiro'} com sucesso.\`);
    } catch (err: any) {`;
const handleShareNew = `  const handleShareWithPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shareDocIds.length === 0 || !selectedShareWorkspaceId) return;
    const chosenWorkspace = partnerWorkspaces.find((w) => w.id === selectedShareWorkspaceId);
    setSharingSubmitting(true);
    try {
      await partnerService.shareDocumentsBatch(
        selectedShareWorkspaceId,
        shareDocIds,
        currentProfile?.email || 'sistema'
      );
      setShareModalOpen(false);
      setShareDocIds([]);
      alert(\`\${shareDocIds.length} documento(s) compartilhado(s) com \${chosenWorkspace?.supplier_name || 'o parceiro'} com sucesso.\`);
    } catch (err: any) {`;
replaceSafe(handleShareOld, handleShareNew, 'handleShareWithPartner');

// 7. Modal close buttons setting shareDocId(null)
const closeModalClickOld = /setShareDocId\(null\);/g;
content = content.replace(closeModalClickOld, 'setShareDocIds([]);');

// 8. Add buttons to the Tree
// Folder hover action
const folderHoverActionRegex = /(<button\s*onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*handleStartEditFolder\(folder\);\s*\}\}\s*className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"\s*title="Configurar\/Incluir Disciplinas"\s*>)/m;
const folderHoverActionNew = `<button
                onClick={(e) => {
                  e.stopPropagation();
                  const docsInFolder = filteredDocuments.filter(d => d.folder_id === folder.id);
                  openShareModal(docsInFolder.map(d => d.id));
                }}
                className="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50"
                title="Compartilhar toda a pasta"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              $1`;
replaceRegexSafe(folderHoverActionRegex, folderHoverActionNew, 'Folder Share Button');

// Discipline hover action
const discHoverActionRegex = /(<button\s*onClick=\{async \(e\) => \{\s*e\.stopPropagation\(\);\s*if \(\!confirm\(`Remover disciplina \$\{disc\.name\} da pasta\?`\)\) return;)/m;
const discHoverActionNew = `<button
                        onClick={(e) => {
                          e.stopPropagation();
                          const docsInDisc = filteredDocuments.filter(d => d.folder_id === folder.id && extractDiscipline(d.nome) === disc.code);
                          openShareModal(docsInDisc.map(d => d.id));
                        }}
                        className="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50"
                        title="Compartilhar disciplina"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      $1`;
replaceRegexSafe(discHoverActionRegex, discHoverActionNew, 'Discipline Share Button');

// 9. Update the modal title to indicate batch
replaceRegexSafe(
  /<h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Compartilhar com Parceiro<\/h3>/,
  '<h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Compartilhar com Parceiro {shareDocIds.length > 1 && `(${shareDocIds.length} arquivos)`}</h3>',
  'Modal Title'
);

if (modified) {
    fs.writeFileSync(path, content, 'utf8');
    console.log("File saved.");
} else {
    console.log("No changes made.");
}
