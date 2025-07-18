const express = require('express');
require('express-async-errors');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const app = express();
const cors = require("cors");

// Import the database connection
const connect = require('./connectDB/mongoDB');

// Cache the database connection
let cachedDb = null;

// Enable CORS for all routes
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-client-key', 'x-client-token', 'x-client-secret'],
    credentials: true,
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add headers before the routes are defined
app.use(function (req, res, next) {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Pass to next layer of middleware
    next();
});

const functions = require("firebase-functions");
// const allowedOrigins = ['*']; // Add more origins if needed
// app.use(cors({
//     origin: function (origin, callback) {
//         if (!origin || allowedOrigins.includes(origin)) {
//             callback(null, true);
//         } else {
//             console.log("origin", origin)
//             callback(new Error('Not allowed by CORS'));
//         }
//     }
// }));
// app.use(cors())
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const dotenv = require('dotenv');
dotenv.config()
const router = require('./common-handlers/commonRoute');
const router_v3 = require('./common-handlers/v3/commonRoute.js');
app.use('/api/v2', router);
app.use('/api/v3', router_v3);
require('dotenv').config();
const bodyParser = require('body-parser');
// const admin.initi
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
const multer = require('multer');
const storage = multer.memoryStorage()

// const upload = multer({ storage: storage })
const upload = multer({ storage: multer.memoryStorage() });

const stream = require('stream');
const errorLogBookSchema = require('./modals/errorLogBookSchema');
const admin = require('firebase-admin');

// const serviceAccount = require('./FireBaseConfig.json');
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount)
//   });

const BUCKET_NAME = process.env.BUCKET_NAME
const BUCKET_REGION = process.env.BUCKET_REGION
const POLICY_NAME = process.env.POLICY_NAME

const ACCESS_KEY = process.env.ACCESS_KEY
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY


const s3 = new S3Client({
    credentials: {

        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_ACCESS_KEY
    },
    region: BUCKET_REGION
})

app.post('/api/v2/sendNotifications', async (req, res) => {

    const message = {
        notification: {
            title: 'Hello',
            body: 'World'
        },
        token: 'recipient-device-token'
    };

    admin.messaging().send(message)
        .then((response) => {
            console.log('Successfully sent message:', response);
        })
        .catch((error) => {
            console.log('Error sending message:', error);
        });
})
connect(process.env.MONGO_DB_URL)

