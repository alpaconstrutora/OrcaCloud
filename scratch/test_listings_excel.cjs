const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

try {
  const filePath = path.join(__dirname, '..', 'concorrencia_teste.xlsx');
  console.log('Lendo arquivo:', filePath);
  
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  const firstSheetName = workbook.SheetNames[0];
  console.log('Planilha ativa:', firstSheetName);
  
  const worksheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  console.log('Total de linhas detectadas:', json.length);
  if (json.length > 0) {
    console.log('Cabeçalhos detectados:', json[0]);
    console.log('Primeira linha de dados:', json[1]);
  }
} catch (err) {
  console.error('Falha no processamento:', err);
}
