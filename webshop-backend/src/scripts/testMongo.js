// advanced-diagnostic.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function diagnose() {
  console.log('🔍 Advanced MongoDB Diagnostic\n');

  const uri = process.env.MONGODB_URI;
  
  // Parse the connection string to see what we're connecting to
  const match = uri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)/);
  if (match) {
    console.log('📊 Connection Details:');
    console.log('   Username:', match[1]);
    console.log('   Cluster:', match[3]);
    console.log('   Database:', match[4]);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });

  try {
    console.log('\n🔄 Attempting connection...');
    await client.connect();
    console.log('✅ SUCCESS: Connected to MongoDB!');
    
    // Test database operations
    const db = client.db();
    const adminDb = client.db().admin();
    
    // List databases to verify full access
    const databases = await adminDb.listDatabases();
    console.log('📁 Available databases:', databases.databases.map(d => d.name));
    
  } catch (err) {
    console.log('\n❌ Connection failed with details:');
    console.log('   Error name:', err.name);
    console.log('   Error code:', err.code);
    console.log('   Message:', err.message);
    
    // Specific error analysis
    if (err.code === 'ENOTFOUND') {
      console.log('\n💡 DNS Issue: Cannot resolve MongoDB Atlas hostname');
      console.log('   Try: Check internet connection or flush DNS cache');
    } else if (err.code === 'ETIMEOUT') {
      console.log('\n💡 Timeout: Connection taking too long');
      console.log('   Try: Check firewall or try different network');
    } else if (err.name === 'MongoServerSelectionError') {
      console.log('\n💡 IP Whitelist or Authentication Issue');
      console.log('   Even with 0.0.0.0/0, this could mean:');
      console.log('   - Database user permissions issue');
      console.log('   - Wrong password in connection string');
      console.log('   - Cluster is paused or not running');
      console.log('   - Corporate firewall blocking connection');
    }
  } finally {
    await client.close();
  }
}

diagnose();