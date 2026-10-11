import * as fs from 'fs';
import * as path from 'path';

describe('bootstrapWorker production gate', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'bootstrap-worker.ts'),
    'utf8',
  );

  it('invokes validateProductionConfig before creating the worker module', () => {
    const validateIndex = source.indexOf('validateProductionConfig()');
    const nestIndex = source.indexOf('createApplicationContext');

    expect(validateIndex).toBeGreaterThan(-1);
    expect(nestIndex).toBeGreaterThan(-1);
    expect(validateIndex).toBeLessThan(nestIndex);
  });

  it('imports validateProductionConfig from the shared validator module', () => {
    expect(source).toContain(
      "from '../common/config/validate-production-config'",
    );
  });
});
