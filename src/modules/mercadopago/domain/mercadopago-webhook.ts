import type { RecordData } from '../../../shared/types/records';

export type MercadoPagoWebhookStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED';

export interface MercadoPagoWebhookMetadata {
  eventId: string | null;
  notificationId: string | null;
  resourceId: string | null;
  topic: string | null;
  action: string | null;
  apiVersion: string | null;
  liveMode: boolean;
  createdAtMp: string | null;
}

export const extractWebhookMetadata = (payload: RecordData): MercadoPagoWebhookMetadata => {
  const notificationId = payload.id ? String(payload.id) : null;
  const data = payload.data && typeof payload.data === 'object' ? (payload.data as RecordData) : null;
  const resourceId = data?.id ? String(data.id) : null;
  const eventId = notificationId ?? resourceId;
  const topicRaw = payload.type ?? payload.topic;
  const topic = typeof topicRaw === 'string' ? topicRaw : null;
  const action = typeof payload.action === 'string' ? payload.action : null;
  const apiVersion = typeof payload.api_version === 'string' ? payload.api_version : null;
  const liveMode = typeof payload.live_mode === 'boolean' ? payload.live_mode : false;
  const createdAtMp = typeof payload.date_created === 'string' ? payload.date_created : null;

  return {
    eventId,
    notificationId,
    resourceId,
    topic,
    action,
    apiVersion,
    liveMode,
    createdAtMp
  };
};
