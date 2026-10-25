export interface NotificationMessage {
  phone: string;
  lotNumber: string;
}

export interface SendResult {
  messageId: string;
}

export interface NotificationProvider {
  send(message: NotificationMessage): Promise<SendResult>;
}

export class NotificationProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable: boolean) {
    super(code);
    this.name = 'NotificationProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ProviderLogger {
  info(data: Record<string, unknown>, message: string): void;
}
