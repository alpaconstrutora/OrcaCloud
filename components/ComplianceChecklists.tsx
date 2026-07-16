import React from 'react';
import { complianceService } from '../services/complianceService';
import { companyService } from '../services/companyService';
import { ComplianceChecklist, ComplianceEvidence, Company } from '../types';

interface ComplianceChecklistsProps {
  organizationId: string;
  onBack: () => void;
}

const ComplianceChecklists: React.FC<ComplianceChecklistsProps> = ({
  organizationId,
  onBack
}) => {
  const [loading, setLoading] = React.useState(true);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState('');
  const [checklists, setChecklists] = React.useState<any[]>([]);
  const [selectedChecklist, setSelectedChecklist] = React.useState<any | null>(null);
  const [evidences, setEvidences] = React.useState<ComplianceEvidence[]>([]);

  // Campos para o envio de nova evidência
  const [uploading, setUploading] = React.useState(false);
  const [operationType, setOperationType] = React.useState('expedicao');
  const [documentRef, setDocumentRef] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);

  const loadInitialData = React.useCallback(async () => {
    try {
      setLoading(true);
      const comps = await companyService.list(organizationId);
      setCompanies(comps);

      if (comps.length > 0) {
        const defaultComp = comps[0].id;
        setSelectedCompanyId(defaultComp);
        
        const checkData = await complianceService.listChecklists(organizationId, defaultComp);
        setChecklists(checkData);

        // Se o checklist estiver vazio, popular com obrigações básicas do TTS
        if (checkData.length === 0) {
          await seedDefaultChecklists(defaultComp);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar checklists iniciais:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Seed para criar obrigações fiscais e operacionais demo
  const seedDefaultChecklists = async (compId: string) => {
    try {
      const today = new Date();
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const formattedDate = endOfMonth.toISOString().split('T')[0];

      // Criar uma regra fictícia para TTS-MG se não houver
      const rules = await complianceService.listRules(organizationId);
      let ruleId = null;

      if (rules.length === 0) {
        const defaultRule = await complianceService.saveRule({
          org_id: organizationId,
          name: 'Meta Faturamento Interestadual TTS-MG',
          description: 'Atingir no mínimo 30% das vendas totais para outros estados e arquivar as notas.',
          category: 'tts_mg',
          metric_threshold: 30.0,
          recurrence_days: 30
        });
        ruleId = defaultRule.id;
      } else {
        ruleId = rules[0].id;
      }

      const defaultChecks = [
        { title: 'Certidão Negativa de Débitos Estaduais (MG)', status: 'conforme', due_date: formattedDate },
        { title: 'Relatório Mensal de Faturamento por Filial', status: 'pendente', due_date: formattedDate },
        { title: 'Segregação física de estoque (Rua A / Box 01)', status: 'conforme', due_date: formattedDate },
        { title: 'Comprovação de Entrega Física (NF-e Interestadual)', status: 'pendente', due_date: formattedDate }
      ];

      for (const check of defaultChecks) {
        await complianceService.saveChecklist({
          org_id: organizationId,
          company_id: compId,
          rule_id: ruleId,
          title: check.title,
          status: check.status as any,
          due_date: check.due_date
        });
      }

      const checkData = await complianceService.listChecklists(organizationId, compId);
      setChecklists(checkData);
    } catch (err) {
      console.error('Erro ao popular dados demo de checklists:', err);
    }
  };

  const handleCompanyChange = async (compId: string) => {
    setSelectedCompanyId(compId);
    setSelectedChecklist(null);
    setEvidences([]);
    try {
      setLoading(true);
      const checkData = await complianceService.listChecklists(organizationId, compId);
      setChecklists(checkData);
    } catch (error) {
      console.error('Erro ao trocar empresa no checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChecklist = async (checklist: any) => {
    setSelectedChecklist(checklist);
    try {
      const evs = await complianceService.listEvidences(organizationId, checklist.id);
      setEvidences(evs);
    } catch (error) {
      console.error('Erro ao buscar evidências:', error);
    }
  };

  // Função para calcular Hash SHA-256 no browser
  const calculateSHA256 = async (targetFile: File): Promise<string> => {
    const arrayBuffer = await targetFile.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !selectedChecklist) return;

    try {
      setUploading(true);

      // 1. Upload do arquivo para o Supabase Storage
      const publicUrl = await complianceService.uploadEvidenceFile(file, organizationId);

      // 2. Calcular o hash do arquivo localmente
      const fileHash = await calculateSHA256(file);

      // 3. Capturar Geolocalização Simulada ou Real
      let latitude = -19.9167; // Belo Horizonte por padrão
      let longitude = -43.9333;

      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              latitude = pos.coords.latitude;
              longitude = pos.coords.longitude;
              resolve();
            },
            () => resolve(), // Continua com valores padrão em caso de bloqueio
            { timeout: 5000 }
          );
        });
      }

      // 4. Salvar os metadados da evidência
      const newEv = await complianceService.saveEvidence({
        org_id: organizationId,
        company_id: selectedCompanyId,
        checklist_id: selectedChecklist.id,
        operation_type: operationType,
        document_ref: documentRef,
        operator_email: 'carlos@opura.com', // Usuário simulado do fluxo
        evidence_url: publicUrl,
        file_hash: fileHash,
        latitude,
        longitude,
        captured_at: new Date().toISOString()
      });

      // 5. Atualizar status do checklist para 'conforme'
      const updatedChecklist = await complianceService.saveChecklist({
        ...selectedChecklist,
        status: 'conforme',
        completed_at: new Date().toISOString(),
        completed_by: 'carlos@opura.com'
      });

      // Recarregar checklists
      const checkData = await complianceService.listChecklists(organizationId, selectedCompanyId);
      setChecklists(checkData);
      
      // Atualizar dados na tela
      setSelectedChecklist(updatedChecklist);
      setEvidences([newEv, ...evidences]);

      // Reset formulário
      setFile(null);
      setDocumentRef('');
      alert('Evidência salva com sucesso! Trilha de auditoria e Hash SHA-256 gerados.');
    } catch (err: any) {
      console.error('Erro ao enviar evidência:', err);
      alert(err.message || 'Erro ao enviar evidência.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-button active:scale-95 transition-transform hover:bg-slate-50"
          >
            ⬅
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">📋 Controle de Obrigações e Evidências</h1>
            <p className="text-xs font-semibold text-slate-500">Fluxo operacional de comprovação regulatória e auditoria fiscal</p>
          </div>
        </div>

        <select
          value={selectedCompanyId}
          onChange={(e) => handleCompanyChange(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.razao_social}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200/50 rounded-3xl">
          <div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Carregando Obrigações...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna da Esquerda: Lista de checklists */}
          <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Obrigações Regulares</h3>

            <div className="space-y-3">
              {checklists.map(c => (
                <div
                  key={c.id}
                  onClick={() => handleSelectChecklist(c)}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all ${
                    selectedChecklist?.id === c.id 
                      ? 'border-slate-800 bg-slate-50/50' 
                      : 'border-slate-200 hover:bg-slate-50/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 line-clamp-2 pr-2">{c.title}</span>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      c.status === 'conforme' ? 'bg-emerald-50 text-emerald-600' :
                      c.status === 'inconforme' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Vence em: {new Date(c.due_date).toLocaleDateString('pt-BR')}</span>
                    {c.completed_at && <span className="text-emerald-600">✓ Comprovado</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna Central / Direita: Enviar evidência e ver dossiê do checklist */}
          <div className="lg:col-span-2 bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-6">
            {selectedChecklist ? (
              <>
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Obrigação Selecionada</span>
                  <h2 className="text-lg font-black text-slate-850 mt-1">{selectedChecklist.title}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedChecklist.compliance_rules?.description || 'Envie as evidências e relatórios exigidos para auditoria fiscal.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Formulário de Envio */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Anexar Evidência Operacional</h3>
                    
                    <form onSubmit={handleUploadEvidence} className="space-y-4">
                      <div className="space-y-1">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Tipo de Operação</label>
                        <select
                          value={operationType}
                          onChange={(e) => setOperationType(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        >
                          <option value="expedicao">Expedição (Comprovante / Canhoto / Rastreio)</option>
                          <option value="recebimento">Recebimento (Foto do palete / NF)</option>
                          <option value="inventario">Inventário (Relatório / Foto de estoque)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Identificador (NF-e ou Pedido)</label>
                        <input
                          type="text"
                          required
                          value={documentRef}
                          onChange={(e) => setDocumentRef(e.target.value)}
                          placeholder="Ex: Chave NF-e ou número do pedido"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Foto / Arquivo Comprovante</label>
                        <input
                          type="file"
                          required
                          accept="image/*,application/pdf"
                          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                          className="w-full text-form-input font-semibold text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-form-input file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={uploading}
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        {uploading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          'Gerar Hash & Enviar Evidência'
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Lista de Evidências Anexadas (Dossiê) */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Trilha de Evidências Existentes</h3>
                    
                    {evidences.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400">
                        Nenhuma evidência anexada a este checklist ainda.
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {evidences.map(ev => (
                          <div key={ev.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-800 uppercase">📦 {ev.operation_type}</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const url = await complianceService.getEvidenceSignedUrl(ev.evidence_url);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  } catch (err: any) {
                                    alert(err.message || 'Erro ao abrir anexo.');
                                  }
                                }}
                                className="text-xs font-bold text-sky-600 hover:underline"
                              >
                                Ver Anexo 🔗
                              </button>
                            </div>

                            <div className="text-[9px] text-slate-400 space-y-1 font-mono">
                              <div className="truncate" title={ev.file_hash || ''}>
                                HASH: <span className="text-slate-600">{ev.file_hash || 'Sem hash'}</span>
                              </div>
                              <div>
                                REF: <span className="text-slate-600">{ev.document_ref}</span>
                              </div>
                              <div>
                                LOCAL: <span className="text-slate-600">{ev.latitude}, {ev.longitude}</span>
                              </div>
                              <div>
                                DATA: <span className="text-slate-600">{new Date(ev.captured_at).toLocaleString('pt-BR')}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-2">
                <span className="text-3xl">📋</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selecione uma obrigação na lista para visualizar</span>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default ComplianceChecklists;
