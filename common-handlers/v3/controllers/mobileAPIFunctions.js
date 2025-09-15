const errorLogBookSchema = require('../../../modals/errorLogBookSchema');
const metaDataSchema = require('../../../modals/metaDataSchema');
const newsDataSchema = require('../../../modals/newsDataSchema');
const newsFramesSchema = require('../../../modals/newsFramesSchema');
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

const getNewsFrames = async (req, res) => {
    try {
        console.log('Request body:', JSON.stringify(req.body));
        const { action, page = 1, count = 10, language, category } = req.body; // Pagination & filters
        const now = new Date().getTime();
        // Adjust for 1-based pagination (page 1 should skip 0 records)
        const skipRecords = (page - 1) * count;
        console.log('Filters:', { action, page, count, language, category, now, skipRecords });

        // Build the filter based on action
        let matchFilter = {};
        console.log('Current timestamp (now):', now);
        
        // Default to showing all frames if no action is specified
        if (!action) {
            console.log('No action specified, showing all frames');
        } else if (action === "Active") {
            console.log('Filtering for Active frames');
            matchFilter = { validFrom: { $lte: now }, validTo: { $gte: now } };
        } else if (action === "Expired") {
            console.log('Filtering for Expired frames');
            matchFilter = { validTo: { $lt: now } };
        } else if (action === "Upcoming") {
            console.log('Filtering for Upcoming frames');
            matchFilter = { validFrom: { $gt: now } };
        } else {
            console.log('Unknown action:', action, 'showing all frames');
        }
        // Optional filters
        if (language) matchFilter.frameLanguage = language;
        if (category) matchFilter.category = category;

        // Aggregation pipeline for pagination
        let aggregationPipeline = [
            { $match: matchFilter },
            { $sort: { validFrom: -1 } }, // Sort newest first
            { $skip: skipRecords },
            { $limit: count }
        ];
        
        console.log('Match filter:', JSON.stringify(matchFilter));
        console.log('Aggregation pipeline:', JSON.stringify(aggregationPipeline));
        
        // Get total count of records matching the filter for metadata
        const totalRecords = await newsFramesSchema.countDocuments(matchFilter);
        console.log('Total records matching filter:', totalRecords);
        
        if (totalRecords === 0) {
            console.log('No records found matching the filter');
            return res.status(200).json({
                status: "success",
                data: {
                    data: [],
                    metaData: {
                        totalRecords: 0,
                        endOfRecords: true,
                        actions: [ {
                            "type": "button",
                            "tooltip": "Edit",
                            "icon": "fa-solid fa-pen-to-square text-primary",
                            "key": "edit"
                        }, {
                            "type": "button",
                            "tooltip": "View",
                            "icon": "fa-solid fa-eye text-success",
                            "key": "view"
                        }, {
                            "type": "button",
                            "tooltip": "Configure",
                            "icon": "fa-solid fa-gear text-warning",
                            "key": "configure"
                        }]
                    }
                },
                message: 'No news frames found matching the criteria'
            });
        }
        
        // Now run the actual query with filters
        let newsData = await newsFramesSchema.aggregate(aggregationPipeline);
        console.log('Query results count with filters:', newsData.length);

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalRecords / count);
        const endOfRecords = page >= totalPages;

        // Format response with the requested structure
        res.status(200).json({
            status: "success",
            data: {
                data: newsData,
                metaData: {
                    totalRecords,
                    endOfRecords,
                    actions: [{
                        "type": "button",
                        "tooltip": "Edit",
                        "icon": "fa-solid fa-pen-to-square text-primary",
                        "key": "edit"
                    }, {
                        "type": "button",
                        "tooltip": "View",
                        "icon": "fa-solid fa-eye text-success",
                        "key": "view"
                    }, {
                        "type": "button",
                        "tooltip": "Configure",
                        "icon": "fa-solid fa-gear text-secondary",
                        "key": "configure"
                    }]
                },

            },
            message: 'News frames retrieved successfully'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: 'Failed to process the request.',
            error: error.message
        });
    }
};

const addNewsFrame = async (req, res) => {
    try {
        // Check if data is in the nested structure or direct structure
        const data = req.body.data || req.body;
        const { 
            frameName, 
            frameData, 
            validFrom, 
            validTo, 
            frameLanguage,
            containerHeight = 535,
            frameHeight = 515,
            textPosition = {
                topPercent: 23, // 23% from the top
                leftPercent: 3, // 3% from the left
                frameReductionWidthPercent: 6, // 6% reduction in width
                contentHeight: 75 // 75% of the frame height
            }
        } = data;

        if (!frameName || !frameData || !validFrom || !validTo) {
            return res.status(400).json({
                status: "failed",
                msg: "Missing required fields"
            });
        }

        // Get latest frameId
        const lastFrame = await newsFramesSchema.findOne().sort({ frameId: -1 });
        const newFrameId = lastFrame ? lastFrame.frameId + 1 : 1;

        const newFrame = new newsFramesSchema({
            frameId: newFrameId,
            frameName,
            frameData,   // stored as object
            validFrom,
            validTo,
            frameLanguage: frameLanguage || 'te',
            containerHeight,
            frameHeight,
            textPosition,
            createdDate: Date.now(),
            createdBy: req.body.employeeId || req.body._id || 'system'
        });

        const savedFrame = await newFrame.save();

        res.status(200).json({
            status: "success",
            data: savedFrame
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: "Failed to add record",
            error: error.message
        });
    }
};

