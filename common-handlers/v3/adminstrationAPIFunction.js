const metaDataSchema = require('../../modals/metaDataSchema');
const newsDataSchema = require('../../modals/newsDataSchema');

const { getFileTempUrls3 } = require('./../commonApiFunction');
const reportersSchema = require('../../modals/reportersSchema');
const CryptoJS = require('crypto-js');
const errorLogBookSchema = require('../../modals/errorLogBookSchema');
const employeeTracing = require('../../modals/employeeTracing');
const Visitor = require('../../modals/visitorSchema');

require('dotenv').config();

// Encryption configuration
const SECRET_SALT = 'NC_MEDIA_SALT_2025@#$%';
const KEY_SIZE = 256;
const ITERATIONS = 1000;

// Encryption utility functions
const encrypt = (data) => {
    try {
        // Generate random IV
        const iv = CryptoJS.lib.WordArray.random(16);

        // Generate key using PBKDF2
        const key = CryptoJS.PBKDF2(SECRET_SALT, iv, {
            keySize: KEY_SIZE / 32,
            iterations: ITERATIONS
        });

        // Encrypt
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            iv: iv,
            padding: CryptoJS.pad.Pkcs7,
            mode: CryptoJS.mode.CBC
        });

        // Combine IV and encrypted data
        const combined = CryptoJS.lib.WordArray.create()
            .concat(iv)
            .concat(encrypted.ciphertext);

        // Convert to base64
        return combined.toString(CryptoJS.enc.Base64);
    } catch (error) {
        console.error('Encryption error:', error);
        return '';
    }
};

const encryptObject = (obj) => {
    try {
        const jsonStr = JSON.stringify(obj);
        return encrypt(jsonStr);
    } catch (error) {
        console.error('Object encryption error:', error);
        return '';
    }
};

// Decryption utility functions
const decrypt = (encrypted) => {
    try {
        console.log("Attempting to decrypt:", encrypted);
        // Convert from base64
        const ciphertext = CryptoJS.enc.Base64.parse(encrypted);
        console.log("Parsed base64 ciphertext");

        // Extract IV and data
        const iv = CryptoJS.lib.WordArray.create(ciphertext.words.slice(0, 4));
        const encryptedData = CryptoJS.lib.WordArray.create(ciphertext.words.slice(4));
        console.log("Extracted IV and data");

        // Generate key using PBKDF2
        const key = CryptoJS.PBKDF2(SECRET_SALT, iv, {
            keySize: KEY_SIZE / 32,
            iterations: ITERATIONS
        });
        console.log("Generated key");

        // Decrypt
        const decrypted = CryptoJS.AES.decrypt(
            encryptedData.toString(CryptoJS.enc.Base64),
            key,
            {
                iv: iv,
                padding: CryptoJS.pad.Pkcs7,
                mode: CryptoJS.mode.CBC
            }
        );
        console.log("Decryption successful");

        const result = decrypted.toString(CryptoJS.enc.Utf8);
        console.log("Decrypted result:", result);
        return result;
    } catch (error) {
        console.error('Decryption error details:', {
            error: error.message,
            stack: error.stack,
            input: encrypted
        });
        return '';
    }
};

const decryptObject = (encrypted) => {
    try {
        console.log("Starting decryption of object");
        const decrypted = decrypt(encrypted);
        if (!decrypted) {
            console.error("Decryption returned empty string");
            return null;
        }
        console.log("Attempting to parse JSON:", decrypted);
        const parsed = JSON.parse(decrypted);
        console.log("Successfully parsed JSON");
        return parsed;
    } catch (error) {
        console.error('Object decryption error details:', {
            error: error.message,
            stack: error.stack
        });
        return null;
    }
};

const employeeLogin = async (req, res) => {
    try {
        const { data } = req.body;

        if (!data) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid request format'
            });
        }

        // Decrypt the login data
        const decryptedData = decryptObject(data);


        if (!decryptedData || !decryptedData.email || !decryptedData.password) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid encrypted data'
            });
        }

        const { email, password } = decryptedData;

        const userData = await reportersSchema.findOne({
            mail: email
        }).select('-__v -passwordCopy -_id');

        if (!userData) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid Username or Password!'
            });
        }

        const verifyPassword = await userData.compare(password);

        if (!verifyPassword) {
            return res.status(200).json({
                status: "failed",
                msg: 'Invalid Credentials'
            });
        }

        if (userData.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        }

        if (!userData.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employement not yet approved..! Kindly Contact your Superior.'
            });
        }

        let userDataCopy = JSON.parse(JSON.stringify(userData));
        // Add expiry time of 2 hours from now
        userDataCopy.expiryTime = new Date(Date.now() + 2 * 60 * 60 * 1000).getTime();
        let tokens = await metaDataSchema.findOne({ type: "FCM_TOKENS" });

        if (userDataCopy?.profilePicture?.fileName) {
            let url = await getFileTempUrls3(userDataCopy?.profilePicture.fileName);
            userDataCopy['profilePicture']['tempURL'] = url;
        }

        // Encrypt the response data
        const encryptedData = encryptObject({
            msg: 'successfully logged in',
            data: userDataCopy
        });

        // Return with unencrypted status and encrypted data
        return res.status(200).json({
            status: "success",
            data: encryptedData
        });

    } catch (error) {
        const obj = await errorLogBookSchema.create({
            message: `Error while Loging Employee`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employee Login Page',
            functionality: 'To Login User',
            errorMessage: `${JSON.stringify(error) || ''}`
        });
        console.error('Login error:', error);
        return res.status(200).json({
            status: "failed",
            msg: 'Error while logging in! Try after some time.'
        });
    }
};


