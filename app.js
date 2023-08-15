const express = require('express');
require('express-async-errors');
const app = express();
const cors = require("cors");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const allowedOrigins = ['http://localhost:4201']; // Add more origins if needed
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
const connect = require('./connectDB/mongoDB')
const router = require('./common-handlers/commonRoute');
require('dotenv').config();
app.use('/api/v2', router);
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));


const start = async () => {
    let port = process.env.PORT || 3001
    try {
        await connect(process.env.MONGO_DB_URL)
        app.listen(port, () => {
            console.log(`listening port ${port}`)
        })
    } catch (error) {
        console.error(error)
    }
}

start();
