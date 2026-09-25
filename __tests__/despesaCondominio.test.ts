// Rótulo de despesa de rateio — as duas funções puras.
// Plano: docs/planos/2026-09-23-despesas-legiveis-e-portal-legado.md
//
// Os casos NÃO são inventados: são as descrições que estavam gravadas no rateio
// 08/2026 de Galeria Altavista em 23/09/2026, quando o condômino passou a ver a
// lista de despesas no portal.
import { describe, it, expect } from 'vitest';
import { rotuloDeDespesa, podarRuidoDeBoleto, rotuloDeFornecedor } from '../utils/despesaCondominio';

describe('podarRuidoDeBoleto', () => {
    it('corta no CNPJ e devolve só o nome', () => {
        expect(podarRuidoDeBoleto(
            'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA - CNPJ: 07604526000120  Ven',
        )).toBe('MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA');
    });

    it('tira o rótulo "BENEFICIÁRIO:" do começo sem comer o nome', () => {
        // Com corte por marcador simples, "BENEFICIÁRIO" no índice 0 zeraria a
        // string inteira — daí o tratamento separado para marcador inicial.
        expect(podarRuidoDeBoleto(
            'BENEFICIÁRIO:ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A. 07.282.377/0001',
        )).toBe('ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A.');
    });

    it('corta a chamada publicitária que o boleto traz junto', () => {
        expect(podarRuidoDeBoleto(
            'ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A.  CADASTRE SUA FATURA EM DÉBITO',
        )).toBe('ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A.');
    });

    it('normaliza o espaçamento do OCR', () => {
        expect(podarRuidoDeBoleto('MN CONSERVAÇÃO   ELEVADORES\n  COM PEÇAS LTDA   CNPJ:   07.604'))
            .toBe('MN CONSERVAÇÃO ELEVADORES COM PEÇAS LTDA');
    });

    it('corta no CNPJ SEM RÓTULO — o caso que escapou da 1ª versão', () => {
        // Achado na prova visual, não no papel: a lista de marcadores procurava
        // a palavra "CNPJ", e o texto real traz só o NÚMERO. O condômino leu
        // "…ENERGIA S.A. 07.282.377/0001-20 47 61" no portal.
        expect(podarRuidoDeBoleto(
            'ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A. 07.282.377/0001-20 47 61',
        )).toBe('ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A.');
        expect(podarRuidoDeBoleto('FULANO DE TAL 123.456.789-00 Ag 0001'))
            .toBe('FULANO DE TAL');
    });

    it('NÃO come número que faz parte da descrição', () => {
        // O corte é pela pontuação de CNPJ/CPF, não por "tem dígito". Um
        // `\d{6,}` genérico decapitaria o que o síndico escreveu.
        expect(podarRuidoDeBoleto('Energia — áreas comuns 08/2026'))
            .toBe('Energia — áreas comuns 08/2026');
        expect(podarRuidoDeBoleto('Reforma do hall — etapa 2 de 3'))
            .toBe('Reforma do hall — etapa 2 de 3');
    });

    it('preserva o ponto da abreviação, apara a pontuação solta', () => {
        // "S.A." é o nome; "LTDA -" tem lixo no fim.
        expect(podarRuidoDeBoleto('ACME S.A. CNPJ: 1')).toBe('ACME S.A.');
        expect(podarRuidoDeBoleto('ACME LTDA - CNPJ: 1')).toBe('ACME LTDA');
    });

    it('texto já limpo passa intacto', () => {
        expect(podarRuidoDeBoleto('Energia das áreas comuns')).toBe('Energia das áreas comuns');
    });
});

describe('rotuloDeDespesa', () => {
    it('nome de arquivo NÃO vira rótulo', () => {
        // É o caso mais comum da base: 'download (98).pdf', 'download (41).pdf'.
        expect(rotuloDeDespesa('download (98).pdf')).toBeNull();
        expect(rotuloDeDespesa('documento_3054431_21_05_2020.pdf')).toBeNull();
    });

    it('cai no credor quando a descrição é só o arquivo', () => {
        expect(rotuloDeDespesa(
            'download (98).pdf',
            'ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A.  CADASTRE SUA FATURA',
        )).toBe('ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A.');
    });

    it('sem descrição e sem credor devolve null — quem chama decide o vazio', () => {
        expect(rotuloDeDespesa(null, null)).toBeNull();
        expect(rotuloDeDespesa('', '')).toBeNull();
        expect(rotuloDeDespesa('download (41).pdf', null)).toBeNull();
    });

    it('descrição escrita à mão pelo síndico vence tudo', () => {
        // O ponto do recurso: depois que alguém escreve a descrição certa, a
        // poda não pode "melhorar" o que já está bom.
        expect(rotuloDeDespesa('Energia — áreas comuns 08/2026', 'ENERGISA … CNPJ: 07'))
            .toBe('Energia — áreas comuns 08/2026');
    });

    it('não devolve fragmento de 1 ou 2 letras', () => {
        // 'A CNPJ 123' podaria para 'A' — rótulo pior que nenhum.
        expect(rotuloDeDespesa('A CNPJ: 123', null)).toBeNull();
    });
});

describe('rotuloDeFornecedor — quem recebeu a despesa', () => {
    it('o fornecedor CADASTRADO ganha do bloco de OCR', () => {
        expect(rotuloDeFornecedor(
            'MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA',
            'MN CONSERVAÇÃO ELEVADORES COM PEÇAS LTDA   CNPJ: 07.604.526/0001-20  Av...',
        )).toBe('MN CONSERVACAO DE ELEVADORES E COMERCIO DE PECAS LTDA');
    });

    it('sem cadastro, o texto cru vai PODADO — não com CNPJ e endereço colados', () => {
        expect(rotuloDeFornecedor(null, 'NEW GRAN ROCHAS LTDA CNPJ: 12.345.678/0001-90 Av. Brasil'))
            .toBe('NEW GRAN ROCHAS LTDA');
    });

    it('cadastro em branco não apaga o texto cru', () => {
        expect(rotuloDeFornecedor('   ', 'JARDINAGEM SILVA LTDA')).toBe('JARDINAGEM SILVA LTDA');
    });

    it('sem nome em lugar nenhum devolve null — a célula decide o texto do vazio', () => {
        expect(rotuloDeFornecedor(null, null)).toBeNull();
        expect(rotuloDeFornecedor(undefined, '')).toBeNull();
    });

    it('é a MESMA resposta para os dois lados do relatório: função pura, sem estado', () => {
        const a = rotuloDeFornecedor('Energisa', null);
        const b = rotuloDeFornecedor('Energisa', 'ENERGISA SUL-SUDESTE - DISTRIBUIDORA DE ENERGIA S.A. CADASTRE');
        expect(a).toBe('Energisa');
        expect(b).toBe('Energisa');
    });
});
