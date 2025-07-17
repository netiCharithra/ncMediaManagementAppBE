
const reporterSchema = require('../modals/reportersSchema');
const metaDataSchema = require('../modals/metaDataSchema');
const newsDataSchema = require('../modals/newsDataSchema');
const subscriberDataSchema = require('../modals/subscriberDataSchema');
const errorLogBookSchema = require('../modals/errorLogBookSchema');
const admin = require('firebase-admin');
// const serviceAccount = require('./../ncmedianewsportal-v2-firebase-adminsdk-zr4hr-b428a7eb9b.json');
// // const admin = require("firebase-admin/messaging")
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
// });
const msgingAdmin = require('firebase-admin/messaging');


const registerReporter = async (req, res) => {
    try {
        let data = JSON.parse(JSON.stringify(req.body));
        let checkMail = await reporterSchema.findOne({
            mail: data.mail
        });
        if (!checkMail) {
            let users = await reporterSchema.find({
                'state': data['state']
            })
            data['employeeId'] = 'NC-' + data['state'] + '-' + (users.length ? users.length + 1 : 1);
            data['createdOn'] = new Date().getTime();
            const task = await reporterSchema.create({
                ...data
            }) //pushing data to DB           
            const token = task.createJwt();
            res.status(200).json({
                status: "success",
                msg: "Registered successfully..! You will get a confirmation as soon as accepeted.."
            }).send(task).save(task);
        } else {
            res.status(200).json({
                status: "failed",
                msg: 'Mail already registered. Try contacting your higher authority.'
            })
        }

    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Registring Employee`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employee Adding User',
            functionality: 'To Register a employee',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }
}

const reporterLogin = async (req, res) => {
    try {

        const {
            mail,
            password
        } = req.body;
        const userData = await reporterSchema.findOne({
            mail
        }).select('-__v -passwordCopy -_id') //returns single object
        if (!userData) {
            res.status(200).json({
                status: "failed",
                msg: 'Invalid Username or Password!'
            })
        } else {
            const verifyPassword = await userData.compare(password);
            if (!verifyPassword) {
                res.status(200).json({
                    status: "failed",
                    msg: 'Invalid Credentials'
                })
            } else if (userData.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!userData.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                let userDataCopy = JSON.parse(JSON.stringify(userData));
                let tokesns = await metaDataSchema.findOne({ type: "FCM_TOKENS" });


                if (userDataCopy?.profilePicture?.fileName) {
                    let url = await getFileTempUrls3(userDataCopy?.profilePicture.fileName);
                    userDataCopy['profilePicture']['tempURL'] = url
                }


                res.status(200).json({
                    status: "success",
                    msg: 'successfully logged in',
                    data: userDataCopy
                })
            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Loging Employee`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employee Login Page',
            functionality: 'To Login User',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        console.log(error)
        res.status(200).json({
            status: "failed",
            msg: 'Error while logging in! Try after some time.'
        })

    }
}

const getMetaData = async (req, res) => {
    try {
        const data = req.body;
        let metaData = {}
        for (let index = 0; index < req.body.metaList.length; index++) {
            let value = await metaDataSchema.findOne({
                type: req.body.metaList[index]
            })
            metaData[req.body.metaList[index]] = value?.['data'] || null;
        }
        if (data.employeeId !== 'NC-AP-1' && metaData['ROLE']) {
            var removeKeys = ['INCHARGE DIRECTOR', 'CEO']
            metaData['ROLE'] = metaData['ROLE'].filter(role => !removeKeys.includes(role));

        }
        if (req.body.metaList.length === Object.keys(metaData).length) {
            res.status(200).json({
                status: "success",
                msg: 'success',
                data: metaData
            })
        } else {
            res.status(200).json({
                status: "failed",
                msg: 'Error while processing! 3'
            })

        }

    } catch (error) {
        console.error(error)
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching Metadata`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'MetaDAta',
            functionality: 'To Fetch Metadata',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while loading! 2'
        })

    }

}

const publishNews = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                if (body.type === 'create') {

                    const existingNews = await newsDataSchema.find();
                    const existingNews_2 = await newsDataSchema.findOne().sort({ newsId: -1 });

                    if (existingNews && existingNews.length > 0) {
                        body['data']['newsId'] = (existingNews_2.newsId + 1);
                    } else {
                        body['data']['newsId'] = 1;
                    };
                    body['data']['employeeId'] = body.employeeId;
                    // console.log(body)
                    if (body['data']['priorityIndex']) {
                        let respppPriority = await newsDataSchema.findOne().sort({ priorityIndex: -1 })
                        // console.log("R", respppPriority)
                        if (!respppPriority) {
                            body['data']['priorityIndex'] = 1;
                        } else {
                            body['data']['priorityIndex'] = respppPriority['priorityIndex'] + 1;
                        }
                    } else {
                        body['data']['priorityIndex'] = null
                    }

                    if (!body['data']['reportedBy']) {

                        body['data']['reportedBy'] = {
                            name: body['name'],
                            profilePicture: body['profilePicture'],
                            role: body['role'],
                            employeeId: body['employeeId']
                        }
                    }
                    console.log(body['data']);
                    body['data']['createdDate'] = body['data']['createdDate'] || new Date().getTime();
                    const task = await newsDataSchema.create({
                        ...body.data
                    });
                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        task: task
                    });
                } else if (body.type === 'approve') {
                    console.log({
                        approved: true,
                        approvedBy: body.employeeId,
                        approvedOn: body?.data?.approvedOn || new Date().getTime(),
                        // lastUpdatedBy: data.employeeId,
                        rejected: false,
                        rejectedOn: '',
                        rejectedReason: '',
                        rejectedBy: ''
                    })
                    let task = await newsDataSchema.updateOne({ newsId: body.data.newsId },
                        {
                            approved: true,
                            approvedBy: body.employeeId,
                            approvedOn: body?.data?.approvedOn || new Date().getTime(),
                            // lastUpdatedBy: data.employeeId,
                            rejected: false,
                            rejectedOn: '',
                            rejectedReason: '',
                            rejectedBy: ''
                        }
                    );

                    res.status(200).json({
                        status: "success",
                        msg: 'Approved..!',
                        data: task
                    });
                } else if (body.type === 'reject') {
                    let task = await newsDataSchema.updateOne({ newsId: body.data.newsId },
                        {
                            approved: false,
                            approvedBy: '',
                            approvedOn: '',
                            rejected: true,
                            rejectedOn: body?.data?.rejectedOn || new Date().getTime(),
                            rejectedReason: body.data.reason,
                            rejectedBy: body.employeeId
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Rejected..!',
                        data: task
                    });
                } else if (body.type === 'update') {
                    console.log("UPDATE TRIGEER")
                    let updateJSON = {
                        ...body.data, ... {
                            approved: false,
                            approvedBy: '',
                            approvedOn: '',
                            rejected: false,
                            rejectedOn: '',
                            rejectedReason: '',
                            rejectedBy: '',
                            lastUpdatedBy: body.employeeId,
                            lastUpdatedOn: body.data.lastUpdatedOn || new Date().getTime(),
                            title: body.data.title,
                            sub_title: body.data.sub_title,
                            description: body.data.description,
                            images: body.data.images,
                            category: body.data.category || 'General',
                            newsType: body.data.newsType || 'Local',
                            source: body.data.source,
                            sourceLink: body.data.sourceLink,
                            reportedBy: body.data.reportedBy

                        }
                    }
                    if (updateJSON) {
                        let initalData = JSON.parse(JSON.stringify(updateJSON.initalDataCopy));

                        if (initalData['priorityIndex'] !== updateJSON['priorityIndex']) {
                            if (updateJSON['priorityIndex']) {
                                let respppPriority = await newsDataSchema.findOne().sort({ priorityIndex: -1 })
                                // console.log("R", respppPriority)
                                if (!respppPriority) {
                                    updateJSON['priorityIndex'] = 1;
                                } else {
                                    updateJSON['priorityIndex'] = respppPriority['priorityIndex'] + 1;
                                }
                            } else {
                                updateJSON['priorityIndex'] = null
                            }

                        }
                    }
                    let task = await newsDataSchema.updateOne({ newsId: body.data.newsId },
                        updateJSON
                    )
                    // console.log(updateJSON)
                    res.status(200).json({
                        // status: "failed",
                        status: "success",
                        msg: 'Updates..!',
                        data: task
                    });
                }
            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Publishing News`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'News Publish',
            functionality: 'Add news for approval',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        console.log(error)
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing.. 2! ',
            error: error
        })
    }
}

// getNewsInfo

