
const newsDataSchema = require('../modals/newsDataSchema');
const errorLogBookSchema = require('../modals/errorLogBookSchema');
const metaDataSchema = require('../modals/metaDataSchema');

const getHomeData = async (req, res) => {
    try {


        let viewersData = await metaDataSchema.updateOne(
            { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
            { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
        )
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

const getIndividualNewsInfo = async (req,res) => {
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




const getCategoryNewsPaginated = async (req, res) => {
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
                            category: req.body.category // Match the specific category
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
        const records = await newsDataSchema.aggregate(aggregationPipeline);
        const endOfRecords = records[0].records.length === 0; // Set endOfRecords to true if no records are fetched
        let value = await metaDataSchema.findOne({
            type: 'NEWS_CATEGORIES'
        })
        res.status(200).json({
            status: "success",
            data: { records: records[0].records, recentRecords: records[0].recentNews, endOfRecords: endOfRecords, categories:value.data }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}

const setFCMToken = async(req,res)=>{
    try{;

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
        //        console.log("set fcm token");
    }
     catch(err){
        res.status(200).json({
            status: "failed",
            message:"FAILED to STORE"
        });
     }
}
module.exports = {
    getHomeData, getIndividualNewsInfo, getCategoryNewsPaginated, setFCMToken
}