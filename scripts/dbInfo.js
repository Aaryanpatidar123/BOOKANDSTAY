// scripts/dbInfo.js
// Print which DB the app would connect to and list collections and counts

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const mongoose = require('mongoose');

const dbUri = process.env.ATLASDB_URL || process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/bookandstay_dev';
const dbNameOpt = process.env.ATLAS_DBNAME || undefined;

(async function info() {
  try {
    const conn = await mongoose.createConnection(dbUri, { dbName: dbNameOpt });
    const db = conn.db;
    console.log('Connected to:', db.serverConfig ? db.serverConfig.s.url : dbUri);
    console.log('Database name:', db.databaseName);
    const cols = await db.listCollections().toArray();
    if (!cols.length) {
      console.log('No collections found.');
    } else {
      console.log('Collections:');
      for (const c of cols) {
        const name = c.name;
        let count = 0;
        try {
          count = await db.collection(name).countDocuments();
        } catch (e) {
          count = '?';
        }
        console.log(` - ${name} (${count} docs)`);
      }
    }
    await conn.close();
    process.exit(0);
  } catch (err) {
    console.error('Failed to connect / list collections:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();