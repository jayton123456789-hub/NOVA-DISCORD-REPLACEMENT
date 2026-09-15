export type ChannelKind = 'text' | 'voice';

export type Channel = {
  id: string;
  name: string;
  kind: ChannelKind;
  position: number;
};

export type Attachment = {
  id: string;
  name: string;
  size: number;
  url: string;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  author_id: string;
  author: string;
  body: string;
  created_at: number;
  attachment?: Attachment | null;
};

export type Member = {
  peer_id: string;
  name: string;
  status: 'online' | 'idle';
  voice_channel?: string | null;
};

export type SharedFile = {
  id: string;
  name: string;
  size: number;
  uploader: string;
  created_at: number;
};

export type HostStatus = {
  running: boolean;
  space_name: string;
  port: number;
  local_ip: string;
  token: string;
  invite: string;
};

export type RuntimeMetrics = {
  nova_cpu_percent: number;
  nova_memory_mb: number;
  system_cpu_percent: number;
  system_memory_used_gb: number;
  system_memory_total_gb: number;
  helper_processes: number;
  uptime_seconds: number;
};

export type ConnectionConfig = {
  host: string;
  port: number;
  token: string;
  label?: string;
};
