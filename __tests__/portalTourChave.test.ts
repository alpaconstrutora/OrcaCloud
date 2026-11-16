// @vitest-environment jsdom
/**
 * Tour dos portais — o token do link nunca vira nome de chave do localStorage.
 *
 * O token de `/portal-*?token=` é a credencial do portal (abre sem senha) e o
 * localStorage sobrevive ao "Sair". O que trava:
 *   1. a chave do "já viu" não contém o token (nem o e-mail) — só o SHA-256;
 *      continua separando portal, pessoa e tour;
 *   2. marca antiga (token cru na chave) é regravada no formato novo com o
 *      mesmo valor — quem já viu não revê — e a antiga sai do aparelho, de
 *      TODAS as identidades guardadas, não só da atual.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chaveDoTour, migrarMarcasAntigas } from '../utils/portalTour';

const TOKEN = '3f2b8c1e-9a4d-4e57-b1c2-7d6e5f4a3b21';

beforeEach(() => localStorage.clear());

describe('chave do "já viu" sem o token', () => {
  it('não carrega o token nem o e-mail; separa portal, pessoa e tour', () => {
    expect(chaveDoTour('cliente', TOKEN)).not.toContain(TOKEN);
    expect(chaveDoTour('cliente', TOKEN, 'checklist:enviar')).not.toContain(TOKEN);
    expect(chaveDoTour('parceiro', 'eu@parceiro.com')).not.toContain('eu@parceiro.com');
    expect(chaveDoTour('cliente', TOKEN)).not.toBe(chaveDoTour('fornecedor', TOKEN));
    expect(chaveDoTour('cliente', TOKEN)).not.toBe(chaveDoTour('cliente', 'outro-token'));
    expect(chaveDoTour('cliente', TOKEN, 'financeiro')).not.toBe(chaveDoTour('cliente', TOKEN));
  });

  it('marca antiga migra com o mesmo valor e o token sai do aparelho', () => {
    localStorage.setItem(`portalHelp:tour:cliente:${TOKEN}`, 'pulado@2026-10-04T10:00:00.000Z');
    localStorage.setItem(`portalHelp:tour:cliente:${TOKEN}:financeiro`, 'concluido@2026-10-05T10:00:00.000Z');
    localStorage.setItem(`portalHelp:tour:cliente:${TOKEN}:checklist:enviar`, 'concluido@2026-10-06T10:00:00.000Z');
    localStorage.setItem('portalHelp:tour:fornecedor:outro-token', 'concluido@2026-10-07T10:00:00.000Z');
    localStorage.setItem('portalHelp:parceiro:busca', '"nota"');

    migrarMarcasAntigas();

    expect(localStorage.getItem(chaveDoTour('cliente', TOKEN))).toBe('pulado@2026-10-04T10:00:00.000Z');
    expect(localStorage.getItem(chaveDoTour('cliente', TOKEN, 'financeiro'))).toBe('concluido@2026-10-05T10:00:00.000Z');
    expect(localStorage.getItem(chaveDoTour('cliente', TOKEN, 'checklist:enviar'))).toBe('concluido@2026-10-06T10:00:00.000Z');
    expect(localStorage.getItem(chaveDoTour('fornecedor', 'outro-token'))).toBe('concluido@2026-10-07T10:00:00.000Z');
    const chaves = Object.keys(localStorage);
    expect(chaves.filter(k => k.startsWith('portalHelp:tour:'))).toEqual([]);
    expect(chaves.some(k => k.includes(TOKEN) || k.includes('outro-token'))).toBe(false);
    // o que não é marca de tour fica como estava
    expect(localStorage.getItem('portalHelp:parceiro:busca')).toBe('"nota"');
  });

  it('migração não sobrescreve marca nova já gravada', () => {
    localStorage.setItem(chaveDoTour('cliente', TOKEN), 'concluido@2026-11-15T10:00:00.000Z');
    localStorage.setItem(`portalHelp:tour:cliente:${TOKEN}`, 'pulado@2026-10-04T10:00:00.000Z');
    migrarMarcasAntigas();
    expect(localStorage.getItem(chaveDoTour('cliente', TOKEN))).toBe('concluido@2026-11-15T10:00:00.000Z');
    expect(localStorage.getItem(`portalHelp:tour:cliente:${TOKEN}`)).toBeNull();
  });

  it('tourVisto migra sozinho na primeira leitura da página: quem já viu não revê', async () => {
    vi.resetModules(); // página nova: a migração roda uma vez por carga do módulo
    const { chaveDoTour: chave, tourVisto } = await import('../utils/portalTour');
    localStorage.setItem(`portalHelp:tour:parceiro:${TOKEN}`, 'concluido@2026-10-04T10:00:00.000Z');
    expect(tourVisto(chave('parceiro', TOKEN))).toBe(true);
    expect(localStorage.getItem(`portalHelp:tour:parceiro:${TOKEN}`)).toBeNull();
  });
});
