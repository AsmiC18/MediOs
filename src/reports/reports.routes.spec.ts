import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReportDateRangeDto } from './dto/report-date-range.dto';

describe('Reports HTTP contract', () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, 'reports.controller.ts'),
    'utf8',
  );

  it('registers report routes behind JWT and permission guards', () => {
    expect(controllerSource).toContain("@Controller('reports')");
    expect(controllerSource).toContain('JwtAuthGuard');
    expect(controllerSource).toContain('FeatureGuard');
    expect(controllerSource).toContain('PermissionsGuard');
  });

  it('requires reports:read for financial and GST summaries', () => {
    expect(controllerSource).toContain("@Get('financial/summary')");
    expect(controllerSource).toContain("@RequirePermissions('reports:read')");
    expect(controllerSource).toContain("@Get('gst/summary')");
  });

  it('uses ReportExportPermissionsGuard for POST /reports/exports', () => {
    expect(controllerSource).toContain("@Post('exports')");
    expect(controllerSource).toContain('ReportExportPermissionsGuard');
    expect(controllerSource).not.toContain("@RequirePermissions('billing:read')");
    expect(controllerSource).not.toContain("@RequirePermissions('billing:export')");
  });

  it('rejects report ranges greater than 90 days at validation layer', async () => {
    const dto = plainToInstance(ReportDateRangeDto, {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-05-01T00:00:00.000Z',
    });
    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });
});
