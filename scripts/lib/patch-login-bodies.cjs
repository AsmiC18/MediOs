const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname, '..');
const files = fs
  .readdirSync(scriptsDir)
  .filter((name) => name.startsWith('test-') && name.endsWith('.cjs'));

for (const file of files) {
  const filePath = path.join(scriptsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes("require('./lib/login-body.cjs')")) {
    if (content.includes("const bcrypt = require('bcrypt');")) {
      content = content.replace(
        "const bcrypt = require('bcrypt');",
        "const bcrypt = require('bcrypt');\nconst { loginBody } = require('./lib/login-body.cjs');",
      );
    } else {
      content = `const { loginBody } = require('./lib/login-body.cjs');\n${content}`;
    }
  }

  content = content.replaceAll(
    "body: { email: 'admin@test.com', password: 'MediOS@12345' }",
    "body: loginBody('admin@test.com')",
  );
  content = content.replaceAll(
    "body: { email: other.user.email, password: 'MediOS@12345' }",
    "body: loginBody(other.user.email, 'MediOS@12345', other.hospital.code)",
  );
  content = content.replaceAll(
    "body: { email: limitedUser.email, password: 'MediOS@12345' }",
    "body: loginBody(limitedUser.email)",
  );
  content = content.replaceAll(
    "body: { email: otherUser.email, password: 'MediOS@12345' }",
    "body: loginBody(otherUser.email)",
  );

  content = content.replace(
    "process.env.JWT_SECRET || 'dev-secret-change-me'",
    "process.env.JWT_SECRET",
  );

  fs.writeFileSync(filePath, content);
  console.log(`patched ${file}`);
}
