const errorLogBookSchema = require('../../../modals/errorLogBookSchema');
const metaDataSchema = require('../../../modals/metaDataSchema');
const newsDataSchema = require('../../../modals/newsDataSchema');
const reportersSchema = require('../../../modals/reportersSchema');
const { generateDownloadUrl } = require('../utils/s3Utils');

require('dotenv').config();




const getPriorityNews = async (req, res) => {
    try {

        let aggregationPipeline = [
            // Match stage to filter records
            {
                $match: {
                    approvedOn: { $gt: 0 }, // approvedOn should be greater than zero
                    language: req?.body?.language || 'te',
                    // deletedOn: { $exists: false } // deletedOn should not exist
                    rejected: false
                }
            },
            // Sort stage to sort by priorityIndex and newsId
            {
                $sort: {
                    priorityIndex: -1, // Sort by priorityIndex in descending order (higher priority first)
                    newsId: -1 // Sort by newsId in descending order (latest news first)
                }
            },
            // Limit stage to get top 5 records
            { $limit: req?.body?.count || 5 }
        ]

        if (req?.body?.category) {
            aggregationPipeline[0]['$match']['category'] = req.body.category
        }
        if (req?.body?.newsType) {
            aggregationPipeline[0]['$match']['newsType'] = req.body.newsType
        }

        let data = await newsDataSchema.aggregate(aggregationPipeline)


        data = await fetchTempUrls(data)

        res.status(200).json({
            status: "success",
            data: data
        });


    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: 'Failed to process the request.',
        });
    }

}

const getLatestNews = async (req, res) => {
    try {


        console.log("ojho")

        // let page starts from zero;
        let viewersData = await metaDataSchema.updateOne(
            { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
            { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
        )
        const recordsPerPage = req?.body?.count || 10;
        const pageNumber = req?.body?.page || 0;
        const skipRecords = pageNumber * recordsPerPage;

        let aggregationPipeline = [
            // Match stage to filter records
            {
                $match: {
                    approvedOn: { $gt: 0 }, // Filtering for approved records
                    // category: req.body.category, // Match the specific category
                    language: req.body.language // Match the specific language
                }
            },
            // Sort stage to sort by newsId in descending order
            {
                $sort: { newsId: -1 }
            },
            // Skip stage to skip records based on page number
            {
                $skip: skipRecords
            },
            // Limit stage to limit records per page
            {
                $limit: recordsPerPage
            }
        ];
        if (req?.body?.category) {
            aggregationPipeline[0]['$match']['category'] = req.body.category
        }
        if (req?.body?.newsType) {
            aggregationPipeline[0]['$match']['newsType'] = req.body.newsType
        }


        try {
            let newsInfo = await newsDataSchema.aggregate(aggregationPipeline);
            console.log(req?.body)
            let endOfRecords = newsInfo.length === 0; // Set endOfRecords to true if no records are fetched
            // Fetch temporary URLs for images
            newsInfo = await fetchTempUrls(newsInfo)
            // await Promise.all(newsInfo.map(async (record) => {
            //     await Promise.all(record.images.map(async (elementImg) => {
            //         elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
            //     }));
            // }));


            res.status(200).json({
                status: "success",
                // newsInfo
                data: newsInfo,
                endOfRecords: endOfRecords

            });
        } catch (error) {
            console.error(error);
            throw error;
        }



        // res.status(200).json({
        //     status: "success",
        //     data: data
        // });


    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: 'Failed to process the request.',
            error: error
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


const searchNews = async (req, res) => {
    try {
        const recordsPerPage = req?.body?.count || 10;
        const pageNumber = req?.body?.page || 0;
        const skipRecords = pageNumber * recordsPerPage;

        let searchString = req?.body?.search;
        // if (!searchString) {
        //     res.status(200).json({
        //         status: "failed",
        //         msg: 'Search is required',
        //     });
        //     return
        // }
        let aggregationPipeline = [
            {
                $match: {
                    $or: [
                        { title: { $regex: searchString, $options: 'i' } },
                        { sub_title: { $regex: searchString, $options: 'i' } }
                    ],
                    approvedOn: { $gt: 0 } // Filtering for approved records
                }
            },
            {
                $sort: { newsId: -1 } // Sorting by newsId in descending order
            },
            {
                $skip: skipRecords
            },
            // Limit stage to limit records per page
            {
                $limit: recordsPerPage
            }
        ]
        if (req?.body?.category) {
            aggregationPipeline[0]['$match']['category'] = req.body.category
        }
        const results = await newsDataSchema.aggregate(aggregationPipeline);
        const endOfRecords = results.length === 0; // Set endOfRecords to true if no records are fetched
        await Promise.all(results.map(async (record) => {
            await Promise.all(record.images.map(async (elementImg) => {
                elementImg.tempURL = await generateDownloadUrl(elementImg?.fileName || elementImg?.name);
            }));
        }));

        res.status(200).json({
            status: "success",
            // newsInfo
            data: results,
            endOfRecords: endOfRecords

        });
    } catch (error) {
        // console.error(error)
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: 'Failed to process the request.',
        });
    }
}



const getIndividualNewsInfo = async (req, res) => {
    try {
        console.log("CALL FROM MBILE 2")
        console.log(req.body)

        let aggregationPipeline = [
            // Match stage to filter records
            {
                $match: {
                    approvedOn: { $gt: 0 }, // approvedOn should be greater than zero
                    language: req?.body?.language || 'en',
                    // deletedOn: { $exists: false } // deletedOn should not exist
                    rejected: false
                }
            },
            // Sort stage to sort by priorityIndex and newsId
            {
                $sort: {
                    priorityIndex: -1, // Sort by priorityIndex in descending order (higher priority first)
                    newsId: -1 // Sort by newsId in descending order (latest news first)
                }
            },
            // Limit stage to get top 5 records
            { $limit: 5 }
        ]

        if (req?.body?.category) {
            aggregationPipeline[0]['$match']['category'] = req.body.category
        }
        if (req?.body?.newsType) {
            aggregationPipeline[0]['$match']['newsType'] = req.body.newsType
        }

        let data = await newsDataSchema.aggregate(aggregationPipeline)
        // console.log(data.length)


        data = await fetchTempUrls(data)

        // console.log(data)
        // // Fetch temporary URLs for images
        // await Promise.all(data.map(async (record) => {
        //     await Promise.all(record.images.map(async (elementImg) => {
        //         elementImg.tempURL = await getFileTempUrls3(elementImg?.fileName || elementImg?.name);
        //     }));
        // }));
        res.status(200).json({
            status: "success",
            data: data
        });


    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: 'Failed to process the request.',
        });
    }
}


