import { invoke } from '@/lib/invoke';
import type {
  AnalystThread,
  AnalystThreadDetail,
  AskAnalystInput,
  AskAnalystResult,
  NewAnalystThread,
} from '@/lib/types';

export const analystChatService = {
  listThreads(): Promise<AnalystThread[]> {
    return invoke('list_analyst_threads');
  },

  getThread(id: string): Promise<AnalystThreadDetail | null> {
    return invoke('get_analyst_thread', { id });
  },

  createThread(input: NewAnalystThread): Promise<AnalystThread> {
    return invoke('create_analyst_thread', { input });
  },

  deleteThread(id: string): Promise<void> {
    return invoke('delete_analyst_thread', { id });
  },

  ask(input: AskAnalystInput): Promise<AskAnalystResult> {
    return invoke('ask_analyst_question', { input });
  },
};
