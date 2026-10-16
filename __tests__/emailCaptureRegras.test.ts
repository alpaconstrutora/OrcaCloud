/**
 * Regras da captura de boletos por e-mail (utils/emailCaptureRegras.ts).
 * Plano: docs/planos/2026-10-15-captura-boletos-por-email.md, item 3.1.
 *
 * O que fica provado: remetente favorito NÃO basta. Cada perna derrubada
 * sozinha manda para revisão com o motivo escrito; e Authentication-Results
 * forjado pelo remetente não conta.
 */
import { describe, it, expect } from 'vitest';
import {
    parseAuthenticationResults,
    extrairEndereco,
    remetenteCasa,
    deveProcessar,
    ignorarPdfSemBoleto,
    decidirDestino,
    proximaTentativa,
    pareceSenhaDePdf,
    normalizarFiltroRemetente,
    remetenteNoFiltro,
    criterioImapDosRemetentes,
    type RemetenteMonitorado,
    type EntradaDestino,
} from '../utils/emailCaptureRegras';

const GMAIL_OK = `mx.google.com;
       dkim=pass header.i=@acme.com.br header.s=s1 header.b=abc;
       spf=pass (google.com: domain of cobranca@acme.com.br designates 1.2.3.4 as permitted sender) smtp.mailfrom=cobranca@acme.com.br;
       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=acme.com.br`;

const remetente = (p: Partial<RemetenteMonitorado> = {}): RemetenteMonitorado => ({
    id: 's1', tipo: 'exato', email: 'cobranca@acme.com.br', dominio: null, palavras_chave: [],
    importacao: 'automatica', exigir_dmarc: true, ativo: true, supplier_id: 'sup-1', ...p,
});

describe('parseAuthenticationResults', () => {
    it('lê spf/dkim/dmarc e o header.from do cabeçalho do Gmail', () => {
        expect(parseAuthenticationResults([GMAIL_OK])).toEqual({
            spf: 'pass', dkim: 'pass', dmarc: 'pass', headerFrom: 'acme.com.br', servidor: 'mx.google.com',
        });
    });

    it('ignora Authentication-Results forjado pelo remetente (outro authserv-id)', () => {
        const forjado = 'mail.golpe.com; dmarc=pass header.from=banco.com.br; spf=pass; dkim=pass';
        expect(parseAuthenticationResults([forjado]).dmarc).toBe('none');
    });

    it('vale o PRIMEIRO cabeçalho do Gmail; um "mx.google.com" mais abaixo é do remetente', () => {
        const real = 'mx.google.com; dmarc=fail (p=REJECT) header.from=banco.com.br; spf=fail';
        const forjadoAbaixo = 'mx.google.com; dmarc=pass header.from=banco.com.br';
        expect(parseAuthenticationResults([real, forjadoAbaixo]).dmarc).toBe('fail');
    });

    it('sem cabeçalho → tudo none', () => {
        expect(parseAuthenticationResults([])).toMatchObject({ spf: 'none', dkim: 'none', dmarc: 'none', servidor: null });
    });
});

describe('extrairEndereco e remetenteCasa', () => {
    it('extrai endereço e domínio, em minúsculas', () => {
        expect(extrairEndereco('ACME Cobrança <Cobranca@ACME.com.br>')).toEqual({ endereco: 'cobranca@acme.com.br', dominio: 'acme.com.br' });
        expect(extrairEndereco('cobranca@acme.com.br')).toEqual({ endereco: 'cobranca@acme.com.br', dominio: 'acme.com.br' });
        expect(extrairEndereco('sem endereço')).toBeNull();
    });

    it('exato ganha de domínio; domínio casa subdomínio', () => {
        const porDominio = remetente({ id: 'd', tipo: 'dominio', email: null, dominio: 'acme.com.br' });
        const exato = remetente({ id: 'e' });
        expect(remetenteCasa('cobranca@acme.com.br', '', [porDominio, exato])?.id).toBe('e');
        expect(remetenteCasa('nf@financeiro.acme.com.br', '', [porDominio, exato])?.id).toBe('d');
        expect(remetenteCasa('x@acme.com.br.golpe.com', '', [porDominio])).toBeNull();
    });

    it('palavras-chave (sem acento) no assunto ou no nome do anexo', () => {
        const r = remetente({ palavras_chave: ['cobrança'] });
        expect(remetenteCasa('cobranca@acme.com.br', 'Sua COBRANCA de outubro', [r])).not.toBeNull();
        expect(remetenteCasa('cobranca@acme.com.br', 'Newsletter', [r])).toBeNull();
    });

    it('inativo não casa', () => {
        expect(remetenteCasa('cobranca@acme.com.br', '', [remetente({ ativo: false })])).toBeNull();
    });

    it('modo favoritos só processa monitorado; híbrido e todos processam tudo', () => {
        expect(deveProcessar('favoritos', null)).toBe(false);
        expect(deveProcessar('favoritos', remetente())).toBe(true);
        expect(deveProcessar('hibrido', null)).toBe(true);
        expect(deveProcessar('todos', null)).toBe(true);
    });
});

