const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname, '..');
const files = fs
  .readdirSync(scriptsDir)
  .filter((f) => f.startsWith('test-') && f.endsWith('.cjs'));

const ensureImport =
  "const { ensureAdminPhase1Permissions } = require('./lib/ensure-admin-permissions.cjs');\n";
const ensureCall =
  '\n  await ensureAdminPhase1Permissions(prisma, login.body.user.roleId);\n';

for (const file of files) {
  const filePath = path.join(scriptsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('ensureAdminPhase1Permissions')) {
    if (content.includes("require('./lib/login-body.cjs')")) {
      content = content.replace(
        "const { loginBody } = require('./lib/login-body.cjs');\n",
        "const { loginBody } = require('./lib/login-body.cjs');\n" + ensureImport,
      );
    }
  }

  if (!content.includes('await ensureAdminPhase1Permissions(prisma, login.body.user.roleId)')) {
    content = content.replace(
      /(if \(!token \|\| !hospitalId[^)]*\) \{[\s\S]*?process\.exit\(1\);\s*\})/,
      `$1${ensureCall}`,
    );
  }

  fs.writeFileSync(filePath, content);
  console.log('patched', file);
}
