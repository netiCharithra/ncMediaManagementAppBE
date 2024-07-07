const express = require('express');
require('express-async-errors');
const app = express();
const cors = require("cors");
app.use(cors())

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const functions = require("firebase-functions");
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require('fs');  // Require the fs module

const dotenv = require('dotenv');
dotenv.config();
const connect = require('./connectDB/mongoDB');
const router = require('./common-handlers/commonRoute');
app.use('/api/v2', router);
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
const util = require('util');

const formidable = require('formidable');

const errorLogBookSchema = require('./modals/errorLogBookSchema');

const BUCKET_NAME = process.env.BUCKET_NAME;
const BUCKET_REGION = process.env.BUCKET_REGION;
const ACCESS_KEY = process.env.ACCESS_KEY;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
    credentials: {
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_ACCESS_KEY
    },
    region: BUCKET_REGION
});

connect(process.env.MONGO_DB_URL);


app.post('/api/v2/uploadFiles', (req, res) => {
    console.log('Request received');

    let responseHasBeenSent = false;

    const sendResponse = (statusCode, responseBody) => {
        if (!responseHasBeenSent) {
            responseHasBeenSent = true;
            res.status(statusCode).json(responseBody);
            console.log(`Response sent with status ${statusCode}`);
        } else {
            console.log('Attempted to send response, but one has already been sent');
        }
    };

    const form = new formidable.IncomingForm({
        multiples: true,
        maxFileSize: 50 * 1024 * 1024, // 50MB limit
        uploadDir: './uploadFileTemp',
        keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
        console.log('Form parsed');

        if (err) {
            console.error('Error parsing form:', err);
            return sendResponse(500, {
                status: "failed",
                msg: 'Error parsing form data',
                error: err.message
            });
        }

        const processFiles = async () => {
            try {
                const fileArray = Array.isArray(files.images) ? files.images : [files.images];

                if (!fileArray || fileArray.length === 0) {
                    console.log('No files received.');
                    return sendResponse(400, {
                        status: "failed",
                        msg: 'No files received.'
                    });
                }

                console.log(`Number of files received: ${fileArray.length}`);

                let uploadedImages = [];

                for (let file of fileArray) {
                    const fileName = fields.fileName === "original" ? file.originalFilename : "FileNew" + new Date().getTime() + '_0';
                    const fileStream = fs.createReadStream(file.filepath);
                    const uploadParams = {
                        Bucket: BUCKET_NAME,
                        Body: fileStream,
                        Key: fileName,
                        ContentType: file.mimetype
                    };

                    console.log(`Uploading file: ${fileName}`);
                    await s3.send(new PutObjectCommand(uploadParams));
                    const fileURLTemp = await getFileTempUrls3(fileName);
                    uploadedImages.push({
                        fileName: fileName,
                        tempURL: fileURLTemp,
                        ContentType: file.mimetype
                    });
                    console.log(`Uploaded file: ${fileName}`);

                    fs.unlinkSync(file.filepath);
                }

                console.log("All files uploaded successfully");
                sendResponse(200, {
                    status: "success",
                    msg: 'Uploaded Successfully',
                    data: uploadedImages
                });
            } catch (error) {
                console.error('Error uploading files:', error);
                
                await errorLogBookSchema.create({
                    message: `Error while uploading files to drive`,
                    stackTrace: JSON.stringify(error.stack.split('\n')),
                    page: 'Uploading News Image',
                    functionality: 'Uploading News Image',
                    errorMessage: JSON.stringify(error)
                });

                sendResponse(500, {
                    status: "failed",
                    msg: 'Failed while processing..',
                    error: error.message
                });
            }
        };

        processFiles().catch(error => {
            console.error('Unhandled error in processFiles:', error);
            sendResponse(500, {
                status: "failed",
                msg: 'Unhandled server error',
                error: error.message
            });
        });
    });

    // Set a timeout to check if the response was sent
    setTimeout(() => {
        if (!responseHasBeenSent) {
            console.log('No response sent after 30 seconds');
            sendResponse(500, {
                status: "failed",
                msg: 'Server timeout'
            });
        }
    }, 30000);
});
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
    let port = process.env.PORT || 3000
    try {
        await connect(process.env.MONGO_DB_URL)
        app.listen(port, () => {
            console.log(`listening port ${port}`)
        })
    } catch (error) {
        console.error(error)
    }
}

// start();


exports.api = functions.https.onRequest(app)


// SETUP FOR DEPLOYMENT
// 1. Uncomment exports.api
// 2. Comment start()

// SETUP FOR LOCAL RUN
// 1. Comment exports.api
// 2. Uncomment start() 