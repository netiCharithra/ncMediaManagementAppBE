
const newsDataSchema = require('../modals/newsDataSchema');
const errorLogBookSchema = require('../modals/errorLogBookSchema');
const metaDataSchema = require('../modals/metaDataSchema');

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



module.exports = {
    getHomeData, getIndividualNewsInfo
}