const getNewsInfo = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        console.log(employee)
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employment not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                let newsContent = await newsDataSchema.findOne({ newsId: body.newsId });

                let news = JSON.parse(JSON.stringify(newsContent))
                // Fetching tempURL for each image in newsContent using promises  
                let imagesWithTempURL = await Promise.all(news?.images.map(async (elementImg) => {
                    if (elementImg?.fileName) {
                        elementImg['tempURL'] = await getFileTempUrls3(elementImg?.fileName);
                    }
                    return elementImg; // Returning updated image object
                }));

                // Updating images array in newsContent with imagesWithTempURL
                news.images = imagesWithTempURL;

                res.status(200).json({
                    status: "success",
                    msg: 'News Fetched successfully..!',
                    data: news
                });
            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching News Info`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch News Info',
            functionality: 'To Fetch News Info Publish',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}


const dotenv = require('dotenv');
const { DeleteObjectCommand, S3, S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const reportersSchema = require('../modals/reportersSchema');
const employeeTracing = require('../modals/employeeTracing');
dotenv.config()

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
const deleteS3Images = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                const params = {
                    Bucket: BUCKET_NAME,
                    Key: body?.data?.fileName || body?.fileName
                }

                const command = new DeleteObjectCommand(params)
                await s3.send(command)
                return res.status(200).json({
                    status: "success",
                    msg: 'Deleted Successfully',

                });
            }
        }
    } catch (error) {
        // const obj = await errorLogBookSchema.create({
        //     message: `Error while Fetching  News Info`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: 'Fetch News Info ',
        //     functionality: 'To Fetch News Info Publish',
        //     employeeId: req.body.employeeId || '',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}


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


const getNewsList = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {
                    approvedNews: {
                        "tableData": {

                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },
                                {
                                    "label": "Approved On",
                                    "key": "approvedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Approved By",
                                    "key": "approvedBy"
                                },

                            ]
                        }
                    },
                    notApprovedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },
                                {
                                    "label": "Last Updated On",
                                    "key": "lastUpdatedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Last Updated By",
                                    "key": "lastUpdatedBy"
                                }
                            ]
                        }
                    },
                    rejectedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },

                                {
                                    "label": "Rejected On",
                                    "key": "rejectedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Rejected By",
                                    "key": "rejectedBy"
                                },
                                {
                                    "label": "Reason",
                                    "key": "rejectedReason"
                                },

                            ]
                        }
                    },
                }

                if (body.role === 'CEO' || body.role === 'INCHARGE DIRECTOR') {

                    const approvedLst = await newsDataSchema.find(
                        {
                            approved: true,
                            rejected: false
                        }

                    ).where('approved').equals(true).where('rejected').equals(false);
                    responseData.approvedNews.tableData['bodyContent'] = await stateDistrictMapping(approvedLst, [])
                    const ntApprovedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: false
                        },

                    );
                    responseData.notApprovedNews.tableData['bodyContent'] = await stateDistrictMapping(ntApprovedLst, []);
                    const rejectedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: { $in: [true] }
                        },

                    );

                    responseData.rejectedNews.tableData['bodyContent'] = await stateDistrictMapping(rejectedLst, []);
                    responseData['approvedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "headerExternalActions": [
                            {
                                type: "select",
                                label: "External Link News",
                                icon: "add_circle",
                                key: "externalLink",
                                options: [
                                    "Andhra Jyothi"
                                ]
                            }
                        ],
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                icon: "visibility",
                                key: "view",
                                class: "btn btn-info"
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                class: "btn btn-info",
                                icon: "edit_square",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }
                    responseData['notApprovedNews']['metaData'] = {
                        title: "Pending News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "task_alt",
                                key: "approve",
                                class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Reject",
                                key: "reject",
                                class: "btn btn-danger",
                                icon: "bi bi-x-circle-fill",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                class: "btn btn-info",
                                icon: "edit_square",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }
                    responseData['rejectedNews']['metaData'] = {
                        title: "Rejected News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "task_alt",
                                key: "approve",
                                class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            }
                        ]
                    }
                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                }
                else if (body.role === 'DISTRICT MANAGER') {
                    const approvedLst = await newsDataSchema.find(
                        {
                            approved: true,
                            rejected: false,
                            district: req.body.district
                        }

                    ).where('approved').equals(true).where('rejected').equals(false);
                    responseData.approvedNews.tableData['bodyContent'] = await stateDistrictMapping(approvedLst, [])
                    const ntApprovedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: false,
                            district: req.body.district
                        },

                    );
                    responseData.notApprovedNews.tableData['bodyContent'] = await stateDistrictMapping(ntApprovedLst, []);
                    const rejectedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: { $in: [true] },
                            district: req.body.district
                        },

                    );

                    responseData.rejectedNews.tableData['bodyContent'] = await stateDistrictMapping(rejectedLst, []);
                    responseData['approvedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                icon: "visibility",
                                key: "view",
                                class: "btn btn-info"
                            }
                        ]
                    }
                    responseData['notApprovedNews']['metaData'] = {
                        title: "Pending News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "task_alt",
                                key: "approve",
                                class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Reject",
                                key: "reject",
                                class: "btn btn-danger",
                                icon: "bi bi-x-circle-fill",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                class: "btn btn-info",
                                icon: "edit_square",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }
                    responseData['rejectedNews']['metaData'] = {
                        title: "Rejected News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "task_alt",
                                key: "approve",
                                class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            }
                        ]
                    }
                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                } else if (body.role === 'REPORTER') {

                }

            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching News List`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch News List ',
            functionality: 'To Fetch News List ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while Processing..! ',
            error: error
        })
    }
}


const fetchNewsListPending = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));

        const recordsPerPage = req?.body?.count || 10;
        const pageNumber = req?.body?.page || 1;
        const skipRecords = (pageNumber - 1) * recordsPerPage;

        console.log(recordsPerPage, skipRecords)

        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {

                    notApprovedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },
                                {
                                    "label": "Last Updated On",
                                    "key": "lastUpdatedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Last Updated By",
                                    "key": "lastUpdatedBy"
                                }
                            ]
                        }
                    }
                }

                if (body.role === 'CEO' || body.role === 'INCHARGE DIRECTOR') {

                    console.log("TR")
                    const ntApprovedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: false
                        }
                    )
                        .sort({ newsId: -1 })
                        .skip(skipRecords)
                        .limit(recordsPerPage);
                    const totalRecords = await newsDataSchema.countDocuments(
                        {
                            approved: false,
                            rejected: false
                        }
                    );
                    console.log(ntApprovedLst)
                    responseData.notApprovedNews.tableData['bodyContent'] = await stateDistrictMapping(ntApprovedLst, []);
                    responseData['notApprovedNews']['metaData'] = {
                        title: "Pending News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "bi bi-check-square-fill text-success fs-4",
                                key: "approve",
                                // class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Reject",
                                key: "reject",
                                // class: "btn text-danger",
                                icon: "bi bi-x-circle-fill  text-danger fs-4",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "bi bi-pencil-square fs-4",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: { ...responseData, ...{ totalRecords: totalRecords } },

                    });
                }
                else if (body.role === 'DISTRICT MANAGER') {


                    const ntApprovedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: false,
                            district: req.body.district
                        },

                    ).sort({ newsId: -1 }) // Sorting by newsId in descending order
                        .skip(skipRecords) // Skipping records based on page number
                        .limit(recordsPerPage); // Limiting records per page
                    responseData.notApprovedNews.tableData['bodyContent'] = await stateDistrictMapping(ntApprovedLst, []);
                    responseData['notApprovedNews']['metaData'] = {
                        title: "Pending News",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "bi bi-check-square-fill text-success fs-4",
                                key: "approve",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Reject",
                                key: "reject",
                                // class: "btn btn-danger",
                                icon: "bi bi-x-circle-fill  text-danger fs-4",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "bi bi-pencil-square fs-4",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                } else if (body.role === 'REPORTER') {
                    const ntApprovedLst = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: false,
                            source: "NETI CHARITHRA",
                            "reportedBy.employeeId": req.body.employeeId// Replace this with the actual employeeId

                        },

                    ).sort({ newsId: -1 }) // Sorting by newsId in descending order
                        .skip(skipRecords) // Skipping records based on page number
                        .limit(recordsPerPage); // Limiting records per page
                    responseData.notApprovedNews.tableData['bodyContent'] = await stateDistrictMapping(ntApprovedLst, []);
                    responseData['notApprovedNews']['metaData'] = {
                        title: "Pending News",
                        "actions": [
                            // {
                            //     type: "button",
                            //     tooltip: "Approve",
                            //     icon: "bi bi-check-square-fill",
                            //     key: "approve",
                            //     class: "btn btn-success",
                            //     disable: {
                            //         role: ['REPORTER']
                            //     }
                            // },
                            {
                                type: "button",
                                tooltip: "Reject",
                                key: "reject",
                                // class: "btn btn-danger",
                                icon: "bi bi-x-circle-fill  text-danger fs-4",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "bi bi-pencil-square fs-4",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                }

            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching News List`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch News List ',
            functionality: 'To Fetch News List ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while Processing..! ',
            error: error
        })
    }
}

const fetchNewsListApproved = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));

        const recordsPerPage = req?.body?.count || 10;
        const pageNumber = req?.body?.page || 1;
        const skipRecords = (pageNumber - 1) * recordsPerPage;

        console.log(recordsPerPage, skipRecords)

        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {

                    approvedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },
                                {
                                    "label": "Last Updated On",
                                    "key": "lastUpdatedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Last Updated By",
                                    "key": "lastUpdatedBy"
                                }
                            ]
                        }
                    }
                }

                if (body.role === 'CEO' || body.role === 'INCHARGE DIRECTOR') {

                    console.log("TR")
                    const approvedList = await newsDataSchema.find(
                        {
                            approved: true,
                            rejected: false
                        }
                    )
                        .sort({ newsId: -1 })
                        .skip(skipRecords)
                        .limit(recordsPerPage);
                    const totalRecords = await newsDataSchema.countDocuments(
                        {
                            approved: true,
                            rejected: false
                        }
                    );
                    console.log(approvedList)
                    responseData.approvedNews.tableData['bodyContent'] = await stateDistrictMapping(approvedList, []);
                    responseData['approvedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "headerExternalActions": [
                            {
                                type: "select",
                                label: "External Link News",
                                icon: "add_circle",
                                key: "externalLink",
                                options: [
                                    "Andhra Jyothi"
                                ]
                            }
                        ],


                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "bi bi-eye-fill fs-4 text-secondary"
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "bi bi-pencil-square fs-4",
                                // disable: {
                                //     role: ['REPORTER']
                                // }
                            }
                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: { ...responseData, ...{ totalRecords: totalRecords } },

                    });
                }
                else if (body.role === 'DISTRICT MANAGER') {


                    const approvedList = await newsDataSchema.find(
                        {
                            approved: true,
                            rejected: false,
                            district: req.body.district
                        },

                    ).sort({ newsId: -1 }) // Sorting by newsId in descending order
                        .skip(skipRecords) // Skipping records based on page number
                        .limit(recordsPerPage); // Limiting records per page
                    responseData.approvedNews.tableData['bodyContent'] = await stateDistrictMapping(approvedList, []);
                    responseData['approvedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "bi bi-eye-fill fs-4 text-secondary"
                            },

                        ]
                    }


                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                } else if (body.role === 'REPORTER') {
                    const approvedList = await newsDataSchema.find(
                        {
                            approved: true,
                            rejected: false,
                            source: "NETI CHARITHRA",
                            "reportedBy.employeeId": req.body.employeeId// Replace this with the actual employeeId

                        },

                    ).sort({ newsId: -1 }) // Sorting by newsId in descending order
                        .skip(skipRecords) // Skipping records based on page number
                        .limit(recordsPerPage); // Limiting records per page
                    responseData.approvedNews.tableData['bodyContent'] = await stateDistrictMapping(approvedList, []);
                    responseData['approvedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "bi bi-eye-fill fs-4 text-secondary"
                            },

                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                }

            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching News List`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch News List ',
            functionality: 'To Fetch News List ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while Processing..! ',
            error: error
        })
    }
}



