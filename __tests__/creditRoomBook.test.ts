/**
 * Book de crédito em PDF (utils/creditRoomBook.ts).
 *
 * O que estes testes protegem:
 *  - o book sai SÓ da versão congelada: o valor máximo é o número congelado (Base do estresse incluído);
 *  - nome de cliente nunca sai: só o rótulo mascarado da carteira;
 *  - versão schema 1 (ou sem capacidade / sem fotos) gera sem erro, com a frase no lugar do bloco;
 *  - foto que não carrega, ou dataURL inválido, não derruba o book;
 *  - a marca d'água do credor aparece em TODAS as páginas.
 *
 * O jsPDF não comprime por padrão: o texto está legível em `doc.output()`.
 */
import { describe, expect, it } from 'vitest';
import type { jsPDF } from 'jspdf';
import { formatMoney } from '../components/ui/Format';
import { CENARIOS_ESTRESSE, estresseDaVersao, fluxosDaOperacao, resumoDaCapacidade } from '../utils/creditCapacity';
import { fotosDoEmpreendimento, montarBook, urlsDasFotosDoBook } from '../utils/creditRoomBook';
import {
    extrasPadrao, NOME_DE_CLIENTE, VALOR_MAXIMO_CONGELADO, versaoSchema1, versaoSchema2,
} from './fixtures/creditRoomBookFixture';

const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const BARRA = String.fromCharCode(92);
/** Parênteses saem escapados no fluxo do PDF (barra + parêntese): volta ao texto da tela. */
const semEscape = (s: string): string => s.replace(NBSP, ' ')
    .split(`${BARRA}(`).join('(').split(`${BARRA})`).join(')');
/** Texto de todas as páginas, com o espaço não separável do formatMoney normalizado. */
const texto = (doc: jsPDF): string => semEscape(doc.output());
/** O conteúdo de cada página, separado (para provar "em TODA página"). */
const paginas = (doc: jsPDF): string[] => (doc.internal as unknown as { pages: string[][] }).pages
    .slice(1).map(p => semEscape(p.join('\n')));
const dinheiro = (v: number) => formatMoney(v).replace(NBSP, ' ');

