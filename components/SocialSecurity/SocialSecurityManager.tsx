import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ConstructionSocialSecurityRecord } from '../../types';
import { socialSecurityService } from '../../services/socialSecurityService';
import DashboardPrevidenciario from './DashboardPrevidenciario';
import CnoForm from './CnoForm';
import DocumentChecklist from './DocumentChecklist';
import SocialSecuritySimulator from './SocialSecuritySimulator';

interface SocialSecurityManagerProps {
  obraId: string;
}

export default function SocialSecurityManager({ obraId }: SocialSecurityManagerProps) {
  const [record, setRecord] = useState<ConstructionSocialSecurityRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRecord() {
      try {
        const data = await socialSecurityService.getRecordByObraId(obraId);
        setRecord(data);
      } catch (error) {
        console.error('Error loading social security record:', error);
      } finally {
        setLoading(false);
      }
    }
    loadRecord();
  }, [obraId]);

  if (loading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Regularização Previdenciária
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Gestão do CNO, INSS da Obra e SERO
          </p>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="cno">Cadastro CNO</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="simulador">Simulador INSS</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardPrevidenciario record={record} />
        </TabsContent>
        <TabsContent value="cno">
          <CnoForm obraId={obraId} record={record} onRecordUpdated={setRecord} />
        </TabsContent>
        <TabsContent value="documentos">
          <DocumentChecklist record={record} />
        </TabsContent>
        <TabsContent value="simulador">
          <SocialSecuritySimulator record={record} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
