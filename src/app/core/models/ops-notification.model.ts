export interface OpsNotification {
  id: string;
  orderId: string | null;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface OpsNotificationList {
  unreadCount: number;
  items: OpsNotification[];
}

export interface OpsNotificationNewPayload {
  id: string;
  title: string;
  body: string;
  type: string;
  referenceId: string;
  orderId: string;
}
