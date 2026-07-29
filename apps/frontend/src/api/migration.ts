import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  RemnawaveCleanupResult,
  RemnawaveConnection,
  RemnawaveImport,
  RemnawaveImportResult,
  RemnawavePreview,
} from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

/** Everything the import writes and re-reads, so one list covers both mutations. */
const IMPORTED = [['providers'], ['services'], ['payments'], ['projects'], ['analytics']];

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
      for (const queryKey of IMPORTED) qc.invalidateQueries({ queryKey });
    },
  });
}

/** Drop the services and payments a previous import created, so it can be run again cleanly. */
export function useRemnawaveCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.delete<RemnawaveCleanupResult>(API_PATH.MIGRATION.REMNAWAVE)).data,
    onSuccess: () => {
      for (const queryKey of IMPORTED) qc.invalidateQueries({ queryKey });
    },
  });
}
