/**
 * Serviço das hipóteses NBR 12721 do estudo (Fase 4.2): uma linha por estudo,
 * gravada na organização DO ESTUDO, sanitizada na ida e na volta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas: { metodo: string; args: unknown[] }[] = [];
let resposta: { data: unknown; error: { message: string } | null } = { data: null, error: null };

function cadeia() {
  const c: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['select', 'eq', 'upsert']) {
    c[m] = (...args: unknown[]) => {
      chamadas.push({ metodo: m, args });
      return c;
    };
  }
  c.maybeSingle = () => Promise.resolve(resposta);
  c.single = () => Promise.resolve(resposta);
  return c;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      chamadas.push({ metodo: 'from', args: [tabela] });
      return cadeia();
    },
  },
}));

import { blueprintNbr12721Service } from '../services/blueprintNbr12721Service';
import { HIPOTESES_NBR12721_PADRAO } from '../utils/blueprintNbr12721';

beforeEach(() => {
  chamadas.length = 0;
  resposta = { data: null, error: null };
});

describe('blueprintNbr12721Service', () => {
  it('estudo sem linha devolve as hipóteses padrão (estado normal)', async () => {
    expect(await blueprintNbr12721Service.get('std_1')).toEqual(HIPOTESES_NBR12721_PADRAO);
    expect(chamadas.find((c) => c.metodo === 'from')!.args).toEqual(['blueprint_study_nbr12721']);
    expect(chamadas.find((c) => c.metodo === 'eq')!.args).toEqual(['study_id', 'std_1']);
  });

  it('salva sanitizado, na organização passada (a do estudo), com upsert por study_id', async () => {
    resposta = { data: { hipoteses: { escopoPadrao: 'BLOCO', coeficientesPadrao: { DIFERENTE: 0.5 } } }, error: null };
    const sujas = { ...HIPOTESES_NBR12721_PADRAO, coeficientesPadrao: { DIFERENTE: 0.5, DESCOBERTA: 99 }, escopoPadrao: 'BLOCO' as const };
    const volta = await blueprintNbr12721Service.save('std_1', 'org_do_estudo', sujas);
    const upsert = chamadas.find((c) => c.metodo === 'upsert')!;
    expect(upsert.args[0]).toMatchObject({ study_id: 'std_1', organization_id: 'org_do_estudo', hipoteses: { coeficientesPadrao: { DIFERENTE: 0.5, DESCOBERTA: null } } });
    expect(upsert.args[1]).toEqual({ onConflict: 'study_id' });
    expect(volta.escopoPadrao).toBe('BLOCO');
  });

  it('erro do banco sobe com contexto — nunca vira hipótese padrão calada', async () => {
    resposta = { data: null, error: { message: 'permission denied' } };
    await expect(blueprintNbr12721Service.get('std_1')).rejects.toThrow('blueprintNbr12721/get: permission denied');
  });
});
