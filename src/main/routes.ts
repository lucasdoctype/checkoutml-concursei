import { Router } from 'express';
import type { Dependencies } from './composition-root';
import { buildMercadoPagoRoutes } from '../modules/mercadopago/presentation/routes';

export const buildRoutes = (deps: Dependencies): Router => {
  const router = Router();

  router.use(buildMercadoPagoRoutes(deps));

  return router;
};
