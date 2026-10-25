import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createConsoleProvider, createMetaWhatsappProvider } from './meta-whatsapp.provider.js';
import type { NotificationProvider } from './provider.js';

export function createNotificationProvider(): NotificationProvider {
  if (env.WHATSAPP_PROVIDER === 'console') {
    return createConsoleProvider(logger);
  }

  if (env.WHATSAPP_PROVIDER === 'meta') {
    const { WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN, WHATSAPP_TEMPLATE_NAME } = env;

    if (
      WHATSAPP_PHONE_NUMBER_ID === undefined ||
      WHATSAPP_TOKEN === undefined ||
      WHATSAPP_TEMPLATE_NAME === undefined
    ) {
      throw new Error('Falta configuración de WhatsApp para el proveedor meta.');
    }

    return createMetaWhatsappProvider({
      apiUrl: env.WHATSAPP_API_URL,
      phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
      token: WHATSAPP_TOKEN,
      templateName: WHATSAPP_TEMPLATE_NAME,
      templateLanguage: env.WHATSAPP_TEMPLATE_LANGUAGE,
    });
  }

  throw new Error('El proveedor de notificaciones está deshabilitado.');
}
