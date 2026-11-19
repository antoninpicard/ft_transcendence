import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { methodNotAllowed } from '../middlewares/methodNotAllowed.js';
import { requireBadgeEnabled } from '../middlewares/requireBadgeEnabled.js';
import { requireDevice } from '../middlewares/requireDevice.js';
import { scanBody } from '../schemas/badge.schema.js';
import * as controller from '../controllers/device.controller.js';

export const deviceRouter = Router();

deviceRouter.post('/hello', requireBadgeEnabled, requireDevice, controller.hello);
deviceRouter.post('/scan', requireBadgeEnabled, requireDevice, validate({ body: scanBody }), controller.scan);

deviceRouter.all('/hello', methodNotAllowed('POST'));
deviceRouter.all('/scan', methodNotAllowed('POST'));
