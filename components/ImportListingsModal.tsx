import React from 'react';
import * as XLSX from 'xlsx';
import { opuraMarketService, LinhaPlanilhaMercado } from '../services/opuraMarketService';

interface ImportListingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cityId: string;
  organizationId: string;
}

/**
 * Número de uma célula da planilha. Célula numérica do Excel chega como number;
 * texto vem no formato brasileiro ("R$ 450.000,00", "80,5 m²") ou americano
 * ("450000.00"). Antes, "450.000,00" virava 450: a vírgula era trocada por ponto
 * e o parseFloat parava no segundo ponto.
 */
export function numeroDaCelula(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (valor == null) return NaN;
  let t = String(valor).replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  const temVirgula = t.includes(',');
  const pontos = (t.match(/\./g) ?? []).length;
  if (temVirgula) {
    t = t.replace(/\./g, '').replace(',', '.');            // 450.000,00 → 450000.00
  } else if (pontos > 1 || /^\d{1,3}\.\d{3}$/.test(t)) {
    t = t.replace(/\./g, '');                               // 1.250.000 ou 450.000 → milhar
  }
  return parseFloat(t);
}

// Atributos do banco de dados que precisam ser mapeados
const MAP_FIELDS = [
  { key: 'address', label: 'Endereço Completo (Rua, Número)', required: true },
  { key: 'price', label: 'Preço de Venda (R$)', required: true },
  { key: 'areaPrivate', label: 'Área Privativa (m²)', required: true },
  { key: 'neighborhood', label: 'Bairro', required: false },
  { key: 'propertyType', label: 'Tipo do Imóvel (Ex: Apartamento, Casa)', required: false },
  { key: 'bedrooms', label: 'Dormitórios', required: false },
  { key: 'suites', label: 'Suítes', required: false },
  { key: 'bathrooms', label: 'Banheiros', required: false },
  { key: 'parkingSpaces', label: 'Vagas de Garagem', required: false },
  { key: 'constructionStandard', label: 'Padrão Construtivo', required: false },
  { key: 'description', label: 'Descrição/Observações', required: false }
];

