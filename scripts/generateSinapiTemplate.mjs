/**
 * Gera o arquivo modelo (Modelo_SINAPI.xlsx) para importação de competências SINAPI.
 *
 * O modelo espelha o shape real de sinapi_items (verificado no 12/2025):
 *   - Aba "Itens":       1 linha por código; preços por UF (col <UF>_sem / <UF>_com).
 *   - Aba "Composicoes": 1 linha por componente (relação pai → filho).
 *
 * Uso:
 *   node scripts/generateSinapiTemplate.mjs
 *   (gera ./Modelo_SINAPI.xlsx na raiz do projeto)
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

export const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

async function main() {
  const wb = new ExcelJS.Workbook();

  // ── Aba Itens ───────────────────────────────────────────────────────────────
  const itens = wb.addWorksheet('Itens');
  const baseCols = [
    { header: 'codigo', key: 'codigo', width: 12 },
    { header: 'descricao', key: 'descricao', width: 60 },
    { header: 'unidade', key: 'unidade', width: 10 },
    { header: 'tipo', key: 'tipo', width: 14 },        // COMPOSITION | INPUT | SERVICE
    { header: 'natureza', key: 'natureza', width: 16 }, // Material | Mão de Obra | Equipamento | Composição
    { header: 'grupo', key: 'grupo', width: 30 },
  ];
  // 2 colunas de preço por UF: <UF>_sem e <UF>_com (desoneração)
  const priceCols = UFS.flatMap(uf => ([
    { header: `${uf}_sem`, key: `${uf}_sem`, width: 10 },
    { header: `${uf}_com`, key: `${uf}_com`, width: 10 },
  ]));
  itens.columns = [...baseCols, ...priceCols];
  itens.getRow(1).font = { bold: true };

  // Linha de exemplo (insumo)
  const exInput = {
    codigo: '2', descricao: 'OXIGENIO - RECARGA DE GAS PARA CILINDRO', unidade: 'M3',
    tipo: 'INPUT', natureza: 'Material', grupo: 'MATERIAL',
    MG_sem: 17.16, MG_com: 17.16, SP_sem: 24.10, SP_com: 24.10,
  };
  // Linha de exemplo (composição) — os componentes vão na aba Composicoes
  const exComp = {
    codigo: '102508', descricao: 'PINTURA DE FAIXA DE PEDESTRE, TINTA EPÓXI. AF_05/2021', unidade: 'M2',
    tipo: 'COMPOSITION', natureza: 'Composição', grupo: 'Pintura para Pisos e Sinalização',
    MG_sem: 55.07, MG_com: 53.64, SP_sem: 56.47, SP_com: 54.84,
  };
  itens.addRow(exInput);
  itens.addRow(exComp);

  // ── Aba Composicoes ──────────────────────────────────────────────────────────
  const comp = wb.addWorksheet('Composicoes');
  comp.columns = [
    { header: 'codigo_pai', key: 'codigo_pai', width: 12 },
    { header: 'codigo_item', key: 'codigo_item', width: 12 },
    { header: 'descricao_item', key: 'descricao_item', width: 55 },
    { header: 'unidade_item', key: 'unidade_item', width: 12 },
    { header: 'tipo_item', key: 'tipo_item', width: 14 },     // COMPOSITION | INPUT
    { header: 'coeficiente', key: 'coeficiente', width: 14 }, // quantidade
  ];
  comp.getRow(1).font = { bold: true };
  // Componentes de exemplo da composição 102508
  comp.addRow({ codigo_pai: '102508', codigo_item: '88316', descricao_item: 'SERVENTE COM ENCARGOS COMPLEMENTARES', unidade_item: 'H', tipo_item: 'COMPOSITION', coeficiente: 0.18 });
  comp.addRow({ codigo_pai: '102508', codigo_item: '88310', descricao_item: 'PINTOR COM ENCARGOS COMPLEMENTARES', unidade_item: 'H', tipo_item: 'COMPOSITION', coeficiente: 0.432 });
  comp.addRow({ codigo_pai: '102508', codigo_item: '7304', descricao_item: 'TINTA EPOXI BASE AGUA PREMIUM, BRANCA', unidade_item: 'L', tipo_item: 'INPUT', coeficiente: 0.322 });

  const outPath = path.join(root, 'Modelo_SINAPI.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ Modelo gerado: ${outPath}`);
  console.log('   Abas: "Itens" (preços por UF) e "Composicoes" (relação pai→filho).');
}

main().catch(err => {
  console.error('❌ Falha ao gerar modelo:', err.message || err);
  process.exit(1);
});
