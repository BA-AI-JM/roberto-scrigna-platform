/**
 * Shared types for the coach reminder-settings UI (#07).
 *
 * ReminderSettings is the exact shape the data seam reads/writes — produced
 * today by the reminder-settings adapter and, after the parallel backend lands
 * notification.getReminderSettings / updateReminderSettings, by those typed
 * procedures (a one-line swap in the adapter).
 */
export interface ReminderSettings {
  checkInEveryDays: number;
  bodyCompEveryDays: number;
  enabled: boolean;
}

export interface UpdateReminderSettingsInput extends ReminderSettings {
  clientId: string;
}
