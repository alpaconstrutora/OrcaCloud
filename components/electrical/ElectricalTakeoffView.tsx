import React, { useState, useEffect } from 'react';
import { OpuraElectricalVersion, OpuraElectricalTakeoff } from '../../types/electrical';
import { electricalProjectService } from '../../services/electricalProjectService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { RefreshCw, Download, Calculator } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/financialMath';

interface ElectricalTakeoffViewProps {
  version: OpuraElectricalVersion;
  organizationId: string;
}

export function ElectricalTakeoffView({ version, organizationId }: ElectricalTakeoffViewProps) {
  const [takeoffs, setTakeoffs] = useState<OpuraElectricalTakeoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { showToast } = useToast();

  const loadTakeoffs = async () => {
    setLoading(true);
    try {
      const data = await electricalProjectService.listTakeoffs(version.id);
      setTakeoffs(data);
    } catch (error: any) {
      showToast(`Erro ao carregar: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTakeoffs();
  }, [version.id]);

  const handleGenerateTakeoffs = async () => {
    setGenerating(true);
    try {
      const data = await electricalProjectService.generateTakeoffs(version.id, organizationId);
      setTakeoffs(data);
      showToast('Quantitativos extraídos e orçados com sucesso!', 'success');
    } catch (error: any) {
      showToast(`Erro ao extrair: ${error.message}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const totalCost = takeoffs.reduce((acc, t) => acc + ((t.quantity || 0) * (t.unitCost || 0)), 0);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Carregando orçamento...</div>;
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Orçamento Paramétrico</h1>
            <p className="text-sm text-slate-500 mt-1">Extração automática de quantitativos baseada no desenho técnico.</p>
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" className="rounded-[1rem]" onClick={loadTakeoffs} disabled={generating}>
              <RefreshCw className={`w-4 h-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
              Recarregar
            </Button>
            <Button className="rounded-[1rem] bg-indigo-600 hover:bg-indigo-700" onClick={handleGenerateTakeoffs} disabled={generating}>
              <Calculator className="w-4 h-4 mr-2" />
              Extrair do Projeto
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <Card className="rounded-[1.5rem] shadow-sm border-slate-200/60 bg-white col-span-2">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Lista de Materiais</CardTitle>
              <CardDescription>Itens quantificados automaticamente pelo sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              {takeoffs.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Calculator className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-600 font-medium">Nenhum item orçado ainda.</p>
                  <p className="text-sm text-slate-500 mt-1 mb-4">Clique em "Extrair do Projeto" para gerar a lista.</p>
                  <Button variant="outline" onClick={handleGenerateTakeoffs} disabled={generating}>Extrair Agora</Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 rounded-t-lg">
                      <tr>
                        <th className="px-4 py-3 font-semibold rounded-tl-lg">Item / Descrição</th>
                        <th className="px-4 py-3 font-semibold text-center">Und.</th>
                        <th className="px-4 py-3 font-semibold text-right">Qtd.</th>
                        <th className="px-4 py-3 font-semibold text-right">Custo Unit.</th>
                        <th className="px-4 py-3 font-semibold text-right rounded-tr-lg">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {takeoffs.map((t, idx) => (
                        <tr key={t.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                          <td className="px-4 py-3 font-medium text-slate-700">{t.description}</td>
                          <td className="px-4 py-3 text-center text-slate-500">{t.unit || 'un'}</td>
                          <td className="px-4 py-3 text-right font-medium">{t.quantity}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(t.unitCost || 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {formatCurrency((t.quantity || 0) * (t.unitCost || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[1.5rem] shadow-sm border-slate-200/60 bg-gradient-to-br from-indigo-50 to-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-indigo-600 font-medium uppercase tracking-wider">Custo Total Estimado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold text-slate-900 tracking-tight">
                  {formatCurrency(totalCost)}
                </div>
                <p className="text-sm text-slate-500 mt-2">Custo direto de materiais sem BDI. Fiação e infraestrutura não inclusos nesta versão.</p>
              </CardContent>
            </Card>

            <Card className="rounded-[1.5rem] shadow-sm border-slate-200/60">
              <CardHeader>
                <CardTitle className="text-lg">Ações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start rounded-xl" disabled={takeoffs.length === 0}>
                  <Download className="w-4 h-4 mr-2 text-slate-500" />
                  Exportar Planilha
                </Button>
                <Button variant="outline" className="w-full justify-start rounded-xl" disabled={takeoffs.length === 0}>
                  Enviar para Suprimentos
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
