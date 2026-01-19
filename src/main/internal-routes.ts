import type { Dependencies } from './composition-root';
import { buildInternalRoutes as buildInternalModuleRoutes } from '../modules/internal/presentation/routes';

export const buildInternalRoutes = (deps: Dependencies) => buildInternalModuleRoutes(deps);