const fetchNewsListRejected = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));

        const recordsPerPage = req?.body?.count || 10;
        const pageNumber = req?.body?.page || 1;
        const skipRecords = (pageNumber - 1) * recordsPerPage;

        console.log(recordsPerPage, skipRecords)

        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {

                    rejectedNews: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Title",
                                    "key": "title"
                                },
                                {
                                    "label": "Sub Title",
                                    "key": "sub_title"
                                }, {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Created Date",
                                    "key": "createdDate",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Created By",
                                    "key": "employeeId"
                                },

                                {
                                    "label": "Rejected On",
                                    "key": "rejectedOn",
                                    "type": "dataTimePipe"
                                },
                                {
                                    "label": "Rejected By",
                                    "key": "rejectedBy"
                                },
                                {
                                    "label": "Reason",
                                    "key": "rejectedReason"
                                },

                            ]
                        }
                    }
                }

                if (body.role === 'CEO' || body.role === 'INCHARGE DIRECTOR') {

                    console.log("TR")
                    const rejectedList = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: true
                        }
                    )
                        .sort({ newsId: -1 })
                        .skip(skipRecords)
                        .limit(recordsPerPage);
                    const totalRecords = await newsDataSchema.countDocuments(
                        {
                            approved: false,
                            rejected: true
                        }
                    );
                    console.log(rejectedList)
                    responseData.rejectedNews.tableData['bodyContent'] = await stateDistrictMapping(rejectedList, []);
                    responseData['rejectedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "headerExternalActions": [
                            {
                                type: "select",
                                label: "External Link News",
                                icon: "add_circle",
                                key: "externalLink",
                                options: [
                                    "Andhra Jyothi"
                                ]
                            }
                        ],


                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "bi bi-eye-fill fs-4 text-secondary"
                            },
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "bi bi-check-square-fill text-success fs-4",
                                key: "approve",
                                // class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: { ...responseData, ...{ totalRecords: totalRecords } },

                    });
                }
                else if (body.role === 'DISTRICT MANAGER') {


                    const rejectedList = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: true,
                            district: req.body.district
                        },

                    ).sort({ newsId: -1 }) // Sorting by newsId in descending order
                        .skip(skipRecords) // Skipping records based on page number
                        .limit(recordsPerPage); // Limiting records per page
                    responseData.rejectedNews.tableData['bodyContent'] = await stateDistrictMapping(rejectedList, []);
                    responseData['rejectedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "bi bi-eye-fill fs-4 text-secondary"
                            },
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "bi bi-check-square-fill text-success fs-4",
                                key: "approve",
                                // class: "btn btn-success",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },

                        ]
                    }


                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                } else if (body.role === 'REPORTER') {
                    const rejectedList = await newsDataSchema.find(
                        {
                            approved: false,
                            rejected: true,
                            source: "NETI CHARITHRA",
                            "reportedBy.employeeId": req.body.employeeId// Replace this with the actual employeeId

                        },

                    ).sort({ newsId: -1 }) // Sorting by newsId in descending order
                        .skip(skipRecords) // Skipping records based on page number
                        .limit(recordsPerPage); // Limiting records per page
                    responseData.rejectedNews.tableData['bodyContent'] = await stateDistrictMapping(rejectedList, []);
                    responseData['rejectedNews']['metaData'] = {
                        title: "Published News",
                        "createNew": {
                            type: "createNew",
                            label: "Add News",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "bi bi-eye-fill fs-4 text-secondary"
                            },
                            // {
                            //     type: "button",
                            //     tooltip: "Approve",
                            //     icon: "bi bi-check-square-fill text-success fs-4",
                            //     key: "approve",
                            //     // class: "btn btn-success",
                            //     disable: {
                            //         role: ['REPORTER']
                            //     }
                            // },

                        ]
                    }

                    res.status(200).json({
                        status: "success",
                        msg: 'News sent for approval..!',
                        data: responseData
                    });
                }

            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching News List`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch News List ',
            functionality: 'To Fetch News List ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while Processing..! ',
            error: error
        })
    }
}



const getAllEmployees = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                // let allEmployees = await reporterSchema.find().select('-password -__v -passwordCopy -_id').where('activeUser').equals(true);
                let allEmployees = await reporterSchema.aggregate([
                    {
                        $match: {
                            activeUser: true,
                            identityVerificationStatus: "approved"
                        }
                    },
                    {
                        $project: {
                            password: 0,
                            __v: 0,
                            passwordCopy: 0,
                            _id: 0
                        }
                    }
                ]);
                let responseData = await stateDistrictMapping(allEmployees, [], ['_id', 'password', 'passwordCopy', 'createdOn', 'activeUser', 'disabledUser', '__v', 'disabledBy', 'disabledOn', 'lastUpdatedBy', 'lastUpdatedOn'])
                res.status(200).json({
                    status: "success",
                    msg: 'Listed',
                    data: responseData
                });


            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Listing all Employees`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employees List ',
            functionality: 'To List All Employees',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}
