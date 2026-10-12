const mongoose = require("mongoose");
const dns = require('dns');

/**
 * Production runs with autoIndex off, so without this new indexes (unique constraints,
 * the TTL that expires sessions and codes) would never be created. createIndexes only
 * adds missing ones; a failure is logged rather than stopping the server.
 */
const ensureIndexes = async () => {
  const results = await Promise.allSettled(
    mongoose.modelNames().map((name) => mongoose.model(name).createIndexes())
  );
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`Index creation failed for ${mongoose.modelNames()[i]}:`, result.reason?.message || result.reason);
    }
  });
};

const connectDB = async () => {
  try {
    // maxPoolSize helps the database handle thousands of concurrent queries rather 
    // than creating and destroying a connection per request
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/productiv";
    const connectOptions = {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 200),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 10),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      autoIndex: process.env.NODE_ENV !== 'production',
    };

    try {
      await mongoose.connect(mongoUri, connectOptions);
      console.log("MongoDB connected with Connection Pooling Enabled");
      await ensureIndexes();
      return;
    } catch (firstError) {
      const msg = String(firstError?.message || firstError || '');

      // Common on some networks: DNS server refuses SRV lookup used by mongodb+srv.
      // Retry once using public DNS resolvers.
      const shouldRetryWithPublicDns =
        mongoUri.startsWith('mongodb+srv://') &&
        (/querySrv\s+ECONNREFUSED/i.test(msg) || /querySrv\s+ENOTFOUND/i.test(msg));

      if (!shouldRetryWithPublicDns) throw firstError;

      dns.setServers(['1.1.1.1', '8.8.8.8']);
      await mongoose.connect(mongoUri, connectOptions);
      console.log("MongoDB connected (public DNS fallback) with Connection Pooling Enabled");
      await ensureIndexes();
      return;
    }
  } catch (error) {
    console.error("MongoDB connection failed", error);
    process.exit(1);
  }
};

module.exports = connectDB;