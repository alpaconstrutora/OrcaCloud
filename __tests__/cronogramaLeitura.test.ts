import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    lerMsProjectXml, lerModeloExcel, lerLinhasDoModelo, lerPredecessorasDoTexto,
    ErroDeLeituraDeCronograma, type CronogramaImportado,
} from '../utils/cronogramaLeitura';

// Arquivos de teste gerados a partir da EAP real do planejamento Divino (nome anonimizado), com
// replanejamento, avanço diferente, 2 tarefas sem par e 1 item fora do arquivo — ver
// __tests__/fixtures/cronograma/LEIAME.md. O gabarito diz o que cada tarefa deve trazer.
const DIR = path.join(__dirname, 'fixtures', 'cronograma');
const gabarito = JSON.parse(readFileSync(path.join(DIR, 'gabarito.json'), 'utf8'));
const xmlDivino = () => lerMsProjectXml(readFileSync(path.join(DIR, 'msproject-divino.xml'), 'utf8'));

/** Forma comum para comparar os dois formatos: predecessoras pela EAP. */
const normal = (c: CronogramaImportado) => {
    const eapPorChave = new Map(c.tarefas.map(t => [t.chave, t.eap]));
    return c.tarefas.map(t => ({
        eap: t.eap, nome: t.nome, nivel: t.nivel, resumo: t.resumo, marco: t.marco,
        inicio: t.inicio, termino: t.termino, duracaoDias: t.duracaoDias, percentual: t.percentual,
        predecessoras: t.predecessoras.map(p => `${eapPorChave.get(p.chave)} ${p.tipo} ${p.defasagemDias}`),
    }));
};