describe('decidirDestino — todas as pernas ou revisão', () => {
    const ok = (): EntradaDestino => ({
        modoPiloto: false,
        remetente: remetente(),
        auth: parseAuthenticationResults([GMAIL_OK]),
        dominioFrom: 'acme.com.br',
        checksumValido: true,
        vencimento: '2026-11-10',
        fornecedoresDoCnpj: ['sup-1'],
        cnpjConfianca: 80,
    });

    it('tudo certo → rascunho com o fornecedor', () => {
        expect(decidirDestino(ok())).toEqual({ status: 'rascunho', supplierId: 'sup-1', sugestaoSupplierId: 'sup-1', motivos: [] });
    });

    const casos: Array<[string, (e: EntradaDestino) => void, RegExp]> = [
        ['modo piloto', e => { e.modoPiloto = true; }, /piloto/],
        ['remetente desconhecido', e => { e.remetente = null; }, /não está entre os monitorados/],
        ['remetente em revisão', e => { e.remetente = remetente({ importacao: 'revisao' }); }, /configurado para revisão/],
        ['DMARC não passou', e => { e.auth = { ...e.auth, dmarc: 'fail' }; }, /DMARC: fail/],
        ['DMARC de outro domínio', e => { e.auth = { ...e.auth, headerFrom: 'outro.com' }; }, /domínio autenticado/],
        ['DV inválido', e => { e.checksumValido = false; }, /dígito verificador/],
        ['sem vencimento', e => { e.vencimento = null; }, /Vencimento/],
        ['CNPJ incerto', e => { e.cnpjConfianca = 60; }, /CNPJ do beneficiário/],
        ['fornecedor não cadastrado', e => { e.fornecedoresDoCnpj = []; }, /não cadastrado/],
        ['CNPJ ambíguo', e => { e.fornecedoresDoCnpj = ['a', 'b']; }, /Mais de um fornecedor/],
        ['beneficiário trocado', e => { e.fornecedoresDoCnpj = ['sup-OUTRO']; }, /não é o fornecedor deste remetente/],
    ];
    for (const [nome, mexer, motivo] of casos) {
        it(`${nome} → revisão com motivo`, () => {
            const e = ok();
            mexer(e);
            const d = decidirDestino(e);
            expect(d.status).toBe('revisao');
            expect(d.supplierId).toBeNull();
            expect(d.motivos.join(' | ')).toMatch(motivo);
        });
    }

    it('remetente sem exigir DMARC dispensa só essa perna', () => {
        const e = ok();
        e.remetente = remetente({ exigir_dmarc: false });
        e.auth = { ...e.auth, dmarc: 'none' };
        expect(decidirDestino(e).status).toBe('rascunho');
    });

    it('em revisão, o fornecedor único ainda vira sugestão', () => {
        const e = ok();
        e.modoPiloto = true;
        expect(decidirDestino(e).sugestaoSupplierId).toBe('sup-1');
    });
});

describe('proximaTentativa', () => {
    it('15 min, 1 h, 4 h, depois para', () => {
        const t0 = new Date('2026-10-15T12:00:00Z');
        expect(proximaTentativa(1, t0)?.toISOString()).toBe('2026-10-15T12:15:00.000Z');
        expect(proximaTentativa(2, t0)?.toISOString()).toBe('2026-10-15T13:00:00.000Z');
        expect(proximaTentativa(3, t0)?.toISOString()).toBe('2026-10-15T16:00:00.000Z');
        expect(proximaTentativa(4, t0)).toBeNull();
    });
});

describe('pareceSenhaDePdf — senha digitada em Palavras-chave (16/10/2026)', () => {
    it('número puro de 3 a 14 dígitos parece senha', () => {
        expect(pareceSenhaDePdf('1234')).toBe(true);
        expect(pareceSenhaDePdf(' 09264 ')).toBe(true);
        expect(pareceSenhaDePdf('12345678901234')).toBe(true);
    });
    it('texto, número curto demais ou longo demais não', () => {
        expect(pareceSenhaDePdf('boleto')).toBe(false);
        expect(pareceSenhaDePdf('fatura 2026')).toBe(false);
        expect(pareceSenhaDePdf('12')).toBe(false);
        expect(pareceSenhaDePdf('123456789012345')).toBe(false);
        expect(pareceSenhaDePdf('')).toBe(false);
    });
});

