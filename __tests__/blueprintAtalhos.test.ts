import { describe, expect, it } from 'vitest';
import { ATALHOS_DE_FERRAMENTA, alvoDoAtalho, letraDoAtalho } from '../utils/blueprintAtalhos';

describe('atalhos de ferramenta da Planta (F1)', () => {
  it('W arma a parede, P a porta e J a janela — maiúscula ou minúscula', () => {
    expect(alvoDoAtalho({ key: 'w' })).toEqual({ tool: 'parede' });
    expect(alvoDoAtalho({ key: 'W' })).toEqual({ tool: 'parede' });
    expect(alvoDoAtalho({ key: 'p' })).toEqual({ tool: 'abertura', abertura: 'door' });
    expect(alvoDoAtalho({ key: 'j' })).toEqual({ tool: 'abertura', abertura: 'window' });
  });

  it('letra com Ctrl/Cmd/Alt/Shift nunca é atalho — Ctrl+Z/D/A/C/V e a trava do Shift têm dono', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
      expect(alvoDoAtalho({ key: 'w', [mod]: true })).toBeNull();
    }
  });

  it('com foco num campo de texto a letra é texto, não ferramenta', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(alvoDoAtalho({ key: 'v' }, { tagName })).toBeNull();
    }
    expect(alvoDoAtalho({ key: 'v' }, { tagName: 'DIV', isContentEditable: true })).toBeNull();
    expect(alvoDoAtalho({ key: 'v' }, { tagName: 'DIV' })).toEqual({ tool: 'selecionar' });
  });

  it('segurar a tecla arma uma vez só; tecla que não é letra não arma nada', () => {
    expect(alvoDoAtalho({ key: 'w', repeat: true })).toBeNull();
    for (const key of [' ', 'Escape', 'Delete', 'ArrowUp', 'F8', 'Enter', '6']) {
      expect(alvoDoAtalho({ key })).toBeNull();
    }
  });

  it('nenhuma letra do mapa colide com as teclas que o canvas e o editor já usam sem modificador', () => {
    // Espaço inverte o lado da parede; setas movem; Delete/Backspace apagam; Esc sai; F8 é orto.
    const ocupadas = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'delete', 'backspace', 'escape', 'f8'];
    for (const letra of Object.keys(ATALHOS_DE_FERRAMENTA)) {
      expect(letra).toMatch(/^[a-z]$/);
      expect(ocupadas).not.toContain(letra);
    }
  });

  it('a letra mostrada no menu é a mesma que arma o item; subtipo sem atalho fica sem letra', () => {
    expect(letraDoAtalho({ tool: 'parede' })).toBe('W');
    expect(letraDoAtalho({ tool: 'abertura', abertura: 'door' })).toBe('P');
    expect(letraDoAtalho({ tool: 'abertura', abertura: 'window' })).toBe('J');
    expect(letraDoAtalho({ tool: 'abertura', abertura: 'sliding' })).toBeNull();
    expect(letraDoAtalho({ tool: 'parede-curva' })).toBeNull();
    for (const [letra, alvo] of Object.entries(ATALHOS_DE_FERRAMENTA)) {
      expect(letraDoAtalho(alvo)).toBe(letra.toUpperCase());
    }
  });
});

describe('atalho C — cota linear (F5)', () => {
  it('C arma a anotação JÁ no tipo cota linear; a letra aparece para esse tipo e só para ele', () => {
    expect(alvoDoAtalho({ key: 'c' })).toEqual({ tool: 'anotacao', anotacao: 'COTA_LINEAR' });
    expect(letraDoAtalho({ tool: 'anotacao', anotacao: 'COTA_LINEAR' })).toBe('C');
    expect(letraDoAtalho({ tool: 'anotacao', anotacao: 'TEXTO' })).toBeNull();
  });
});
