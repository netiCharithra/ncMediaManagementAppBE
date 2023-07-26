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
const reporterSchema = require('./modals/reportersSchema');
const errorLogBookSchema = require('./modals/errorLogBookSchema')

app.use(cors({
    origin:"*"
}))
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
    port = process.env.PORT || 3000
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

    try {
        // const file = req.files[0];
        let folderId = '15BPdY4ps7wJNOXu9YeAVKlbjnlawnyHH'; // Replace with the ID of your target folder

        // console.log(req)
        let uploadedImages = [];

        // console.log(req)
        if (req.body) {
            if (req.body.uploadType) {
                if (['user_profile', 'user_identity'].indexOf(req.body.uploadType) > -1) {
                    folderId = '1HBhN9kB13IeVsYBWeH5-xaz7Sdbh_pJ0';
                }
                console.log(uploadedImages)
            }
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
            if (req.body.uploadType === 'user_profile') {
                if (uploadedImages[0].id) {

                    let task = await reporterSchema.updateOne({ employeeId: req.body.employeeId }, {
                        profilePicture: uploadedImages[0].id,
                        identityVerificationStatus: "pending"
                    })
                    const userDataCopy = await reporterSchema.findOne({ employeeId: req.body.employeeId }).select('-password -__v -passwordCopy -_id')
                    res.status(200).json({
                        status: "success",
                        msg: 'Profile Picture Updated Successfully...!',
                        data: userDataCopy
                    });
                } else {
                    res.status(200).json({
                        status: "failed",
                        msg: 'Failed to update profile picture..',

                    });
                }

            } else if (req.body.uploadType === 'user_identity') {
                let task = await reporterSchema.updateOne({ employeeId: req.body.employeeId }, {
                    identityProof: uploadedImages[0].id,
                    identityVerificationStatus: "pending"

                })
                const userDataCopy = await reporterSchema.findOne({ employeeId: req.body.employeeId }).select('-password -__v -passwordCopy -_id')

                res.status(200).json({
                    status: "success",
                    msg: 'Identity Updated Successfully...!',
                    data: userDataCopy
                });
            } else {
                return res.status(200).json({
                    status: "success",
                    msg: 'Uploaded Succesfully.',
                    data: uploadedImages
                });
            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while uploading files to drive`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
            page: (req.body && req.body.uploadType) ? req.body.uploadType + " uploading" : 'Uploading News Image',
            functionality: (req.body && req.body.uploadType) ? req.body.uploadType + " uploading" : 'Uploading News Image',
            errorMessage: `${JSON.stringify(error) || ''}`
        })

        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }


    // return res.status(200).json({
    //     status: "success",
    //     msg: 'Uploaded Succesfully.',
    //     data: uploadedImages
    // });
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






app.post('/api/v2/registerEmployee_v2', upload.fields([{ name: 'profilePic' }, { name: 'identityProof' }]), async (req, res) => {
    try {
        console.log(req.body.name)
        let data = JSON.parse(JSON.stringify(req.body));
        console.log(data)
        let checkMail = await reporterSchema.findOne({
            mail: data.mail
        });
        console.log("ERROR FROM HERE 1")
        if (!checkMail) {
            let users = await reporterSchema.find({
                'state': data['state']
            })
            data['employeeId'] = 'NC-' + data['state'] + '-' + (users.length ? users.length + 1 : 1);
            console.log("ERROR FROM HERE 2")
            data['createdOn'] = new Date().getTime();
            const folderId = '1HBhN9kB13IeVsYBWeH5-xaz7Sdbh_pJ0'; // Replace with the ID of your target folder

            const profilePic = await uploadToDrive(req.files.profilePic[0], folderId)
                .then((response) => {
                    // console.log(response)
                    return response;
                })
                .catch(err => {
                    return res.status(200).json({
                        status: "failed",
                        msg: 'Failed to upload..! Try again later...!'
                    });
                });

            const identityProof = await uploadToDrive(req.files.identityProof[0], folderId)
                .then((response) => {
                    // console.log(response)
                    return response;
                })
                .catch(err => {
                    return res.status(200).json({
                        status: "failed",
                        msg: 'Failed to upload..! Try again later...!'
                    });
                });
            data['profilePicture'] = profilePic['id']
            data['identityProof'] = identityProof['id']
            // console.log(profilePic)
            // console.log(identityProof)

            const task = await reporterSchema.create({
                ...data
            }) //pushing data to DB           
            const token = task.createJwt();
            console.log(task)
            res.cookie("tokens", token, {
                httpOnly: true,
            }).status(200).json({
                status: "success",
                msg: "Registered successfully..! You will get a confirmation as soon as accepeted.."
            })
            // .send(task).save(task);
        } else {
            res.status(200).json({
                status: "failed",
                msg: 'Mail already registered. Try contacting your higher authority.'
            })
        }

    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Registring Employee`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
            page: 'User self Register Page',
            functionality: 'To Register a employee',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }

});
start();
