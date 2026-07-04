import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, FileText, Calendar, ShieldCheck, Building2 } from 'lucide-react';
import { documentService } from '../../services/documentService';

interface PublicPlantStatus {
  document_name: string;
  category: string;
  active_version_id: string;
  active_version_number: number;
  active_version_created_at: string;
  active_version_storage_path: string;
  status: string;
}

export function PublicPlantChecker() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<PublicPlantStatus | null>(null);

  // Extrair o docId da URL (/publico/validar-planta/:docId)
  const pathnameParts = window.location.pathname.split('/');
  const docId = pathnameParts[pathnameParts.length - 1];

  // Extrair a versão física informada na URL (?v=X)
  const queryParams = new URLSearchParams(window.location.search);
  const versionParam = queryParams.get('v');
  const physicalVersion = versionParam ? parseInt(versionParam, 10) : null;

  useEffect(() => {
    if (!docId || docId.length < 32) {
      setError('Identificador de documento inválido ou ausente.');
      setLoading(false);
      return;
    }

    async function checkStatus() {
      try {
        const result = await documentService.getPublicDocumentStatus(docId);
        if (!result) {
          setError('Documento não localizado na base de dados da Construtora.');
        } else {
          setDocStatus(result);
        }
      } catch (err: any) {
        console.error('[PublicPlantChecker] Erro ao carregar status:', err);
        setError('Ocorreu um erro ao consultar o servidor de validação.');
      } finally {
        setLoading(false);
      }
    }

    checkStatus();
  }, [docId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center space-y-4 max-w-sm w-full text-center">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Consultando ÓPURA Docs</h3>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Verificando validade e revisões do arquivo físico...</p>
        </div>
      </div>
    );
  }

  if (error || !docStatus) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center space-y-4 max-w-sm w-full text-center">
          <div className="p-3 bg-red-50 text-red-500 rounded-full">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="font-black text-red-600 uppercase tracking-wider text-sm">Aviso de Validação</h3>
          <p className="text-sm text-slate-600 font-medium leading-relaxed">
            {error || 'Não foi possível ler as informações deste documento.'}
          </p>
          <div className="w-full pt-4 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            ÓPURA CLOUD GED
          </div>
        </div>
      </div>
    );
  }

  // Determinar se a versão física da folha está ativa/atualizada
  const isUpToDate = physicalVersion === null || physicalVersion === docStatus.active_version_number;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${
      isUpToDate ? 'bg-emerald-50/60' : 'bg-rose-50/60'
    }`}>
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-w-md w-full animate-in zoom-in-95 duration-200">
        
        {/* Banner de Status Principal */}
        <div className={`p-6 text-center text-white flex flex-col items-center space-y-3 ${
          isUpToDate ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          <div className="p-2 bg-white/20 rounded-full animate-bounce">
            {isUpToDate ? (
              <CheckCircle2 className="w-10 h-10 text-white" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-white" />
            )}
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black uppercase tracking-wider leading-none">
              {isUpToDate ? 'Planta Liberada' : 'PLANTA OBSOLETA'}
            </h2>
            <p className="text-xs text-white/80 font-bold uppercase tracking-widest">
              {isUpToDate ? 'Pronto para Execução no Canteiro' : 'NÃO EXECUTE ESTE PROJETO'}
            </p>
          </div>
        </div>

        {/* Detalhes do Documento */}
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nome do Documento / Planta</p>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide leading-snug">
                  {docStatus.document_name}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Versão da Folha Física</p>
                <p className="text-sm font-black text-slate-700">
                  {physicalVersion ? `V${physicalVersion}` : 'Não Informada'}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Versão Ativa no Sistema</p>
                <p className="text-sm font-black text-blue-600">
                  V{docStatus.active_version_number}
                </p>
              </div>
            </div>

            {!isUpToDate && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-800">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs font-semibold">
                  <p className="font-black uppercase tracking-wider text-rose-700">Atenção!</p>
                  <p className="leading-relaxed">
                    Você está consultando a versão <strong>V{physicalVersion}</strong> física, porém a construtora enviou uma nova revisão (<strong>V{docStatus.active_version_number}</strong>) que está ativa no ÓPURA Docs. Descarte esta folha impressa antiga imediatamente para evitar erros no canteiro.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Data da Versão Ativa</p>
                  <p className="text-xs font-bold text-slate-700">
                    {new Date(docStatus.active_version_created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Autenticidade</p>
                  <p className="text-xs font-bold text-slate-700">
                    Código de Controle Certificado por ÓPURA Cloud GED
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-widest">
            <span>ÓPURA CLOUD GED</span>
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              CONSTRUMARKET INSPIRED
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
