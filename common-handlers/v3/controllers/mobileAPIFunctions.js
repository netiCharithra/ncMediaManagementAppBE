const errorLogBookSchema = require('../../../modals/errorLogBookSchema');
const metaDataSchema = require('../../../modals/metaDataSchema');
const newsDataSchema = require('../../../modals/newsDataSchema');
const newsFramesSchema = require('../../../modals/newsFramesSchema');
const reportersSchema = require('../../../modals/reportersSchema');
const { generateDownloadUrl } = require('../utils/s3Utils');
const MobileScreenManagement = require('../../../modals/mobileScreenManagementSchema');
const employeeTracing = require('../../../modals/employeeTracing');
const MobileUser = require('../../../modals/mobileUserSchema');

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
        console.log("CALL FROM MOBILE - getIndividualNewsInfo")
        console.log(req.body)

        if (!req.body.newsId) {
            return res.status(200).json({
                status: "failed",
                msg: 'News ID is required'
            });
        }

        // Find the specific news item by newsId
        let newsItem = await newsDataSchema.findOne({
            newsId: parseInt(req.body.newsId),
            approved: true,
            rejected: false
        });

        if (!newsItem) {
            return res.status(200).json({
                status: "failed",
                msg: 'News not found or not approved'
            });
        }

        // Convert to plain object and add tempURL to image
        let newsData = newsItem.toObject();
        
        if (newsData.images && newsData.images.length > 0 && newsData.images[0].fileName) {
            newsData.images[0].tempURL = await generateDownloadUrl(newsData.images[0].fileName, 3600, 'articles');
        }

        // Increment view count
        await newsDataSchema.updateOne(
            { newsId: parseInt(req.body.newsId) },
            { $inc: { viewCount: 1 } }
        );

        res.status(200).json({
            status: "success",
            data: newsData
        });

    } catch (error) {
        console.error("Error in getIndividualNewsInfo:", error);
        res.status(200).json({
            status: "failed",
            msg: 'Failed to fetch news details',
            error: error.message
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
                console.log("Element Image", elementImg)
                elementImg.tempURL = await generateDownloadUrl(elementImg?.fileName || elementImg?.name);
                console.log("Element Image", elementImg)
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
            createdDate: new Date().getTime(),
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

/**
 * Get screen permissions for a specific employee
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getScreenPermissions = async (req, res) => {
    try {
        const { employeeId } = req.body;

        if (!employeeId) {
            return res.status(200).json({
                status: "failed",
                msg: "Employee ID is required"
            });
        }

        // Find the screen permissions for the employee
        const screenPermissions = await MobileScreenManagement.findOne({ employeeId });

        if (!screenPermissions) {
            // If no permissions are found, create a temporary object with schema defaults
            // This won't be saved to the database, just used for the response
            const tempScreenPermissions = new MobileScreenManagement({
                employeeId
            });
            
            return res.status(200).json({
                status: "success",
                data: {
                    employeeId,
                    screens: tempScreenPermissions.screens
                },
                msg: "Default screen permissions retrieved"
            });
        }

        // Return the found permissions
        res.status(200).json({
            status: "success",
            data: screenPermissions,
            msg: "Screen permissions retrieved successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: "Failed to retrieve screen permissions",
            error: error.message
        });
    }
};

/**
 * Update screen permissions for a specific employee
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateScreenPermissions = async (req, res) => {
    try {
        const { employeeId, permissions, loggedEmployeeId } = req.body;

        if (!employeeId || !permissions) {
            return res.status(200).json({
                status: "failed",
                msg: "Employee ID and permissions object are required"
            });
        }
        
        // Authorization check: Only NC-AP-1 can update permissions for NC-AP-1
        // If the target employeeId is NC-AP-1, verify the logged employee is also NC-AP-1
        if (employeeId === 'NC-AP-1' && loggedEmployeeId !== 'NC-AP-1') {
            return res.status(403).json({
                status: "failed",
                msg: "Not authorized to update permissions for this employee"
            });
        }

        // Import the schema here to avoid circular dependencies

        // Find existing permissions
        let screenPermissions = await MobileScreenManagement.findOne({ employeeId });

        if (!screenPermissions) {
            // Create new permissions if none exist
            
            // Apply the same authorization check for creation
            if (employeeId === 'NC-AP-1' && loggedEmployeeId !== 'NC-AP-1') {
                return res.status(403).json({
                    status: "failed",
                    msg: "Not authorized to create permissions for this employee"
                });
            }
            
            // Create new permissions object with the provided structure
            screenPermissions = new MobileScreenManagement({
                employeeId,
                screens: {
                    dashboard: permissions.dashboard || false,
                    newsManagement: permissions.newsManagement || false,
                    employeeManagement: permissions.employeeManagement || false,
                    employeeTracing: permissions.employeeTracing || false,
                    newsFrameManagement: permissions.newsFrameManagement || false,
                    userScreensPermissionManagement: permissions.userScreensPermissionManagement || false
                },
                createdOn: new Date().getTime(),
                createdBy: req.body.adminId || loggedEmployeeId || 'system'
            });
            await screenPermissions.save();

            return res.status(200).json({
                status: "success",
                data: screenPermissions,
                msg: "Screen permissions created successfully"
            });
        }

        // Update existing permissions with the new structure
        screenPermissions.screens = {
            dashboard: permissions.dashboard !== undefined ? permissions.dashboard : screenPermissions.screens.dashboard,
            newsManagement: permissions.newsManagement !== undefined ? permissions.newsManagement : screenPermissions.screens.newsManagement,
            employeeManagement: permissions.employeeManagement !== undefined ? permissions.employeeManagement : screenPermissions.screens.employeeManagement,
            employeeTracing: permissions.employeeTracing !== undefined ? permissions.employeeTracing : screenPermissions.screens.employeeTracing,
            newsFrameManagement: permissions.newsFrameManagement !== undefined ? permissions.newsFrameManagement : screenPermissions.screens.newsFrameManagement,
            userScreensPermissionManagement: permissions.userScreensPermissionManagement !== undefined ? permissions.userScreensPermissionManagement : screenPermissions.screens.userScreensPermissionManagement
        };
        screenPermissions.lastUpdatedOn = new Date().getTime();
        screenPermissions.lastUpdatedBy = req.body.adminId || loggedEmployeeId || 'system';
        await screenPermissions.save();

        res.status(200).json({
            status: "success",
            data: screenPermissions,
            msg: "Screen permissions updated successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: "Failed to update screen permissions",
            error: error.message
        });
    }
};

/**
 * Toggle a specific screen permission for an employee
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const toggleScreenPermission = async (req, res) => {
    try {
        const { employeeId, screenName, isEnabled, loggedEmployeeId } = req.body;

        if (!employeeId || !screenName || isEnabled === undefined) {
            return res.status(200).json({
                status: "failed",
                msg: "Employee ID, screen name, and isEnabled flag are required"
            });
        }
        
        // Authorization check: Only NC-AP-1 can update permissions for NC-AP-1
        // If the target employeeId is NC-AP-1, verify the logged employee is also NC-AP-1
        if (employeeId === 'NC-AP-1' && loggedEmployeeId !== 'NC-AP-1') {
            return res.status(403).json({
                status: "failed",
                msg: "Not authorized to update permissions for this employee"
            });
        }

        // Valid screen names for the new schema structure
        const validScreens = ['dashboard', 'newsManagement', 'employeeManagement', 'employeeTracing', 'newsFrameManagement', 'userScreensPermissionManagement'];
        
        if (!validScreens.includes(screenName)) {
            return res.status(200).json({
                status: "failed",
                msg: `Invalid screen name. Valid options are: ${validScreens.join(', ')}`
            });
        }

        // Find existing permissions
        let screenPermissions = await MobileScreenManagement.findOne({ employeeId });

        if (!screenPermissions) {
            // Create a new instance with default values from schema
            // Initialize with all permissions set to false
            const initialScreens = {
                dashboard: false,
                newsManagement: false,
                employeeManagement: false,
                employeeTracing: false,
                newsFrameManagement: false,
                userScreensPermissionManagement: false
            };
            
            // Set the specific permission that's being toggled
            initialScreens[screenName] = isEnabled;
            
            screenPermissions = new MobileScreenManagement({
                employeeId,
                screens: initialScreens,
                createdOn: new Date().getTime(),
                createdBy: req.body.adminId || loggedEmployeeId || 'system'
            });
            
            await screenPermissions.save();

            return res.status(200).json({
                status: "success",
                data: screenPermissions,
                msg: `Screen permission for ${screenName} set to ${isEnabled}`
            });
        }

        // Update the specific screen permission
        screenPermissions.screens[screenName] = isEnabled;
        screenPermissions.lastUpdatedOn = new Date().getTime();
        screenPermissions.lastUpdatedBy = req.body.adminId || loggedEmployeeId || 'system';
        await screenPermissions.save();

        res.status(200).json({
            status: "success",
            data: screenPermissions,
            msg: `Screen permission for ${screenName} set to ${isEnabled}`
        });

    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: "Failed to toggle screen permission",
            error: error.message
        });
    }
};

/**
 * Get list of all employees with optional filtering by name or ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getEmployeesList = async (req, res) => {
    try {
        // Use count and page parameters to match admin/news/approved pattern
        const recordsPerPage = req.body?.count || 10;
        const pageNumber = req.body?.page || 1;
        const skipRecords = (pageNumber - 1) * recordsPerPage;
        const searchTerm = req.body?.searchTerm;
        
        // Build the query based on search parameters
        let query = {};
        
        // If searchTerm is provided, search by name or employeeId
        if (searchTerm) {
            query = {
                $or: [
                    { name: { $regex: searchTerm, $options: 'i' } }, // Case-insensitive name search
                    { employeeId: { $regex: searchTerm, $options: 'i' } } // Case-insensitive employeeId search
                ]
            };
        }
        
        // Execute the query with pagination
        const employees = await reportersSchema.find(query)
            .select('name employeeId mail mobile state district mandal role activeUser') // Select only needed fields
            .skip(skipRecords)
            .limit(recordsPerPage)
            .sort({ employeeId: 1 }); // Sort by name in ascending order
        
        // Get total count for pagination
        const totalRecords = await reportersSchema.countDocuments(query);
        
        // Calculate if this is the end of records
        const endOfRecords = (pageNumber * recordsPerPage) >= totalRecords;
        
        // Format response to match admin/news/approved pattern
        let responseData = {
            employeesList: {
                tableData: {
                    bodyContent: employees
                },
                metaData: {
                    title: "Employees List"
                }
            }
        };
        
        res.status(200).json({
            status: "success",
            msg: "Employees retrieved successfully",
            data: { ...responseData, totalRecords, endOfRecords }
        });
        
    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: "Failed to retrieve employees list",
            error: error.message
        });
    }
};


const logNewsFrameSharing = async (req, res) => {
    try {
        const { employeeId, newsId, frameId } = req.body;
        
        // Find the news frame by newsId field
        const newsFrame = await newsDataSchema.findOne({ newsId });
        
        if (!newsFrame) {
            return res.status(200).json({
                status: "failed",
                msg: "News frame not found"
            });
        }
        
        // Update the news frame's sharing info
        newsFrame.newsFrameSharingInfo.employeeIds.push(employeeId);
        newsFrame.newsFrameSharingInfo.timestamps.push(new Date().getTime());
        newsFrame.newsFrameSharingInfo.frameIds.push(frameId);
        await newsFrame.save();
        
        res.status(200).json({
            status: "success",
            msg: "News frame shared successfully"
        });
        
    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: "failed",
            msg: "Failed to share news frame",
            error: error.message
        });
    }
};


const newsSharingAnalytics = async (req, res) => {
    try {
        const { fromDate, toDate, newsType, state, district, mandal } = req.body;
        const today = new Date();
        const startOfToday = new Date(today);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTodayEpoch = startOfToday.getTime();

        // Build base query
        let baseQuery = {
            rejected: false,
            approved: true,
            deleted: false
        };

        // Add date range if provided
        if (fromDate || toDate) {
            baseQuery.createdDate = {};
            if (fromDate) baseQuery.createdDate.$gte = fromDate;
            if (toDate) baseQuery.createdDate.$lte = toDate;
            console.log("fromDate", new Date(fromDate))
            console.log("toDate", new Date(toDate))
        }

        // Add location filters hierarchically
        if (newsType){
            console.log("newsType", newsType)
             baseQuery[newsType === "Regional"?'newsType':'category'] = newsType
        };
        if (state) baseQuery.state = state;
        if (district) baseQuery.district = district;
        if (mandal) baseQuery.mandal = mandal;

        // Get active employees count using aggregation
        const activeEmployeesResult = await employeeTracing.aggregate([
            {
                $match: {
                    $and: [
                        { startDate: { $lte: today.getTime() } },
                        { endDate: { $gte: today.getTime() } }
                    ]
                }
            },
            {
                $group: {
                    _id: null,
                    employeeIds: { $addToSet: "$employeeId" },
                    employeeMap: {
                        $push: {
                            k: "$employeeId",
                            v: "$name"
                        }
                    }
                }
            }
        ]);

        const activeEmployeeIds = new Set(activeEmployeesResult[0]?.employeeIds || []);
        
        // Get employee names from reporterSchema
        const reporters = await reportersSchema.find(
            { employeeId: { $in: Array.from(activeEmployeeIds) } },
            { employeeId: 1, name: 1, _id: 0 }
        );

        // Create employee map from reporters
        const employeeMap = reporters.reduce((acc, reporter) => {
            acc[reporter.employeeId] = reporter.name;
            return acc;
        }, {});

        // Get overall counts (with location filters but no date filter)
        const overallQuery = { ...baseQuery };
        delete overallQuery.createdDate;  // Remove date filter for overall counts
        
        const overallArticles = await newsDataSchema.find(
            overallQuery,
            { newsType: 1, 'newsFrameSharingInfo.employeeIds': 1 }
        );

        // Calculate overall totals
        let totalShares = 0;
        const overallNewsTypeTotal = {};
        const overallSharedArticles = overallArticles.filter(article => {
            if (article.newsFrameSharingInfo?.employeeIds?.length > 0) {
                totalShares += article.newsFrameSharingInfo.employeeIds.length;
                return true;
            }
            return false;
        });

        // Count overall articles by type
        overallArticles.forEach(article => {
            overallNewsTypeTotal[article.newsType] = (overallNewsTypeTotal[article.newsType] || 0) + 1;
        });

        // Get articles created in date range if provided
        let rangeArticles = [];
        let rangeShares = 0;
        let rangeTotalArticles = 0;
        let rangeNonShares = 0;

        if (fromDate && toDate) {
            // Get all articles created in the range (using all filters)
            rangeArticles = await newsDataSchema.find(
                baseQuery,
                { 
                    newsType: 1, 
                    'newsFrameSharingInfo.employeeIds': 1, 
                    'newsFrameSharingInfo.timestamps': 1,
                    createdDate: 1,
                    state: 1,
                    district: 1,
                    mandal: 1
                }
            );

            // Calculate range statistics
            rangeTotalArticles = rangeArticles.length;
            
            // Count articles that have been shared (from the articles created in range)
            const rangeSharedArticles = rangeArticles.filter(article => 
                article.newsFrameSharingInfo?.employeeIds?.length > 0
            );
            rangeShares = rangeSharedArticles.length;
            rangeNonShares = rangeTotalArticles - rangeShares;
        }

        // Initialize counters for filtered data
        let todaysShares = 0;
        const filteredNewsTypeCount = {};
        const filteredNewsTypeTotal = {};
        const employeeShareCount = {};

        // Process articles for today's shares and employee counts
        const allArticles = await newsDataSchema.find(
            { rejected: false, approved: true, deleted: false },
            { 
                'newsFrameSharingInfo.employeeIds': 1, 
                'newsFrameSharingInfo.timestamps': 1
            }
        );

        allArticles.forEach(article => {
            if (!article.newsFrameSharingInfo?.employeeIds) return;

            article.newsFrameSharingInfo.employeeIds.forEach((empId, index) => {
                const shareTimestamp = article.newsFrameSharingInfo.timestamps[index];
                
                // Count today's shares
                if (shareTimestamp >= startOfTodayEpoch) {
                    todaysShares++;
                }

                // We don't need to count range shares here anymore
                // Range shares are now counted based on article creation date

                // Count employee shares
                if (activeEmployeeIds.has(empId)) {
                    employeeShareCount[empId] = (employeeShareCount[empId] || 0) + 1;
                }
            });
        });

        // Prepare top employees list
        const topEmployees = Object.entries(employeeShareCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([employeeId, shareCount]) => ({
                name: employeeMap[employeeId] || 'Unknown Employee',
                employeeId,
                shareCount
            }));

        // Prepare news type breakup with totals
        // Prepare news type breakup based on date range
        const newsTypeBreakup = fromDate && toDate ? 
            // If date range provided, use rangeArticles
            Object.values(rangeArticles.reduce((acc, article) => {
                const type = article.newsType;
                if (!acc[type]) {
                    acc[type] = { 
                        label: type, 
                        value: 0,  // shared count
                        total: 0   // total count
                    };
                }
                acc[type].total++;
                if (article.newsFrameSharingInfo?.employeeIds?.length > 0) {
                    acc[type].value++;
                }
                return acc;
            }, {})).sort((a, b) => b.value - a.value)
            : 
            // If no date range, return empty array
            [];

        res.status(200).json({
            status: 'success',
            data: {
                // Overall stats (no date filter)
                totalShares,
                uniqueArticles: overallSharedArticles.length,
                totalArticles: overallArticles.length,
                nonSharedCount: overallArticles.length - overallSharedArticles.length,
                
                // Current day and active stats
                todaysShares,
                activeEmployees: activeEmployeeIds.size,
                
                // Date range stats (based on article creation date)
                rangeShares: fromDate && toDate ? rangeShares : 'N/A',
                rangeTotalArticles: fromDate && toDate ? rangeTotalArticles : 'N/A',
                rangeNonShares: fromDate && toDate ? rangeNonShares : 'N/A',
                
                // Type breakup (value shows filtered count, total shows overall count)
                newsTypeBreakup,
                topEmployees
            }
        });

    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: 'failed',
            msg: 'Failed to get sharing analytics',
            error: error.message
        });
    }
};

// Helper function to get state and district labels
const getLocationLabels = async (state, district) => {
    try {
        const result = { stateName: state, districtName: district };
        
        // Get state label
        if (state) {
            const statesData = await metaDataSchema.findOne({ type: "STATES" });
            const stateInfo = statesData?.data?.find(s => s.value === state);
            if (stateInfo) {
                result.stateName = stateInfo.label;
            }
        }

        // Get district label
        if (state && district) {
            const districtsData = await metaDataSchema.findOne({ type: `${state}_DISTRICTS` });
            const districtInfo = districtsData?.data?.find(d => d.value === district);
            if (districtInfo) {
                result.districtName = districtInfo.label;
            }
        }

        return result;
    } catch (error) {
        console.error('Error getting location labels:', error);
        return { stateName: state, districtName: district };
    }
};

const getNewsWithSharingInfo = async (req, res) => {
    try {
        const { fromDate, toDate, newsType, state, district, mandal, showSharedNews, count = 10, page = 1 } = req.body;
        
        // Calculate pagination
        const skip = (page - 1) * count;

        // Build base query
        let baseQuery = {
            rejected: false,
            approved: true,
            deleted: false
        };

        // Add date range if provided
        if (fromDate || toDate) {
            baseQuery.createdDate = {};
            if (fromDate) baseQuery.createdDate.$gte = fromDate;
            if (toDate) baseQuery.createdDate.$lte = toDate;
            console.log("fromDate", new Date(fromDate).toISOString());
            console.log("toDate", new Date(toDate).toISOString());
        }

        // Add location filters hierarchically
        if (newsType) baseQuery[newsType === "Regional" ? 'newsType' : 'category'] = newsType;
        if (state) baseQuery.state = state;
        if (district) baseQuery.district = district;
        if (mandal) baseQuery.mandal = mandal;

        // Add sharing filter if requested
        if (showSharedNews === true) {
            baseQuery['newsFrameSharingInfo.employeeIds'] = { $exists: true, $ne: [] };
        } else if (showSharedNews === false) {
            baseQuery.$or = [
                { 'newsFrameSharingInfo.employeeIds': { $exists: false } },
                { 'newsFrameSharingInfo.employeeIds': { $eq: [] } }
            ];
        }

        console.log("baseQuery", baseQuery);
        // Get total count
        const totalCount = await newsDataSchema.countDocuments(baseQuery);

        // Get paginated news with required fields
        const news = await newsDataSchema.find(
            baseQuery,
            {
                title: 1,
                newsId: 1,
                category: 1,
                newsType: 1,
                source: 1,
                sourceLink: 1,
                employeeId: 1,
                state: 1,
                district: 1,
                mandal: 1,
                'newsFrameSharingInfo.employeeIds': 1
            }
        )
        .sort({ newsId: -1 })
        .skip(skip)
        .limit(count);

        // Format response with location labels
        const formattedNews = await Promise.all(news.map(async item => {
            // Get employee name
            const reporter = item.employeeId ? 
                await reportersSchema.findOne({ employeeId: item.employeeId }, { name: 1 }) : null;

            // Get state and district labels
            const { stateName, districtName } = await getLocationLabels(item.state, item.district);

            return {
                title: item.title,
                newsId: item.newsId,
                category: item.category,
                newsType: item.newsType,
                source: item.source,
                sourceLink: item.sourceLink,
                employeeId: item.employeeId,
                sharesCount: item.newsFrameSharingInfo?.employeeIds?.length || 0,
                employeeName: reporter?.name || null,
                stateName: stateName,
                districtName: districtName,
                mandal: item.mandal
            };
        }));

        res.status(200).json({
            status: 'success',
            data: formattedNews,
            pagination: {
                totalRecords: totalCount,
                totalPages: Math.ceil(totalCount / count),
                currentPage: page,
                pageSize: count
            }
        });

    } catch (error) {
        console.error(error);
        res.status(200).json({
            status: 'failed',
            msg: 'Failed to fetch news with sharing info',
            error: error.message
        });
    }
};

const registerMobileUser = async (req, res) => {
    try {
        const { token, latitude, longitude, language, userId , platform} = req.body;

        if (!token) {
            return res.status(200).json({
                status: "failed",
                message: "FCM token is required"
            });
        }

        const currentTimestamp = Date.now();

        // Prepare mobile user data
        const mobileUserData = {
            fcmToken: token,
            location: {
                latitude: latitude || null,
                longitude: longitude || null
            },
            preferredLanguage: language || 'en',
            deviceInfo: {
                deviceId: userId || null
            }
        };

        // Find existing user or create new one
        let mobileUser = await MobileUser.findOne({ fcmToken: token });

        if (mobileUser) {
            // Update existing user and add timestamp
            mobileUser.location = mobileUserData.location;
            mobileUser.preferredLanguage = mobileUserData.preferredLanguage;
            mobileUser.deviceInfo = mobileUserData.deviceInfo;
            mobileUser.accessTimestamps.push(currentTimestamp);
            mobileUser.platform = platform;
            await mobileUser.save();
            console.log('Mobile user updated with new timestamp:', mobileUser._id);
        } else {
            // Create new user with first timestamp
            mobileUserData.accessTimestamps = [currentTimestamp];
            mobileUser = await MobileUser.create(mobileUserData);
            console.log('New mobile user created:', mobileUser._id);
        }

        res.status(200).json({
            status: "success",
            message: "Mobile user registered successfully",
            data: {
                id: mobileUser._id,
                fcmToken: mobileUser.fcmToken,
                language: mobileUser.preferredLanguage,
                location: mobileUser.location,
                totalAccess: mobileUser.accessTimestamps.length,
                lastAccess: currentTimestamp,
                platform: mobileUser.platform
            }
        });

    } catch (error) {
        console.error("Error registering mobile user:", error);

        res.status(200).json({
            status: "failed",
            message: error.message || "Failed to register mobile user"
        });
    }
};

module.exports = {
    getPriorityNews, 
    getLatestNews, 
    getMetaData, 
    searchNews, 
    getIndividualNewsInfo, 
    getHelpTeam, 
    getNewsFrames, 
    addNewsFrame, 
    updateNewsFrame, 
    getNewsFrameById, 
    getActiveNewsFrames, 
    getScreenPermissions, 
    updateScreenPermissions, 
    toggleScreenPermission,
    getEmployeesList,
    logNewsFrameSharing,
    newsSharingAnalytics,
    getNewsWithSharingInfo,
    registerMobileUser
};