const getAllEmployeesV2 = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                // let allEmployees = await reporterSchema.find().select('-password -__v -passwordCopy -_id').where('activeUser').equals(true);
                let allEmployees = await reporterSchema.aggregate([
                    {
                        $match: {
                            activeUser: true,
                            identityVerificationStatus: "approved",
                            role: body?.role === "CEO" ? { $exists: true } : { $nin: ["CEO", "INCHARGE DIRECTOR"] }
                        }
                    },
                    {
                        $project: {
                            password: 0,
                            __v: 0,
                            passwordCopy: 0,
                            _id: 0
                        }
                    }
                ]);
                let responseData = await stateDistrictMapping(allEmployees, [], ['_id', 'password', 'passwordCopy', 'createdOn', 'activeUser', 'disabledUser', '__v', 'disabledBy', 'disabledOn', 'lastUpdatedBy', 'lastUpdatedOn'])
                res.status(200).json({
                    status: "success",
                    msg: 'Listed',
                    data: responseData
                });


            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Listing all Employees`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employees List ',
            functionality: 'To List All Employees',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while publishing..! ',
            error: error
        })
    }
}

const fetchDashboard = async (req, res) => {
    try {
        let responseData = {
            dashboardCount: {}
        };
        let todaysStart = new Date();
        todaysStart.setHours(0);
        todaysStart.setMinutes(0);
        todaysStart.setSeconds(0);
        if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {

            let userData = await reporterSchema.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        activeUsers: { $sum: { $cond: [{ $eq: ['$activeUser', true] }, 1, 0] } }
                    }
                }
            ])
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let newsInfo = await newsDataSchema.aggregate([
                {
                    $facet: {
                        todaysAllNews: [
                            {
                                $match: {
                                    createdDate: { $gte: today.getTime() }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        todaysApprovedNews: [
                            {
                                $match: {
                                    createdDate: { $gte: today.getTime() },
                                    approvedOn: { $gt: 0 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        overallNews: [
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        overallApprovedNews: [
                            {
                                $match: {
                                    approvedOn: { $gt: 0 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        todaysAllNewsCount: { $arrayElemAt: ['$todaysAllNews.count', 0] },
                        todaysApprovedNewsCount: { $arrayElemAt: ['$todaysApprovedNews.count', 0] },
                        overallNewsCount: { $arrayElemAt: ['$overallNews.count', 0] },
                        overallApprovedNewsCount: { $arrayElemAt: ['$overallApprovedNews.count', 0] }
                    }
                }
            ])
            responseData.dashboardCount.employees = userData[0]?.totalUsers || 0;
            responseData.dashboardCount.activeEmployees = userData[0]?.activeUsers || 0;
            responseData.dashboardCount.todaysNews = newsInfo[0].todaysAllNewsCount || 0;
            responseData.dashboardCount.todaysNewsApproved = newsInfo[0].todaysApprovedNewsCount || 0;

            responseData.dashboardCount.totalNews = newsInfo[0]?.overallNewsCount || 0;
            responseData.dashboardCount.totalNewsApproved = newsInfo[0]?.overallApprovedNewsCount || 0;

            responseData.dashboardCount.contactsAll = (await subscriberDataSchema.find()).length;
            responseData.dashboardCount.contactsAdded = (await subscriberDataSchema.find().where('addedToGroup').equals(true)).length;
        } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {

            let dtEmployeeInfo = await reporterSchema.aggregate([
                {
                    $match: {
                        district: req.body.district // Replace with the desired district value
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalEmployees: { $sum: 1 },
                        approvedEmployees: { $sum: { $cond: [{ $eq: ['$activeUser', true] }, 1, 0] } }
                    }
                }
            ])

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let newsInfo = await newsDataSchema.aggregate([
                {
                    $match: {
                        district: req.body.district // Replace with the desired district value
                    }
                },
                {
                    $facet: {
                        todaysAllNews: [
                            {
                                $match: {
                                    createdDate: { $gte: today.getTime() }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        todaysApprovedNews: [
                            {
                                $match: {
                                    createdDate: { $gte: today.getTime() },
                                    approvedOn: { $gt: 0 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        overallNews: [
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        overallApprovedNews: [
                            {
                                $match: {
                                    approvedOn: { $gt: 0 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        todaysAllNewsCount: { $arrayElemAt: ['$todaysAllNews.count', 0] },
                        todaysApprovedNewsCount: { $arrayElemAt: ['$todaysApprovedNews.count', 0] },
                        overallNewsCount: { $arrayElemAt: ['$overallNews.count', 0] },
                        overallApprovedNewsCount: { $arrayElemAt: ['$overallApprovedNews.count', 0] }
                    }
                }
            ]);

            responseData.dashboardCount.employees = dtEmployeeInfo[0].totalEmployees || 0;
            responseData.dashboardCount.activeEmployees = dtEmployeeInfo[0].approvedEmployees || 0;
            responseData.dashboardCount.todaysNews = newsInfo[0].todaysAllNewsCount || 0;
            responseData.dashboardCount.todaysNewsApproved = newsInfo[0].todaysApprovedNewsCount || 0;
            responseData.dashboardCount.totalNews = newsInfo[0].overallNewsCount || 0;
            responseData.dashboardCount.totalNewsApproved = newsInfo[0].overallApprovedNewsCount || 0;
            responseData.dashboardCount.contactsAll = (await subscriberDataSchema.find().where('district').equals(req.body.district)).length;
            responseData.dashboardCount.contactsAdded = (await subscriberDataSchema.find().where('district').equals(req.body.district).where('addedToGroup').equals(true)).length;
        } else if (req.body.role === 'REPORTER') {

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let newsInfo = await newsDataSchema.aggregate([
                {
                    $match: {
                        employeeId: req.body.employeeId // Replace with the desired district value
                    }
                },
                {
                    $facet: {
                        todaysAllNews: [
                            {
                                $match: {
                                    createdDate: { $gte: today.getTime() }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        todaysApprovedNews: [
                            {
                                $match: {
                                    createdDate: { $gte: today.getTime() },
                                    approvedOn: { $gt: 0 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        overallNews: [
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ],
                        overallApprovedNews: [
                            {
                                $match: {
                                    approvedOn: { $gt: 0 }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    count: { $sum: 1 }
                                }
                            }
                        ]
                    }
                },
                {
                    $project: {
                        todaysAllNewsCount: { $arrayElemAt: ['$todaysAllNews.count', 0] },
                        todaysApprovedNewsCount: { $arrayElemAt: ['$todaysApprovedNews.count', 0] },
                        overallNewsCount: { $arrayElemAt: ['$overallNews.count', 0] },
                        overallApprovedNewsCount: { $arrayElemAt: ['$overallApprovedNews.count', 0] }
                    }
                }
            ]);
            responseData.dashboardCount.todaysNews = newsInfo[0].todaysAllNewsCount || 0;
            responseData.dashboardCount.todaysNewsApproved = newsInfo[0].todaysApprovedNewsCount || 0;
            responseData.dashboardCount.totalNews = newsInfo[0].overallNewsCount || 0;
            responseData.dashboardCount.totalNewsApproved = newsInfo[0].overallApprovedNewsCount || 0;
            responseData.dashboardCount.contactsAll = (await subscriberDataSchema.find().where('district').equals(req.body.district)).length;
            responseData.dashboardCount.contactsAdded = (await subscriberDataSchema.find().where('district').equals(req.body.district).where('addedToGroup').equals(true)).length;
        }


        let chartInfos = []

        if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {

            const newsTypeBasedInfo = await newsDataSchema.aggregate([
                {
                    $group: {
                        _id: '$newsType',
                        approvedCount: {
                            $sum: { $cond: [{ $gt: ['$approvedOn', 0] }, 1, 0] }
                        },
                        notApprovedCount: {
                            $sum: { $cond: [{ $and: [{ $eq: ['$approved', false] }, { $eq: ['$rejected', false] }] }, 1, 0] }
                        },
                        rejectedCount: {
                            $sum: { $cond: ['$rejected', 1, 0] }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        approvedCount: { $ifNull: ['$approvedCount', 0] },
                        notApprovedCount: { $ifNull: ['$notApprovedCount', 0] },
                        rejectedCount: { $ifNull: ['$rejectedCount', 0] }
                    }
                }
            ])
            chartInfos.push({
                title: "Overall news statistics",
                description: "Locality wise news reports.",
                type: "state_wise_chart",
                chartData: {}
            })

            let firstChartData = [];
            let firstChartapprovedNews = []
            let firstChartPendingNews = []
            let firstChartRejectedNews = []
            for (let index = 0; index < newsTypeBasedInfo.length; index++) {
                firstChartData.push(newsTypeBasedInfo[index]._id)
                firstChartapprovedNews.push(newsTypeBasedInfo[index].approvedCount)
                firstChartPendingNews.push(newsTypeBasedInfo[index].notApprovedCount)
                firstChartRejectedNews.push(newsTypeBasedInfo[index].rejectedCount)
            }
            chartInfos[0]['chartData'] = await multiBarChart({
                type: "category",
                value: firstChartData
            }, [{
                name: "Approved",
                value: firstChartapprovedNews
            }, {
                name: "Pending",
                value: firstChartPendingNews
            }, {
                name: "Rejected",
                value: firstChartRejectedNews
            }])




            // =============================================================================================


            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

            const startOfOneMonthAgo = new Date(oneMonthAgo.getFullYear(), oneMonthAgo.getMonth(), oneMonthAgo.getDate(), 0, 0, 0);

            const startDateEpoch = startOfOneMonthAgo.getTime() / 1000; // Convert to epoch

            const newsTypeBasedInfoForAMonth = await newsDataSchema.aggregate([
                {
                    $match: {
                        createdDate: { $gte: startDateEpoch } // Filter within the last one month
                    }
                },
                {
                    $group: {
                        _id: '$newsType',
                        approvedCount: {
                            $sum: { $cond: [{ $gt: ['$approvedOn', 0] }, 1, 0] }
                        },
                        notApprovedCount: {
                            $sum: { $cond: [{ $and: [{ $eq: ['$approved', false] }, { $eq: ['$rejected', false] }] }, 1, 0] }
                        },
                        rejectedCount: {
                            $sum: { $cond: ['$rejected', 1, 0] }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        approvedCount: { $ifNull: ['$approvedCount', 0] },
                        notApprovedCount: { $ifNull: ['$notApprovedCount', 0] },
                        rejectedCount: { $ifNull: ['$rejectedCount', 0] }
                    }
                }
            ])

            chartInfos.push({
                title: "Overall news statistics for last one month",
                description: "Locality wise news reports for last one month.",
                type: "state_wise_chart",
                chartData: {}
            })

            let secondChartData = [];
            let secondChartapprovedNews = []
            let secondChartPendingNews = []
            let secondChartRejectedNews = []
            for (let index = 0; index < newsTypeBasedInfoForAMonth.length; index++) {
                secondChartData.push(newsTypeBasedInfoForAMonth[index]._id)
                secondChartapprovedNews.push(newsTypeBasedInfoForAMonth[index].approvedCount)
                secondChartPendingNews.push(newsTypeBasedInfoForAMonth[index].notApprovedCount)
                secondChartRejectedNews.push(newsTypeBasedInfoForAMonth[index].rejectedCount)
            }
            chartInfos[1]['chartData'] = await multiBarChart({
                type: "category",
                value: secondChartData
            }, [{
                name: "Approved",
                value: secondChartapprovedNews
            }, {
                name: "Pending",
                value: secondChartPendingNews
            }, {
                name: "Rejected",
                value: secondChartRejectedNews
            }]);

            responseData['chartInfos'] = chartInfos;
            res.status(200).json({
                status: "success",
                msg: 'Successfully fetched. ',
                data: responseData
            })
        } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
            res.status(200).json({
                status: "success",
                msg: 'Successfully fetched. ',
                data: responseData
            })
        } else if (req.body.role === 'REPORTER') {
            res.status(200).json({
                status: "success",
                msg: 'Successfully fetched. ',
                data: responseData
            })
        }



    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching Dashboard`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch Dashboard ',
            functionality: 'To Fetch Dashboard ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..! ',
            error: error
        })

    }
}

function getPastSevenDays() {
    const today = new Date();
    const pastSevenDays = [];

    for (let i = 0; i < 7; i++) {
        const pastDay = new Date();
        pastDay.setDate(today.getDate() - i);
        pastSevenDays.push(pastDay.toISOString().split('T')[0]);
    }

    return pastSevenDays;
}
// Function to convert Date to start of day and end of day epoch timestamps
const getEpochTimeRange = (date) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0); // Set to beginning of day
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999); // Set to end of day
    return {
        start: startOfDay.getTime(),
        end: endOfDay.getTime()
    };
};
function getMonthEpochs(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const months = [];

    const endMonth = (year === currentYear) ? currentMonth : 11;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    for (let month = 0; month <= endMonth; month++) {
        const startDate = new Date(year, month, 1, 0, 0, 0);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

        const startEpoch = startDate.getTime();
        const endEpoch = endDate.getTime();

        months.push({
            month: monthNames[month], // Month name
            startEpoch,
            endEpoch
        });
    }

    return months;
}

