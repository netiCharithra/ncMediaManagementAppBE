const express = require('express')
require('express-async-errors')
const app = express();
var cors = require("cors")
const path = require("path");
const multer = require('multer');
// const upload=multer();
const { google } = require('googleapis')

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(`${__dirname}/index.html`)
})

app.use(cors())
const connect = require('./connectDB/mongoDB')
const errorHandler = require('./common-error-handlers/commonErrorHandler')
const router = require('./common-handlers/commonRoute');
require('dotenv').config();
app.use('/api/v2', router)
app.use(errorHandler)
var cookieParser = require('cookie-parser');
app.use(cookieParser())
var bodyParser = require('body-parser');

// var corsOptions = {
//     origin: ["*"], //angular url
//     Headers: ["Content-Type", "Authorization"],
//     optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
// };

// app.use(bodyParser.json({
//     limit: "50mb",
//     type: "application/json"
// }));

// app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
const start = async () => {
    port = process.env.PORT
    try {
        await connect(process.env.MONGO_DB_URL)
        app.listen(port, () => {
            console.log(`listening port ${port}`)
        })
    } catch (error) {
        console.error(error)
    }
}


const upload = multer({ dest: 'uploads/' });
const stream = require('stream');

app.post('/api/upload/uploadFiles', upload.array('images'), async (req, res) => {
    const file = req.files[0];
    const folderId = '15BPdY4ps7wJNOXu9YeAVKlbjnlawnyHH'; // Replace with the ID of your target folder

    let uploadedImages = [];

    for (let index = 0; index < req.files.length; index++) {
        const obj = await uploadToDrive(req.files[index], folderId)
            .then((response) => {
                return response;
            })
            .catch(err => {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Failed to upload..! Try again later...!'
                });
            });

        if (obj) {
            uploadedImages.push(obj)
        }
    }

    return res.status(200).json({
        status: "success",
        msg: 'Uploaded Succesfully.',
        data: uploadedImages
    });
});


const fs = require('fs');

async function uploadToDrive(file, folderId) {
    const credentials = require('./cred.json'); // Replace with your Google Drive API credentials

    const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/drive']
    );

    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.create({
        requestBody: {
            name: file.originalname,
            mimeType: file.mimetype,
            parents: [folderId], // Specify the folder ID where you want to upload the file
        },
        media: {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
        },
    });

    fs.unlinkSync(file.path); // Remove the temporary file
     //https://drive.google.com/uc?export=view&id=
    return response.data
}

start();