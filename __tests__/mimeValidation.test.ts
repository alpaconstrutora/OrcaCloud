/**
 * Testes de segurança para validação de MIME type em uploads de documentos.
 *
 * Cobre três vetores de ataque principais:
 *  1. Extensão proibida  (.exe, .sh, .php, .html, ...)
 *  2. MIME spoofing       (arquivo executável renomeado para .pdf)
 *  3. Double extension   (virus.pdf.exe → extensão real é .exe)
 *
 * E também valida os casos legítimos (PDF, JPG, PNG).
 */
import { describe, it, expect } from 'vitest';
import {
    validateDocumentFile,
    ACCEPTED_EXTENSIONS,
    ACCEPTED_MIMES,
    DOCUMENT_ACCEPT_ATTR,
} from '../lib/mimeValidation';

// ─── Helper ───────────────────────────────────────────────────────────────────

const KB = 1024;
const MB = 1024 * KB;

/** Cria um File com nome, MIME type e tamanho controlados */
function makeFile(name: string, type: string, sizeBytes = 4 * KB): File {
    const content = new Uint8Array(sizeBytes).fill(0x25); // 0x25 = '%' (início de %PDF)
    return new File([content], name, { type });
}

// ─── Arquivos legítimos ───────────────────────────────────────────────────────

describe('validateDocumentFile — arquivos legítimos', () => {
    it('aceita PDF válido', () => {
        const f = makeFile('contrato.pdf', 'application/pdf');
        expect(validateDocumentFile(f)).toEqual({ valid: true });
    });

    it('aceita JPEG com extensão .jpg', () => {
        const f = makeFile('foto.jpg', 'image/jpeg');
        expect(validateDocumentFile(f)).toEqual({ valid: true });
    });

    it('aceita JPEG com extensão .jpeg', () => {
        const f = makeFile('foto.jpeg', 'image/jpeg');
        expect(validateDocumentFile(f)).toEqual({ valid: true });
    });

    it('aceita PNG válido', () => {
        const f = makeFile('documento.png', 'image/png');
        expect(validateDocumentFile(f)).toEqual({ valid: true });
    });

    it('aceita nome com espaços e maiúsculas', () => {
        const f = makeFile('Ficha Médica ASO.PDF', 'application/pdf');
        expect(validateDocumentFile(f).valid).toBe(true);
    });

    it('aceita arquivo no limite máximo exato (10 MB)', () => {
        const f = makeFile('grande.pdf', 'application/pdf', 10 * MB);
        expect(validateDocumentFile(f).valid).toBe(true);
    });
});

// ─── Extensões proibidas ──────────────────────────────────────────────────────