function getLast7Years(year) {
    let baseYear = 2023;
    const currentYear = year ? year : new Date().getFullYear();
    const yearsData = [];

    // Adjust the loop to start from baseYear and go to currentYear
    for (let year = baseYear; year <= currentYear && yearsData.length < 7; year++) {
        // Calculate epoch time for January 1st of the current year
        const jan1Epoch = new Date(`${year}-01-01T00:00:00`).getTime();

        // Calculate epoch time for December 31st of the current year
        const dec31Epoch = new Date(`${year}-12-31T23:59:59`).getTime();

        // Push the year data into the array
        yearsData.push({
            year: year,
            startEpoch: jan1Epoch,
            endEpoch: dec31Epoch
        });
    }

    return yearsData;
}


// Example usage:

const newsReportChart = async (req, res) => {

    try {

        let reqPayloadData = req.body;


        let responseJSON = {}
        if (reqPayloadData.data.reportType === 'Recent') {
            let dates = await getPastSevenDays();




            // Build aggregation pipeline for each date
            const pipelines = dates.map(date => {
                const { start, end } = getEpochTimeRange(date);
                let pipe = [
                    {
                        $match: {
                            createdDate: { $gte: start, $lte: end }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            approved: {
                                $sum: { $cond: [{ $ne: ["$approvedOn", null] }, 1, 0] }
                            },
                            rejected: {
                                $sum: { $cond: [{ $ne: ["$rejectedOn", null] }, 1, 0] }
                            },
                            pending: {
                                $sum: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $eq: ["$approvedOn", null] },
                                                { $eq: ["$rejectedOn", null] }
                                            ]
                                        },
                                        1,
                                        0
                                    ]
                                }
                            },
                            total: { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            date: { $toDate: start }, // Use start of day as the date for consistent output
                            approved: 1,
                            pending: 1,
                            rejected: 1
                        }
                    }


                ];
                // let pipe= [
                //     {
                //         $match: {
                //             createdDate: { $gte: start, $lte: end }
                //         }
                //     },
                //     {
                //         $group: {
                //             _id: null,
                //             approved: { $sum: { $cond: [{ $ne: ["$approvedOn", null] }, 1, 0] } },
                //             // approved: { $sum: { $cond: [{ $eq: ["$approvedOn", null], $eq: ["$rejectedOn", null] }, 1, 0] } },

                //             pending: {
                //                 $sum: {
                //                     $cond: [
                //                         { $and: [{ $eq: ["$approvedOn", null] }, { $eq: ["$rejectedOn", null] }] },
                //                         1,
                //                         0
                //                     ]
                //                 }
                //             },
                //             rejected: { $sum: { $cond: [{ $ne: ["$rejectedOn", null] }, 1, 0] } }
                //         }
                //     },
                //     {
                //         $project: {
                //             _id: 0,
                //             date: { $toDate: start }, // Use start of day as the date for consistent output
                //             approved: 1,
                //             pending: 1,
                //             rejected: 1
                //         }
                //     }
                // ];
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
                } else
                    if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                        pipe[0].$match['district'] = req.body.district

                    } else {
                        pipe[0].$match['employeeId'] = req.body.employeeId // Replace with the desired district value

                    }
                return pipe
            });

            // Execute all pipelines concurrently
            const pipelineResults = await Promise.all(pipelines.map(pipeline =>
                newsDataSchema.aggregate(pipeline)
            ));

            // Map results to the correct date and category counts
            const reports = pipelineResults.map((result, index) => ({
                date: dates[index],
                approved: result.length > 0 ? result[0].approved : 0,
                pending: result.length > 0 ? result[0].pending : 0,
                rejected: result.length > 0 ? result[0].rejected : 0
            }));

            // Prepare response in the desired format
            const response = {
                xLabel: reports.map(report => report.date),
                approved: reports.map(report => report.approved),
                pending: reports.map(report => report.pending),
                rejected: reports.map(report => report.rejected)
            };


            responseJSON = response
            // Respond with reports


        } else if (reqPayloadData.data.reportType === 'Monthly') {


            let months = await getMonthEpochs(reqPayloadData.data.year);


            const insidePipeMatch = (month) => {
                let insidePipeMatchResp = {
                    createdDate: { $gte: month.startEpoch, $lte: month.endEpoch }
                }
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
                } else
                    if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                        insidePipeMatchResp['district'] = req.body.district

                    } else {
                        insidePipeMatchResp['employeeId'] = req.body.employeeId // Replace with the desired district value

                    }
                return insidePipeMatchResp
            }


            let pipeline = [
                {
                    $facet: Object.fromEntries(months.map(month => [
                        month.month,
                        [
                            {
                                $match: insidePipeMatch(month)
                            },
                            {
                                $group: {
                                    _id: null,
                                    approved: {
                                        $sum: { $cond: [{ $ne: ["$approvedOn", null] }, 1, 0] }
                                    },
                                    rejected: {
                                        $sum: { $cond: [{ $ne: ["$rejectedOn", null] }, 1, 0] }
                                    },
                                    pending: {
                                        $sum: {
                                            $cond: [
                                                {
                                                    $and: [
                                                        { $eq: ["$approvedOn", null] },
                                                        { $eq: ["$rejectedOn", null] }
                                                    ]
                                                },
                                                1,
                                                0
                                            ]
                                        }
                                    },
                                    total: { $sum: 1 }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    approved: 1,
                                    rejected: 1,
                                    pending: 1,
                                    total: 1
                                }
                            }
                        ]
                    ]))
                },
                {
                    $project: {
                        xLabel: months.map(m => m.month),
                        approved: months.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.month}.approved`, 0] }, 0]
                        })),
                        pending: months.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.month}.pending`, 0] }, 0]
                        })),
                        rejected: months.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.month}.rejected`, 0] }, 0]
                        })),
                        total: months.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.month}.total`, 0] }, 0]
                        }))
                    }
                }
            ];
            const result = await newsDataSchema.aggregate(pipeline);


            responseJSON = result[0]



        } else if (reqPayloadData.data.reportType === 'Yearly') {


            let years = getLast7Years()


            const insidePipeMatch = (month) => {
                let insidePipeMatchResp = {
                    createdDate: { $gte: month.startEpoch, $lte: month.endEpoch }
                }
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
                } else
                    if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                        insidePipeMatchResp['district'] = req.body.district

                    } else {
                        insidePipeMatchResp['employeeId'] = req.body.employeeId // Replace with the desired district value

                    }
                return insidePipeMatchResp
            }




            const pipeline = [
                {
                    $facet: Object.fromEntries(years.map(month => [
                        month.year,
                        [
                            {
                                $match: insidePipeMatch(month)
                            },
                            {
                                $group: {
                                    _id: null,
                                    approved: {
                                        $sum: { $cond: [{ $ne: ["$approvedOn", null] }, 1, 0] }
                                    },
                                    rejected: {
                                        $sum: { $cond: [{ $ne: ["$rejectedOn", null] }, 1, 0] }
                                    },
                                    pending: {
                                        $sum: {
                                            $cond: [
                                                {
                                                    $and: [
                                                        { $eq: ["$approvedOn", null] },
                                                        { $eq: ["$rejectedOn", null] }
                                                    ]
                                                },
                                                1,
                                                0
                                            ]
                                        }
                                    },
                                    total: { $sum: 1 }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    approved: 1,
                                    rejected: 1,
                                    pending: 1,
                                    total: 1
                                }
                            }
                        ]
                    ]))
                },
                {
                    $project: {
                        xLabel: years.map(m => m.year),
                        approved: years.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.year}.approved`, 0] }, 0]
                        })),
                        pending: years.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.year}.pending`, 0] }, 0]
                        })),
                        rejected: years.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.year}.rejected`, 0] }, 0]
                        })),
                        total: years.map(m => ({
                            $ifNull: [{ $arrayElemAt: [`$${m.year}.total`, 0] }, 0]
                        }))
                    }
                }
            ];
            const result = await newsDataSchema.aggregate(pipeline);


            responseJSON = result[0]
        }

        res.status(200).json({
            status: "success",
            reports: responseJSON
        });
        // console.log(reqPayloadData)

    } catch (error) {

        // const obj = await errorLogBookSchema.create({
        //     message: `Error while Fetching Dashboard`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: 'Fetch Dashboard ',
        //     functionality: 'To Fetch Dashboard ',
        //     employeeId: req.body.employeeId || '',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })
        console.log(error)
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..! ',
            error: error
        })

    }
}

const overallNewsReport = async (req, res) => {

    try {


        let pipeline = [
            { $match: {} },
            {
                $group: {
                    _id: null,
                    pending: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$approvedOn", null] },
                                        { $eq: ["$rejectedOn", null] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    approved: {
                        $sum: {
                            $cond: [{ $ne: ["$approvedOn", null] }, 1, 0]
                        }
                    },
                    rejected: {
                        $sum: {
                            $cond: [{ $ne: ["$rejectedOn", null] }, 1, 0]
                        }
                    },
                    total: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    pending: 1,
                    approved: 1,
                    rejected: 1,
                    total: 1
                }
            }
        ]

        if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
        } else
            if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                pipeline[0]['$match']['district'] = req.body.district

            } else {
                pipeline[0]['$match']['employeeId'] = req.body.employeeId // Replace with the desired district value

            }
        const result = await newsDataSchema.aggregate(pipeline);


        res.status(200).json({
            status: "success",
            // reports: responseJSON
            result: result[0] || { pending: 0, approved: 0, rejected: 0, total: 0 }
        });

    } catch (error) {

        // const obj = await errorLogBookSchema.create({
        //     message: `Error while Fetching Dashboard`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: 'Fetch Dashboard ',
        //     functionality: 'To Fetch Dashboard ',
        //     employeeId: req.body.employeeId || '',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })
        console.log(error)
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..! ',
            error: error
        })

    }
}

const moment = require('moment-timezone');

const getEmployeeActiveCount = async (req, res) => {

    try {



        console.log("a")
        // const currentDate = new Date().setHours(0, 0, 0, 0); // Start of the current day

        const employeeIds = await reportersSchema.find({}, 'employeeId').lean();
        let list = employeeIds.map(employee => employee.employeeId);

        // const { employeeIds } = req.body;

        if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty employeeIds array' });
        }


        const currentDate = new Date().getTime(); // Current date in epoch seconds

        const result = await employeeTracing.aggregate([
            {
                $match: {
                    employeeId: { $in: list }
                }
            },
            {
                $group: {
                    _id: "$employeeId",
                    isActive: {
                        $max: {
                            $cond: [
                                {
                                    $and: [
                                        { $lte: ["$startDate", currentDate] },
                                        { $gte: ["$endDate", currentDate] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    activeCount: { $sum: "$isActive" },
                    inactiveCount: { $sum: { $cond: [{ $eq: ["$isActive", 0] }, 1, 0] } },
                    processedCount: { $sum: 1 }
                }
            }
        ]);

        let activeCount = 0;
        let inactiveCount = 0;
        let notFoundCount = 0;

        if (result.length > 0) {
            activeCount = result[0].activeCount;
            inactiveCount = result[0].inactiveCount;
            notFoundCount = list.length - result[0].processedCount;
        } else {
            notFoundCount = list.length;
        }

        let obj = {
            activeCount,
            inactiveCount,
            notFoundCount
        };


        // let reso = await employeeTracing.find()
        // res.json(employeeStatuses);


        res.status(200).json({
            status: "success",
            data: obj,
        });

    } catch (error) {

        // const obj = await errorLogBookSchema.create({
        //     message: `Error while Fetching Dashboard`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: 'Fetch Dashboard ',
        //     functionality: 'To Fetch Dashboard ',
        //     employeeId: req.body.employeeId || '',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })
        console.log(error)
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..! ',
            error: error
        })

    }
}

const multiBarChart = async (xaxis, yaxisArray) => {
    let chartData = {
        "tooltip": {
            "trigger": "axis",
            "axisPointer": {
                "type": "shadow"
            }
        },
        "xAxis": [{
            "type": xaxis.type,
            "axisTick": {
                "show": false
            },
            axisLabel: {
                textStyle: {
                    color: 'white'
                }
            },
            "data": xaxis.value
        }],
        "yAxis": [{
            "type": "value",
            axisLabel: {
                textStyle: {
                    color: 'white'
                }
            },
        }],
        dataZoom: {

            type: "inside",
            disabled: false
        },
        "series": [

        ]
    }

    yaxisArray.forEach(elem => {
        chartData.series.push({
            "name": elem.name,
            "type": "bar",
            "barGap": 0,
            "label": {
                "show": true,
                "position": "insideBottom",
                "distance": 15,
                "align": "left",
                "verticalAlign": "middle",
                "rotate": 90,
                "formatter": "{c}  {name|{a}}",
                "fontSize": 16,
                "rich": {
                    "name": {}
                }
            },
            "emphasis": {
                "focus": "series"
            },
            "data": elem.value
        })
    })
    return chartData;
}
const pieChartCircle = async (name, data) => {
    let chartData = {
        tooltip: {
            trigger: 'item'
        },
        series: [{
            name: 'Access From',
            type: 'pie',
            radius: ['60%', '90%'],


            itemStyle: {
                borderRadius: 10,
                borderColor: '#fff',
                borderWidth: 2
            },
            data: [{
                value: 1048,
                name: 'Search Engine'
            },
            {
                value: 735,
                name: 'Direct'
            }

            ]
        }]
    }
}
const addSubscribers = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {
                // PERFROM ADDING HERE
                const subscriberData = await subscriberDataSchema.findOne().where({ mobile: req.body.data.mobile });
                if (subscriberData) {
                    res.status(200).json({
                        status: "failed",
                        msg: 'Duplications found!'
                    })
                } else {
                    const addSubscriber = await subscriberDataSchema.create({ ...req.body.data, ...{ addedBy: req.body.employeeId } })
                    res.status(200).json({
                        status: "success",
                        msg: 'Contacts added to list...!',
                        data: addSubscriber
                    });
                };

            }
        }
    } catch (error) {
        console.error(error)
        // const obj = await errorLogBookSchema.create({
        //     message: `Error while Adding Subscribers`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: 'Adding Subscribers ',
        //     functionality: 'To Fetch Dashboard ',
        //     employeeId: req.body.employeeId || '',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}


const getEmployeesData = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                let responseData = {
                    activeEmployees: {
                        "tableData": {

                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Identity Verification Status",
                                    "key": "identityVerificationStatus"
                                }
                            ]
                        }
                    },
                    inActiveEmployees: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]
                        }
                    },
                    disabledEmployees: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]

                        }
                    }
                }
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {

                    let activeEmp = await reporterSchema.find().where('activeUser').equals(true).where('disabledUser').equals(false);
                    responseData['activeEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(activeEmp, [])
                    let inActiveEmp = await reporterSchema.find().where('activeUser').equals(false).where('disabledUser').equals(false);
                    responseData['inActiveEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(inActiveEmp, [])
                    let disabledEmp = await reporterSchema.find().where('disabledUser').equals(true);
                    responseData['disabledEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(disabledEmp, []);


                    // ACTIONS BELOW

                    responseData['activeEmployees']['metaData'] = {
                        title: "Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Edit",
                                icon: "edit",
                                key: "edit",
                                class: "btn btn-success"
                            },
                            {
                                type: "button",
                                tooltip: "In Active",
                                icon: "edit_off",
                                key: "inactive",
                                class: "btn btn-dark"
                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                            },
                            {
                                type: "button",
                                tooltip: "Verify Identity",
                                key: "verify_identity",
                                class: "btn btn-outline-primary",
                                icon: "fact_check",
                            }
                        ],
                        "createNew": {
                            type: "createNew",
                            label: "Add Employee",
                            icon: "add_circle",
                            key: "createNew",
                        }
                    }

                    responseData['inActiveEmployees']['metaData'] = {
                        title: "In Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Edit",
                                icon: "edit",
                                key: "edit",
                                class: "btn btn-success"
                            },
                            {
                                type: "button",
                                tooltip: "Active",
                                key: "active",
                                class: "btn btn-success",
                                icon: "verified",

                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                            }
                        ]
                    }
                    responseData['disabledEmployees']['metaData'] = {
                        title: "Disabled Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Enable",
                                key: "enable",
                                class: "btn btn-primary",
                                icon: "person_book"
                            }
                        ]
                    }
                    if (req.body.role === 'INCHARGE DIRECTOR') {
                        for (let index = 0; index < responseData['activeEmployees']['metaData']['actions'].length; index++) {
                            responseData['activeEmployees']['metaData']['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }
                        for (let index = 0; index < responseData['inActiveEmployees']['metaData']['actions'].length; index++) {
                            responseData['inActiveEmployees']['metaData']['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }
                        for (let index = 0; index < responseData['disabledEmployees']['metaData']['actions'].length; index++) {
                            responseData['disabledEmployees']['metaData']['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }
                    }
                    // disable: {
                    //     role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                    // }
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });


                } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                    let activeEmp = await reporterSchema.find().where('district').equals(req.body.district).where('role').ne("CEO").where('role').ne("INCHARGE DIRECTOR").where('activeUser').equals(true).where('disabledUser').equals(false);
                    responseData['activeEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(activeEmp, [])
                    let inActiveEmp = await reporterSchema.find().where('district').equals(req.body.district).where('role').ne("CEO").where('role').ne("INCHARGE DIRECTOR").where('activeUser').equals(false).where('disabledUser').equals(false);
                    responseData['inActiveEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(inActiveEmp, [])
                    let disabledEmp = await reporterSchema.find().where('district').equals(req.body.district).where('role').ne("CEO").where('role').ne("INCHARGE DIRECTOR").where('disabledUser').equals(true);
                    responseData['disabledEmployees']['tableData']['bodyContent'] = await stateDistrictMapping(disabledEmp, [])


                    // ACTIONS BELOW

                    responseData['activeEmployees']['metaData'] = {
                        title: "Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "In Active",
                                icon: "edit_off",
                                key: "inactive",
                                class: "btn btn-dark",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            }
                        ],
                        "createNew": {
                            type: "createNew",
                            label: "Add Employee",
                            icon: "add_circle",
                            key: "createNew",
                        }
                    }
                    responseData['inActiveEmployees']['metaData'] = {
                        title: "In Active Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Active",
                                key: "active",
                                class: "btn btn-success",
                                icon: "verified",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Disable",
                                key: "disable",
                                class: "btn btn-danger",
                                icon: "no_accounts",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            }
                        ]
                    }
                    responseData['disabledEmployees']['metaData'] = {
                        title: "Disabled Employees",
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Enable",
                                key: "enable",
                                class: "btn btn-primary",
                                icon: "person_book",
                                disable: {
                                    role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                }
                            }
                        ]
                    }
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });

                } else if (req.body.role === 'REPORTER') {


                    res.status(200).json({
                        status: "failed",
                        msg: 'No Access...!'
                    });
                }

            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Listing Employees Data`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch Employees Data ',
            functionality: 'To Fetch Employees Data ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const getEmployeesDataV2 = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {


                const page = req?.body?.page || 1;
                const limit = req?.body?.count || 5;


                const skip = (page - 1) * limit;

                console.log("skip", skip)
                let pipeline = [
                    // Match stage (for filtering)
                    { $match: {} },
                    {
                        $addFields: {
                            parts: { $split: ["$employeeId", "-"] }
                        }
                    },
                    {
                        $addFields: {
                            part1: { $arrayElemAt: ["$parts", 0] },
                            part2: { $arrayElemAt: ["$parts", 1] },
                            numericPart: { $toInt: { $arrayElemAt: ["$parts", 2] } }
                        }
                    },
                    {
                        $facet: {
                            metadata: [{ $count: "total" }],
                            data: [
                                { $sort: { part2: 1, numericPart: 1 } },
                                { $skip: skip },
                                { $limit: limit }
                            ]
                        }
                    },
                    {
                        $sort: { part2: 1, numericPart: 1 }
                    },
                    // Sort stage
                    // { $sort: { employeeId: -1 } },

                    // Pagination
                    // { $skip: skip },
                    // { $limit: limit }
                ];



                if (req?.body?.action?.toLowerCase() === 'active') {

                    pipeline[0]['$match'] = {
                        activeUser: true,
                        disabledUser: false
                    }

                } else if (req?.body?.action?.toLowerCase() === 'inactive') {
                    pipeline[0]['$match'] = {
                        activeUser: false,
                        disabledUser: false
                    }

                } else if (req?.body?.action?.toLowerCase() === 'disabled') {
                    pipeline[0]['$match'] = {
                        disabledUser: true
                    }
                }
                let headerContent = [
                    {
                        "label": "Employee Name",
                        "key": "name"
                    },
                    {
                        "label": "Employee Id",
                        "key": "employeeId"
                    }, {
                        "label": "Role",
                        "key": "role"
                    },
                    {
                        "label": "Mobile Number",
                        "key": "mobile"
                    },
                    {
                        "label": "Email",
                        "key": "mail"
                    },
                    {
                        "label": "State",
                        "key": "state"
                    },
                    {
                        "label": "District",
                        "key": "district"
                    },
                    {
                        "label": "Mandal",
                        "key": "mandal"
                    },
                    {
                        "label": "Identity Verification Status",
                        "key": "identityVerificationStatus",
                        "style": {
                            "min-width": "20rem"
                        }
                    }
                ]
                let metaData = {}

                let responseData = {
                    activeEmployees: {
                        "tableData": {

                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                },
                                {
                                    "label": "Identity Verification Status",
                                    "key": "identityVerificationStatus"
                                }
                            ]
                        }
                    },
                    inActiveEmployees: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]
                        }
                    },
                    disabledEmployees: {
                        "tableData": {
                            "headerContent": [
                                {
                                    "label": "Employee Name",
                                    "key": "name"
                                },
                                {
                                    "label": "Employee Id",
                                    "key": "employeeId"
                                }, {
                                    "label": "Role",
                                    "key": "role"
                                },
                                {
                                    "label": "Mobile Number",
                                    "key": "mobile"
                                },
                                {
                                    "label": "Email",
                                    "key": "mail"
                                },
                                {
                                    "label": "State",
                                    "key": "state"
                                },
                                {
                                    "label": "District",
                                    "key": "district"
                                },
                                {
                                    "label": "Mandal",
                                    "key": "mandal"
                                }
                            ]

                        }
                    }
                }
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {



                    if (req?.body?.action?.toLowerCase() === 'active') {
                        console.log("CAME HERE")
                        metaData = {
                            title: "Active Employees",
                            "actions": [
                                {
                                    type: "button",
                                    tooltip: "Edit",
                                    icon: "bi bi-pencil-square",

                                    key: "edit",
                                    class: "btn btn-success"
                                },
                                {
                                    type: "button",
                                    tooltip: "In Active",
                                    icon: "bi bi-person-exclamation",
                                    key: "inactive",
                                    class: "btn btn-dark"
                                },
                                {
                                    type: "button",
                                    tooltip: "Disable",
                                    key: "disable",
                                    class: "btn btn-danger",
                                    icon: "bi bi-person-slash",
                                },
                                {
                                    type: "button",
                                    tooltip: "Verify Identity",
                                    key: "verify_identity",
                                    class: "btn btn-outline-primary",
                                    icon: "bi bi-person-check-fill",
                                }
                            ],
                            "createNew": {
                                type: "createNew",
                                label: "Add Employee",
                                icon: "add_circle",
                                key: "createNew",
                            }
                        },
                            console.log("CAME HERE", metaData)

                    } else

                        if (req?.body?.action?.toLowerCase() === 'inactive') {
                            metaData = {
                                title: "In Active Employees",
                                "actions": [
                                    {
                                        type: "button",
                                        tooltip: "Edit",
                                        icon: "bi bi-pencil-square",
                                        key: "edit",
                                        class: "btn btn-success"
                                    },
                                    {
                                        type: "button",
                                        tooltip: "Active",
                                        key: "active",
                                        class: "btn btn-success",
                                        icon: "bi bi-person-plus-fill",

                                    },
                                    {
                                        type: "button",
                                        tooltip: "Disable",
                                        key: "disable",
                                        class: "btn btn-danger",
                                        icon: "bi bi-person-slash",
                                    }
                                ]
                            }
                        } else

                            if (req?.body?.action?.toLowerCase() === 'disabled') {
                                metaData = {
                                    title: "Disabled Employees",
                                    "actions": [
                                        {
                                            type: "button",
                                            tooltip: "Enable",
                                            key: "enable",
                                            class: "btn btn-primary",
                                            icon: "bi bi-person-plus-fill",
                                        }
                                    ]
                                }
                            }


                    if (req.body.role === 'INCHARGE DIRECTOR') {
                        for (let index = 0; index < metaData['actions'].length; index++) {
                            metaData['actions'][index]['disable'] = {
                                role: ['CEO', 'INCHARGE DIRECTOR']
                            }
                        }

                    }



                } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {


                    // ACTIONS BELOW
                    if (req?.body?.action?.toLowerCase() === 'active') {

                        metaData = {
                            title: "Active Employees",
                            "actions": [
                                {
                                    type: "button",
                                    tooltip: "In Active",
                                    icon: "bi bi-person-exclamation",
                                    key: "inactive",
                                    class: "btn btn-dark",
                                    disable: {
                                        role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                    }
                                },
                                {
                                    type: "button",
                                    tooltip: "Disable",
                                    key: "disable",
                                    class: "btn btn-danger",
                                    icon: "bi bi-person-slash",
                                    disable: {
                                        role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                    }
                                }
                            ],
                            "createNew": {
                                type: "createNew",
                                label: "Add Employee",
                                icon: "add_circle",
                                key: "createNew",
                            }
                        }
                    } else if (req?.body?.action?.toLowerCase() === 'inactive') {

                        metaData = {
                            title: "In Active Employees",
                            "actions": [
                                {
                                    type: "button",
                                    tooltip: "Active",
                                    key: "active",
                                    class: "btn btn-success",
                                    icon: "bi bi-person-plus-fill",
                                    disable: {
                                        role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                    }
                                },
                                {
                                    type: "button",
                                    tooltip: "Disable",
                                    key: "disable",
                                    class: "btn btn-danger",
                                    icon: "bi bi-person-slash",
                                    disable: {
                                        role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                    }
                                }
                            ]
                        }
                    } else if (req?.body?.action?.toLowerCase() === 'disabled') {
                        metaData = {
                            title: "Disabled Employees",
                            "actions": [
                                {
                                    type: "button",
                                    tooltip: "Enable",
                                    key: "enable",
                                    class: "btn btn-primary",
                                    icon: "bi bi-person-plus-fill",
                                    disable: {
                                        role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                    }
                                }
                            ]
                        }
                    }



                } else if (req.body.role === 'REPORTER') {


                    res.status(200).json({
                        status: "failed",
                        msg: 'No Access...!'
                    });
                }


                let resp = await reporterSchema.aggregate(pipeline)

                let metaDataFinal = resp[0]?.['metadata'] || {}

                res.status(200).json({
                    status: "success",
                    data: { ...resp[0], ...{ header: headerContent, metadata: { ...metaData, ...metaDataFinal } } }
                });


            }
        }
    } catch (error) {
        // const obj = await errorLogBookSchema.create({
        //     message: `Error while Listing Employees Data`,
        //     stackTrace: JSON.stringify([...error.stack].join('/n')),
        //     page: 'Fetch Employees Data ',
        //     functionality: 'To Fetch Employees Data ',
        //     employeeId: req.body.employeeId || '',
        //     errorMessage: `${JSON.stringify(error) || ''}`
        // })
        console.error(error)
        res.status(200).json({
            error: error,
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const manipulateEmployee = async (req, res) => {
    try {

        let data = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: data.employeeId
        });

        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot process, contact your superior!'
            });
        } else {

            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {

                if (data.type === 'create') {

                    let checkMail = await reporterSchema.findOne({
                        mail: data.data.mail
                    });

                    if (!checkMail) {
                        let users = await reporterSchema.find({
                            'state': data.data['state']
                        });

                        // Find the maximum sequence number for the given state
                        let maxSequenceNumber = 0;
                        if (users.length > 0) {
                            const maxEmployeeId = users.reduce((max, user) => {
                                const [, , sequence] = user.employeeId.split('-');
                                const num = parseInt(sequence);
                                if (num > max) {
                                    max = num;
                                }
                                return max;
                            }, 0);
                            maxSequenceNumber = maxEmployeeId;
                        }

                        // Generate the new employeeId with the incremented sequence number
                        const newStateEmployeeId = 'NC-' + data.data['state'] + '-' + (maxSequenceNumber + 1);
                        data.data['employeeId'] = newStateEmployeeId;
                        data.data.createdBy = newStateEmployeeId;
                        data['createdDate'] = new Date().getTime();

                        let task = await reporterSchema.create(data.data);

                        res.status(200).json({
                            status: "success",
                            msg: 'Employee Added...!',
                            data: task
                        });
                    } else {
                        res.status(200).json({
                            status: "failed",
                            msg: 'Employee alerady to registered...!'
                        });
                    }
                } else if (data.type === 'active') {
                    // to move user to active state, if disabled user make it false for disabled
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: true,
                            disabledUser: false,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'inactive') {
                    // to move user to inactive state, if disabled user make it false for disabled
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: false,
                            disabledUser: false,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'disable') {
                    // to move disable
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: false,
                            disabledUser: true,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledOn: new Date().getTime(),
                            disabledBy: data.employeeId
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'enable') {
                    // to move disable
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            activeUser: false,
                            disabledUser: false,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Employee Enabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'edit') {
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            name: data.data.name,
                            mobile: data.data.mobile,
                            state: data.data.state,
                            district: data.data.district,
                            mandal: data.data.mandal,
                            constituency: data.data.constituency,
                            aadharNumber: data.data.aadharNumber || 0,
                            identityProof: data.data.identityProof || null,
                            profilePicture: data.data.profilePicture || null,
                            bloodGroup: data.data.bloodGroup || '',
                            role: data.data.role,
                            lastUpdatedOn: new Date().getTime(),
                            lastUpdatedBy: data.employeeId,
                            disabledBy: '',
                            disabledOn: ''
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Updated Successfully...!',
                        data: task
                    });
                } else if (data.type === 'verify_identity') {
                    let task = await reporterSchema.updateOne({ employeeId: data.data.employeeId },

                        {
                            identityVerificationStatus: data.status,
                            identityVerificationRejectionReason: data.data.identityVerificationRejectionReason,
                            identityApprovedOn: new Date().getTime(),
                            identityApprovedBy: data.employeeId
                        }
                    )
                    res.status(200).json({
                        status: "success",
                        msg: 'Identification Updated Successfully...!',
                        data: task
                    });
                }
            }
        }

    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Manipulating Employees`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Manipulate Employee Data ',
            functionality: 'To Manipulate Employee Data ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const getEmployeeData = async (req, res) => {
    try {
        let data = JSON.parse(JSON.stringify(req.body));
        const userData = await reporterSchema.findOne({
            employeeId: data.data.employeeId
        })
        var userInfo = JSON.parse(JSON.stringify(userData))
        let deleteElements = ['_id', 'password', '__v', 'createdDate'];
        deleteElements.forEach(element => {
            if (userInfo[element] || userInfo[element] === 0) {
                delete userInfo[element]
            }
        })

        if (userInfo?.['identityProof']?.fileName) {
            const url = await getFileTempUrls3(userInfo['identityProof'].fileName)
            userInfo['identityProof']['tempURL'] = url;
        }
        if (userInfo?.['profilePicture']?.fileName) {
            const url = await getFileTempUrls3(userInfo['profilePicture'].fileName)
            userInfo['profilePicture']['tempURL'] = url;
        }
        res.status(200).json({
            status: "success",
            data: userInfo
        });
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching Individual Employee Data`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch Individual Employee Data ',
            functionality: 'To Fetch Individual Employee Data ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const getSubscribers = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {



                const responseData = {
                    "tableData": {
                        headerContent: [{
                            key: "name",
                            label: "Name"
                        },
                        {
                            key: "state",
                            label: "State"
                        },
                        {
                            key: "district",
                            label: "District"
                        },
                        {
                            key: "mandal",
                            label: "Mandal"
                        },
                        {
                            key: "mobile",
                            label: "Mobile"
                        },
                        {
                            key: "addedToGroup",
                            label: "Added to Group"
                        }
                        ]
                    },
                    "metaData": {
                        "createNew": {
                            type: "createNew",
                            label: "Add Subscriber",
                            icon: "add_circle",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Add to Group",
                                icon: "group_add",
                                key: "addToGroup",
                                class: "btn btn-success",
                                disable: {
                                    addedToGroup: [true]
                                }
                            }
                        ]
                    }
                }
                // PERFROM GET LIST SUBSCIRBERS
                if (req.body.role === 'CEO' || req.body.role === 'INCHARGE DIRECTOR') {
                    let allSubscirbers = await subscriberDataSchema.find();
                    let allSubscirbersUpdated = await stateDistrictMapping(allSubscirbers, [])
                    responseData['tableData']['bodyContent'] = allSubscirbersUpdated
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });
                } else if (req.body.role === 'DISTRICT MANAGER' || req.body.role === 'ADVERTISEMENT MANAGER') {
                    let allSubscirbers = await subscriberDataSchema.find().where('district').equals(req.body.district);
                    let allSubscirbersUpdated = await stateDistrictMapping(allSubscirbers, [])
                    responseData['tableData']['bodyContent'] = allSubscirbersUpdated
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });
                } else if (req.body.role === 'REPORTER') {
                    let allSubscirbers = await subscriberDataSchema.find().where('district').equals(req.body.district).where('mandal').equals(req.body.mandal);
                    let allSubscirbersUpdated = await stateDistrictMapping(allSubscirbers, ['mobile'])
                    responseData['tableData']['bodyContent'] = allSubscirbersUpdated
                    res.status(200).json({
                        status: "success",
                        data: responseData
                    });

                }
            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Fetching All Subscribers`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Fetch All Subscribers ',
            functionality: 'To Fetch All Subscribers ',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const addSubscriberToGroup = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reporterSchema.findOne({
            employeeId: body.employeeId
        });
        if (!employee) {
            res.status(200).json({
                status: "failed",
                msg: 'Cannot publish, contact your superior!'
            });
        } else {
            if (employee.disabledUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Forbidden Access!'
                });
            } else if (!employee.activeUser) {
                return res.status(200).json({
                    status: "failed",
                    msg: 'Employement not yet approved..! Kindly Contact your Superior.'
                });
            } else {


                let resp = await subscriberDataSchema.updateOne(
                    {
                        mobile: req.body.data.mobile
                    },
                    {
                        addedToGroup: true,
                        addedBy: req.body.employeeId
                    }
                );
                if (resp.modifiedCount > 0) {
                    res.status(200).json({
                        status: "success",
                        msg: 'Added to group!'
                    })
                } else {
                    res.status(200).json({
                        status: "error",
                        msg: 'Failed to add in group!'
                    })

                };
            }
        }
    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while adding user to whatsapp group`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Subscribers',
            functionality: 'Adding Subscriber to group,',
            employeeId: req.body.employeeId || '',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Error while processing..!'
        })
    }
}

