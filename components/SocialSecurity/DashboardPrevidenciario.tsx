import React from 'react';
import { ConstructionSocialSecurityRecord } from '../../types';

interface Props {
  record: ConstructionSocialSecurityRecord | null;
}

export default function DashboardPrevidenciario({ record }: Props) {
  if (!record) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
          Obra sem Cadastro Previdenciário
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center max-w-md">
          Para iniciar a gestão da regularização previdenciária desta obra, cadastre as informações básicas e o CNO (se já houver).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Status CNO</p>
          <p className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">{record.cno_status}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Status SERO</p>
          <p className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">{record.sero_status}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Área a Aferir</p>
          <p className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">
            {record.assessed_area ? `${record.assessed_area} m²` : 'Não informada'}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Regime</p>
          <p className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">
            {record.regularization_method === 'contabilidade_regular' ? 'Contabilidade Regular' :
             record.regularization_method === 'afericao_indireta' ? 'Aferição Indireta' : 'Não definido'}
          </p>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-4">Alertas e Pendências</h3>
        <div className="space-y-3">
          {record.cno_status === 'nao_cadastrado' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md text-amber-800 dark:text-amber-200 text-sm flex gap-2">
              <span className="font-bold">Aviso:</span> Esta obra ainda não possui CNO cadastrado. Regularize em até 30 dias após o início da obra.
            </div>
          )}
          {/* More alerts logic to come */}
          {record.cno_status !== 'nao_cadastrado' && (
             <p className="text-sm text-slate-500">Nenhum alerta crítico no momento.</p>
          )}
        </div>
      </div>
    </div>
  );
}