describe('fornecedor do remetente como sugestão quando o PDF não tem CNPJ (16/10/2026)', () => {
    const base = (): EntradaDestino => ({
        modoPiloto: false, remetente: remetente({ supplier_id: 'sup-energisa' }),
        auth: parseAuthenticationResults([GMAIL_OK]), dominioFrom: 'acme.com.br',
        checksumValido: true, vencimento: '2026-10-02', fornecedoresDoCnpj: [], cnpjConfianca: 0,
    });

    it('sem CNPJ: sugere o fornecedor do remetente, mas continua em revisão e sem supplier_id', () => {
        const d = decidirDestino(base());
        expect(d.status).toBe('revisao');
        expect(d.supplierId).toBeNull();
        expect(d.sugestaoSupplierId).toBe('sup-energisa');
        expect(d.motivos.join(' ')).toMatch(/CNPJ do beneficiário/);
    });

    it('CNPJ de OUTRO beneficiário: não sugere o do remetente (é alerta, não sugestão)', () => {
        const e = base();
        e.cnpjConfianca = 80;
        e.fornecedoresDoCnpj = ['sup-outro'];
        expect(decidirDestino(e).sugestaoSupplierId).toBe('sup-outro');
    });

    it('CNPJ confiável mas sem cadastro na org: sem sugestão', () => {
        const e = base();
        e.cnpjConfianca = 80;
        expect(decidirDestino(e).sugestaoSupplierId).toBeNull();
    });

    it('remetente sem fornecedor vinculado: sem sugestão', () => {
        const e = base();
        e.remetente = remetente({ supplier_id: null });
        expect(decidirDestino(e).sugestaoSupplierId).toBeNull();
    });
});

describe('filtro de remetentes da busca por período (16/10/2026)', () => {
    it('normaliza e-mail exato e domínio; recusa o resto', () => {
        expect(normalizarFiltroRemetente(' Cobranca@ACME.com.br ')).toEqual({ tipo: 'email', valor: 'cobranca@acme.com.br' });
        expect(normalizarFiltroRemetente('energisaonline.com.br')).toEqual({ tipo: 'dominio', valor: 'energisaonline.com.br' });
        expect(normalizarFiltroRemetente('@energisa.com.br')).toEqual({ tipo: 'dominio', valor: 'energisa.com.br' });
        expect(normalizarFiltroRemetente('energisa')).toBeNull();
        expect(normalizarFiltroRemetente('a b@x.com')).toBeNull();
        expect(normalizarFiltroRemetente('')).toBeNull();
    });

    it('confere exato: e-mail igual; domínio e subdomínio — e NÃO o trecho que o IMAP casaria', () => {
        const f = ['energisaonline.com.br', 'faturas@energisa.com.br'];
        expect(remetenteNoFiltro('Energisa <reavisoenergisa03@energisaonline.com.br>', f)).toBe(true);
        expect(remetenteNoFiltro('x@mail.energisaonline.com.br', f)).toBe(true);
        expect(remetenteNoFiltro('faturas@energisa.com.br', f)).toBe(true);
        expect(remetenteNoFiltro('golpe@falso-energisaonline.com.br', f)).toBe(false);
        expect(remetenteNoFiltro('outro@energisa.com.br', f)).toBe(false);
        expect(remetenteNoFiltro(null, f)).toBe(false);
    });

    it('filtro vazio = todos', () => {
        expect(remetenteNoFiltro('qualquer@x.com', [])).toBe(true);
        expect(remetenteNoFiltro('qualquer@x.com', null)).toBe(true);
    });

    it('critério IMAP: nada, FROM único ou OR de vários', () => {
        expect(criterioImapDosRemetentes([])).toEqual({});
        expect(criterioImapDosRemetentes(['ACME.com.br'])).toEqual({ from: 'acme.com.br' });
        expect(criterioImapDosRemetentes(['a@x.com', 'y.com.br'])).toEqual({ or: [{ from: 'a@x.com' }, { from: 'y.com.br' }] });
    });
});

describe('PDF sem linha digitável de remetente avulso (16/10/2026)', () => {
    const base = { modo: 'hibrido' as const, remetenteMonitorado: false, escolhidoNaBusca: false, temLinhaValida: false };

    it('híbrido e favoritos: ignora o PDF sem linha de quem não é monitorado', () => {
        expect(ignorarPdfSemBoleto(base)).toBe(true);
        expect(ignorarPdfSemBoleto({ ...base, modo: 'favoritos' })).toBe(true);
    });

    it('com linha válida, monitorado ou escolhido na busca: vira boleto', () => {
        expect(ignorarPdfSemBoleto({ ...base, temLinhaValida: true })).toBe(false);
        expect(ignorarPdfSemBoleto({ ...base, remetenteMonitorado: true })).toBe(false);
        expect(ignorarPdfSemBoleto({ ...base, escolhidoNaBusca: true })).toBe(false);
    });

    it('"todos" continua trazendo qualquer PDF', () => {
        expect(ignorarPdfSemBoleto({ ...base, modo: 'todos' })).toBe(false);
    });
});
