// Conversão formulário ⇄ registro de unidade do empreendimento
// (components/empreendimento/UnitFormFields.tsx). As duas telas que cadastram
// unidade usavam conversões próprias que divergiam: uma mandava `undefined` nos
// enums vazios (o update não limpava a coluna), a outra `null`.
import { describe, it, expect } from 'vitest';
import {
  emptyUnitFormValues, unitFormFromRecord, unitFormToPayload, UnitFormValues,
} from '../components/empreendimento/UnitFormFields';

describe('unitFormToPayload', () => {
  it('número vazio vira undefined, enum vazio vira null e o nome é aparado', () => {
    const p = unitFormToPayload({ ...emptyUnitFormValues(), name: '  101  ' });
    expect(p.name).toBe('101');
    expect(p.floor).toBeUndefined();
    expect(p.bedrooms).toBeUndefined();
    expect(p.typology).toBeUndefined();
    expect(p.floor_tipo).toBeNull();
    expect(p.position_type).toBeNull();
    expect(p.view_type).toBeNull();
    expect(p.sun_orientation).toBeNull();
    expect(p.total_area).toBeUndefined();
  });

  it('total_area soma privativa e comum, mesmo com só uma das duas', () => {
    const base = { ...emptyUnitFormValues(), name: '101' };
    expect(unitFormToPayload({ ...base, private_area: '60.5', common_area: '20' }).total_area).toBe(80.5);
    expect(unitFormToPayload({ ...base, private_area: '60' }).total_area).toBe(60);
    expect(unitFormToPayload({ ...base, common_area: '15' }).total_area).toBe(15);
  });

  it('pavimento 0 (térreo) não se perde como "vazio"', () => {
    const p = unitFormToPayload({ ...emptyUnitFormValues(), name: 'T01', floor: '0' });
    expect(p.floor).toBe(0);
  });

  it('ida e volta registro → form → payload não perde dado', () => {
    const cheio: UnitFormValues = {
      name: '1502', floor: '15', floor_tipo: 'TIPO', typology: '3 quartos',
      private_area: '98.4', common_area: '31.2', bedrooms: '3', bathrooms: '2', suites: '1',
      parking_spaces: '2', position_type: 'FRENTE', view_type: 'PLENA', sun_orientation: 'NORTE',
    };
    const payload = unitFormToPayload(cheio);
    const deVolta = unitFormFromRecord(payload);
    expect(deVolta).toEqual(cheio);
  });

  it('registro sem valores vira formulário vazio', () => {
    expect(unitFormFromRecord({ name: 'A' })).toEqual({ ...emptyUnitFormValues(), name: 'A' });
  });
});
