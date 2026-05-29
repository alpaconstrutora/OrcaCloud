import React from 'react';
import { CheckCircle, FileText, Layers, X, ArrowRight } from 'lucide-react';

interface Props {
  contactName: string;
  contractNumber: string | null;
  projectName: string | null;
  onClose: () => void;
  onGoToProject?: () => void;
}

const ServicesWonModal: React.FC<Props> = ({
  contactName,
  contractNumber,
  projectName,
  onClose,
  onGoToProject,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
      {/* Header verde */}
      <div className="bg-green-500 px-6 py-8 flex flex-col items-center gap-3 text-white">
        <div className="bg-white/20 rounded-full p-3">
          <CheckCircle size={32} strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-center">Negócio fechado!</h2>
        <p className="text-sm text-green-100 text-center">
          A oportunidade de <strong>{contactName}</strong> foi convertida em obra.
        </p>
      </div>

      {/* Detalhes */}
      <div className="px-6 py-5 space-y-3">
        {contractNumber && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
            <FileText size={18} className="text-green-600 dark:text-green-400 shrink-0" />
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">Contrato gerado</p>
              <p className="text-sm font-bold text-green-800 dark:text-green-200">{contractNumber}</p>
            </div>
          </div>
        )}
        {projectName && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
            <Layers size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Obra criada</p>
              <p className="text-sm font-bold text-blue-800 dark:text-blue-200">{projectName}</p>
            </div>
          </div>
        )}
        {!contractNumber && !projectName && (
          <p className="text-sm text-gray-500 text-center py-2">
            Obra e contrato estão sendo gerados…
          </p>
        )}
      </div>

      {/* Ações */}
      <div className="px-6 pb-5 flex flex-col gap-2">
        {onGoToProject && projectName && (
          <button
            onClick={onGoToProject}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Ir para a obra <ArrowRight size={15} />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  </div>
);

export default ServicesWonModal;
