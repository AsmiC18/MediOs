import {
  CanActivate,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isProduction } from '../../common/config/app-environment';

@Injectable()
export class NonProductionGuard implements CanActivate {
  canActivate(): boolean {
    if (isProduction()) {
      throw new NotFoundException();
    }
    return true;
  }
}
