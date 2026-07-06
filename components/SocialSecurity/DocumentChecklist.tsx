import React, { useState, useEffect } from 'react';
import { ConstructionSocialSecurityRecord, ConstructionSocialSecurityDocument } from '../../types';
import Button from '../ui/Button';
import { socialSecurityService } from '../../services/socialSecurityService';

interface Props {
  record: ConstructionSocialSecurityRecord | null;
}

const REQUIRED_DOCS = [
  { name: 'Alvará de Construção', type: 'ALVARA' },
  { name: 'ART / RRT', type: 'ART_RRT' },
  { name: 'Matrícula CNO', type: 'MATRICULA_CNO' },
  { name: 'Projeto Arquitetônico Aprovado', type: 'PROJETO_APROVADO' },
  { name: 'Habite-se', type: 'HABITE_SE' },
  { name: 'Certidão Negativa de Débitos (CND)', type: 'CND' },
];

export default function DocumentChecklist({ record }: Props) {
  const [documents, setDocuments] = useState<ConstructionSocialSecurityDocument[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (record?.id) {
      socialSecurityService.getDocuments(record.id).then(setDocuments);
    }
  }, [record?.id]);

  const toggleDocument = async (docType: string, isChecked: boolean) => {
    if (!record?.id) {
      alert('Por favor, salve os dados gerais do CNO primeiro.');
      return;
    }
    
    setLoading(true);
    try {
      if (isChecked) {
        const newDoc = await socialSecurityService.insertDocument({
          record_id: record.id,
          document_type: REQUIRED_DOCS.find(d => d.type === docType)?.name || docType,
          status: 'PENDING',
        });
        setDocuments(prev => [...prev, newDoc]);
      } else {
        const existing = documents.find(d => d.document_type === docType);
        if (existing?.id) {
          await socialSecurityService.deleteDocument(existing.id);
          setDocuments(prev => prev.filter(d => d.id !== existing.id));
        }
      }
    } catch (e: any) {
      alert('Erro ao atualizar documento: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-medium mb-4">Checklist de Documentação</h3>
      <p className="text-sm text-slate-500 mb-6">Documentos exigidos para a regularização no SERO.</p>
      
      <div className="space-y-3">
        {REQUIRED_DOCS.map(doc => {
          const isUploaded = documents.some(d => d.document_type === doc.type);
          return (
            <div key={doc.type} className="flex items-center justify-between p-3 border border-slate-200 rounded">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  checked={isUploaded} 
                  onChange={(e) => toggleDocument(doc.type, e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span className="font-medium text-slate-700">{doc.name}</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${isUploaded ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                {isUploaded ? 'Anexado' : 'Pendente'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
