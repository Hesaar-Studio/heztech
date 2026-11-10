import { useMemo } from 'react';
import { getAdapters, type HezTechAdapters } from '@/adapters';

export function useAdapters(override?: Partial<HezTechAdapters>): HezTechAdapters {
  return useMemo(() => getAdapters(override), [override]);
}
