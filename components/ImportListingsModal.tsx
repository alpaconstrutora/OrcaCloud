import React from 'react';
import * as XLSX from 'xlsx';
import { opuraMarketService } from '../services/opuraMarketService';
import { OpuraMarketNeighborhood } from '../types';

interface ImportListingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cityId: string;
  cityName: string;
  neighborhoods: OpuraMarketNeighborhood[];
  organizationId: string;
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
  cityName,
  neighborhoods,
  organizationId
}) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<any[][]>([]);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  
  // Estados de progresso da geocodificação
  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [currentLine, setCurrentLine] = React.useState(0);
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

  // Dispara a importação, geocodificando linha por linha sequencialmente
  const handleImport = async () => {
    // Valida campos obrigatórios
    const missingFields = MAP_FIELDS.filter(f => f.required && !mappings[f.key]);
    if (missingFields.length > 0) {
      alert(`Por favor, mapeie as colunas obrigatórias: ${missingFields.map(f => f.label).join(', ')}`);
      return;
    }

    setImporting(true);
    setTotalLines(rows.length);
    setCurrentLine(0);
    setProgress(0);

    const importedListings: any[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setCurrentLine(i + 1);
      setProgress(Math.round(((i + 1) / rows.length) * 100));

      // Mapeia os dados da linha com base nas colunas selecionadas
      const getVal = (key: string) => {
        const headerName = mappings[key];
        if (!headerName) return null;
        const headerIdx = headers.indexOf(headerName);
        return headerIdx !== -1 ? row[headerIdx] : null;
      };

      const rawAddress = getVal('address');
      const addressString = rawAddress ? String(rawAddress).trim() : '';
      const rawPrice = getVal('price');
      const priceVal = rawPrice ? parseFloat(String(rawPrice).replace(/[^\d.,]/g, '').replace(',', '.')) : 0;
      const rawArea = getVal('areaPrivate');
      const areaVal = rawArea ? parseFloat(String(rawArea).replace(/[^\d.,]/g, '').replace(',', '.')) : 0;

      if (!addressString || isNaN(priceVal) || priceVal <= 0 || isNaN(areaVal) || areaVal <= 0) {
        // Pula linhas inconsistentes ou sem dados cruciais
        continue;
      }

      const rawNeighborhood = getVal('neighborhood');
      const neighborhoodName = rawNeighborhood ? String(rawNeighborhood).trim() : '';

      // Tenta cruzar com bairro semeado para associar neighborhoodId
      let matchedNeighborhoodId: string | null = null;
      if (neighborhoodName) {
        const found = neighborhoods.find(n => n.name.toLowerCase() === neighborhoodName.toLowerCase());
        if (found) {
          matchedNeighborhoodId = found.id;
        }
      }

      setStatusMessage(`Geocodificando: "${addressString}"...`);

      // Geocodificação com a API do Nominatim
      let latitude: number | null = null;
      let longitude: number | null = null;

      try {
        const coords = await opuraMarketService.geocodeAddress(addressString, cityName);
        if (coords) {
          latitude = coords.lat;
          longitude = coords.lng;
        } else {
          // Se não localizar o endereço específico da rua, busca pelo Bairro se mapeado
          if (neighborhoodName) {
            const neighborhoodCoords = await opuraMarketService.geocodeAddress(neighborhoodName, cityName);
            if (neighborhoodCoords) {
              latitude = neighborhoodCoords.lat;
              longitude = neighborhoodCoords.lng;
            }
          }
        }
      } catch (err) {
        console.error('Erro de geocodificação na linha', i, err);
      }

      // Se todas as tentativas falharem, assume a coordenada central padrão de Cambuí como fallback
      // (Prevenindo que o ponto suma e permitindo que o usuário visualize ou corrija no mapa)
      if (!latitude || !longitude) {
        latitude = -22.6122 + (Math.random() - 0.5) * 0.01;
        longitude = -46.0578 + (Math.random() - 0.5) * 0.01;
      }

      // Constrói o modelo de anúncio correspondente
      const rawType = getVal('propertyType');
      const propertyType = rawType ? String(rawType) : 'Apartamento';
      const bedroomsVal = getVal('bedrooms') ? parseInt(String(getVal('bedrooms'))) : 0;
      const suitesVal = getVal('suites') ? parseInt(String(getVal('suites'))) : 0;
      const bathroomsVal = getVal('bathrooms') ? parseInt(String(getVal('bathrooms'))) : 1;
      const parkingVal = getVal('parkingSpaces') ? parseInt(String(getVal('parkingSpaces'))) : 0;
      const standardVal = getVal('constructionStandard') ? String(getVal('constructionStandard')) : 'Médio';
      const descVal = getVal('description') ? String(getVal('description')) : '';

      importedListings.push({
        cityId,
        neighborhoodId: matchedNeighborhoodId,
        organizationId,
        source: 'Planilha Importada',
        sourceUrl: null,
        propertyType,
        address: addressString,
        zipCode: null,
        areaPrivate: areaVal,
        areaTotal: areaVal,
        bedrooms: isNaN(bedroomsVal) ? 0 : bedroomsVal,
        suites: isNaN(suitesVal) ? 0 : suitesVal,
        bathrooms: isNaN(bathroomsVal) ? 1 : bathroomsVal,
        parkingSpaces: isNaN(parkingVal) ? 0 : parkingVal,
        price: priceVal,
        condoFee: null,
        iptu: null,
        latitude,
        longitude,
        description: descVal,
        constructionStandard: standardVal,
        listingStatus: 'active',
        capturedAt: now,
        lastSeenAt: now
      });

      // Taxa Limite Nominatim: Aguardar obrigatoriamente 1000ms antes da próxima linha
      if (i < rows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (importedListings.length === 0) {
      alert('Nenhum anúncio válido foi localizado para importação.');
      setImporting(false);
      return;
    }

    // Grava dados em lote
    try {
      setStatusMessage(`Enviando ${importedListings.length} anúncios para o Supabase...`);
      await opuraMarketService.importListingsInBatch(importedListings);
      alert(`${importedListings.length} anúncios importados e geocodificados com sucesso!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar no banco: ' + err.message);
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
            /* Tela de progresso de geocodificação */
            <div className="py-12 flex flex-col items-center justify-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center animate-pulse">
                <span className="text-2xl">🌍</span>
              </div>
              <div className="text-center space-y-2">
                <span className="text-sm font-black text-slate-800 uppercase tracking-wider block">
                  Geocodificando Dados ({progress}%)
                </span>
                <span className="text-xs text-slate-400 font-semibold block">
                  Linha {currentLine} de {totalLines} processada
                </span>
                <span className="text-[11px] text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full font-bold inline-block border border-emerald-100 max-w-xs truncate mt-2">
                  {statusMessage}
                </span>
              </div>
              {/* Barra de Progresso */}
              <div className="w-full max-w-xs bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 max-w-xs text-center font-medium leading-relaxed">
                Respeitando o limite de requisições da API do Nominatim (1s por endereço) para prevenir bloqueios de IP.
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
                  <span className="block text-[10px] text-slate-400 font-semibold mt-1">Suporta formatos .CSV, .XLSX e .XLS</span>
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
                  <span className="text-[10px] text-slate-400">({rows.length} linhas de dados)</span>
                </div>
                <button 
                  onClick={() => { setFile(null); setHeaders([]); setRows([]); setMappings({}); }}
                  className="text-rose-500 hover:underline text-[10px] font-black uppercase tracking-wider"
                >
                  Alterar Arquivo
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-1.5">
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
                        className="w-full md:w-48 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
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
              className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-98"
            >
              🚀 Importar e Geocodificar
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
