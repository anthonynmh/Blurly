import { invoke } from '@/lib/invoke';
import type {
  InvestmentStrategy,
  NewStrategyMilestone,
  StrategyMilestone,
  UpdateInvestmentStrategy,
  UpdateStrategyMilestone,
} from '@/lib/types';

export const strategyService = {
  get(): Promise<InvestmentStrategy> {
    return invoke('get_investment_strategy');
  },

  update(input: UpdateInvestmentStrategy): Promise<InvestmentStrategy> {
    return invoke('update_investment_strategy', { input });
  },

  listMilestones(): Promise<StrategyMilestone[]> {
    return invoke('list_strategy_milestones');
  },

  createMilestone(input: NewStrategyMilestone): Promise<StrategyMilestone> {
    return invoke('create_strategy_milestone', { input });
  },

  updateMilestone(id: string, input: UpdateStrategyMilestone): Promise<StrategyMilestone> {
    return invoke('update_strategy_milestone', { id, input });
  },

  deleteMilestone(id: string): Promise<void> {
    return invoke('delete_strategy_milestone', { id });
  },
};
