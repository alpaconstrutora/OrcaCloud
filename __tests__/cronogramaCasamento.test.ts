import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lerMsProjectXml, lerModeloExcel, type CronogramaImportado } from '../utils/cronogramaLeitura';
import { casarComOrcamento, normalizarNome, numeroDaEap } from '../utils/cronogramaCasamento';

// Casamento contra o gabarito dos arquivos de teste (__tests__/fixtures/cronograma/LEIAME.md):
// `itemId` de cada tarefa é o item do orçamento que ela DEVE casar; null = sem par.
const DIR = path.join(__dirname, 'fixtures', 'cronograma');
const gabarito = JSON.parse(readFileSync(path.join(DIR, 'gabarito.json'), 'utf8'));
const orcamento = JSON.parse(readFileSync(path.join(DIR, 'orcamento-divino.json'), 'utf8')).itens;
const xml = () => lerMsProjectXml(readFileSync(path.join(DIR, 'msproject-divino.xml'), 'utf8'));
const esperado = new Map<string, string | null>(gabarito.tarefas.filter((t: { resumo: boolean }) => !t.resumo).map((t: { eap: string; itemId: string | null }) => [t.eap, t.itemId]));

describe('casarComOrcamento', () => {
    it('cada tarefa casa com o item do gabarito; as duas sem par ficam sem par', () => {
        const r = casarComOrcamento(xml(), orcamento);
        expect(r.casamentos).toHaveLength(esperado.size);
        for (const c of r.casamentos) expect(c.itemId, c.tarefa.nome).toBe(esperado.get(c.tarefa.eap));
        expect(r.casamentos.filter(c => !c.itemId).map(c => c.tarefa.nome)).toEqual(['Mobilização do canteiro', 'Aprovação do projeto na prefeitura']);
    });

    it('o item que ficou fora do arquivo aparece em itensSemTarefa', () => {
        const r = casarComOrcamento(xml(), orcamento);
        expect(r.itensSemTarefa).toEqual(gabarito.foraDoArquivo.map((f: { itemId: string }) => f.itemId));
    });

    it('sem a EAP (Project com numeração própria), casa pelo nome — inclusive sem acento', () => {
        const semEap: CronogramaImportado = { ...xml(), tarefas: xml().tarefas.map(t => ({ ...t, eap: `X${t.eap}` })) };
        const r = casarComOrcamento(semEap, orcamento);
        const tapume = r.casamentos.find(c => c.tarefa.nome === 'tapume com telha metalica')!;
        expect(tapume.motivo).toBe('nome');
        expect(tapume.itemId).toBe(esperado.get(tapume.tarefa.eap.slice(1)));
        // homônimos (mesma descrição SINAPI em subetapas diferentes) casam na ordem, sem repetir item
        const ids = r.casamentos.map(c => c.itemId).filter(Boolean);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('o modelo Excel casa igual ao XML', async () => {
        const excel = await lerModeloExcel(readFileSync(path.join(DIR, 'modelo-cronograma.xlsx')));
        const a = casarComOrcamento(xml(), orcamento).casamentos.map(c => [c.tarefa.eap, c.itemId]);
        const b = casarComOrcamento(excel, orcamento).casamentos.map(c => [c.tarefa.eap, c.itemId]);
        expect(b).toEqual(a);
    });

    it('tarefa-resumo nunca casa', () => {
        const r = casarComOrcamento(xml(), orcamento);
        expect(r.casamentos.every(c => !c.tarefa.resumo)).toBe(true);
    });
});

describe('apoio', () => {
    it('normalizarNome e numeroDaEap', () => {
        expect(normalizarNome('  TAPUME COM TELHA METÁLICA. AF_03/2024 ')).toBe('tapume com telha metalica af 03 2024');
        expect(numeroDaEap('04.02.01. Estaca Hélice')).toBe('04.02.01');
        expect(numeroDaEap('Sem número')).toBe('');
    });
});
