const fs = require('fs');
const path = 'components/OpuraDocsModule.tsx';
let content = fs.readFileSync(path, 'utf8').replace(/\\r\\n/g, '\\n');
let modified = false;

function replaceSafe(search, replace, tag) {
    if (content.includes(search.replace(/\\r\\n/g, '\\n'))) {
        content = content.replace(search.replace(/\\r\\n/g, '\\n'), replace.replace(/\\r\\n/g, '\\n'));
        console.log("[OK] " + tag);
        modified = true;
    } else {
        console.log("[FAIL] " + tag);
    }
}

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

if (modified) {
    fs.writeFileSync(path, content, 'utf8');
    console.log("File saved.");
} else {
    console.log("No changes made.");
}
