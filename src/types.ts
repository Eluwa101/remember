export type CategoryType = 'reminder' | 'task' | 'insight' | 'document' | 'uncategorized';
export type ChannelType = 'whatsapp' | 'telegram' | 'email' | 'web';
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface User {
  id: string;
  whatsapp_number: string;
  created_at: string;
}

export interface MemoryMetadata {
  summary: string;
  is_time_bound: boolean;
  execution_time_iso: string | null;
  media_url?: string | null;
  entities?: {
    key_points?: string[];
    dates_mentioned?: string[];
    people?: string[];
    actions?: string[];
  };
}

export interface Memory {
  id: string;
  user_id: string;
  raw_content: string;
  category: CategoryType;
  source_channel: ChannelType;
  metadata: MemoryMetadata;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  memory_id: string;
  reminder_text: string;
  target_time: string;
  status: ReminderStatus;
  created_at: string;
}

export interface ConfigDetails {
  twilioSandboxNumber: string;
  twilioSandboxCode: string;
  appUrl: string;
}
