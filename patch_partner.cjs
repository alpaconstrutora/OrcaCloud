const fs = require('fs');
const path = 'services/partnerService.ts';
let content = fs.readFileSync(path, 'utf8');

const search = `  async unshareDocument(workspaceId: string, documentId: string): Promise<void> {
    const { error } = await supabase
      .from('partner_shared_documents')
      .delete()
      .eq('partner_workspace_id', workspaceId)
      .eq('document_id', documentId);

    if (error) {
      console.error('[PARTNER SERVICE] Error unsharing document:', error);
      throw error;
    }
  },`;

const replace = search + `

  async shareDocumentsBatch(workspaceId: string, documentIds: string[], sharedBy: string): Promise<void> {
    if (documentIds.length === 0) return;
    
    const payloads = documentIds.map(docId => ({
      partner_workspace_id: workspaceId,
      document_id: docId,
      shared_by: sharedBy
    }));

    const { error } = await supabase
      .from('partner_shared_documents')
      .upsert(payloads, { onConflict: 'partner_workspace_id,document_id', ignoreDuplicates: true });

    if (error) {
      console.error('[PARTNER SERVICE] Error sharing documents batch:', error);
      throw error;
    }

    this.notifyPartnersOfSharedDocument(workspaceId, \`Lote de \${documentIds.length} documentos\`, sharedBy).catch((err) => {
      console.error('[PARTNER SERVICE] Erro ao notificar parceiros sobre lote de documentos:', err);
    });
  },`;

if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync(path, content, 'utf8');
    console.log("[OK] partnerService patched");
} else {
    console.log("[FAIL] not found.");
}
