// components/AssetImportModal.tsx

import React from 'react';
import { X, Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle, Download, AlertTriangle } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { assetService } from '../services/assetService';
import { OpuraAsset, OpuraAssetInsert, AssetCategory } from '../types';

interface AssetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
  activeOrganizationId: string | null;
  existingAssets: OpuraAsset[];
}

interface ParsedRow {
  index: number;
  code: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  model: string;
  serial_number: string;
  purchase_date: string;
  purchase_value: number;
  useful_life_months: number;
  residual_value: number;
  notes: string;
  errors: string[];
  isValid: boolean;
}

const CATEGORIES_ALLOWED: AssetCategory[] = [
  'equipamento',
  'ferramenta',
  'veiculo',
  'tecnologia',
  'imovel',
  'mobiliario'
];

const getCellValueAsString = (cell: ExcelJS.Cell): string => {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  const val = cell.value;
  if (typeof val === 'object') {
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    if ('result' in val) {
      return val.result !== null && val.result !== undefined ? String(val.result).trim() : '';
    }
    if ('richText' in val) {
      return (val as any).richText.map((rt: any) => rt.text).join('').trim();
    }
    if ('text' in val) {
      return String((val as any).text).trim();
    }
    return '';
  }
  return String(val).trim();
};

export const AssetImportModal: React.FC<AssetImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  activeOrganizationId,
  existingAssets
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [importSummary, setImportSummary] = React.useState({ valid: 0, invalid: 0 });

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx')) {
      setError('Por favor, selecione um arquivo Excel válido no formato (.xlsx)');
      return;
    }
    setError(null);
    setFile(selectedFile);
    setParsedRows([]);
  };

  // Baixar Planilha Modelo
  const handleDownloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Ativos Modelo');

      // Cabeçalho da Planilha
      const headers = [
        'Código Patrimonial',
        'Nome do Ativo*',
        'Categoria*',
        'Subcategoria',
        'Marca',
        'Modelo',
        'Número de Série',
        'Data de Aquisição (AAAA-MM-DD)',
        'Valor de Aquisição (R$)',
        'Vida Útil (meses)',
        'Valor Residual (R$)',
        'Observações'
      ];

      const headerRow = worksheet.addRow(headers);
      
      // Estilo do Cabeçalho
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' } // Azul Escuro
        };
        cell.font = {
          color: { argb: 'FFFFFFFF' },
          bold: true,
          size: 11
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      // Linhas explicativas de exemplo
      const examples = [
        [
          'OPR-EQP-0001',
          'Betoneira Menegotti 400L',
          'equipamento',
          'Construção Civil',
          'Menegotti',
          'Premium',
          'MNG-7482-B',
          '2026-01-10',
          4500.00,
          60,
          500.00,
          'Locada temporariamente na Obra Residencial Alfa'
        ],
        [
          'OPR-VEI-0004',
          'Caminhão Ford Cargo',
          'veiculo',
          'Frota Pesada',
          'Ford',
          'Cargo 2428',
          'FRD-9988-PL',
          '2025-11-20',
          220000.00,
          120,
          40000.00,
          'Com seguro ativo até dez/2026'
        ],
        [
          'OPR-TEC-0089',
          'Notebook Dell Latitude',
          'tecnologia',
          'Equipamento de TI',
          'Dell',
          'Latitude 3420',
          'DLL-XYZ849',
          '2026-03-01',
          5600.00,
          36,
          600.00,
          'Entregue ao departamento de engenharia'
        ]
      ];

      examples.forEach((example) => {
        worksheet.addRow(example);
      });

      // Auto-fit de largura das colunas
      worksheet.columns.forEach((column) => {
        let maxLen = 0;
        column.eachCell && column.eachCell({ includeEmpty: true }, (cell) => {
          const value = cell.value ? String(cell.value) : '';
          if (value.length > maxLen) maxLen = value.length;
        });
        column.width = Math.max(maxLen + 4, 15);
      });
      // Validação de dados na coluna de categorias
      (worksheet as any).dataValidations.add('C2:C1000', {
        type: 'list',
        allowBlank: false,
        formulae: ['"equipamento,ferramenta,veiculo,tecnologia,imovel,mobiliario"'],
        showErrorMessage: true,
        errorTitle: 'Categoria Inválida',
        error: 'Escolha uma categoria válida da lista.'
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, 'modelo_importacao_ativos.xlsx');
    } catch (err) {
      console.error('Erro ao gerar planilha modelo:', err);
      alert('Falha ao baixar modelo de planilha.');
    }
  };

  // Processar arquivo e validar dados
  const processFile = async () => {
    console.log('[AssetImportModal] Iniciando processamento do arquivo:', file?.name, 'Org:', activeOrganizationId);
    if (!file) {
      setError('Por favor, selecione ou arraste um arquivo primeiro.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('A planilha está vazia ou ilegível.');
      }

      const rows: ParsedRow[] = [];
      const codeSet = new Set<string>(); // Para checar duplicidades dentro do próprio arquivo

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Pula o cabeçalho

        const codeRaw = getCellValueAsString(row.getCell(1));
        const nameRaw = getCellValueAsString(row.getCell(2));
        const categoryRaw = getCellValueAsString(row.getCell(3)).toLowerCase();
        const subcategory = getCellValueAsString(row.getCell(4));
        const brand = getCellValueAsString(row.getCell(5));
        const model = getCellValueAsString(row.getCell(6));
        const serial_number = getCellValueAsString(row.getCell(7));
        const purchaseDateRaw = getCellValueAsString(row.getCell(8));
        const purchaseValueRaw = getCellValueAsString(row.getCell(9));
        const usefulLifeRaw = getCellValueAsString(row.getCell(10));
        const residualValueRaw = getCellValueAsString(row.getCell(11));
        const notes = getCellValueAsString(row.getCell(12));

        // Se a linha inteira estiver em branco, ignora
        if (!codeRaw && !nameRaw && !categoryRaw && !purchaseValueRaw) return;

        const rowErrors: string[] = [];

        // Validação do Código Patrimonial (Opcional - gera se vazio)
        let rowCode = codeRaw;
        if (!rowCode) {
          rowCode = `OPR-PAT-${Math.floor(100000 + Math.random() * 900000)}`;
          while (codeSet.has(rowCode.toLowerCase()) || existingAssets.some(a => a.code.toLowerCase() === rowCode.toLowerCase())) {
            rowCode = `OPR-PAT-${Math.floor(100000 + Math.random() * 900000)}`;
          }
          codeSet.add(rowCode.toLowerCase());
        } else {
          // Checa duplicidade interna no Excel
          if (codeSet.has(rowCode.toLowerCase())) {
            rowErrors.push(`Código "${rowCode}" está repetido na planilha.`);
          } else {
            codeSet.add(rowCode.toLowerCase());
          }

          // Checa duplicidade contra banco de dados
          const codeExistsInDb = existingAssets.some(
            (a) => a.code.toLowerCase() === rowCode.toLowerCase()
          );
          if (codeExistsInDb) {
            rowErrors.push(`Código "${rowCode}" já está cadastrado no sistema.`);
          }
        }

        if (!nameRaw) {
          rowErrors.push('O Nome do Ativo é obrigatório.');
        }

        if (!categoryRaw) {
          rowErrors.push('A Categoria é obrigatória.');
        } else if (!CATEGORIES_ALLOWED.includes(categoryRaw as AssetCategory)) {
          rowErrors.push(
            `Categoria "${categoryRaw}" inválida. Use: ${CATEGORIES_ALLOWED.join(', ')}.`
          );
        }

        // Validação do valor de aquisição (Opcional)
        let purchase_value = 0;
        if (purchaseValueRaw) {
          purchase_value = Number(purchaseValueRaw.replace(/[R$\s]/g, '').replace(',', '.'));
          if (isNaN(purchase_value) || purchase_value < 0) {
            rowErrors.push('Valor de aquisição inválido.');
          }
        }

        // Validação da data de aquisição
        let purchase_date = '';
        if (purchaseDateRaw) {
          const parsedDate = new Date(purchaseDateRaw);
          if (isNaN(parsedDate.getTime())) {
            // Tenta tratar formato alternativo DD/MM/AAAA
            const parts = purchaseDateRaw.split('/');
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              const altDate = new Date(year, month, day);
              if (!isNaN(altDate.getTime())) {
                purchase_date = altDate.toISOString().split('T')[0];
              } else {
                rowErrors.push('Data de aquisição inválida. Use o formato AAAA-MM-DD.');
              }
            } else {
              rowErrors.push('Data de aquisição inválida. Use o formato AAAA-MM-DD.');
            }
          } else {
            purchase_date = parsedDate.toISOString().split('T')[0];
          }
        }

        // Outros campos opcionais numéricos
        const useful_life_months = usefulLifeRaw ? parseInt(usefulLifeRaw, 10) : 60;
        const residual_value = residualValueRaw 
          ? Number(residualValueRaw.replace(/[R$\s]/g, '').replace(',', '.')) 
          : 0;

        if (usefulLifeRaw && (isNaN(useful_life_months) || useful_life_months <= 0)) {
          rowErrors.push('Vida útil em meses deve ser um número inteiro positivo.');
        }
        if (residualValueRaw && (isNaN(residual_value) || residual_value < 0)) {
          rowErrors.push('Valor residual inválido.');
        }

        rows.push({
          index: rowNumber,
          code: rowCode,
          name: nameRaw,
          category: categoryRaw,
          subcategory,
          brand,
          model,
          serial_number,
          purchase_date,
          purchase_value,
          useful_life_months,
          residual_value,
          notes,
          errors: rowErrors,
          isValid: rowErrors.length === 0
        });
      });

      const validCount = rows.filter((r) => r.isValid).length;
      const invalidCount = rows.length - validCount;

      setParsedRows(rows);
      setImportSummary({ valid: validCount, invalid: invalidCount });

      if (rows.length === 0) {
        setError('Nenhuma linha de ativo válida foi encontrada no arquivo.');
      }
    } catch (err: any) {
      console.error('Erro ao ler planilha:', err);
      setError(`Falha ao ler o arquivo Excel: ${err.message || 'Verifique o formato.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Gravar linhas válidas no banco
  const handleImportData = async () => {
    if (!activeOrganizationId) {
      setError('Organização ativa não encontrada. Por favor, selecione uma organização na barra lateral.');
      return;
    }
    
    if (parsedRows.length === 0) return;

    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      alert('Não há registros válidos para importar.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const inserts: OpuraAssetInsert[] = validRows.map((r) => ({
        organization_id: activeOrganizationId,
        code: r.code,
        name: r.name,
        category: r.category as AssetCategory,
        subcategory: r.subcategory || undefined,
        brand: r.brand || undefined,
        model: r.model || undefined,
        serial_number: r.serial_number || undefined,
        purchase_date: r.purchase_date || undefined,
        purchase_value: r.purchase_value,
        useful_life_months: r.useful_life_months,
        residual_value: r.residual_value,
        status: 'disponivel',
        tracking_code: r.code,
        notes: r.notes || undefined
      }));

      await assetService.createMany(inserts);

      alert(`Sucesso! ${validRows.length} ativos foram importados.`);
      onImportSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao importar ativos em lote:', err);
      setError(`Erro ao gravar dados no Supabase: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl h-full max-h-[85vh] overflow-hidden flex flex-col border border-gray-100">
        
        {/* Cabeçalho */}
        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2 tracking-tight">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Importar Ativos via Planilha
            </h3>
            <p className="text-xs font-semibold text-gray-400 mt-0.5">Suba uma lista de bens em lote a partir do Excel.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo Principal */}
        <div className="p-8 flex-1 overflow-y-auto space-y-6">
          
          {parsedRows.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Dropzone à Esquerda */}
              <div className="md:col-span-2">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer h-64
                    ${isDragging ? 'border-emerald-500 bg-emerald-50/30' : 'border-gray-200 hover:border-emerald-400 hover:bg-gray-50/50'}`}
                >
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    id="assets-excel-upload"
                    onChange={handleFileChange}
                  />
                  {file ? (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <FileSpreadsheet className="w-12 h-12 text-emerald-600 mb-3 animate-pulse" />
                      <p className="font-bold text-gray-800 text-sm">{file.name}</p>
                      <p className="text-xs font-semibold text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setFile(null);
                          }}
                          className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all active:scale-95"
                        >
                          Limpar
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            processFile();
                          }}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
                        >
                          Analisar Planilha
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label htmlFor="assets-excel-upload" className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
                      <Upload className="w-10 h-10 text-gray-300 mb-3" />
                      <p className="font-bold text-gray-700 text-sm">Selecione ou arraste a planilha</p>
                      <p className="text-xs font-semibold text-gray-400 mt-1">Formatos suportados: .xlsx</p>
                    </label>
                  )}
                </div>
              </div>

              {/* Informações e Instruções à Direita */}
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-between">
                <div className="space-y-4">
                  <h4 className="font-black text-gray-800 text-xs uppercase tracking-widest">Instruções de Importação</h4>
                  <ul className="text-xs font-medium text-gray-500 space-y-2.5">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      Campos com asterisco (*) no modelo são de preenchimento obrigatório.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      As categorias válidas são: <strong>{CATEGORIES_ALLOWED.join(', ')}</strong>.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      O código patrimonial de cada ativo deve ser exclusivo no sistema.
                    </li>
                  </ul>
                </div>

                <button
                  onClick={handleDownloadTemplate}
                  className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-2xl text-xs font-bold transition-all"
                >
                  <Download className="w-4 h-4 text-gray-500" />
                  Baixar Planilha Modelo
                </button>
              </div>
            </div>
          ) : (
            // Exibição do Preview dos Dados
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="flex gap-4 text-xs font-bold text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>{importSummary.valid} Válidos</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>{importSummary.invalid} Inválidos</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsedRows([]);
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Carregar Outro Arquivo
                </button>
              </div>

              {/* Tabela de Preview */}
              <div className="border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[40vh] no-scrollbar">
                  <table className="min-w-full divide-y divide-gray-100 text-left text-xs font-medium">
                    <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-6 py-3.5">Linha</th>
                        <th className="px-6 py-3.5">Código</th>
                        <th className="px-6 py-3.5">Nome do Ativo</th>
                        <th className="px-6 py-3.5">Categoria</th>
                        <th className="px-6 py-3.5">Valor (R$)</th>
                        <th className="px-6 py-3.5">Status Validação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white text-gray-700">
                      {parsedRows.map((row) => (
                        <React.Fragment key={row.index}>
                          <tr className={row.isValid ? 'hover:bg-slate-50/50' : 'bg-rose-50/30'}>
                            <td className="px-6 py-3.5 font-bold text-gray-400">#{row.index}</td>
                            <td className="px-6 py-3.5 font-bold">{row.code || 'Vazio'}</td>
                            <td className="px-6 py-3.5 font-semibold">{row.name || 'Vazio'}</td>
                            <td className="px-6 py-3.5 uppercase">{row.category || 'Vazio'}</td>
                            <td className="px-6 py-3.5 font-bold">
                              {row.purchase_value ? `R$ ${row.purchase_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                            </td>
                            <td className="px-6 py-3.5">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Ok
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Erro
                                </span>
                              )}
                            </td>
                          </tr>
                          {!row.isValid && (
                            <tr className="bg-rose-50/20">
                              <td colSpan={6} className="px-8 py-2 text-rose-600 font-semibold border-b border-gray-100 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{row.errors.join(' | ')}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

        </div>

        {/* Rodapé */}
        <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-500 hover:bg-gray-200/50 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
          >
            Cancelar
          </button>
          
          {parsedRows.length > 0 && (
            <button
              onClick={handleImportData}
              disabled={isLoading || importSummary.valid === 0}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isLoading ? 'Importando...' : `Importar ${importSummary.valid} Ativos`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
