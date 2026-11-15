/**
 * Modelo Excel de cronograma para baixar e preencher (importação em Engenharia › Planejamento,
 * item 2 de docs/planos/2026-11-14-planejamento-lista-critica.md). Os cabeçalhos são os que
 * `lerLinhasDoModelo` (utils/cronogramaLeitura.ts) reconhece.
 */
export const NOME_DO_MODELO = 'modelo-cronograma-opura.xlsx';

export const AJUDA_DO_MODELO: [string, string][] = [
    ['EAP', 'Número da tarefa na EAP, com pontos (ex.: 04.02.01). Tarefa com filhas é resumo: as datas dela vêm das filhas. Para casar com o orçamento, use o número do item como está no orçamento.'],
    ['Tarefa', 'Nome da tarefa. Sem EAP igual, o casamento é pelo nome do serviço ou da subetapa como está no orçamento.'],
    ['Início / Término', 'Datas no formato dd/mm/aaaa. Término = último dia de trabalho. As datas entram como estão — o app não recalcula na importação.'],
    ['Duração (dias úteis)', 'Dias de trabalho. Sem ela, conta-se os dias úteis do início ao término. Marco = 0.'],
    ['Predecessoras', 'EAP da predecessora + tipo: TI (término→início), II (início→início), TT (término→término), IT (início→término), com defasagem opcional em dias: "04.02.01 TI+2d; 04.03.01 II". Várias separadas por ponto e vírgula.'],
    ['% Concluído', 'De 0% a 100%.'],
    ['Marco', '"Sim" para marcos (duração zero).'],
];

export async function gerarModeloDeCronograma(): Promise<Blob> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ÒPURA';
    const ws = wb.addWorksheet('Cronograma', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
        { header: 'EAP', key: 'eap', width: 12 },
        { header: 'Tarefa', key: 'tarefa', width: 50 },
        { header: 'Início', key: 'ini', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
        { header: 'Término', key: 'fim', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
        { header: 'Duração (dias úteis)', key: 'dur', width: 12 },
        { header: 'Predecessoras', key: 'pred', width: 28 },
        { header: '% Concluído', key: 'pct', width: 12, style: { numFmt: '0%' } },
        { header: 'Marco', key: 'marco', width: 8 },
    ];
    ws.getRow(1).font = { bold: true };
    // Linhas de exemplo — apagar antes de preencher.
    const d = (s: string) => new Date(`${s}T12:00:00`);
    ws.addRow({ eap: '01', tarefa: 'Serviços iniciais', ini: d('2026-08-03'), fim: d('2026-08-14'), dur: 10, pct: 0 }).font = { bold: true };
    ws.addRow({ eap: '01.01', tarefa: 'Mobilização do canteiro', ini: d('2026-08-03'), fim: d('2026-08-07'), dur: 5, pct: 0 });
    ws.addRow({ eap: '01.02', tarefa: 'Locação da obra', ini: d('2026-08-10'), fim: d('2026-08-14'), dur: 5, pred: '01.01 TI', pct: 0 });
    ws.addRow({ eap: '01.03', tarefa: 'Canteiro liberado', ini: d('2026-08-14'), fim: d('2026-08-14'), dur: 0, pred: '01.02 TT', pct: 0, marco: 'Sim' });
    const ajuda = wb.addWorksheet('Como preencher');
    ajuda.addRow(['Como preencher o modelo de cronograma do ÒPURA']).font = { bold: true, size: 13 };
    ajuda.addRow(['Apague as linhas de exemplo da aba Cronograma antes de preencher. Use uma linha por tarefa, na ordem da EAP.']);
    ajuda.addRow([]);
    AJUDA_DO_MODELO.forEach(l => ajuda.addRow(l));
    ajuda.getColumn(1).width = 22;
    ajuda.getColumn(2).width = 110;
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
