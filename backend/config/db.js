const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // maxPoolSize helps the database handle thousands of concurrent queries rather 
    // than creating and destroying a connection per request
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/productiv", {
        maxPoolSize: 100, // Important for scaling MongoDB connections
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    });
    console.log("MongoDB connected with Connection Pooling Enabled");
  } catch (error) {
    console.error("MongoDB connection failed", error);
    process.exit(1);
  }
};

module.exports = connectDB;