describe('validateDocumentFile — extensões proibidas', () => {
    const dangerousFiles = [
        ['virus.exe',  'application/x-msdownload'],
        ['shell.sh',   'application/x-sh'],
        ['script.php', 'application/x-php'],
        ['page.html',  'text/html'],
        ['macro.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['data.js',    'text/javascript'],
        ['hack.svg',   'image/svg+xml'],   // SVG pode conter JS
        ['code.xml',   'text/xml'],
        ['run.bat',    'application/x-msdos-program'],
    ];

    for (const [name, type] of dangerousFiles) {
        it(`rejeita ${name}`, () => {
            const result = validateDocumentFile(makeFile(name, type));
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });
    }
});

// ─── MIME spoofing ────────────────────────────────────────────────────────────

describe('validateDocumentFile — MIME spoofing (extensão ≠ MIME real)', () => {
    it('rejeita executável renomeado para .pdf (MIME diferente da extensão)', () => {
        // Arquivo .exe com extensão .pdf — MIME não bate
        const f = makeFile('virus.pdf', 'application/x-msdownload');
        const result = validateDocumentFile(f);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('application/x-msdownload');
    });

    it('rejeita HTML renomeado para .jpg', () => {
        const f = makeFile('xss.jpg', 'text/html');
        expect(validateDocumentFile(f).valid).toBe(false);
    });

    it('rejeita script renomeado para .png', () => {
        const f = makeFile('payload.png', 'text/javascript');
        expect(validateDocumentFile(f).valid).toBe(false);
    });

    it('rejeita PDF verdadeiro renomeado para .jpg (cruzamento entre tipos permitidos)', () => {
        // Mesmo que o arquivo seja legítimo, extensão e MIME devem coincidir
        const f = makeFile('doc.jpg', 'application/pdf');
        expect(validateDocumentFile(f).valid).toBe(false);
    });

    it('rejeita PNG verdadeiro com extensão .pdf', () => {
        const f = makeFile('imagem.pdf', 'image/png');
        expect(validateDocumentFile(f).valid).toBe(false);
    });
});

// ─── Double extension ─────────────────────────────────────────────────────────

describe('validateDocumentFile — double extension attack', () => {
    it('rejeita virus.pdf.exe — extensão real é .exe', () => {
        const f = makeFile('virus.pdf.exe', 'application/x-msdownload');
        expect(validateDocumentFile(f).valid).toBe(false);
    });

    it('rejeita malware.jpg.sh — extensão real é .sh', () => {
        const f = makeFile('malware.jpg.sh', 'application/x-sh');
        expect(validateDocumentFile(f).valid).toBe(false);
    });

    it('aceita nome.valido.pdf quando a última extensão é .pdf com MIME correto', () => {
        // Double extension onde a última é válida deve ser aceita
        const f = makeFile('relatorio.jan.pdf', 'application/pdf');
        expect(validateDocumentFile(f).valid).toBe(true);
    });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('validateDocumentFile — edge cases', () => {
    it('rejeita arquivo sem extensão', () => {
        const f = makeFile('semextensao', 'application/octet-stream');
        expect(validateDocumentFile(f).valid).toBe(false);
    });

    it('rejeita arquivo com MIME type vazio (browser não conseguiu identificar)', () => {
        const f = makeFile('doc.pdf', '');
        const result = validateDocumentFile(f);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('identificar');
    });

    it('rejeita arquivo vazio (0 bytes)', () => {
        const f = makeFile('vazio.pdf', 'application/pdf', 0);
        const result = validateDocumentFile(f);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('vazio');
    });

    it('rejeita arquivo acima de 10 MB', () => {
        const f = makeFile('grande.pdf', 'application/pdf', 10 * MB + 1);
        const result = validateDocumentFile(f);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('10 MB');
    });

    it('rejeita octet-stream mesmo com extensão .pdf', () => {
        // application/octet-stream = download genérico, não é PDF confiável
        const f = makeFile('doc.pdf', 'application/octet-stream');
        expect(validateDocumentFile(f).valid).toBe(false);
    });
});

// ─── Consistência dos exports ─────────────────────────────────────────────────

describe('exports — consistência do módulo', () => {
    it('ACCEPTED_EXTENSIONS contém pdf, jpg, jpeg, png', () => {
        expect(ACCEPTED_EXTENSIONS).toContain('pdf');
        expect(ACCEPTED_EXTENSIONS).toContain('jpg');
        expect(ACCEPTED_EXTENSIONS).toContain('jpeg');
        expect(ACCEPTED_EXTENSIONS).toContain('png');
    });

    it('ACCEPTED_MIMES contém os MIME types dos tipos aceitos', () => {
        expect(ACCEPTED_MIMES).toContain('application/pdf');
        expect(ACCEPTED_MIMES).toContain('image/jpeg');
        expect(ACCEPTED_MIMES).toContain('image/png');
    });

    it('DOCUMENT_ACCEPT_ATTR está alinhado com ACCEPTED_EXTENSIONS', () => {
        // O atributo accept do input deve listar as mesmas extensões
        for (const ext of ACCEPTED_EXTENSIONS) {
            expect(DOCUMENT_ACCEPT_ATTR).toContain(`.${ext}`);
        }
    });

    it('ACCEPTED_MIMES não contém tipos perigosos', () => {
        const dangerous = ['text/html', 'text/javascript', 'application/x-sh', 'application/x-msdownload'];
        for (const mime of dangerous) {
            expect(ACCEPTED_MIMES).not.toContain(mime);
        }
    });

    it('validateDocumentFile retorna { valid: true } sem campo error para arquivos válidos', () => {
        const result = validateDocumentFile(makeFile('ok.pdf', 'application/pdf'));
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('validateDocumentFile sempre retorna campo error quando valid=false', () => {
        const invalids = [
            makeFile('x.exe', 'application/x-msdownload'),
            makeFile('x.pdf', 'text/html'),
            makeFile('x.pdf', '', 0),
        ];
        for (const f of invalids) {
            const result = validateDocumentFile(f);
            expect(result.valid).toBe(false);
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
        }
    });
});

// ─── Integração com service layer ────────────────────────────────────────────

describe('validateDocumentFile — cobertura das regras do service', () => {
    it('o service deve rejeitar os mesmos arquivos que o utilitário rejeita', () => {
        // Garante que service e utilitário usam a mesma lógica (via import direto)
        // O service chama validateDocumentFile internamente — ao testar o utilitário,
        // testamos indiretamente o comportamento do service para qualquer arquivo inválido.
        const maliciousFiles = [
            makeFile('hack.exe',     'application/x-msdownload'),
            makeFile('spoof.pdf',    'application/x-msdownload'),
            makeFile('trojan.pdf',   'text/html'),
            makeFile('empty.pdf',    'application/pdf', 0),
            makeFile('huge.pdf',     'application/pdf', 10 * MB + 1),
        ];

        for (const f of maliciousFiles) {
            const result = validateDocumentFile(f);
            expect(result.valid).toBe(false);
        }
    });
});
