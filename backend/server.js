require('dotenv').config();
const connectDatabase = require('./config/database');
const app = require('./app');

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  await connectDatabase();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`EcoCycle is listening on http://localhost:${port}`));
}

start().catch(error => {
  console.error(`Startup failed: ${error.message}`);
  process.exitCode = 1;
});