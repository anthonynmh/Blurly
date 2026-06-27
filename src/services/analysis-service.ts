import { invoke } from '@/lib/invoke';
import type { AnalysisRun, RunAnalysisInput } from '@/lib/types';

export const analysisService = {
  list(): Promise<AnalysisRun[]> {
    return invoke('list_analysis_runs');
  },

  get(id: string): Promise<AnalysisRun | null> {
    return invoke('get_analysis_run', { id });
  },

  delete(id: string): Promise<void> {
    return invoke('delete_analysis_run', { id });
  },

  run(input: RunAnalysisInput): Promise<AnalysisRun> {
    return invoke('run_analysis', { input });
  },
};