const stateDistrictMapping = async (value, hideFieldValues, deleteElementsList) => {
    let valueCopy = JSON.parse(JSON.stringify(value));
    let allSt = await metaDataSchema.findOne({
        type: "STATES"
    })
    let allStates = allSt['data'];
    let unqiueStateFromValue = findUniqueValues(value, "state");

    let allDistricts = {};
    for (let index = 0; index < unqiueStateFromValue.length; index++) {
        const dt = await metaDataSchema.findOne({
            type: unqiueStateFromValue[index] + "_DISTRICTS"
        })
        allDistricts[unqiueStateFromValue[index]] = dt['data'];
    };
    for (let index = 0; index < valueCopy.length; index++) {
        if (valueCopy[index]['newsType'] === 'Regional') {

            const distINdex = allDistricts[valueCopy[index]['state']].findIndex(ele => ele.value === valueCopy[index]['district']);
            if (distINdex > -1) {
                valueCopy[index]['district'] = allDistricts[valueCopy[index]['state']][distINdex].label;
            }
            const stateIndex = allStates.findIndex(ele => ele.value === valueCopy[index]['state']);
            if (stateIndex > -1) {
                valueCopy[index]["state"] = allStates[stateIndex].label;
            };
        }
        if (hideFieldValues && hideFieldValues.length > 0) {
            hideFieldValues.forEach(elem => {
                if (valueCopy[index][elem]) {
                    valueCopy[index][elem] = "XXXXX";
                }
            })
        }
        let deleteElements = deleteElementsList ? deleteElementsList : ['_id', 'password', 'passwordCopy', '__v'];
        deleteElements.forEach(element => {
            if (valueCopy[index][element] || valueCopy[index][element] === 0 || valueCopy[index][element] === '' || valueCopy[index][element] === false) {
                delete valueCopy[index][element]
            }
        })
    };
    return valueCopy;
}

