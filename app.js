const express = require('express');
require('express-async-errors');
const app = express();
const cors = require("cors");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const allowedOrigins = ['http://localhost:4201', 'https://neticharithra-ncmedia.web.app']; // Add more origins if needed
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const dotenv = require('dotenv');
dotenv.config()
const connect = require('./connectDB/mongoDB');
const router = require('./common-handlers/commonRoute');
app.use('/api/v2', router);
require('dotenv').config();
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
const multer = require('multer');
const storage = multer.memoryStorage()

const upload = multer({ storage: storage })
const stream = require('stream');


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

app.post('/api/v2/uploadFiles', upload.array('images'), async (req, res) => {

    try {

        let uploadedImages = []

        // const file = req.file


        if (req?.files?.length > 0) {
            for (let index = 0; index < req.files.length; index++) {
                const fileName =  "FileNew" + new Date().getTime() + '_0';
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Body: req.files[index].buffer,
                    Key: fileName,
                    ContentType: req.files[index].mimetype
                }

                // Send the upload to S3
                await s3.send(new PutObjectCommand(uploadParams));
                const fileURLTemp = await getFileTempUrls3(fileName)
                uploadedImages.push({
                    fileName: fileName,
                    tempURL: fileURLTemp,
                    ContentType: req.files[index].mimetype
                })

            }
        }

        res.status(200).json({
            status: "success",
            msg: 'Uploaded Succesfully',
            data: uploadedImages

        });
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while uploading files to drive`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
            page: (req.body && req.body.uploadType) ? req.body.uploadType + " uploading" : 'Uploading News Image',
            functionality: (req.body && req.body.uploadType) ? req.body.uploadType + " uploading" : 'Uploading News Image',
            errorMessage: `${JSON.stringify(error) || ''}`
        })

        console.error(error)
        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }

});
// BELWO ENDPOINT IS ONLY FOR TESTING
app.post('/api/v2/deleteS3', async (req, res) => {

    try {
        var filename = req.body.data.fileName
        // const params = {
        //     Bucket: BUCKET_NAME,
        //     Key: body.data.fileName
        // }

        // console.log(params)


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
        //     stackTrace: JSON.stringify([...error.stack].join('\n')),
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

start();
