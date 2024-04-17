
const newsDataSchema = require('../modals/newsDataSchema');
const errorLogBookSchema = require('../modals/errorLogBookSchema');
const metaDataSchema = require('../modals/metaDataSchema');
const EmployeeTracing = require('../modals/employeeTracing')
const reporterSchema = require('../modals/reportersSchema');
const { getFileTempUrls3 } = require('./commonApiFunction');
const publicUserSchema = require('../modals/publicUserSchema');
const otpTrackingSchema = require('../modals/otpTrackingSchema');

const getHomeData = async (req, res) => {
    try {



        let mostRecentRecords = await newsDataSchema.aggregate([
            {
                $match: {
                    approvedOn: { $gt: 0 }
                }
            },
            {
                $sort: { createdDate: -1 }
            },
            {
                $limit: 5
            }
        ])
        mostRecentRecords = mostRecentRecords.sort((a, b) => b.newsId - a.newsId);
        if (mostRecentRecords.length === 0) {
            mostRecentRecords = [];
        }

        let categoryWiseRecentRecords = await newsDataSchema.aggregate([
            {
                $match: {
                    approvedOn: { $gt: 0 }
                }
            },
            {
                $sort: { createdDate: -1 }
            },
            {
                $group: {
                    _id: '$category', // Group by category
                    records: { $push: '$$ROOT' } // Store all records in an array
                }
            },
            {
                $addFields: {
                    sortedRecords: {
                        $slice: ['$records', 4] // Take the most recent 4 records
                    }
                }
            },
            {
                $unwind: '$sortedRecords' // Unwind the sortedRecords array
            },
            {
                $sort: { 'sortedRecords.createdDate': -1 } // Sort by createdDate within the 4 records
            },
            {
                $replaceRoot: { newRoot: '$sortedRecords' } // Replace root with sortedRecords
            },
            {
                $group: {
                    _id: '$category', // Group by category again
                    categoryRecords: { $push: '$$ROOT' } // Store the sorted records for each category
                }
            },
            {
                $group: {
                    _id: null, // Group all categories
                    categorizedRecords: { $push: { category: '$_id', records: '$categoryRecords' } } // Store categorized records as objects
                }
            },
            {
                $project: {
                    _id: 0,
                    categorizedRecords: 1 // Include the categorizedRecords array
                }
            }
        ])

        let moreRecentRecords = await newsDataSchema.aggregate([
            {
                $match: {
                    approvedOn: { $gt: 0 }
                }
            },
            {
                $sort: { createdDate: -1 }
            },
            {
                $skip: 5 // Skip the first 5 records
            },
            {
                $limit: 6 // Take the next 6 records
            }, {
                $sort: { newsId: -1 } // Sort by newsId within the 6 to 11 records
            }

        ])

        const fetchTempUrls = async (records) => {
            return await Promise.all(records.map(async (record) => {
                await Promise.all(record.images.map(async (elementImg) => {
                    elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
                }));

                // const fileURLTemp = await getFileTempUrls3(record.fileName);
                // return { ...record, tempURL: fileURLTemp };
                return record;
            }));
        };
        mostRecentRecords = await fetchTempUrls(mostRecentRecords);
        // Fetch temporary URLs for categoryWiseRecentRecords
        for (const categoryRecord of categoryWiseRecentRecords[0].categorizedRecords) {
            categoryRecord.records = await fetchTempUrls(categoryRecord.records);
        }

        // Fetch temporary URLs for moreRecentRecords
        moreRecentRecords = await fetchTempUrls(moreRecentRecords);
        res.status(200).json({
            status: "success",
            msg: 'Success',
            data: { mostRecentRecords: mostRecentRecords, categoryWiseRecentRecords: categoryWiseRecentRecords[0].categorizedRecords, moreRecentRecords: moreRecentRecords }

        });
    } catch (error) {
        console.error(error)
        await errorLogBookSchema.create({
            message: `Error while Fetching Home Data`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
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

const getIndividualNewsInfo = async (req, res) => {
    let viewersData = await metaDataSchema.updateOne(
        { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
        { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    )
    let increamentData = await newsDataSchema.findOneAndUpdate(
        { newsId: req.body.newsId }, // Find the specific record by newsId
        { $inc: { viewCount: 1 } }, // Increment the viewCount by 1
        { new: true } // Return the updated document
    )
    let newsInfo = await newsDataSchema.aggregate([
        {
            $facet: {
                recentRecords: [
                    {
                        $sort: { createdDate: -1 } // Sort by createdDate in descending order
                    },
                    {
                        $limit: 5 // Limit to 5 records
                    }
                ],
                specificRecord: [
                    {
                        $match: { newsId: req.body.newsId } // Match specific newsId
                    },
                    {
                        $limit: 1 // Limit to 1 record
                    }
                ]
            }
        },
    ]);

    // Fetching tempURL for each image in recentRecords and specificRecord
    let recentRecordsWithTempURL = await Promise.all(newsInfo[0].recentRecords.map(async record => {
        let imagesWithTempURL = await Promise.all(record.images.map(async image => {
            let tempURL = await getFileTempUrls3(image.fileName);
            return { ...image, tempURL };
        }));
        return { ...record, images: imagesWithTempURL };
    }));

    let specificRecordWithTempURL = await Promise.all(newsInfo[0].specificRecord.map(async record => {
        let imagesWithTempURL = await Promise.all(record.images.map(async image => {
            let tempURL = await getFileTempUrls3(image.fileName);
            return { ...image, tempURL };
        }));
        return { ...record, images: imagesWithTempURL };
    }));

    let value = await metaDataSchema.findOne({ type: 'NEWS_CATEGORIES' });

    let responseData = {
        recentRecords: recentRecordsWithTempURL,
        specificRecord: specificRecordWithTempURL,
        categories: value.data
    };

    res.status(200).json({
        status: "success",
        data: responseData
    });
}


const employeeTracing = async (req, res) => {
    let viewersData = await tracingSchema.updateOne(
        { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
        { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    )
    let increamentData = await newsDataSchema.findOneAndUpdate(
        { newsId: req.body.newsId }, // Find the specific record by newsId
        { $inc: { viewCount: 1 } }, // Increment the viewCount by 1
        { new: true } // Return the updated document
    )
    let newsInfo = await newsDataSchema.aggregate([
        {
            $facet: {
                recentRecords: [
                    {
                        $sort: { createdDate: -1 } // Sort by createdDate in descending order
                    },
                    {
                        $limit: 5 // Limit to 5 records
                    }
                ],
                specificRecord: [
                    {
                        // $match: { body } // Match specific newsId
                        $match: { newsId: req.body.newsId } // Match specific newsId
                    },
                    {
                        $limit: 1 // Limit to 1 record
                    }
                ]
            }
        },

    ])
    let value = await metaDataSchema.findOne({
        type: 'NEWS_CATEGORIES'
    })

    let responseData = {};

    responseData = { ...responseData, ...newsInfo[0], ...{ categories: value.data } }

    res.status(200).json({
        status: "success",
        data: responseData
    });
}
const employeeTracingManagement = async (req, res) => {

    const requestPayload = req.body;
    const today = new Date().toISOString(); // Get today's date in ISO format

    // Check if traceID is present
    if (requestPayload.data.activeTraceId) {
        // Update the existing record with traceID
        EmployeeTracing.findOneAndUpdate(
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
        EmployeeTracing.find({
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

                // Check if the period overlaps with existing records
                return EmployeeTracing.find({
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
                overlappingRecords = records;

                if (overlappingRecords && overlappingRecords.length > 0) {

                    res.status(200).json({
                        "status": "failed",
                        "msg": "Selected Period is already in an active position"
                    });
                } else {
                    // Create a new record
                    const newRecord = new EmployeeTracing({
                        activeTraceId: newTraceID,
                        employeeId: requestPayload.data.employeeId,
                        startDate: requestPayload.data.startDate,
                        endDate: requestPayload.data.endDate,
                        createdOn: today,
                        createdBy: requestPayload.data.employeeId
                        // Add other fields as needed
                    });

                    // Save the new record
                    return newRecord.save();
                }
            })
            .then((result) => {
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
const employeeTracingListing = async (req, res) => {

    const PAGE_SIZE = 10; // Set your desired page size

    const today = new Date().toISOString();

    const page = req.body.page ? parseInt(req.body.page, 10) : 1;
    const skip = (page - 1) * PAGE_SIZE;




    let totalRecords;

    EmployeeTracing.countDocuments({})
        .then((count) => {
            totalRecords = count;

            return EmployeeTracing.aggregate([
                {
                    $addFields: {
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
                    $sort: {
                        active: -1,
                        startDate: 1
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
                const employeeDetails = await reporterSchema.find({ employeeId: { $in: employeeIds } }).select('-password -__v -passwordCopy -_id');

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
                        "actions": [
                            {
                                type: "button",
                                tooltip: "Edit",
                                icon: "edit",
                                key: "edit",
                                class: "btn btn-success",
                                disable: {
                                    role: req.body.role === 'CEO' ? [] : req.body.role === 'INCHARGE DIRECTOR' ? ['CEO', 'INCHARGE DIRECTOR'] : ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']

                                }
                            },
                            {
                                type: "button",
                                tooltip: "Copy QR Code",
                                icon: "qr_code_2",
                                key: "qrCode",
                                class: "btn btn-dark",
                                disable: {
                                    role: req.body.role === 'CEO' ? [] : req.body.role === 'INCHARGE DIRECTOR' ? ['CEO', 'INCHARGE DIRECTOR'] : ['CEO', 'INCHARGE DIRECTOR', 'DISTRICT MANAGER', 'ADVERTISEMENT MANAGER']

                                }
                            },
                            // {
                            //     type: "button",
                            //     tooltip: "In Active",
                            //     icon: "edit_off",
                            //     key: "inactive",
                            //     class: "btn btn-dark"
                            // },
                            // {
                            //     type: "button",
                            //     tooltip: "Disable",
                            //     key: "disable",
                            //     class: "btn btn-danger",
                            //     icon: "no_accounts",
                            // },
                            // {
                            //     type: "button",
                            //     tooltip: "Verify Identity",
                            //     key: "verify_identity",
                            //     class: "btn btn-outline-primary",
                            //     icon: "fact_check",
                            // }
                        ],
                        "createNew": {
                            type: "createNew",
                            label: "Add New Record",
                            icon: "add_circle",
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

const employeeTraceCheck = async (req, res) => {
    try {


        const currentDate = new Date().toISOString();
        const providedTraceId = req.body.activeTraceId;



        const result = await EmployeeTracing.aggregate([
            {
                $match: {
                    activeTraceId: providedTraceId // Filter documents with the provided traceId
                }
            },
            {
                $project: {

                    activeTraceId: 1,
                    employeeId: 1,
                    startDate: 1,
                    endDate: 1,
                    createdOn: 1,
                    createdBy: 1,
                    UpdatedOn: 1,
                    UpdatedBy: 1,
                    status: {
                        $ifNull: [
                            {
                                $cond: {
                                    if: {
                                        $eq: ["$activeTraceId", providedTraceId] // Check if the activeTraceId matches the providedTraceId
                                    },
                                    then: {
                                        $cond: {
                                            if: {
                                                $and: [
                                                    { $lte: ["$startDate", currentDate] }, // Check if startDate is less than or equal to current date
                                                    { $gte: ["$endDate", currentDate] }   // Check if endDate is greater than or equal to current date
                                                ]
                                            },
                                            then: "active",
                                            else: {
                                                $cond: {
                                                    if: { $lt: ["$endDate", currentDate] }, // Check if endDate is less than current date
                                                    then: "expired",
                                                    else: "inactive"
                                                }
                                            }
                                        }
                                    },
                                    else: "Not a NC Media Reporter"
                                }
                            },
                            "Not a NC Media Reporter"
                        ]
                    }
                }
            }
        ]);
        if (result.length === 0) {

            res.status(200).json({
                "status": "invalid",
                "msg": "Not a Neti Charithra Employee",
                // data:result
            });
        } else {

            var recordList = JSON.parse(JSON.stringify(result))
            const employeeIds = recordList.map(record => record.employeeId);

            // Fetch employee information excluding _id, password, and passwordCopy
            const employeeInfoList = await reporterSchema.find({ employeeId: { $in: employeeIds } })
                .select('-_id -password -passwordCopy')
                .lean(); // Use lean() to get plain JavaScript objects instead of mongoose documents

            for (const record of recordList) {
                const matchingEmployee = employeeInfoList.find(employee => employee.employeeId === record.employeeId);
                if (matchingEmployee) {
                    // Add employeeInfo to the record
                    record.employeeInfo = matchingEmployee;
                    if (record?.employeeInfo?.profilePicture?.fileName) {
                        record.employeeInfo.profilePicture['tempURL'] = await getFileTempUrls3(record.employeeInfo?.profilePicture?.fileName);
                    }
                    if (record?.employeeInfo?.identityProof?.fileName) {
                        record.employeeInfo.identityProof['tempURL'] = await getFileTempUrls3(record.employeeInfo?.identityProof?.fileName);
                    }
                    if (record?.employeeInfo?.state) {

                        let allSt = await metaDataSchema.findOne({
                            type: "STATES"
                        })
                        const index = allSt?.data?.findIndex(element => element.value === record.employeeInfo.state);
                        if (index > -1) {
                            record.employeeInfo.stateName = allSt.data[index].label;
                        };

                        const dt = await metaDataSchema.findOne({
                            type: record.employeeInfo.state + "_DISTRICTS"
                        })
                        if (dt?.data?.length > 0 && record?.employeeInfo?.district) {
                            const dtIndex = dt.data.findIndex(ele => ele.value === record?.employeeInfo?.district)
                            if (dtIndex > -1) {
                                record.employeeInfo.districtName = dt.data[dtIndex]?.label
                            }
                        }
                    }


                }
            }

            res.status(200).json({
                "status": "success",
                // "msg": "Something went wrong.. Try after sometime..",
                data: recordList
            });
        }



    } catch (error) {
        console.error("Error:", error);

        res.status(200).json({
            "status": "failed",
            "msg": "Something went wrong.. Try after sometime.."
        });
    }

}




const getCategoryNewsPaginated = async (req, res) => {
    // let page starts from zero;
    let viewersData = await metaDataSchema.updateOne(
        { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
        { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    )
    const recordsPerPage = req?.body?.count || 10;
    const pageNumber = req?.body?.page || 0;
    const skipRecords = pageNumber * recordsPerPage;
    const aggregationPipeline = [
        {
            $facet: {
                records: [
                    {
                        $match: {
                            approvedOn: { $gt: 0 }, // Filtering for approved records
                            category: req.body.category, // Match the specific category,
                            language: req.body.language
                        }
                    },
                    {
                        $sort: { newsId: -1 } // Sorting by createdDate in descending order
                    },
                    {
                        $skip: skipRecords // Skipping records based on page number
                    },
                    {
                        $limit: recordsPerPage // Limiting records per page
                    }
                ],
                recentNews: [
                    {
                        $match: {
                            // Assuming 'news' is the category for news articles
                            approvedOn: { $gt: 0 } // Ensure approvedDate is greater than zero
                        }
                    },
                    {
                        $sort: { createdDate: -1 } // Sorting by createdDate in descending order
                    },
                    {
                        $limit: 5 // Limiting to the most recent 5 news articles
                    }
                ]
            }
        }
    ];

    try {
        const newsInfo = await newsDataSchema.aggregate(aggregationPipeline);
        const endOfRecords = newsInfo[0].records.length === 0; // Set endOfRecords to true if no records are fetched

        // Fetching categories from metadata
        let value = await metaDataSchema.findOne({
            type: 'NEWS_CATEGORIES'
        });

        // Update recent records with temporary URLs for images
        let recentRecordsWithTempURL = await Promise.all(newsInfo[0].recentNews.map(async record => {
            let imagesWithTempURL = await Promise.all(record.images.map(async image => {
                let tempURL = await getFileTempUrls3(image.fileName);
                return { ...image, tempURL };
            }));
            return { ...record, images: imagesWithTempURL };
        }));

        // Update specific record with temporary URLs for images
        let specificRecordWithTempURL = await Promise.all(newsInfo[0].records.map(async record => {
            let imagesWithTempURL = await Promise.all(record.images.map(async image => {
                let tempURL = await getFileTempUrls3(image.fileName);
                return { ...image, tempURL };
            }));
            return { ...record, images: imagesWithTempURL };
        }));

        res.status(200).json({
            status: "success",
            data: {
                records: specificRecordWithTempURL,
                recentRecords: recentRecordsWithTempURL,
                endOfRecords: endOfRecords,
                categories: value.data
            }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}


const getCategoryNewsPaginatedOnly = async (req, res) => {
    // let page starts from zero;
    let viewersData = await metaDataSchema.updateOne(
        { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
        { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    )
    const recordsPerPage = req?.body?.count || 10;
    const pageNumber = req?.body?.page || 1;
    const skipRecords = (pageNumber - 1) * recordsPerPage;
    const aggregationPipeline = [
        {
            $facet: {
                records: [
                    {
                        $match: {
                            // approvedOn: { $gt: 0 }, // Filtering for approved records
                            category: req.body.category, // Match the specific category,
                            // language:req.body.language
                        }
                    },
                    {
                        $sort: { newsId: -1 } // Sorting by createdDate in descending order
                    },
                    {
                        $skip: skipRecords // Skipping records based on page number
                    },
                    {
                        $limit: recordsPerPage // Limiting records per page
                    }
                ],

            }
        }
    ];

    try {
        const newsInfo = await newsDataSchema.aggregate(aggregationPipeline);
        const endOfRecords = newsInfo[0].records.length === 0; // Set endOfRecords to true if no records are fetched


        // Update specific record with temporary URLs for images
        let specificRecordWithTempURL = await Promise.all(newsInfo[0].records.map(async record => {
            let imagesWithTempURL = await Promise.all(record.images.map(async image => {
                let tempURL = await getFileTempUrls3(image.fileName);
                return { ...image, tempURL };
            }));
            return { ...record, images: imagesWithTempURL };
        }));

        res.status(200).json({
            status: "success",
            data: {
                records: specificRecordWithTempURL,
                endOfRecords: endOfRecords,
            }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}


const getDistrictNewsPaginated = async (req, res) => {
    // let page stars from zero;
    let viewersData = await metaDataSchema.updateOne(
        { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
        { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    )
    const recordsPerPage = req?.body?.count || 10;
    const pageNumber = req?.body?.page || 0;
    const skipRecords = (pageNumber - 1) * recordsPerPage;

    const aggregationPipeline = [
        {
            $facet: {
                records: [
                    {
                        $match: {
                            approvedOn: { $gt: 0 }, // Filtering for approved records
                            district: req.body.district.value // Match the specific category
                        }
                    },
                    {
                        $sort: { newsId: -1 } // Sorting by newsId in descending order
                    },
                    {
                        $skip: skipRecords // Skipping records based on page number
                    },
                    {
                        $limit: recordsPerPage // Limiting records per page
                    }
                ]
            }
        }
    ];

    try {
        const records = await newsDataSchema.aggregate(aggregationPipeline);
        let newRecords = JSON.parse(JSON.stringify(records?.[0].records)) || [];
        const endOfRecords = newRecords.length === 0; // Set endOfRecords to true if no records are fetched
        await Promise.all(newRecords.map(async (record) => {
            await Promise.all(record.images.map(async (elementImg) => {
                elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
            }));
        }));

        res.status(200).json({
            status: "success",
            data: { records: newRecords, endOfRecords: endOfRecords }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}

const getAllNewsList = async (req, res) => {
    const recordsPerPage = req?.body?.count || 10;
    const pageNumber = req?.body?.page || 1; // Adjusted page number to start from 1
    const skipRecords = (pageNumber - 1) * recordsPerPage;

    const aggregationPipeline = [
        {
            $facet: {
                records: [
                    {
                        $match: {
                            approvedOn: { $gt: 0 }, // Filtering for approved records
                            // category: req.body.category // Match the specific category
                        }
                    },
                    {
                        $sort: { createdDate: -1 } // Sorting by createdDate in descending order
                    },
                    {
                        $skip: skipRecords // Skipping records based on page number
                    },
                    {
                        $limit: recordsPerPage // Limiting records per page
                    }
                ],
                totalCount: [
                    {
                        $count: "total" // Counting the total number of records
                    }
                ]
            }
        }
    ];

    try {
        const result = await newsDataSchema.aggregate(aggregationPipeline);
        const records = result[0].records;
        const totalCount = result[0].totalCount.length > 0 ? result[0].totalCount[0].total : 0;

        // Calculate endOfRecords based on the current page and total count
        const endOfRecords = (pageNumber * recordsPerPage) >= totalCount;

        // Fetch temporary URLs for images
        await Promise.all(records.map(async (record) => {
            await Promise.all(record.images.map(async (elementImg) => {
                elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
            }));
        }));

        res.status(200).json({
            status: "success",
            data: { records: records, endOfRecords: endOfRecords }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}

const setFCMToken = async (req, res) => {
    try {
        ;

        const query = {
            type: 'FCM_TOKENS',
        };


        const update = {
            $addToSet: {
                data: req.body.token,
            },
        };

        const options = {
            upsert: true, // Create a new document if it doesn't exist
            new: true, // Return the updated document
        };


        let data = await metaDataSchema.findOneAndUpdate(query, update, options);

        res.status(200).json({
            status: "success"
        });
    }
    catch (err) {
        res.status(200).json({
            status: "failed",
            message: "FAILED to STORE"
        });
    }
}
const getAllNews = async (req, res) => {
    const recordsPerPage = req?.body?.count || 10;
    const pageNumber = req?.body?.page || 1; // Adjusted page number to start from 1
    const skipRecords = (pageNumber - 1) * recordsPerPage;

    const aggregationPipeline = [
        {
            $facet: {
                records: [
                    {
                        $match: {
                            approvedOn: { $gt: 0 }, // Filtering for approved records
                            // language: req?.body?.language || "te"
                            // category: req.body.category // Match the specific category
                        }
                    },
                    {
                        $sort: { newsId: -1 } // Sorting by newsId in descending order
                    },
                    {
                        $skip: skipRecords // Skipping records based on page number
                    },
                    {
                        $limit: recordsPerPage // Limiting records per page
                    }
                ]
            }
        }
    ];

    try {
        const result = await newsDataSchema.aggregate(aggregationPipeline);
        const records = result[0].records;
        // Calculate endOfRecords based on the current page and total count
        const endOfRecords = records.length < recordsPerPage;

        // Fetch temporary URLs for images
        await Promise.all(records.map(async (record) => {
            await Promise.all(record.images.map(async (elementImg) => {
                elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
            }));
        }));

        res.status(200).json({
            status: "success",
            data: { records: records, endOfRecords: endOfRecords }
        });
    } catch (error) {
        res.status(200).json({
            status: "failed",
            message: "Something went wrong try after sometime.."
        });
        console.error(error);
        throw error;
    }
}

const client = require('twilio')(process.env.TWILIO_accountSid, process.env.TWILIO_authToken);

const requestPublicOTP = async (req, res) => {
    try {

        // {
        //     "mobileNumber": 8317513201,
        //     "countryCode":"+91"
        // }
        let obj = {
            otp: generateOTP(6),
            mobileNumber: req.body.phoneNumber,
            countryCode:req.body.countryCode
        }
        let resp = await otpTrackingSchema.create(obj);

        client.messages
            .create({
                body: `${obj.otp} is your OTP to validate in NC Media mobile App \n OTP Expires in 10 minutes. \n Team - NC Media`,
                from: '+1 251 572 1321', // Replace with your alphanumeric sender ID
                to: req.body.countryCode + req.body.phoneNumber
            })
            .then(message => {

                res.status(200).json({
                    status: "success",
                    step: "otp",
                    message: `OTP Sent to your mobile.. Validate with OTP`,
                    msg: message
                })
            })
            .catch(error => {
                console.log(error)
                res.status(200).json({
                    status: "failed",

                    message: `Something went wrong`,
                })
            });





    } catch (error) {
        console.log(error)

        const obj = await errorLogBookSchema.create({
            message: `Error while OTP GENERATION User`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
            page: 'OTP GENERATION User',
            functionality: 'To OTP GENERATION User',
            errorMessage: `${JSON.stringify(error) || ''}`
        })
        res.status(200).json({
            status: "failed",
            msg: 'Failed to while processing..',

        });
    }
}
const validateUserOTP = async (req, res) => {
    try {
        const data = JSON.parse(JSON.stringify(req.body));
        data.mobileNumber = parseInt(data.mobileNumber)
        const otp = parseInt(req.body.otp);

        const result = await otpTrackingSchema.aggregate([
            { $match: { mobileNumber: data.mobileNumber } },
            { $sort: { createdDate: -1 } },
            { $limit: 1 }
        ]);

        if (result.length === 0) {
            return res.status(200).json({ message: 'No record found for the provided mobile number' });
        }

        const latestRecord = result[0];
        const currentTime = new Date();

        // Check if the OTP matches
        if (latestRecord.otp !== otp) {
            return res.status(200).json({ message: 'Invalid OTP' });
        }

        // Check if the OTP has expired
        if (latestRecord.expiryDate < currentTime) {
            return res.status(200).json({ message: 'OTP has expired' });
        }

        // If OTP is valid, delete other records for the same mobile number
        await otpTrackingSchema.deleteMany({ mobileNumber: data.mobileNumber, _id: { $ne: latestRecord._id } });

        // Check if the mobile number and details exist in the publicUserSchema
        const user = await publicUserSchema.findOne({ mobileNumber: data.mobileNumber });

        if (!user) {
            // If the user doesn't exist, request for name
            return res.status(200).json({"status":"success", message: 'Please provide your name to proceed', nameCode: 1 });
        } else {
            // If the user exists, send a custom code stating okay to proceed
            return res.status(200).json({"status":"success", message: 'Okay to proceed', nameCode: 0 });
        }
    } catch (error) {
        console.error(error);

        // Log the error
        await errorLogBookSchema.create({
            message: `Error while OTP GENERATION User`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
            page: 'OTP GENERATION User',
            functionality: 'To OTP GENERATION User',
            errorMessage: `${JSON.stringify(error) || ''}`
        });

        // Send a generic error response
        res.status(500).json({
            status: "failed",
            msg: 'Failed while processing..',
        });
    }
}

const addPublicUser = async (req, res) => {
    try {

        // Find the maximum value of publicUserId
        const maxUserId = await publicUserSchema.findOne({}, { publicUserId: 1 }).sort({ publicUserId: -1 });
        let newUserId;
        if (maxUserId) {
            const maxNumber = parseInt(maxUserId.publicUserId.split('_')[1]);
            newUserId = `publicUser_${maxNumber + 1}`;
        } else {
            // If no existing records, start with publicUser_1
            newUserId = 'publicUser_1';
        }

        // Add the new user record with the constructed identifier
        const newData = { ...req.body, publicUserId: newUserId }; // Assuming your schema has a field named "publicUserId"

        let data = await publicUserSchema.create(newData);
        console.log("data", data)
        res.status(200).json({ "status":"success", data:data});

    } catch (error) {
        console.log(error)
        const obj = await errorLogBookSchema.create({
            message: `Error while adding public user`,
            stackTrace: JSON.stringify([...error.stack].join('\n')),
            page: 'Adding Public User',
            functionality: 'Add Public User',
            errorMessage: `${JSON.stringify(error) || ''}`
        });
        res.status(500).json({
            status: "failed",
            msg: 'Failed to process the request.',
        });
    }
};




function generateOTP(length) {
    const chars = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += chars[Math.floor(Math.random() * chars.length)];
    }
    return otp;
}

module.exports = {
    getHomeData, getIndividualNewsInfo, employeeTraceCheck, getCategoryNewsPaginated, getCategoryNewsPaginatedOnly, setFCMToken, employeeTracing, employeeTracingManagement, employeeTracingListing, getAllNewsList,
    getDistrictNewsPaginated, getAllNews, requestPublicOTP, validateUserOTP, addPublicUser
}