import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

describe('AuditLog HTTP contract', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, 'audit-log.controller.ts'),
    'utf8',
  );

  it('registers GET /audit-logs behind JWT and PermissionsGuard', () => {
    expect(controllerSource).toContain("@Controller('audit-logs')");
    expect(controllerSource).toContain('@UseGuards(JwtAuthGuard, PermissionsGuard)');
    expect(controllerSource).toContain("@RequirePermissions('audit:read')");
  });

  it('registers POST /audit-logs/export with audit:export', () => {
    expect(controllerSource).toContain("@Post('export')");
    expect(controllerSource).toContain("@RequirePermissions('audit:export')");
  });

  it('rejects limit greater than 100 at validation layer', async () => {
    const dto = plainToInstance(AuditLogQueryDto, { limit: 101 });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
