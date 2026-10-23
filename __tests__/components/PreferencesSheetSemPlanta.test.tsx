// @vitest-environment jsdom
/**
 * 23/10/2026 — pedido do usuário: *"completamente errado isto! Esse menu de preferencia diz respeito a planta
 * inteligente. Mova para planta inteligente"*. A gaveta Preferências do PERFIL volta a ser só a aparência (tema
 * e contraste); as escolhas da planta elétrica moram na aba "Preferências" da Planta.
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PreferencesSheet from '../../components/PreferencesSheet';
import { ConfirmProvider } from '../../components/ui/confirm';

afterEach(cleanup);

describe('PreferencesSheet (perfil)', () => {
  it('não traz mais a seção da planta elétrica — só a aparência, deste dispositivo', () => {
    render(
      <ConfirmProvider>
        <PreferencesSheet
          open
          onClose={() => {}}
          themeMode="light"
          setThemeMode={() => {}}
          resolvedThemeMode="light"
          highContrast={false}
          setHighContrast={() => {}}
        />
      </ConfirmProvider>,
    );
    expect(screen.getByText('Aparência')).toBeTruthy();
    expect(screen.getByText(/neste dispositivo/)).toBeTruthy();
    expect(screen.queryByText(/Elétrica/)).toBeNull();
    expect(screen.queryByText(/Fios no eletroduto|Potência do ponto/)).toBeNull();
    expect(screen.queryByText(/Planta/)).toBeNull();
  });
});
