require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = new URL(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecocycle?replicaSet=rs0');
  const replicaHost = `${uri.hostname}:${uri.port || '27017'}`;
  uri.pathname = '/admin';
  uri.searchParams.delete('replicaSet');
  uri.searchParams.set('directConnection', 'true');
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 8000 });
  try {
    const result = await mongoose.connection.db.admin().command({
      replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: replicaHost }] }
    });
    console.log(`MongoDB replica set initialized: ${result.ok === 1 ? 'rs0' : 'check server response'}`);
  } catch (error) {
    if (error.code === 23 || /already initialized/i.test(error.message)) console.log('MongoDB replica set rs0 is already initialized.');
    else throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(`MongoDB replica-set initialization failed: ${error.message}`);
  process.exitCode = 1;
});