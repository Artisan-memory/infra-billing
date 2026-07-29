import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  RemnawaveConnection,
  RemnawaveImport,
  RemnawaveImportResult,
  RemnawavePreview,
} from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

/** Dry run: what a Remnawave panel holds and what the import would touch. Writes nothing. */
export function useRemnawavePreview() {
  return useMutation({
    mutationFn: async (dto: RemnawaveConnection) =>
      (await api.post<RemnawavePreview>(API_PATH.MIGRATION.REMNAWAVE_PREVIEW, dto)).data,
  });
}

export function useRemnawaveImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: RemnawaveImport) =>
      (await api.post<RemnawaveImportResult>(API_PATH.MIGRATION.REMNAWAVE, dto)).data,
    // The import writes providers, services and payments at once — refresh everything derived.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