const fetchNewsListPending = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));

        const recordsPerPage = req?.body?.count || 10;
        const pageNumber = req?.body?.page || 1;
        const skipRecords = (pageNumber - 1) * recordsPerPage;

        console.log(recordsPerPage, skipRecords)

        let employee = await reportersSchema.findOne({
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
                console.log("RAE", body.role)

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
                                icon: "fa-solid fa-square-check text-success ",
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
                                icon: "fa-solid fa-square-xmark  text-danger ",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "fa-solid fa-pen-to-square ",
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
                                icon: "fa-solid fa-square-check text-success ",
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
                                icon: "fa-solid fa-square-xmark  text-danger ",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "fa-solid fa-pen-to-square ",
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
                            //     icon: "fa-solid fa-square-check",
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
                                icon: "fa-solid fa-square-xmark  text-danger ",
                                disable: {
                                    role: ['REPORTER']
                                }
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "fa-solid fa-pen-to-square ",
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

        let employee = await reportersSchema.findOne({
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
                            icon: "fa-solid fa-circle-plus",
                            key: "createNew",
                        },
                        "headerExternalActions": [
                            {
                                type: "select",
                                label: "External Link News",
                                icon: "fa-solid fa-circle-plus",
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
                                icon: "fa-solid fa-eye  text-secondary"
                            },
                            {
                                type: "button",
                                tooltip: "Update",
                                key: "update",
                                // class: "btn btn-info",
                                icon: "fa-solid fa-pen-to-square ",
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
                            icon: "fa-solid fa-circle-plus",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "fa-solid fa-eye  text-secondary"
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
                            icon: "fa-solid fa-circle-plus",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "fa-solid fa-eye  text-secondary"
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

        let employee = await reportersSchema.findOne({
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
                            icon: "fa-solid fa-circle-plus",
                            key: "createNew",
                        },
                        "headerExternalActions": [
                            {
                                type: "select",
                                label: "External Link News",
                                icon: "fa-solid fa-circle-plus",
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
                                icon: "fa-solid fa-eye  text-secondary"
                            },
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "fa-solid fa-square-check text-success ",
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
                            icon: "fa-solid fa-circle-plus",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "fa-solid fa-eye  text-secondary"
                            },
                            {
                                type: "button",
                                tooltip: "Approve",
                                icon: "fa-solid fa-square-check text-success ",
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
                            icon: "fa-solid fa-circle-plus",
                            key: "createNew",
                        },
                        "actions": [
                            {
                                type: "button",
                                tooltip: "View",
                                // icon: "visibility",
                                key: "view",
                                icon: "fa-solid fa-eye  text-secondary"
                            },
                            // {
                            //     type: "button",
                            //     tooltip: "Approve",
                            //     icon: "fa-solid fa-square-check text-success ",
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

const getAllActiveEmployees = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        console.log("body", body)
        let employee = await reportersSchema.findOne({
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

                // let allEmployees = await reportersSchema.find().select('-password -__v -passwordCopy -_id').where('activeUser').equals(true);
                let allEmployees = await reportersSchema.aggregate([
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
function findUniqueValues(objects, key) {
    const uniqueValues = new Set();

    objects.forEach(obj => {
        uniqueValues.add(obj[key]);
    });
    return Array.from(uniqueValues).filter(item => item !== undefined && item !== null && item !== '');
}

const manipulateNews = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reportersSchema.findOne({
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
                        data: task
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

const getAdminIndividualNewsInfo = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reportersSchema.findOne({
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


const getEmployeesDataPaginated = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reportersSchema.findOne({
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
                                    icon: "fa-solid fa-pen-to-square text-primary",

                                    key: "edit",
                                },
                                {
                                    type: "button",
                                    tooltip: "In Active",
                                    icon: "fa-solid fa-exclamation text-danger",
                                    key: "inactive",
                                },
                                {
                                    type: "button",
                                    tooltip: "Disable",
                                    key: "disable",
                                    icon: "fa-solid fa-user-slash text-secondary",
                                },
                                {
                                    type: "button",
                                    tooltip: "Verify Identity",
                                    key: "verify_identity",
                                    icon: "fa-solid fa-address-card text-success",
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
                                        icon: "fa-solid fa-pen-to-square text-primary",
                                        key: "edit",
                                    },
                                    {
                                        type: "button",
                                        tooltip: "Active",
                                        key: "active",
                                        icon: "fa-solid fa-user-check text-success",

                                    },
                                    {
                                        type: "button",
                                        tooltip: "Disable",
                                        key: "disable",
                                        icon: "fa-solid fa-user-slash text-secondary",
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
                                            icon: "fa-solid fa-user-check text-success",
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
                                    icon: "fa-solid fa-exclamation",
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
                                    icon: "fa-solid fa-user-slash",
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
                                    icon: "fa-solid fa-user-check",
                                    disable: {
                                        role: ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']
                                    }
                                },
                                {
                                    type: "button",
                                    tooltip: "Disable",
                                    key: "disable",
                                    class: "btn btn-danger",
                                    icon: "fa-solid fa-user-slash",
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
                                    icon: "fa-solid fa-user-check",
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


                let resp = await reportersSchema.aggregate(pipeline)

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

const getIndividualEmployeeData = async (req, res) => {
    try {
        let data = JSON.parse(JSON.stringify(req.body));
        const userData = await reportersSchema.findOne({
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

const manipulateIndividualEmployee = async (req, res) => {
    try {

        let data = JSON.parse(JSON.stringify(req.body));
        let employee = await reportersSchema.findOne({
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

                    let checkMail = await reportersSchema.findOne({
                        mail: data.data.mail
                    });

                    if (!checkMail) {
                        let users = await reportersSchema.find({
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

                        let task = await reportersSchema.create(data.data);

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
                    let task = await reportersSchema.updateOne({ employeeId: data.data.employeeId },

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
                        msg: 'Employee Activated Successfully...!',
                        data: task
                    });
                } else if (data.type === 'inactive') {
                    // to move user to inactive state, if disabled user make it false for disabled
                    let task = await reportersSchema.updateOne({ employeeId: data.data.employeeId },

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
                        msg: 'Employee markes as Inactive!',
                        data: task
                    });
                } else if (data.type === 'disable') {
                    // to move disable
                    let task = await reportersSchema.updateOne({ employeeId: data.data.employeeId },

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
                        msg: 'Employee Disabled Successfully...!',
                        data: task
                    });
                } else if (data.type === 'enable') {
                    // to move disable
                    let task = await reportersSchema.updateOne({ employeeId: data.data.employeeId },

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
                    let task = await reportersSchema.updateOne({ employeeId: data.data.employeeId },

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
                    let task = await reportersSchema.updateOne({ employeeId: data.data.employeeId },

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



const employeeTracingListing = async (req, res) => {

    const PAGE_SIZE = req.body.count || 10; // Set your desired page size

    const today = new Date().getTime();
    console.log(today)

    const page = req.body.page ? parseInt(req.body.page, 10) : 1;
    const skip = (page - 1) * PAGE_SIZE;




    let totalRecords;

    employeeTracing.countDocuments({})
        .then((count) => {
            totalRecords = count;

            return employeeTracing.aggregate([

                {
                    $addFields: {
                        // Split the activeTraceId into parts based on "-"
                        parts: { $split: ["$activeTraceId", "-"] }
                    }
                },
                {
                    $addFields: {
                        // Extract the state code (AP in this case)
                        state: { $arrayElemAt: ["$parts", 1] },
                        // Split the last part (1_1) based on "_"
                        lastPart: { $arrayElemAt: ["$parts", 2] }
                    }
                },
                {
                    $addFields: {
                        // Further split the last part into ID and sequence
                        lastPartsSplit: { $split: ["$lastPart", "_"] }
                    }
                },
                {
                    $addFields: {
                        // Convert ID and sequence into integers
                        id: { $toInt: { $arrayElemAt: ["$lastPartsSplit", 0] } },
                        sequence: { $toInt: { $arrayElemAt: ["$lastPartsSplit", 1] } }
                    }
                },
                {
                    $addFields: {
                        // numericPart: { $toInt: { $arrayElemAt: ["$parts", 2] } },

                        active: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $gte: [today, "$startDate"] },
                                        { $lte: [today, "$endDate"] }
                                    ]
                                },
                                then: true,
                                else: false
                            }
                        }
                    }
                },
                {
                    $match: {
                        active: req.body.action
                    }
                },
                {
                    $sort: {
                        active: -1,
                        startDate: 1,
                        id: 1,          // Ascending order by id
                        sequence: 1     // Ascending order by sequence
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: PAGE_SIZE
                }
            ]).exec();
        })
        .then(async (result) => {

            try {

                const endOfRecords = totalRecords <= (page * PAGE_SIZE);

                // Extracting employeeIds from the result
                const employeeIds = [...new Set(result.map(entry => entry.employeeId))];

                // Fetching employee details based on employeeIds
                const employeeDetails = await reportersSchema.find({ employeeId: { $in: employeeIds } }).select('-password -__v -passwordCopy -_id');

                // Merge employee details with the result
                const mergedResult = result.map(entry => {
                    const employeeDetail = employeeDetails.find(emp => emp.employeeId === entry.employeeId);
                    return { ...entry, ...employeeDetail._doc };
                });

                var data = {
                    "tableData": {

                        "headerContent": [
                            {
                                "label": "Employee Name",
                                "key": "name"
                            },
                            {
                                "label": "Employee Id",
                                "key": "employeeId"
                            },

                            {
                                "label": "Active Trace Id",
                                "key": "activeTraceId"
                            },
                            {
                                "label": "Status",
                                "key": "active"
                            },
                            {
                                label: "Start Date",
                                key: 'startDate',
                                type: 'dataTimePipe'
                            },
                            {
                                label: "End Date",
                                key: 'endDate',
                                type: 'dataTimePipe'
                            },
                            {
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
                            // {
                            //     "label": "Identity Verification Status",
                            //     "key": "identityVerificationStatus"
                            // },

                        ],
                        "bodyContent": mergedResult
                    },
                    metaData: {
                        title: "Emplpoyee Tracing",
                        totalRecords: totalRecords,
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Edit",
                                icon: "fa-solid fa-pen-to-square text-success",
                                key: "edit",
                                // class: "btn btn-success",
                                disable: {
                                    role: req.body.role === 'CEO' ? [] : req.body.role === 'INCHARGE DIRECTOR' ? ['CEO', 'INCHARGE DIRECTOR'] : ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']

                                }
                            },
                            {
                                type: "button",
                                tooltip: "Copy QR Code",
                                icon: "fa-solid fa-qrcode text-dark",
                                key: "qrCode",
                                // class: "btn btn-dark",
                                // disable: {
                                //     role: req.body.role === 'CEO' ? [] : req.body.role === 'INCHARGE DIRECTOR' ? ['CEO', 'INCHARGE DIRECTOR'] : ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']

                                // }
                            },

                        ],
                        "createNew": {
                            type: "createNew",
                            label: "Add New Record",
                            icon: "fa-solid fa-circle-plus text-primary",
                            key: "createNew",
                        }
                    },
                    "totalRecords": totalRecords,
                    "endOfRecords": endOfRecords,
                }
                res.status(200).json({
                    "status": "success",
                    "data": data
                });
            } catch (error) {
                console.error("Error:", error);

                res.status(200).json({
                    "status": "failed",
                    "msg": "Something went wrong.. Try after sometime.."
                });
            }
        })
}

const employeeTracingManagement = async (req, res) => {

    let requestPayload = req.body;
    // const today = new Date().toISOString(); // Get today's date in ISO format
    const today = new Date().getTime(); // Get today's date in ISO format
    requestPayload.data.startDate = new Date(requestPayload.data.startDate).getTime();
    requestPayload.data.endDate = new Date(requestPayload.data.endDate).getTime();
    console.log(requestPayload.data)
    // Check if traceID is present
    if (requestPayload.data.activeTraceId) {
        // Update the existing record with traceID
        employeeTracing.findOneAndUpdate(
            { "activeTraceId": requestPayload.data.activeTraceId },
            {
                $set: {
                    startDate: requestPayload.data.startDate,
                    endDate: requestPayload.data.endDate,
                    UpdatedOn: today,
                    UpdatedBy: requestPayload.data.employeeId
                    // Add other fields to update as needed
                }
            },
            { new: true }
        )
            .then((updatedRecord) => {
                if (updatedRecord) {

                    res.status(200).json({
                        "status": "success",
                        "msg": "Record updated successfully"
                    });
                } else {

                    res.status(200).json({
                        "status": "failed",
                        "msg": "No record found with the provided traceID"
                    });
                }
            })
            .catch((error) => {
                console.error("Error:", error);

                res.status(200).json({
                    "status": "failed",
                    "msg": "Something went wrong.. Try after sometime.."
                });
            });
    } else {
        // If traceID is not present, create a new record
        let newTraceID = null; // Initialize newTraceID

        let overlappingRecords;

        // Inner query to find existing records of the employee
        employeeTracing.find({
            employeeId: requestPayload.data.employeeId
        })
            .sort({ activeTraceId: -1 })
            .limit(1)
            .then((latestRecord) => {
                if (latestRecord && latestRecord.length > 0) {
                    const latestTraceID = latestRecord[0].activeTraceId;
                    const latestTraceNumber = latestTraceID.split('_')[1] ? parseInt(latestTraceID.split('_')[1], 10) : 0;
                    newTraceID = `${requestPayload.data.employeeId}_${latestTraceNumber + 1}`;
                } else {
                    newTraceID = `${requestPayload.data.employeeId}_1`;
                }
                console.log("l1", newTraceID, typeof newTraceID)
                // Check if the period overlaps with existing records
                return employeeTracing.find({
                    employeeId: requestPayload.data.employeeId,
                    $or: [
                        {
                            $and: [
                                { startDate: { $lte: requestPayload.data.endDate } },
                                { endDate: { $gte: requestPayload.data.startDate } }
                            ]
                        },
                        {
                            $and: [
                                { startDate: { $gte: requestPayload.data.startDate } },
                                { endDate: { $lte: requestPayload.data.endDate } }
                            ]
                        }
                    ]
                });
            })
            .then((records) => {
                console.log("l2", records)
                overlappingRecords = records;

                if (overlappingRecords && overlappingRecords.length > 0) {

                    res.status(200).json({
                        "status": "failed",
                        "msg": "Selected Period is already in an active position"
                    });
                } else {
                    console.log("l3")
                    // Create a new record
                    const newRecord = new employeeTracing({
                        activeTraceId: newTraceID,
                        employeeId: requestPayload.data.employeeId,
                        startDate: requestPayload.data.startDate,
                        endDate: requestPayload.data.endDate,
                        createdOn: today,
                        createdBy: requestPayload.data.employeeId
                        // Add other fields as needed
                    });
                    console.log("l4", newRecord)

                    // Save the new record
                    return newRecord.save();
                }
            })
            .then((result) => {
                console.log("l5", result)
                if (result) {

                    res.status(200).json({
                        "status": "success",
                        "msg": "New record added successfully"
                    });
                }
            })
            .catch((error) => {
                console.error("Error:", error);

                res.status(200).json({
                    "status": "failed",
                    "msg": "Something went wrong.. Try after sometime.."
                });
            });
    }



    // responseData = { ...responseData, ...newsInfo[0], ...{ categories: value.data } }

    // res.status(200).json(responseData);
}


const employeeTracingActiveEmployeeList = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));
        let employee = await reportersSchema.findOne({
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
                let allEmployees = await reportersSchema.aggregate([
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


const getArticlesDashbordInfo = async (req, res) => {
    try {
        const body = JSON.parse(JSON.stringify(req.body));
        const { employeeId } = body;

        // Employee validation
        let employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();       // epoch ms
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();   // epoch ms
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getTime() + 86400000 - 1; // end of day

        // Debug logs
        console.log('Start of This Month (epoch):', startOfThisMonth);
        console.log('Start of Last Month (epoch):', startOfLastMonth);
        console.log('End of Last Month (epoch):', endOfLastMonth);

        const employeeFilter = employeeId ? { employeeId } : {};

        const stats = await newsDataSchema.aggregate([
          {
            $facet: {
              total: [
                { 
                  $match: {
                    ...employeeFilter,
                    approvedOn: { $gt: 0 }
                  }
                },
                { $count: 'count' }
              ],
              lastMonth: [
                {
                  $match: {
                    ...employeeFilter,
                    approvedOn: { $gt: 0 },
                    createdDate: {
                      $gte: startOfLastMonth,
                      $lte: endOfLastMonth,
                    },
                  },
                },
                { $count: 'count' },
              ],
              thisMonth: [
                {
                  $match: {
                    ...employeeFilter,
                    approvedOn: { $gt: 0 },
                    createdDate: {
                      $gte: startOfThisMonth,
                    },
                  },
                },
                { $count: 'count' },
              ],
            },
        }
        ]);

        console.log(stats)
        const totalRecords = stats[0].total[0]?.count || 0;
        const lastMonthRecords = stats[0].lastMonth[0]?.count || 0;
        const thisMonthRecords = stats[0].thisMonth[0]?.count || 0;

        let percentChange = 0;
        if (lastMonthRecords === 0) {
            percentChange = thisMonthRecords === 0 ? 0 : 100;
        } else {
            percentChange = ((thisMonthRecords - lastMonthRecords) / lastMonthRecords) * 100;
        }

        res.json({
        status:"success",
        msg:"Data Fetched Successfully",
        data:{

            employeeId: employeeId || 'ALL',
            totalRecords,
            lastMonthRecords,
            thisMonthRecords,
            percentChange: parseFloat(percentChange.toFixed(2)),
        }
    });
    
    } catch (error) {
        console.error(error)
        await errorLogBookSchema.create({
            message: `Error while Fetching Home Data`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employee Fetching Home Data',
            functionality: 'Error while Fetching Home Data',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }
}
const getPageViewDashboardInfo = async (req, res) => {
    try {
        let body = JSON.parse(JSON.stringify(req.body));

        // Employee validation
        let employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        
        // Get first and last day of current month
        const firstDayCurrentMonth = new Date(currentYear, currentMonth, 1);
        const lastDayCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
        
        // Get first and last day of last month
        const firstDayLastMonth = new Date(currentYear, currentMonth - 1, 1);
        const lastDayLastMonth = new Date(currentYear, currentMonth, 0);

        // Format dates as yyyy-mm-dd for comparison
        const formatDate = (date) => date.toISOString().split('T')[0];
        
        const currentMonthStart = formatDate(firstDayCurrentMonth);
        const currentMonthEnd = formatDate(lastDayCurrentMonth);
        const lastMonthStart = formatDate(firstDayLastMonth);
        const lastMonthEnd = formatDate(lastDayLastMonth);

        // Main aggregation pipeline
        const result = await Visitor.aggregate([
            // Convert fcmTokensByDay map to array of {date, tokens} objects
            { $project: {
                entries: { $objectToArray: "$fcmTokensByDay" }
            }},
            // Unwind the entries array
            { $unwind: "$entries" },
            // Unwind the tokens array
            { $unwind: "$entries.v" },
            // Project relevant fields
            { $project: {
                date: "$entries.k",
                visitCount: { $size: { $ifNull: ["$entries.v.visitedOn", []] } }
            }},
            // Group to calculate metrics
            { $group: {
                _id: null,
                totalVisits: { $sum: "$visitCount" },
                thisMonthVisits: {
                    $sum: {
                        $cond: [
                            { $and: [
                                { $gte: ["$date", currentMonthStart] },
                                { $lte: ["$date", currentMonthEnd] }
                            ]},
                            "$visitCount",
                            0
                        ]
                    }
                },
                lastMonthVisits: {
                    $sum: {
                        $cond: [
                            { $and: [
                                { $gte: ["$date", lastMonthStart] },
                                { $lte: ["$date", lastMonthEnd] }
                            ]},
                            "$visitCount",
                            0
                        ]
                    }
                }
            }}
        ]);

        // Process the result
        const stats = result[0] || { totalVisits: 0, thisMonthVisits: 0, lastMonthVisits: 0 };
        
        // Calculate percentage change
        let percentChange = 0;
        if (stats.lastMonthVisits > 0) {
            percentChange = ((stats.thisMonthVisits - stats.lastMonthVisits) / stats.lastMonthVisits) * 100;
        } else if (stats.thisMonthVisits > 0) {
            percentChange = 100;
        }
        
        // Round to 2 decimal places
        percentChange = parseFloat(percentChange.toFixed(2));
        res.json({
            status: "success",
            data: {
                totalVisits: stats.totalVisits || 0,
                thisMonthVisits: stats.thisMonthVisits || 0,
                lastMonthVisits: stats.lastMonthVisits || 0,
                percentChange: percentChange
            },
            message: "Page view dashboard data retrieved successfully"
        });
    } catch (error) {
        console.error(error);
        await errorLogBookSchema.create({
            message: `Error while Fetching Page View Dashboard Data`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Page View Dashboard',
            functionality: 'Error while Fetching Page View Dashboard Data',
            errorMessage: `${JSON.stringify(error) || ''}`,
        });
        res.status(500).json({
            status: "error",
            message: 'Failed to process page view dashboard data',
            error: error.message
        });
    }
}

const getArticlesByCategory = async (req, res) => {
    try {
        const body = JSON.parse(JSON.stringify(req.body));
        const TARGET_ARTICLES = 350;

        // Employee validation
        let employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        // Get all unique categories
        const categories = await newsDataSchema.distinct('category');
        
        // Get count of articles for each category
        const categoryStats = await Promise.all(categories.map(async (category) => {
            const count = await newsDataSchema.countDocuments({ 
                category: category,
                approved: true,
                rejected: false
            });
            
            const percentage = Math.min(Math.round((count / TARGET_ARTICLES) * 100), 100);
            
            return {
                name: category,
                count: count,
                percentage: percentage,
                target: TARGET_ARTICLES,
                remaining: Math.max(0, TARGET_ARTICLES - count)
            };
        }));

        // Sort by count (descending)
        categoryStats.sort((a, b) => b.count - a.count);

        res.status(200).json({
            status: "success",
            data: categoryStats
        });

    } catch (error) {
        console.error('Error in getArticlesByCategory:', error);
        await errorLogBookSchema.create({
            message: 'Error while fetching article counts by category',
            stackTrace: error.stack ? [...error.stack].join('/n') : '',
            page: 'Article Dashboard',
            functionality: 'Fetch article counts by category',
            errorMessage: error.message || JSON.stringify(error)
        });
        
        res.status(500).json({
            status: "failed",
            msg: 'Failed to fetch article statistics',
            error: error.message
        });
    }
};

const getActiveEmployeeStats = async (req, res) => {
    try {
        const body = JSON.parse(JSON.stringify(req.body));

        // Employee validation
        let employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth();
        
        // Get first and last day of current month
        const firstDayCurrentMonth = new Date(currentYear, currentMonth, 1);
        const lastDayCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
        
        // Get first and last day of last month
        const firstDayLastMonth = new Date(currentYear, currentMonth - 1, 1);
        const lastDayLastMonth = new Date(currentYear, currentMonth, 0);

        // Get active employees for current month
        const currentMonthActive = await employeeTracing.distinct('employeeId', {
            startDate: { $lte: lastDayCurrentMonth.getTime() },
            $or: [
                { endDate: { $gte: firstDayCurrentMonth.getTime() } },
                { endDate: { $exists: false } }
            ]
        });

        // Get active employees for last month
        const lastMonthActive = await employeeTracing.distinct('employeeId', {
            startDate: { $lte: lastDayLastMonth.getTime() },
            $or: [
                { endDate: { $gte: firstDayLastMonth.getTime() } },
                { endDate: { $exists: false } }
            ]
        });

        const currentMonthCount = currentMonthActive.length;
        const lastMonthCount = lastMonthActive.length;
        
        // Calculate percentage change
        let percentChange = 0;
        if (lastMonthCount > 0) {
            percentChange = ((currentMonthCount - lastMonthCount) / lastMonthCount) * 100;
        } else if (currentMonthCount > 0) {
            percentChange = 100;
        }
        
        // Round to 2 decimal places
        percentChange = parseFloat(percentChange.toFixed(2));
        
        // Get all active employees (regardless of month)
        const totalActiveEmployees = await employeeTracing.distinct('employeeId', {
            $or: [
                { endDate: { $exists: false } },
                { endDate: { $gte: Date.now() } }
            ]
        });

        res.json({
            status: "success",
            data: {
                totalActive: totalActiveEmployees.length,
                lastMonthActive: lastMonthCount,
                percentChange: percentChange
            },
            message: "Active employee statistics retrieved successfully"
        });
    } catch (error) {
        console.error('Error in getActiveEmployeeStats:', error);
        await errorLogBookSchema.create({
            message: 'Error while fetching active employee statistics',
            stackTrace: error.stack ? [...error.stack].join('/n') : '',
            page: 'Employee Dashboard',
            functionality: 'Fetch active employee statistics',
            errorMessage: error.message || JSON.stringify(error)
        });
        
        res.status(500).json({
            status: "error",
            message: 'Failed to process active employee statistics',
            error: error.message
        });
    }
};

const getVisitorTimeSeries = async (req, res) => {
    try {
        const body = JSON.parse(JSON.stringify(req.body));
        const { period = 'day' } = body; // 'day', 'week', 'month', 'year', 'total'

        // Employee validation
        const employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        const now = new Date();
        let startDate, endDate, groupId, dateFormat;
        let matchStage = {};

        // Set date range and grouping based on period
        switch (period.toLowerCase()) {
            case 'total':
                // All data, group by day
                groupId = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } } } };
                dateFormat = '%Y-%m-%d';
                startDate = null;
                break;
            case 'day':
                // Last 24 hours, group by 30-minute intervals
                startDate = new Date(now);
                startDate.setHours(now.getHours() - 24);
                // Group by both hour and minute (30-minute intervals)
                groupId = {
                    $let: {
                        vars: {
                            date: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } },
                            hour: { $hour: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } } },
                            minute: { $minute: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } } }
                        },
                        in: {
                            $concat: [
                                { $toString: { $cond: [{ $eq: [{$mod: ["$$hour", 12]}, 0] }, 12, { $mod: ["$$hour", 12] }] } },
                                ":",
                                { $cond: [{ $lt: ["$$minute", 30] }, "00", "30"] },
                                { $cond: [{ $lt: ["$$hour", 12] }, "am", "pm"] }
                            ]
                        }
                    }
                };
                dateFormat = 'h:mma';
                break;
            case 'week':
                // Last 7 days, group by day
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                groupId = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } } } };
                dateFormat = '%Y-%m-%d';
                break;
            case 'month':
                // Last 30 days, group by day
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 30);
                groupId = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } } } };
                dateFormat = '%Y-%m-%d';
                break;
            case 'year':
                // Last 12 months, group by month
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 12);
                groupId = { $dateToString: { format: '%Y-%m', date: { $toDate: { $arrayElemAt: ["$visitedOn", -1] } } } };
                dateFormat = '%Y-%m';
                break;
            default:
                return res.status(400).json({
                    status: "failed",
                    msg: 'Invalid period. Must be one of: day, week, month, year, total'
                });
        }

        // Create the aggregation pipeline
        const pipeline = [
            // Convert the fcmTokensByDay map to an array of {k: date, v: tokens} objects
            { $addFields: { tokensArray: { $objectToArray: "$fcmTokensByDay" } } },
            // Unwind the tokens array
            { $unwind: "$tokensArray" },
            // Unwind the tokens array inside each date
            { $unwind: "$tokensArray.v" },
            // Project the fields we need
            {
                $project: {
                    _id: 0,
                    date: "$tokensArray.k",
                    visitedOn: "$tokensArray.v.visitedOn"
                }
            },
            // Filter by date range (skip for total)
            ...(period.toLowerCase() !== 'total' ? [{
                $match: {
                    $expr: {
                        $gte: [
                            { $arrayElemAt: ["$visitedOn", -1] },
                            startDate.getTime()
                        ]
                    }
                }
            }] : []),
            // Group by time period
            {
                $group: {
                    _id: groupId,
                    count: { $sum: 1 },
                    // Keep the actual timestamp for sorting
                    timestamp: { $max: { $arrayElemAt: ["$visitedOn", -1] } }
                }
            },
            // Sort by the timestamp
            { $sort: { timestamp: 1 } },
            // Project to final format
            {
                $project: {
                    _id: 0,
                    period: "$_id",
                    count: 1
                }
            }
        ];

        const result = await Visitor.aggregate(pipeline);

        res.json({
            status: "success",
            data: {
                period: period,
                dateFormat: dateFormat,
                counts: result.map(item => item.count),
                periods: result.map(item => item.period)
            },
            message: "Visitor time series data retrieved successfully"
        });

    } catch (error) {
        console.error('Error in getVisitorTimeSeries:', error);
        await errorLogBookSchema.create({
            message: 'Error while fetching visitor time series data',
            stackTrace: error.stack ? [...error.stack].join('/n') : '',
            page: 'Visitor Analytics',
            functionality: 'Fetch visitor time series data',
            errorMessage: error.message || JSON.stringify(error)
        });
        
        res.status(500).json({
            status: "error",
            message: 'Failed to process visitor time series data',
            error: error.message
        });
    }
};
const getVisitorLocations = async (req, res) => {
    try {
        const body = JSON.parse(JSON.stringify(req.body));
        
        // Employee validation
        const employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        // Get all visitors with location data
        const visitors = await Visitor.find({});
        
        // Extract all locations from fcmTokensByDay
        const locations = [];
        
        visitors.forEach(visitor => {
            if (visitor.fcmTokensByDay) {
                for (const [day, tokens] of visitor.fcmTokensByDay.entries()) {
                    if (Array.isArray(tokens)) {
                        tokens.forEach(tokenData => {
                            if (tokenData.location && 
                                Array.isArray(tokenData.location) && 
                                tokenData.location.length === 2) {
                                locations.push({
                                    lat: tokenData.location[0],
                                    lng: tokenData.location[1]
                                });
                            }
                        });
                    }
                }
            }
        });

        res.json({
            status: "success",
            data: locations,
            message: "Visitor locations retrieved successfully"
        });
    } catch (error) {
        console.error('Error in getVisitorLocations:', error);
        await errorLogBookSchema.create({
            message: 'Error while fetching visitor locations',
            stackTrace: error.stack ? [...error.stack].join('/n') : '',
            page: 'Visitor Analytics',
            functionality: 'Fetch visitor locations',
            errorMessage: error.message || JSON.stringify(error)
        });
        res.status(500).json({
            status: "error",
            message: 'Failed to process visitor locations',
            error: error.message
        });
    }
};

const getVisitsTimeSeries = async (req, res) => {
    try {
        const body = JSON.parse(JSON.stringify(req.body));
        const { period = 'day' } = body; // 'day', 'week', 'month', 'year', 'total'

        // Employee validation
        const employee = await reportersSchema.findOne({
            employeeId: body.employeeId
        });
        
        if (!employee) {
            return res.status(200).json({
                status: "failed",
                msg: 'Cannot access, contact your superior!'
            });
        } else if (employee.disabledUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Forbidden Access!'
            });
        } else if (!employee.activeUser) {
            return res.status(200).json({
                status: "failed",
                msg: 'Employment not yet approved. Kindly contact your superior.'
            });
        }

        const now = new Date();
        let startDate, groupId, dateFormat;

        // Set date range and grouping based on period
        switch (period.toLowerCase()) {
            case 'total':
                groupId = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: "$visitTime" } } };
                dateFormat = '%Y-%m-%d';
                startDate = null;
                break;
            case 'day':
                startDate = new Date(now);
                startDate.setHours(now.getHours() - 24);
                groupId = {
                    $let: {
                        vars: {
                            date: { $toDate: "$visitTime" },
                            hour: { $hour: { $toDate: "$visitTime" } },
                            minute: { $minute: { $toDate: "$visitTime" } }
                        },
                        in: {
                            $concat: [
                                { $toString: { $cond: [{ $eq: [{$mod: ["$$hour", 12]}, 0] }, 12, { $mod: ["$$hour", 12] }] } },
                                ":",
                                { $cond: [{ $lt: ["$$minute", 30] }, "00", "30"] },
                                { $cond: [{ $lt: ["$$hour", 12] }, "am", "pm"] }
                            ]
                        }
                    }
                };
                dateFormat = 'h:mma';
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                groupId = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: "$visitTime" } } };
                dateFormat = '%Y-%m-%d';
                break;
            case 'month':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 30);
                groupId = { $dateToString: { format: '%Y-%m-%d', date: { $toDate: "$visitTime" } } };
                dateFormat = '%Y-%m-%d';
                break;
            case 'year':
                startDate = new Date(now);
                startDate.setMonth(now.getMonth() - 12);
                groupId = { $dateToString: { format: '%Y-%m', date: { $toDate: "$visitTime" } } };
                dateFormat = '%Y-%m';
                break;
            default:
                return res.status(400).json({
                    status: "failed",
                    msg: 'Invalid period. Must be one of: day, week, month, year, total'
                });
        }

        // Aggregation pipeline: unwind all visits (all timestamps in all tokens)
        const pipeline = [
            { $addFields: { tokensArray: { $objectToArray: "$fcmTokensByDay" } } },
            { $unwind: "$tokensArray" },
            { $unwind: "$tokensArray.v" },
            { $unwind: "$tokensArray.v.visitedOn" },
            { $project: {
                _id: 0,
                visitTime: "$tokensArray.v.visitedOn"
            }},
            ...(period.toLowerCase() !== 'total' ? [{
                $match: {
                    $expr: {
                        $gte: ["$visitTime", startDate.getTime()]
                    }
                }
            }] : []),
            { $group: {
                _id: groupId,
                count: { $sum: 1 },
                timestamp: { $max: "$visitTime" }
            }},
            { $sort: { timestamp: 1 } },
            { $project: {
                _id: 0,
                period: "$_id",
                count: 1
            }}
        ];

        const result = await Visitor.aggregate(pipeline);

        res.json({
            status: "success",
            data: {
                period: period,
                dateFormat: dateFormat,
                counts: result.map(item => item.count),
                periods: result.map(item => item.period)
            },
            message: "Visits time series data retrieved successfully"
        });
    } catch (error) {
        console.error('Error in getVisitsTimeSeries:', error);
        await errorLogBookSchema.create({
            message: 'Error while fetching visits time series data',
            stackTrace: error.stack ? [...error.stack].join('/n') : '',
            page: 'Visits Analytics',
            functionality: 'Fetch visits time series data',
            errorMessage: error.message || JSON.stringify(error)
        });
        res.status(500).json({
            status: "error",
            message: 'Failed to process visits time series data',
            error: error.message
        });
    }
};
module.exports = {
    employeeLogin, fetchNewsListPending, fetchNewsListApproved, fetchNewsListRejected, 
    getAllActiveEmployees, manipulateNews, getAdminIndividualNewsInfo, getEmployeesDataPaginated, 
    getIndividualEmployeeData, manipulateIndividualEmployee, employeeTracingListing,
    employeeTracingManagement, employeeTracingActiveEmployeeList, getArticlesDashbordInfo, 
    getPageViewDashboardInfo, getArticlesByCategory, getActiveEmployeeStats, getVisitorTimeSeries, getVisitsTimeSeries, getVisitorLocations
};