import { Router } from 'express';
import type { Dependencies } from '../../../main/composition-root';
import { requireInternalAccess } from '../../../shared/http/internal-auth';
import { InternalMqController } from './internal-mq-controller';

export const buildInternalRoutes = (deps: Dependencies): Router => {
  const router = Router();
  const controller = new InternalMqController({
    publisher: deps.mq.publisher,
    config: deps.mq.config,
    getStatus: deps.mq.getStatus
  });

  router.post('/internal/mq/publish-mock', requireInternalAccess, (req, res, next) =>
    controller.publishMock(req, res, next)
  );
  router.get('/internal/mq/status', requireInternalAccess, (req, res) => controller.status(req, res));

  return router;
};
