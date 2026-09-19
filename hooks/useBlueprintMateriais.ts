/**
 * BIBLIOTECA DE MATERIAIS da organização (19/09/2026, E7.4) — carrega uma vez
 * por editor e entrega o índice por código a quem resolve `itemCode` (camadas,
 * acabamentos, guarda-corpos, quantitativos). Gravar passa por `criar`/
 * `atualizar`/`desativar` e recarrega. Sem a tabela (migration ausente) a
 * lista fica vazia e `indisponivel` diz por quê — nada quebra: o código opaco
 * continua valendo como sempre valeu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { blueprintMaterialService, type NovoMaterial } from '../services/blueprintMaterialService';
import { indicePorCodigo, type Material } from '../utils/blueprintMateriais';

export interface BibliotecaDeMateriais {
  materiais: Material[];
  porCodigo: Map<string, Material>;
  carregando: boolean;
  indisponivel: string | null;
  recarregar: () => void;
  criar: (organizationId: string, m: NovoMaterial) => Promise<Material>;
  atualizar: (id: string, m: Partial<NovoMaterial> & { active?: boolean }) => Promise<Material>;
  desativar: (id: string) => Promise<void>;
}

export function useBlueprintMateriais(organizationId: string | null, incluirInativos = false): BibliotecaDeMateriais {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [indisponivel, setIndisponivel] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const recarregar = useCallback(() => {
    setCarregando(true);
    blueprintMaterialService
      .list(organizationId, !incluirInativos)
      .then((lista) => {
        if (!vivo.current) return;
        setMateriais(lista);
        setIndisponivel(null);
      })
      .catch((e: unknown) => {
        if (!vivo.current) return;
        console.warn('[materiais] biblioteca indisponível:', e);
        setMateriais([]);
        setIndisponivel(e instanceof Error ? e.message : String(e));
      })
      .finally(() => vivo.current && setCarregando(false));
  }, [organizationId, incluirInativos]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const porCodigo = useMemo(() => indicePorCodigo(materiais), [materiais]);

  const criar = useCallback(
    async (org: string, m: NovoMaterial) => {
      const criado = await blueprintMaterialService.create(org, m);
      recarregar();
      return criado;
    },
    [recarregar],
  );
  const atualizar = useCallback(
    async (id: string, m: Partial<NovoMaterial> & { active?: boolean }) => {
      const atualizado = await blueprintMaterialService.update(id, m);
      recarregar();
      return atualizado;
    },
    [recarregar],
  );
  const desativar = useCallback(
    async (id: string) => {
      await blueprintMaterialService.deactivate(id);
      recarregar();
    },
    [recarregar],
  );

  return { materiais, porCodigo, carregando, indisponivel, recarregar, criar, atualizar, desativar };
}