const getHelpTeam = async (req, res) => {
    try {
        console.log("CALL FROM MBILE")
        console.log(req.body)
        let teamRoles = req?.body?.roles || ["CEO", "INCHARGE DIRECTOR", "MANAGEMENT LEAD"];
        var users = await reportersSchema.find({ role: { $in: teamRoles } }).select('profilePicture name mail role');

        var dataCopy = users.map(user => ({
            ...user.toObject(), // Convert Mongoose Document to a plain JavaScript object
            // tempURL: null 
        }));
        // Function to update tempURL for each user
        async function updateTempURLs(dataCopy) {
            // Map over the dataCopy array to create an array of promises
            const updatedData = await Promise.all(dataCopy.map(async (user) => {
                console.log(user)
                const tempURLProfile = await generateDownloadUrl(user.profilePicture.fileName, undefined, 'employee-docs');
                return { ...user, tempURLProfile }; // Add tempURL to the user object
            }));
            return updatedData;
        }

        // Call the function and get the updated data
        dataCopy = await updateTempURLs(dataCopy);


        console.log(dataCopy)
        // console.log(dataCopy);

        res.status(200).json({
            status: "success",
            data: dataCopy
        });


    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: 'Failed to process the request.',
        });
    }

}
const fetchTempUrls = async (records) => {
    return await Promise.all(records.map(async (record) => {
        await Promise.all(record.images.map(async (elementImg) => {
            if (elementImg?.fileName || elementImg?.name) {

                elementImg.tempURL = await generateDownloadUrl(elementImg?.fileName || elementImg?.name);
            }
        }));

        return record;
    }));
};


module.exports = {
    getPriorityNews, getLatestNews, getMetaData, searchNews, getIndividualNewsInfo, getHelpTeam
}