describe('MS Project XML (MSPDI)', () => {
    it('lê as 58 tarefas do gabarito, sem a tarefa-resumo do projeto (UID 0)', () => {
        const c = xmlDivino();
        expect(c.formato).toBe('msproject-xml');
        expect(c.titulo).toBe('Obra Exemplo — Cronograma replanejado');
        expect(c.tarefas).toHaveLength(gabarito.tarefas.length);
        expect(c.avisos).toEqual([]);
    });

    it('cada tarefa traz EAP, nome com acento, resumo/marco, datas, % e predecessoras do gabarito', () => {
        const porUid = new Map(xmlDivino().tarefas.map(t => [t.chave, t]));
        for (const g of gabarito.tarefas) {
            const t = porUid.get(String(g.uid));
            expect(t, `UID ${g.uid}`).toBeDefined();
            expect({ eap: t!.eap, nome: t!.nome, resumo: t!.resumo, marco: t!.marco, inicio: t!.inicio, termino: t!.termino, duracaoDias: t!.duracaoDias, percentual: t!.percentual })
                .toEqual({ eap: g.eap, nome: g.nome, resumo: g.resumo, marco: g.marco, inicio: g.inicio, termino: g.termino, duracaoDias: g.duracaoDias, percentual: g.percentual });
            expect(t!.predecessoras).toEqual(g.predecessoras.map((p: { uid: number; tipo: string; defasagemDias: number }) =>
                ({ chave: String(p.uid), tipo: p.tipo, defasagemDias: p.defasagemDias })));
        }
    });

    it('folhas em profundidades diferentes (subetapa com 1 item é a própria tarefa)', () => {
        const niveis = new Set(xmlDivino().tarefas.filter(t => !t.resumo).map(t => t.nivel));
        expect([...niveis].sort()).toEqual([2, 3, 4]);
    });

    it('os 4 tipos de vínculo e defasagem em dias (LinkLag em décimos de minuto)', () => {
        const c = lerMsProjectXml(readFileSync(path.join(DIR, 'msproject-pequeno.xml'), 'utf8'));
        const porNome = new Map(c.tarefas.map(t => [t.nome, t]));
        expect(porNome.get('Armação do pavimento térreo')!.predecessoras[0]).toMatchObject({ tipo: 'SS', defasagemDias: 2 });
        expect(porNome.get('Concretagem do pavimento térreo')!.predecessoras[0]).toMatchObject({ tipo: 'FS', defasagemDias: 0 });
        expect(porNome.get('Cura do concreto')!.predecessoras[0]).toMatchObject({ tipo: 'FF', defasagemDias: 5 });
        expect(porNome.get('Desforma')!.predecessoras[0]).toMatchObject({ tipo: 'SF', defasagemDias: -1 });
        expect(porNome.get('Laje do térreo liberada')!.marco).toBe(true);
        expect(porNome.get('Laje do térreo liberada')!.duracaoDias).toBe(0);
        expect(porNome.get('Formas do pavimento térreo')!.duracaoDias).toBe(4);   // ter 01 → sex 04
    });

    it('arquivo que não é XML do Project explica o que fazer', () => {
        expect(() => lerMsProjectXml('isto não é xml')).toThrow(ErroDeLeituraDeCronograma);
        expect(() => lerMsProjectXml('<Planilha><Linha/></Planilha>')).toThrow(/não é um cronograma do MS Project/);
    });

    it('predecessora para tarefa que não está no arquivo sai com aviso', () => {
        const x = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Tasks>
            <Task><UID>1</UID><Name>A</Name><OutlineLevel>1</OutlineLevel><Start>2026-09-01T08:00:00</Start><Finish>2026-09-02T17:00:00</Finish>
            <PredecessorLink><PredecessorUID>99</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink></Task></Tasks></Project>`;
        const c = lerMsProjectXml(x);
        expect(c.tarefas[0].predecessoras).toEqual([]);
        expect(c.avisos[0]).toMatch(/"99" não está no arquivo/);
    });
});

describe('Modelo Excel', () => {
    it('lê o modelo e devolve EXATAMENTE o mesmo que o XML (mesmo conteúdo, dois formatos)', async () => {
        const c = await lerModeloExcel(readFileSync(path.join(DIR, 'modelo-cronograma.xlsx')));
        expect(c.formato).toBe('excel');
        expect(c.avisos).toEqual([]);
        expect(normal(c)).toEqual(normal(xmlDivino()));
    });

    it('cabeçalho sem as colunas obrigatórias diz quais faltam', () => {
        expect(() => lerLinhasDoModelo([['EAP', 'Nome'], ['1', 'A']])).toThrow(/"Início", "Término"/);
    });

    it('aceita data dd/mm/aaaa em texto, % em número inteiro ou com "%", e marco "Sim"', () => {
        const c = lerLinhasDoModelo([
            ['EAP', 'Tarefa', 'Início', 'Término', 'Predecessoras', '% Concluído', 'Marco'],
            ['1', 'Fundação', '01/09/2026', '10/09/2026', '', '40%', ''],
            ['2', 'Fundação pronta', '10/09/2026', '10/09/2026', '1 TI', 100, 'Sim'],
        ]);
        expect(c.tarefas[0]).toMatchObject({ inicio: '2026-09-01', termino: '2026-09-10', percentual: 40, marco: false });
        expect(c.tarefas[1]).toMatchObject({ percentual: 100, marco: true, predecessoras: [{ chave: '1', tipo: 'FS', defasagemDias: 0 }] });
    });

    it('linha sem data entra com aviso, não derruba a leitura', () => {
        const c = lerLinhasDoModelo([['EAP', 'Tarefa', 'Início', 'Término'], ['1', 'Sem data', '', '']]);
        expect(c.tarefas[0].inicio).toBe('');
        expect(c.avisos[0]).toMatch(/sem início/);
    });
});

describe('Predecessoras em texto (modelo Excel)', () => {
    it('tipos em português e inglês, defasagem com sinal, várias separadas por ";"', () => {
        expect(lerPredecessorasDoTexto('04.02.01 TI+2d; 04.03.01 II; 3 TT-1 dia; 5 SF+1,5d; 7')).toEqual([
            { eap: '04.02.01', tipo: 'FS', defasagemDias: 2 },
            { eap: '04.03.01', tipo: 'SS', defasagemDias: 0 },
            { eap: '3', tipo: 'FF', defasagemDias: -1 },
            { eap: '5', tipo: 'SF', defasagemDias: 1.5 },
            { eap: '7', tipo: 'FS', defasagemDias: 0 },
        ]);
    });
    it('o que não entende volta marcado (vira aviso na leitura)', () => {
        expect(Number.isNaN(lerPredecessorasDoTexto('depois da fundação')[0].defasagemDias)).toBe(true);
    });
});
