const mongoose = require('mongoose');

// Cache the connection across Lambda invocations
let cachedDb = null;

const connectToMongoDB = async (url) => {
    if (cachedDb && mongoose.connection.readyState === 1) {
        console.log('Using existing database connection');
        return Promise.resolve(cachedDb);
    }

    try {
        // Close existing connection if it exists but is not connected
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }

        console.log('Creating new database connection');
        const client = await mongoose.connect(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // 5 seconds timeout for initial connection
            socketTimeoutMS: 45000, // 45 seconds timeout for queries
            maxPoolSize: 10, // Maximum number of connections in the connection pool
        });

        cachedDb = client.connection;
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            cachedDb = null;
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            cachedDb = null;
        });

        return client.connection;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        cachedDb = null;
        throw error;
    }
};

// Close the connection when the Node process ends
process.on('SIGINT', async () => {
    try {
        await mongoose.disconnect();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (error) {
        console.error('Error closing MongoDB connection:', error);
        process.exit(1);
    }
});

module.exports = connectToMongoDB;