describe('montarBook - versão schema 2', () => {
    const v = versaoSchema2();
    const doc = montarBook(v, extrasPadrao());
    const t = texto(doc);

    it('gera um PDF com várias páginas', () => {
        expect(doc.getNumberOfPages()).toBeGreaterThan(3);
        expect(doc.output().startsWith('%PDF')).toBe(true);
    });

    it('capa e rodapé: código, nome, versão e data-base', () => {
        expect(t).toContain('CR-0007');
        expect(t).toContain('Operação Torre B');
        expect(t).toContain('Banco Exemplo');
        expect(t).toContain('V3');
        expect(t).toContain('20/11/2026');
        // A legenda do "n/d" está na capa (1ª página), não só na seção de estresse.
        expect(paginas(doc)[0]).toContain('n/d = dado não disponível nesta versão');
        const total = doc.getNumberOfPages();
        paginas(doc).forEach((p, i) => {
            expect(p).toContain(`CR-0007 · V3 · data-base 20/11/2026 · página ${i + 1}/${total}`);
        });
    });

    it('capacidade: o valor máximo é o congelado, "sobre a dívida atual", e a comparação com o pedido', () => {
        expect(t).toContain('Valor máximo do empréstimo');
        expect(t).toContain('sobre a dívida atual');
        expect(t).toContain(dinheiro(VALOR_MAXIMO_CONGELADO));
        // pedido R$ 5 mi > máximo congelado
        expect(t).toContain(`pedido ${dinheiro(5_000_000)} acima do máximo`);
        expect(t).toContain('DSCR mínimo 12m (pós-operação)');
        expect(t).toContain('com a operação pedida');
    });

    it('estresse: os 3 cenários, com o Base igual ao congelado', () => {
        for (const c of CENARIOS_ESTRESSE) expect(t).toContain(c.nome);
        const cap = v.snapshot.capacidade!;
        const fluxos = fluxosDaOperacao(v.snapshot);
        const severo = estresseDaVersao(cap, CENARIOS_ESTRESSE[2], fluxos);
        expect(t).toContain(dinheiro(severo.capacidade_maxima.valor_maximo));
        // O Base não é recalculado: o valor máximo dele é o congelado, e o DSCR é o do resumo.
        const resumo = resumoDaCapacidade(cap)!;
        const dscr = (resumo.dscr_minimo_12m as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        expect(t).toContain(`${dscr}×`);
    });

    it('estresse: a linha Base usa o valor máximo CONGELADO, não uma recomputação', () => {
        const cap = v.snapshot.capacidade!;
        const recalculado = estresseDaVersao(cap, CENARIOS_ESTRESSE[0], fluxosDaOperacao(v.snapshot)).capacidade_maxima.valor_maximo;
        // O congelado é DE PROPÓSITO diferente do que a série daria: se o Base fosse recalculado, aparece o outro número.
        const congelado = recalculado + 777_700;
        expect(congelado).not.toBe(recalculado);
        const adulterada = {
            ...v, snapshot: { ...v.snapshot, capacidade: { ...cap, capacidade_maxima: { ...cap.capacidade_maxima, valor_maximo: congelado } } },
        };
        const pagina = paginas(montarBook(adulterada, extrasPadrao())).find(p => p.includes('Teste de estresse'));
        expect(pagina).toBeDefined();
        expect(pagina).toContain(dinheiro(congelado));
        // O número recalculado do Base só pode aparecer se Moderado/Severo calcularem o mesmo valor (ex.: 0).
        const fluxos = fluxosDaOperacao(v.snapshot);
        const esperadas = CENARIOS_ESTRESSE.slice(1)
            .filter(c => estresseDaVersao(cap, c, fluxos).capacidade_maxima.valor_maximo === recalculado).length;
        expect(pagina!.split(dinheiro(recalculado)).length - 1).toBe(esperadas);
    });

    it('carteira: só rótulos mascarados, nunca o nome do cliente', () => {
        expect(t).toContain('Comprador 01');
        expect(t).toContain('Comprador 02');
        expect(t).toContain('Locatário 01');
        expect(t).not.toContain(NOME_DE_CLIENTE);
        expect(t).not.toContain('Zeferino');
        // Locação sem parcelas geradas: o aluguel vem do contrato (regra da tela).
        expect(t).toContain('aluguel pelo contrato');
        expect(t).toContain('Em atraso');
    });

    it('empreendimentos: nome e números; sem fotos → frase no lugar do bloco', () => {
        expect(t).toContain('Garden Cambuhy');
        expect(t).toContain('Residencial Sem Fotos');
        expect(t).toContain('Sem fotos nesta versão.');
    });

    it('índice do Data Room traz os nomes, com a empresa no grupo', () => {
        expect(t).toContain('Matrícula do terreno.pdf');
        expect(t).toContain('Certidão negativa.pdf');
        expect(t).toContain('Alpha Empreendimentos');
    });
});

describe('montarBook - versão sem capacidade', () => {
    it('schema 1 gera sem quebrar, dizendo por quê, e não traz os números de capacidade', () => {
        const doc = montarBook(versaoSchema1(), extrasPadrao());
        const t = texto(doc);
        expect(doc.getNumberOfPages()).toBeGreaterThan(1);
        expect(t).toContain('versão congelada antes da capacidade de pagamento');
        expect(t).not.toContain('Valor máximo do empréstimo');
        expect(t).not.toContain('Moderado');
        // O resumo da operação continua: o book não fica vazio.
        expect(t).toContain('Resumo da operação e indicadores');
        expect(t).toContain('CR-0007');
    });

    it('schema 2 com capacidade null: frase no lugar, sem erro', () => {
        const v = versaoSchema2();
        const doc = montarBook({ ...v, snapshot: { ...v.snapshot, capacidade: null, qualidade: null } }, extrasPadrao());
        const t = texto(doc);
        expect(t).toContain('versão congelada antes da capacidade de pagamento');
        // Sem capacidade a qualidade da renda não entra (a frase da seção já explica).
        expect(t).not.toContain('Concentração nos 5 maiores pagadores');
    });

    it('capacidade sem meses projetados: frase, e valor ausente é n/d (nunca zero)', () => {
        const v = versaoSchema2();
        const cap = { ...v.snapshot.capacidade!, serie: [] };
        const t = texto(montarBook({ ...v, snapshot: { ...v.snapshot, capacidade: cap } }, extrasPadrao()));
        expect(t).toContain('sem meses projetados nesta versão');
        expect(t).toContain('Esta versão não tem meses projetados');
    });

    it('qualidade da renda ausente: frase', () => {
        const v = versaoSchema2();
        const t = texto(montarBook({ ...v, snapshot: { ...v.snapshot, qualidade: null } }, extrasPadrao()));
        expect(t).toContain('Esta versão não calculou a qualidade da renda');
    });

    it('sem empreendimentos nem carteira (schema 1): frase em cada seção, sem erro', () => {
        const t = texto(montarBook(versaoSchema1(), extrasPadrao({ documentos: [] })));
        expect(t).toContain('Nenhum documento compartilhado nesta operação.');
        expect(t.match(/versão congelada antes da capacidade de pagamento/g)!.length).toBeGreaterThanOrEqual(4);
    });
});

describe('montarBook - fotos', () => {
    it('imagem com dataURL inválido e foto ausente não derrubam a geração', () => {
        const doc = montarBook(versaoSchema2(), extrasPadrao({
            imagens: { 'https://x.test/capa-1.jpg': 'data:image/jpeg;base64,AAAA', 'https://x.test/foto-2.jpg': 'lixo' },
        }));
        expect(doc.getNumberOfPages()).toBeGreaterThan(3);
        expect(texto(doc)).toContain('Sem fotos nesta versão.');
    });

    it('com imagem válida o JPEG entra no PDF (capa e empreendimento)', () => {
        const comFoto = montarBook(versaoSchema2(), extrasPadrao());
        const semFoto = montarBook(versaoSchema2(), extrasPadrao({ imagens: {} }));
        expect(comFoto.output().includes('/DCTDecode')).toBe(true);
        expect(semFoto.output().includes('/DCTDecode')).toBe(false);
    });

    it('o service e o book escolhem as mesmas fotos: capa primeiro, sem repetir, no máximo 4', () => {
        const e = versaoSchema2().snapshot.empreendimentos![0];
        const urls = fotosDoEmpreendimento(e);
        expect(urls).toHaveLength(4);
        expect(urls[0]).toBe(e.capa);
        expect(new Set(urls).size).toBe(4);
        expect(urlsDasFotosDoBook(versaoSchema2())).toEqual(urls);
    });
});

describe('montarBook - marca d\'água', () => {
    it('aparece em todas as páginas', () => {
        const marca = 'analista@banco.com · 22/11/2026 14:05';
        const doc = montarBook(versaoSchema2(), extrasPadrao({ marcaDagua: marca }));
        const ps = paginas(doc);
        expect(ps.length).toBeGreaterThan(3);
        for (const p of ps) expect(p).toContain(marca);
    });

    it('sem marca, nenhuma página a leva', () => {
        const t = texto(montarBook(versaoSchema2(), extrasPadrao()));
        expect(t).not.toContain('analista@banco.com');
    });
});