const updateNewsFrame = async (req, res) => {
    try {
        // Check if data is in the nested structure or direct structure
        const data = req.body.data || req.body;
        const { 
            frameId, 
            frameName, 
            validFrom, 
            validTo, 
            frameLanguage,
            containerHeight,
            frameHeight,
            textPosition
        } = data;

        // Validate required fields
        if (!frameId) {
            return res.status(400).json({
                status: "failed",
                msg: "frameId is required"
            });
        }

        // Find the existing frame
        const existingFrame = await newsFramesSchema.findOne({ frameId });
        
        if (!existingFrame) {
            return res.status(404).json({
                status: "failed",
                msg: "News frame not found"
            });
        }

        // Prepare update object with only the fields that are provided
        const updateData = {};
        
        if (frameName) updateData.frameName = frameName;
        if (validFrom) updateData.validFrom = validFrom;
        if (validTo) updateData.validTo = validTo;
        if (frameLanguage) updateData.frameLanguage = frameLanguage;
        if (containerHeight) updateData.containerHeight = containerHeight;
        if (frameHeight) updateData.frameHeight = frameHeight;
        
        // Handle textPosition object - check if any of its properties are provided
        if (textPosition) {
            // If textPosition is provided as a complete object, use it directly
            if (typeof textPosition === 'object') {
                // Merge with existing textPosition to ensure all properties are preserved
                updateData.textPosition = {
                    ...existingFrame.textPosition || {},
                    ...textPosition
                };
            }
        }
        
        // Add update metadata
        updateData.updatedDate = new Date().getTime();
        updateData.updatedBy = req.body.employeeId || req.body._id || 'system';

        // Update the frame
        const updatedFrame = await newsFramesSchema.findOneAndUpdate(
            { frameId },
            { $set: updateData },
            { new: true } // Return the updated document
        );

        res.status(200).json({
            status: "success",
            data: updatedFrame,
            msg: "News frame updated successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: "Failed to update news frame",
            error: error.message
        });
    }
};

/**
 * Get information about a specific news frame by its ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getNewsFrameById = async (req, res) => {
    try {
        // Get frameId from request body
        const { frameId } = req.body;

        // Validate required fields
        if (!frameId) {
            return res.status(400).json({
                status: "failed",
                msg: "frameId is required"
            });
        }

        // Find the frame by ID
        let frame = await newsFramesSchema.findOne({ frameId });

        frame['frameData']['tempURL']=await generateDownloadUrl(frame['frameData']['fileName'],3600, 'news-frames');
        
        if (!frame) {
            return res.status(404).json({
                status: "failed",
                msg: "News frame not found"
            });
        }

        // Return the frame data
        res.status(200).json({
            status: "success",
            data: frame,
            msg: "News frame retrieved successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: "Failed to retrieve news frame",
            error: error.message
        });
    }
};

/**
 * Get all active news frames with temporary URLs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getActiveNewsFrames = async (req, res) => {
    try {
        const now = new Date().getTime();
        
        // Filter for active frames (current time is between validFrom and validTo)
        const matchFilter = { validFrom: { $lte: now }, validTo: { $gte: now } };
        
        // Add optional language filter if provided
        if (req.body.language) {
            matchFilter.frameLanguage = req.body.language;
        }
        
        // Add optional category filter if provided
        if (req.body.category) {
            matchFilter.category = req.body.category;
        }
        
        // Get all active frames
        const frames = await newsFramesSchema.find(matchFilter).sort({ validFrom: -1 });
        
        // Add temporary URLs to all frames
        const framesWithUrls = await Promise.all(frames.map(async (frame) => {
            // Create a plain JavaScript object from the Mongoose document
            const frameObj = frame.toObject();
            
            // Add temporary URL to the frame data
            if (frameObj.frameData && frameObj.frameData.fileName) {
                frameObj.frameData.tempURL = await generateDownloadUrl(
                    frameObj.frameData.fileName,
                    3600, // 1 hour expiry
                    'news-frames'
                );
            }
            
            return frameObj;
        }));
        
        // Return the frames with temporary URLs
        res.status(200).json({
            status: "success",
            data: framesWithUrls,
            message: "Active news frames retrieved successfully"
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "failed",
            msg: "Failed to retrieve active news frames",
            error: error.message
        });
    }
};

module.exports = {
    getPriorityNews, getLatestNews, getMetaData, searchNews, getIndividualNewsInfo, getHelpTeam, getNewsFrames, addNewsFrame, updateNewsFrame, getNewsFrameById, getActiveNewsFrames
}