function findUniqueValues(objects, key) {
    const uniqueValues = new Set();

    objects.forEach(obj => {
        uniqueValues.add(obj[key]);
    });
    return Array.from(uniqueValues).filter(item => item !== undefined && item !== null && item !== '');
}

function getRecentOneMonthEpoch() {
    const presentEpochTime = Math.floor(Date.now()); // Divide by 1000 to convert milliseconds to seconds
    const oneMonthAgo = new Date();
    oneMonthAgo.setHours(0);
    oneMonthAgo.setMinutes(0);
    oneMonthAgo.setSeconds(0);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoEpochTime = Math.floor(oneMonthAgo.getTime());
    return {
        presentEpochTime,
        oneMonthAgoEpochTime
    };
}


module.exports = {
    registerReporter,
    reporterLogin,
    getMetaData,
    publishNews,
    fetchDashboard, deleteS3Images, getFileTempUrls3,
    addSubscribers,
    getSubscribers, getEmployeesData, manipulateEmployee, getEmployeeData, getNewsList, getAllEmployees, getAllEmployeesV2, getNewsInfo, addSubscriberToGroup,


    newsReportChart, overallNewsReport, getEmployeeActiveCount, fetchNewsListPending, fetchNewsListApproved, fetchNewsListRejected, getEmployeesDataV2
}