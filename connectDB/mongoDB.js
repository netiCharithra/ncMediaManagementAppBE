const mongoose = require('mongoose');

// Cache the connection across Lambda invocations
let cachedDb = null;

const connectToMongoDB = async (url) => {
    if (!url) {
        throw new Error('MongoDB connection URL is not defined. Please check your environment variables.');
    }

    // Mask the password in the URL for logging
    const maskedUrl = url.replace(/(?<=:)[^@]+(?=@)/, '******');
    
    if (cachedDb && mongoose.connection.readyState === 1) {
        console.log(`Using existing database connection to ${maskedUrl.split('@').pop()}`);
        return Promise.resolve(cachedDb);
    }

    try {
        // Close existing connection if it exists but is not connected
        if (mongoose.connection.readyState !== 0) {
            console.log('Closing existing database connection');
            await mongoose.disconnect();
        }

        console.log(`Attempting to connect to MongoDB at ${maskedUrl.split('@').pop()}`);
        
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // Increased to 10 seconds
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            retryWrites: true,
            w: 'majority'
        };

        const client = await mongoose.connect(url, options);
        console.log('MongoDB connected successfully');
        
        cachedDb = client.connection;
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err.message);
            console.error('Error stack:', err.stack);
            cachedDb = null;
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected');
            cachedDb = null;
        });

        mongoose.connection.on('connected', () => {
            console.log('MongoDB connected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected');
        });

        return client.connection;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error.message);
        console.error('Error details:', {
            name: error.name,
            code: error.code,
            codeName: error.codeName,
            errorLabels: error.errorLabels,
            stack: error.stack
        });
        
        // Provide more helpful error messages
        if (error.name === 'MongoNetworkError') {
            console.error('\nTroubleshooting tips:');
            console.error('1. Check if your MongoDB server is running and accessible');
            console.error('2. Verify your MongoDB connection string in the .env file');
            console.error('3. Check your network connection and firewall settings');
            console.error('4. If using MongoDB Atlas, ensure your IP is whitelisted');
        }
        
        cachedDb = null;
        throw error;
    }
};

// Close the connection when the Node process ends
process.on('SIGINT', async () => {
    try {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
            console.log('MongoDB connection closed through app termination');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
    }
});

module.exports = connectToMongoDB;