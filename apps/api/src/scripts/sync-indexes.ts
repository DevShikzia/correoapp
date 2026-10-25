import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { AuditLogModel } from '../modules/audit/audit-log.model.js';
import { LotModel } from '../modules/lots/lot.model.js';
import { MailItemModel } from '../modules/mail/mail-item.model.js';
import { StaffUserModel } from '../modules/staff/staff-user.model.js';

const MODELS = [LotModel, StaffUserModel, MailItemModel, AuditLogModel];

async function syncIndexes(): Promise<void> {
  if (env.MONGODB_URI === undefined) {
    throw new Error('Definí MONGODB_URI para sincronizar los índices.');
  }

  await connectDatabase(env.MONGODB_URI);

  try {
    for (const model of MODELS) {
      await model.syncIndexes();
      logger.info({ model: model.modelName }, 'índices sincronizados');
    }
  } finally {
    await disconnectDatabase();
  }
}

syncIndexes().catch((error: unknown) => {
  logger.error({ err: error }, 'no se pudieron sincronizar los índices');
  process.exit(1);
});
