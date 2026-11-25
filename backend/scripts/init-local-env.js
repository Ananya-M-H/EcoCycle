const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');
const envPath = path.join(projectRoot, '.env');
const templatePath = path.join(projectRoot, '.env.example');

if (fs.existsSync(envPath)) {
  console.error('.env already exists; it was not modified.');
  process.exitCode = 1;
} else {
  const password = `Eco${crypto.randomBytes(24).toString('base64url')}9A`;
  const template = fs.readFileSync(templatePath, 'utf8');
  const config = template
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('base64url')}`)
    .replace(/^ADMIN_NAME=.*$/m, 'ADMIN_NAME=EcoCycle Local Administrator')
    .replace(/^ADMIN_EMAIL=.*$/m, 'ADMIN_EMAIL=admin@ecocycle.local')
    .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`);
  fs.writeFileSync(envPath, config, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random JWT secret and local administrator password.');
  console.log('The administrator password is stored only in .env; inspect it locally when signing in.');
}