export const ImportListingsModal: React.FC<ImportListingsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  cityId,
  organizationId
}) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<any[][]>([]);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  
  // Estado da importação (feita no servidor)
  const [importing, setImporting] = React.useState(false);
  const [totalLines, setTotalLines] = React.useState(0);
  const [statusMessage, setStatusMessage] = React.useState('');

  if (!isOpen) return null;

  // Processa o arquivo selecionado
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (selectedFile: File) => {
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (data) {
        try {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Converte para formato de matriz de arrays (header: 1)
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (json.length === 0) {
            alert('A planilha selecionada está vazia.');
            return;
          }

          const fileHeaders = Array.from(json[0] || []).map(h => (h !== undefined && h !== null) ? String(h).trim() : '');
          const fileRows = json.slice(1).filter(row => row.length > 0);

          setHeaders(fileHeaders);
          setRows(fileRows);

          // Tenta mapear automaticamente colunas comuns por proximidade textual
          const autoMappings: Record<string, string> = {};
          MAP_FIELDS.forEach(field => {
            const fieldKey = field.key.toLowerCase();
            const fieldLabel = field.label.toLowerCase();
            
            const match = fileHeaders.find(h => {
              if (!h) return false;
              const headerLower = h.toLowerCase();
              return headerLower === fieldKey ||
                     headerLower.includes(fieldKey) ||
                     fieldLabel.includes(headerLower) ||
                     (fieldKey === 'areaprivate' && (headerLower.includes('m2') || headerLower.includes('area') || headerLower.includes('privativa')));
            });

            if (match) {
              autoMappings[field.key] = match;
            }
          });

          setMappings(autoMappings);
        } catch (err: any) {
          console.error(err);
          alert(`Erro ao processar planilha: ${err.message || 'Verifique se o formato está correto.'}`);
        }
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // Trata a seleção manual do cabeçalho
  const handleMappingChange = (fieldKey: string, headerName: string) => {
    setMappings(prev => ({
      ...prev,
      [fieldKey]: headerName
    }));
  };

  // Lê e mapeia as linhas aqui; a geocodificação e a gravação acontecem no
  // servidor (Edge Function opura-market-import, Fase 3 revisada do plano
  // 2026-10-07-opura-market-intelligence.md). Antes este laço geocodificava no
  // navegador, uma linha por segundo, e sorteava um ponto quando não achava.
  const handleImport = async () => {
    const missingFields = MAP_FIELDS.filter(f => f.required && !mappings[f.key]);
    if (missingFields.length > 0) {
      alert(`Por favor, mapeie as colunas obrigatórias: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }
    if (!cityId || cityId.trim() === '') {
      alert('Erro: Nenhuma cidade válida selecionada para importação.');
      return;
    }
    if (!organizationId) {
      alert('Selecione uma organização no topo da tela antes de importar: o anúncio é gravado nela.');
      return;
    }

    const linhas: LinhaPlanilhaMercado[] = [];
    for (const row of rows) {
      const getVal = (key: string) => {
        const headerName = mappings[key];
        if (!headerName) return null;
        const headerIdx = headers.indexOf(headerName);
        return headerIdx !== -1 ? row[headerIdx] : null;
      };
      const endereco = getVal('address') != null ? String(getVal('address')).trim() : '';
      const preco = numeroDaCelula(getVal('price'));
      const area = numeroDaCelula(getVal('areaPrivate'));
      if (!endereco || !(preco > 0) || !(area > 0)) continue;   // linha sem o essencial

      const texto = (key: string) => {
        const v = getVal(key);
        return v == null || String(v).trim() === '' ? null : String(v).trim();
      };
      const inteiro = (key: string) => {
        const n = numeroDaCelula(getVal(key));
        return n > 0 ? Math.round(n) : 0;
      };
      linhas.push({
        endereco,
        bairro: texto('neighborhood'),
        preco,
        area,
        tipo: texto('propertyType'),
        quartos: inteiro('bedrooms'),
        suites: inteiro('suites'),
        banheiros: inteiro('bathrooms'),
        vagas: inteiro('parkingSpaces'),
        padrao: texto('constructionStandard'),
        descricao: texto('description'),
      });
    }

    if (linhas.length === 0) {
      alert('Nenhum anúncio válido foi localizado para importação (cada linha precisa de endereço, preço e área).');
      return;
    }

    setImporting(true);
    setTotalLines(linhas.length);
    setStatusMessage(`Enviando ${linhas.length} anúncios. O servidor localiza cerca de um endereço por segundo.`);
    try {
      const r = await opuraMarketService.importarPlanilha(organizationId, cityId, linhas);
      const partes = ['Importação concluída.', '', `🔹 Anúncios novos: ${r.novos}`];
      if (r.duplicados > 0) partes.push(`🛡️ Repetidos de anúncios que já existiam: ${r.duplicados} (gravados como duplicados, fora das contas)`);
      if (r.semLocalizacao > 0) partes.push(`📍 Endereço não encontrado: ${r.semLocalizacao}. Ficam na tabela, fora do mapa e da análise de raio.`);
      if (r.pendentes > 0) partes.push(`⏳ Ainda sem localização por limite de tempo: ${r.pendentes}. Use "Localizar anúncios sem coordenada" na aba Feed XML.`);
      if (r.invalidas) partes.push(`⚠️ Linhas recusadas pelo servidor: ${r.invalidas}`);
      alert(partes.join('\n'));
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Erro na importação: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[28px] shadow-2xl border border-slate-100 max-w-xl w-full flex flex-col max-h-[85vh] overflow-hidden animate-fadeIn">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-base font-black text-slate-800 tracking-tight">📥 Importar Pesquisa de Concorrência</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Alimente o mapa e a RPC de análise com seus dados de mercado</p>
          </div>
          <button 
            disabled={importing}
            onClick={onClose} 
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {importing ? (
            /* Importação em andamento no servidor */
            <div className="py-12 flex flex-col items-center justify-center space-y-6">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-center space-y-2">
                <span className="text-sm font-black text-slate-800 block">
                  Importando {totalLines} anúncios
                </span>
                <span className="text-xs text-slate-500 font-semibold block max-w-xs">
                  {statusMessage}
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-xs text-center font-medium leading-relaxed">
                Pode levar até dois minutos. O que não for localizado nesse tempo fica pendente e pode ser completado depois.
              </p>
            </div>
          ) : !file ? (
            /* Upload do Arquivo */
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-200 hover:border-slate-400 rounded-3xl p-12 text-center transition-all cursor-pointer bg-slate-50/50 flex flex-col items-center justify-center group"
            >
              <input 
                type="file" 
                id="file-upload" 
                className="hidden" 
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload" className="cursor-pointer space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-xl group-hover:scale-110 transition-transform mx-auto">
                  📊
                </div>
                <div>
                  <span className="block text-xs font-black text-slate-700 uppercase tracking-wider">Arraste sua planilha ou clique aqui</span>
                  <span className="block text-xs text-slate-400 font-semibold mt-1">Suporta formatos .CSV, .XLSX e .XLS</span>
                </div>
              </label>
            </div>
          ) : (
            /* Mapeamento de Colunas */
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2 text-slate-600">
                  <span>📄</span>
                  <span className="font-bold text-slate-800 truncate max-w-xs">{file.name}</span>
                  <span className="text-xs text-slate-400">({rows.length} linhas de dados)</span>
                </div>
                <button 
                  onClick={() => { setFile(null); setHeaders([]); setRows([]); setMappings({}); }}
                  className="text-rose-500 hover:underline text-xs font-black uppercase tracking-wider"
                >
                  Alterar Arquivo
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1.5">
                  Mapear Colunas da Planilha
                </h4>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {MAP_FIELDS.map(field => (
                    <div key={field.key} className="flex flex-col md:flex-row md:items-center justify-between p-3 border border-slate-100 hover:bg-slate-50/30 rounded-xl gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-700">{field.label}</span>
                        {field.required && <span className="text-rose-500" title="Obrigatório">*</span>}
                      </div>
                      <select
                        value={mappings[field.key] || ''}
                        onChange={(e) => handleMappingChange(field.key, e.target.value)}
                        className="w-full md:w-48 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                      >
                        <option value="">-- Ignorar ou Não Mapeado --</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        {!importing && file && (
          <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-button font-black uppercase tracking-wider transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all shadow-md active:scale-98"
            >
              🚀 Importar e Geocodificar
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