app.post('/api/v2/uploadFiles', upload.array('images'), async (req, res) => {
    try {
        let uploadedImages = [];
        console.log(`Number of files received: ${req.files.length}`);

        if (req.files && req.files.length > 0) {
            for (let index = 0; index < req.files.length; index++) {
                const fileName = req.body.fileName === "original" ? req.files[index].originalname : "FileNew" + new Date().getTime() + '_0';
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Body: req.files[index].buffer,
                    Key: fileName,
                    ContentType: req.files[index].mimetype
                };

                console.log(`Uploading file: ${fileName}`);
                await s3.send(new PutObjectCommand(uploadParams));
                const fileURLTemp = await getFileTempUrls3(fileName);
                uploadedImages.push({
                    fileName: fileName,
                    tempURL: fileURLTemp,
                    ContentType: req.files[index].mimetype
                });
                console.log(`Uploaded file: ${fileName}`);
            }
        } else {
            console.log('No files received.');
        }

        res.status(200).json({
            status: "success",
            msg: 'Uploaded Successfully',
            data: uploadedImages
        });
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while uploading files to drive`,
            stackTrace: JSON.stringify(error.stack.split('\n')),
            page: req.body?.uploadType ? `${req.body.uploadType} uploading` : 'Uploading News Image',
            functionality: req.body?.uploadType ? `${req.body.uploadType} uploading` : 'Uploading News Image',
            errorMessage: JSON.stringify(error)
        });

        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: 'Failed while processing..',
        });
    }
});


const uploadHandler = async (req, res) => {
    try {
        let uploadedImages = [];
        console.log(`Number of files received: ${req.files?.length}`);

        if (req.files && req.files.length > 0) {
            for (let index = 0; index < req.files.length; index++) {
                const fileName = req.body.fileName === "original"
                    ? req.files[index].originalname
                    : `File_${Date.now()}_${index}`;

                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Body: req.files[index].buffer,
                    Key: fileName,
                    ContentType: req.files[index].mimetype
                };

                console.log(`Uploading file: ${fileName}`);
                await s3.send(new PutObjectCommand(uploadParams));
                const fileURLTemp = await getFileTempUrls3(fileName);
                uploadedImages.push({
                    fileName: fileName,
                    tempURL: fileURLTemp,
                    ContentType: req.files[index].mimetype
                });
            }
        }

        res.status(200).json({
            status: "success",
            msg: 'Uploaded Successfully',
            data: uploadedImages
        });
    } catch (error) {
        await errorLogBookSchema.create({
            message: `Error while uploading files to drive`,
            stackTrace: JSON.stringify(error.stack?.split('\n')),
            page: req.body?.uploadType || 'Uploading News Image',
            functionality: req.body?.uploadType || 'Uploading News Image',
            errorMessage: JSON.stringify(error)
        });

        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: 'Failed while processing..',
        });
    }
};

app.post('/api/v3/uploadFiles', upload.array('images'), uploadHandler);


// BELWO ENDPOINT IS ONLY FOR TESTING
app.post('/api/v2/deleteS3', async (req, res) => {

    try {
        var filename = req.body.data.fileName
        // const params = {
        //     Bucket: BUCKET_NAME,
        //     Key: body.data.fileName
        // }



        const uploadParams = {
            Bucket: BUCKET_NAME,
            // Body: req.files[index].buffer,
            Key: filename,
            // ContentType: req.files[index].mimetype
        }

        // Send the upload to S3
        await s3.send(new DeleteObjectCommand(uploadParams));



        return res.status(200).json({
            status: "success",
            msg: 'Deleted Successfully',

        });

    } catch (error) {
        // const obj = await errorLogBookSchema.create({
        //     message: `Error while uploading files to drive`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: (req.body && req.body.uploadType) ? req.body.uploadType + " uploading" : 'Uploading News Image',
        //     functionality: (req.body && req.body.uploadType) ? req.body.uploadType + " uploading" : 'Uploading News Image',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })

        console.error(error)
        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }

});


app.get('', (req, res) => {
    res.send("HIIII")
})
async function getFileTempUrls3(fileName) {
    // GETTING IMAGE URL
    const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
            Bucket: BUCKET_NAME,

            Key: fileName
            // ContentType: file.mimetype
        }),
        { expiresIn: 3600 }// 60 seconds
    );
    return url
}



const start = async () => {
    const server = require('http').createServer(app);
    let port = process.env.PORT || 3000;
    
    const tryPort = (portToTry) => {
        return new Promise((resolve, reject) => {
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`Port ${portToTry} is in use, trying port ${Number(portToTry) + 1}...`);
                    resolve(tryPort(Number(portToTry) + 1));
                } else {
                    reject(err);
                }
            });
            
            server.listen(portToTry, () => {
                console.log(`Server is running on port ${portToTry}`);
                console.log(`Local: http://localhost:${portToTry}`);
                resolve(portToTry);
            });
        });
    };

    try {
        // Connect to MongoDB
        const db = await connect(process.env.MONGO_DB_URL);
        console.log('MongoDB connected successfully');
        
        // Start the server
        await tryPort(port);
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

start();

// AWS Lambda handler
const handler = async (event, context) => {
    // Ensure the database is connected
    try {
        if (!cachedDb || mongoose.connection.readyState !== 1) {
            console.log('Connecting to MongoDB from Lambda handler...');
            await connect(process.env.MONGO_DB_URL);
        }
        return serverless(app)(event, context);
    } catch (error) {
        console.error('Error in Lambda handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

// exports.handler = handler;

// For local development
if (process.env.NODE_ENV !== 'production') {
  // const PORT = process.env.PORT || 3000;
  // app.listen(PORT, () => {
  //   console.log(`Server is running on port ${PORT}`);
  // });
}

// SETUP FOR DEPLOYMENT (AWS Lambda)
// 1. Keep exports.handler uncommented
// 2. Comment out start()

// SETUP FOR LOCAL RUN
// 1. Comment out exports.handler
// 2. Keep start() uncommented