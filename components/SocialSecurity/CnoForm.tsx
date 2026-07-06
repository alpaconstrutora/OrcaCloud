import React, { useState } from 'react';
import { ConstructionSocialSecurityRecord } from '../../types';
import Button from '../ui/Button';
import { socialSecurityService } from '../../services/socialSecurityService';

interface Props {
  obraId: string;
  record: ConstructionSocialSecurityRecord | null;
  onRecordUpdated: (record: ConstructionSocialSecurityRecord) => void;
}

export default function CnoForm({ obraId, record, onRecordUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cno_number: record?.cno_number || '',
    permit_number: record?.permit_number || '',
    occupancy_permit_number: record?.occupancy_permit_number || '',
    construction_type: record?.construction_type || 'NORMAL',
    total_area: record?.total_area || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        total_area: formData.total_area ? Number(formData.total_area) : undefined,
      };
      
      let updatedRecord;
      if (record?.id) {
        updatedRecord = await socialSecurityService.upsertRecord({ ...payload, id: record.id, obra_id: obraId });
      } else {
        updatedRecord = await socialSecurityService.upsertRecord({ ...payload, obra_id: obraId });
      }
      onRecordUpdated(updatedRecord);
      alert('Dados salvos com sucesso!');
    } catch (error: any) {
      alert('Erro ao salvar os dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-medium mb-4">Cadastro CNO e Dados Gerais</h3>
      <p className="text-sm text-slate-500 mb-6">Preencha os dados de inscrição para regularização previdenciária.</p>
      
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Número do CNO</label>
            <input 
              name="cno_number" 
              value={formData.cno_number} 
              onChange={handleChange} 
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" 
              placeholder="00.000.00000/00"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">ART / RRT</label>
            <input 
              name="permit_number" 
              value={formData.permit_number} 
              onChange={handleChange} 
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" 
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Número do Alvará</label>
            <input 
              name="occupancy_permit_number" 
              value={formData.occupancy_permit_number} 
              onChange={handleChange} 
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" 
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Área Total Construída (m²)</label>
            <input 
              name="total_area" 
              type="number"
              step="0.01"
              value={formData.total_area} 
              onChange={handleChange} 
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm" 
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Padrão da Construção</label>
          <select 
            name="construction_type" 
            value={formData.construction_type} 
            onChange={handleChange} 
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          >
            <option value="ALTO">Alto</option>
            <option value="NORMAL">Normal</option>
            <option value="BAIXO">Baixo</option>
          </select>
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Dados do CNO'}
          </Button>
        </div>
      </form>
    </div>
  );
}
