const newsDataSchema = require('../../modals/newsDataSchema');
const errorLogBookSchema = require('../../modals/errorLogBookSchema');
const metaDataSchema = require('../../modals/metaDataSchema');
const EmployeeTracing = require('../../modals/employeeTracing')
const reportersSchema = require('../../modals/reportersSchema');

const { getFileTempUrls3 } = require('./../commonApiFunction');
require('dotenv').config();


const getLatestNews = async (req, res) => {
    try {


        const language = req?.body?.language || 'te';

        console.log("hii",req?.body?.language)
        const result = await newsDataSchema.aggregate([
            {
                $match: {
                    approvedOn: { $gt: 0 },
                    language: language,
                    rejected: false
                }
            },
            {
                $sort: { newsId: -1 }
            },
            {
                $limit: 13
            }
        ]);

        console.log(result)
        res.status(200).json({
            status: "success",
            msg: "Success",
            data: result
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



const getNewsTypeCategorizedNews = async (req, res) => {
    try {

        console.log("i")
        const language = req?.body?.language || 'te';


        let newsTypesList = await metaDataSchema.findOne({ type: 'NEWS_TYPE_REGIONAL' });

        newsTypes = newsTypesList?.data || []

        const aggregateQuery = [
            {
                $facet: {
                    regionalNews: [
                        {
                            $match: {
                                newsType: 'Regional',
                                approvedOn: { $gt: 0 },
                                language: language,
                                rejected: false
                            }
                        },
                        { $sort: { newsId: -1 } },

                        { $limit: 5 }
                    ],
                    nationalNews: [
                        {
                            $match: {
                                newsType: 'National',
                                approvedOn: { $gt: 0 },
                                language: language,
                                rejected: false
                            }
                        },
                        { $sort: { newsId: -1 } },

                        { $limit: 5 }
                    ],
                    internationalNews: [
                        {
                            $match: {
                                newsType: 'International',
                                approvedOn: { $gt: 0 },
                                language: language,
                                rejected: false
                            }
                        },
                        { $sort: { newsId: -1 } },

                        { $limit: 5 }
                    ]
                }
            },
            {
                $project: {
                    types: {
                        $map: {
                            input: newsTypes,
                            as: "type",
                            in: {
                                type: "$$type",
                                records: {
                                    $cond: {
                                        if: { $eq: ["$$type.value", "Regional"] },
                                        then: "$regionalNews",
                                        else: {
                                            $cond: {
                                                if: { $eq: ["$$type.value", "National"] },
                                                then: "$nationalNews",
                                                else: "$internationalNews"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ];
        let result = await newsDataSchema.aggregate(aggregateQuery)

        // for (let index = 0; index < result?.[0]?.['types'].length; index++) {

        //     result[0]['types'][index]['records'] = await fetchTempUrls(result[0]['types'][index]['records'])


        // }


        res.status(200).json({
            status: "success",
            msg: 'Success',
            data: result

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
const getNewsCategoryCategorizedNews = async (req, res) => {
    try {


        const language = req?.body?.language || 'te';

        const aggregateQuery = [{
            $match: {
                approvedOn: { $gt: 0 },
                language: language,
                rejected: false
            }
        },
        {
            $sort: { newsId: -1 }
        },
        {
            $group: {
                _id: "$category",
                news: { $push: "$$ROOT" }
            }
        },
        {
            $project: {
                _id: 0,
                category: "$_id",
                news: { $slice: ["$news", 5] }
            }
        }]
        let result = await newsDataSchema.aggregate(aggregateQuery)

        for (let index = 0; index < result?.length; index++) {
            result[index]['news'] = await fetchTempUrls(result[index]['news'])
        }
        res.status(200).json({
            status: "success",
            msg: 'Success',
            data: result

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
const getCategoryNewsPaginatedOnly = async (req, res) => {
    // let page starts from zero;
    // let viewersData = await metaDataSchema.updateOne(
    //     { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
    //     { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    // )
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
        // let specificRecordWithTempURL = await Promise.all(newsInfo[0].records.map(async record => {
        //     let imagesWithTempURL = await Promise.all(record.images.map(async image => {
        //         let tempURL = await getFileTempUrls3(image.fileName);
        //         return { ...image, tempURL };
        //     }));
        //     return { ...record, images: imagesWithTempURL };
        // }));

        res.status(200).json({
            status: "success",
            data: {
                records: newsInfo[0].records,
                endOfRecords: endOfRecords,
            }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}



const fetchTempUrls = async (records) => {
    return await Promise.all(records.map(async (record) => {
        await Promise.all(record.images.map(async (elementImg) => {
            if (elementImg?.fileName || elementImg?.name) {

                elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
            }
        }));

        // const fileURLTemp = await getFileTempUrls3(record.fileName);
        // return { ...record, tempURL: fileURLTemp };
        return record;
    }));
};



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
    let language = req?.body?.language || 'te'
    let newsInfo = await newsDataSchema.aggregate([
        {
            $facet: {
                recentRecords: [
                    {
                        $match: {
                            approvedOn: { $gt: 0 },
                            language: language,
                            rejected: false
                        }
                    },
                    {
                        $sort: { newsId: -1 } // Sort by createdDate in descending order
                    },
                    {
                        $limit: 5 // Limit to 5 records
                    }
                ],
                specificRecord: [
                    {
                        $match: { newsId: parseInt(req?.body?.newsId) } // Match specific newsId
                    },
                    {
                        $limit: 1 // Limit to 1 record
                    }
                ]
            }
        },
    ]);

    // Fetching tempURL for each image in recentRecords and specificRecord

    let recentRecordsWithTempURL = await fetchTempUrls(newsInfo[0].recentRecords)
    let specificRecordWithTempURL = await fetchTempUrls(newsInfo[0].specificRecord)

    if (specificRecordWithTempURL?.[0]?.['reportedBy']?.['profilePicture']?.['fileName']) {
        specificRecordWithTempURL[0]['reportedBy']['profilePicture']['tempURL'] = await getFileTempUrls3(specificRecordWithTempURL[0]['reportedBy']['profilePicture']['fileName']);
    }



    // let value = await metaDataSchema.findOne({ type: 'NEWS_CATEGORIES' });

    let responseData = {
        recentRecords: recentRecordsWithTempURL,
        specificRecord: specificRecordWithTempURL,
        // categories: value.data
    };

    res.status(200).json({
        status: "success",
        data: responseData
    });
}



const getCategoryWiseCount = async (req, res) => {
    try {
        const language = req?.body?.language || 'te';
        
        const result = await newsDataSchema.aggregate([
            {
                $match: {
                    approvedOn: { $gt: 0 },
                    language: language,
                    rejected: false
                }
            },
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    category: "$_id",
                    count: 1,
                    _id: 0
                }
            }
        ]);

        res.status(200).json({
            status: "success",
            msg: "Success",
            data: result
        });

    } catch (error) {
        console.error(error);
        await errorLogBookSchema.create({
            message: `Error while fetching category-wise count`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Category Count',
            functionality: 'Error while fetching category-wise count',
            errorMessage: `${JSON.stringify(error) || ''}`
        });
        res.status(200).json({
            status: "failed",
            msg: 'Failed while processing..',
        });
    }
}

const employeeTraceCheck = async (req, res) => {
    try {


        const currentDate = new Date().getTime();
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
            const employeeInfoList = await reportersSchema.find({ employeeId: { $in: employeeIds } })
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

module.exports = {
    getLatestNews, getIndividualNewsInfo, getMetaData, getNewsTypeCategorizedNews, getNewsCategoryCategorizedNews, getCategoryNewsPaginatedOnly, getCategoryWiseCount, employeeTraceCheck
}