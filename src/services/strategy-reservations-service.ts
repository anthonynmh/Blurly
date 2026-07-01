import { invoke } from '@/lib/invoke';
import type {
  NewStrategyCashReservation,
  StrategyCashReservation,
  UpdateStrategyCashReservation,
} from '@/lib/types';

export const strategyReservationsService = {
  list(): Promise<StrategyCashReservation[]> {
    return invoke('list_strategy_cash_reservations');
  },

  create(input: NewStrategyCashReservation): Promise<StrategyCashReservation> {
    return invoke('create_strategy_cash_reservation', { input });
  },

  update(id: string, input: UpdateStrategyCashReservation): Promise<StrategyCashReservation> {
    return invoke('update_strategy_cash_reservation', { id, input });
  },

  delete(id: string): Promise<void> {
    return invoke('delete_strategy_cash_reservation', { id });
  },
};
