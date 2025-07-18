const newsDataSchema = require('../../modals/newsDataSchema');
const errorLogBookSchema = require('../../modals/errorLogBookSchema');
const metaDataSchema = require('../../modals/metaDataSchema');
const EmployeeTracing = require('../../modals/employeeTracing')
const reportersSchema = require('../../modals/reportersSchema');
const Visitor = require('../../modals/visitorSchema');
const { getFileTempUrls3 } = require('./../commonApiFunction');
const { generateDownloadUrl } = require('./utils/s3Utils');
require('dotenv').config();



const handleVisitorManagement = async (visitorId, coordinates, timestamp) => {
    try {
      if (!visitorId || !timestamp) {
        console.error('Missing required parameters - visitorId:', visitorId, 'timestamp:', timestamp);
        return { success: false, error: 'Missing required parameters' };
      }

      const dateKey = new Date(timestamp).toISOString().split('T')[0];
      // Validate location format: must be null, undefined, or [number, number]
      let location = null;
      if (coordinates && Array.isArray(coordinates) && coordinates.length === 2 && 
          typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
        location = coordinates;
      } else if (coordinates !== null && coordinates !== undefined) {
        console.warn('Invalid coordinates format. Expected [latitude, longitude] or null, got:', coordinates);
      }
      
      // Find a document that has this visitorId (token) under this dateKey
      const existingDoc = await Visitor.findOne({
        [`fcmTokensByDay.${dateKey}`]: {
          $elemMatch: { token: visitorId }
        }
      });
  
      if (existingDoc) {
        // Token exists for the date – update its visitedOn
        const tokenArray = existingDoc.fcmTokensByDay.get(dateKey) || [];
        const tokenIndex = tokenArray.findIndex(entry => entry.token === visitorId);
  
        if (tokenIndex !== -1) {
          const visitor = tokenArray[tokenIndex];
          const lastVisitedTimestamp = visitor.visitedOn.length > 0 
            ? new Date(visitor.visitedOn[visitor.visitedOn.length - 1])
            : null;
          const currentTimestamp = new Date(timestamp);
          
          // Only push new timestamp if it's the first one or if it's been at least 1 hour since the last one
          if (!lastVisitedTimestamp || (currentTimestamp - lastVisitedTimestamp) >= 3600000) {
            visitor.visitedOn.push(timestamp);
            // Only update location if it's a valid [number, number] array
            if (Array.isArray(location) && location.length === 2) {
              visitor.location = location;
            } else if (location === null || location === undefined) {
              // Explicitly set to null if location is null/undefined
              visitor.location = null;
            }
          }
        }
        existingDoc.fcmTokensByDay.set(dateKey, tokenArray);
        await existingDoc.save();
        return { success: true, action: 'updated' };
      }
      
      // If we get here, either the document doesn't exist or the token isn't found for the date
      // Try to find a document that already has this dateKey to append to
      let doc = await Visitor.findOne({
        [`fcmTokensByDay.${dateKey}`]: { $exists: true }
      });
  
      if (!doc) {
        // No document yet for this day – create new with proper Map initialization
        doc = new Visitor({
          fcmTokensByDay: new Map()
        });
      }
  
      // Initialize the Map if it doesn't exist
      if (!doc.fcmTokensByDay) {
        doc.fcmTokensByDay = new Map();
      }
  
      // Get or initialize the token array for this date
      const tokenArray = doc.fcmTokensByDay.get(dateKey) || [];
  
      // Create visitor object with required fields
      const newVisitor = {
        token: visitorId,
        visitedOn: [timestamp]
      };
      
      // Only add location if it's a valid [number, number] array
      if (Array.isArray(location) && location.length === 2) {
        newVisitor.location = location;
      }
      
      tokenArray.push(newVisitor);
  
      // Update the Map with the new token array
      doc.fcmTokensByDay.set(dateKey, tokenArray);
      
      // Save the document
      await doc.save();
      return { success: true, action: 'created' };
      
    } catch (error) {
      console.error('Error in handleVisitorManagement:', error);
      return { success: false, error: error.message };
    }
  };
  
  

const getLatestNews = async (req, res) => {
    try {


        const language = req?.body?.language || 'te';

        console.log("hii",req?.body?.language)

        if(req?.body?.visitorId){
            handleVisitorManagement(req?.body?.visitorId, req?.body?.location, req?.body?.requestTime)
        }
        let result = await newsDataSchema.aggregate([
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

        // Add signed URLs to each image in the result
        result = await Promise.all(result.map(async (newsItem) => {
            if (newsItem.images && Array.isArray(newsItem.images)) {
                // Process each image to add signed URL
                newsItem.images = await Promise.all(newsItem.images.map(async (image) => {
                    if (image?.fileName) {
                        try {
                            const signedUrl = await generateDownloadUrl(image.fileName);
                            return {
                                ...image.toObject ? image.toObject() : image,
                                tempURL: signedUrl
                            };
                        } catch (error) {
                            console.error(`Error generating URL for ${image.fileName}:`, error);
                            return {
                                ...image.toObject ? image.toObject() : image,
                                tempURL: null,
                                error: 'Failed to generate URL'
                            };
                        }
                    }
                    return image.toObject ? image.toObject() : image;
                }));
            }
            return newsItem;
        }));

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
const getVisitorsCount = async (req, res) => {
    try {
        const result = await Visitor.aggregate([
            {
                $project: {
                    tokenCount: {
                        $reduce: {
                            input: { $objectToArray: "$fcmTokensByDay" },
                            initialValue: 0,
                            in: { $add: ["$$value", { $size: "$$this.v" }] }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalTokens: { $sum: "$tokenCount" }
                }
            }
        ], { maxTimeMS: 30000 });

        res.status(200).json({
            status: "success",
            msg: "Success",
            data: result[0]?.totalTokens || 0
        });
    } catch (error) {
        console.error(error)
        await errorLogBookSchema.create({
            message: `Error while Fetching Visitors Count`,
            stackTrace: JSON.stringify([...error.stack].join('/n')),
            page: 'Employee Fetching Visitors Count',
            functionality: 'Error while Fetching Visitors Count',
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
        let result = await newsDataSchema.aggregate(aggregateQuery);

        // Process each type and its records to add image URLs
        if (result?.[0]?.types?.length > 0) {
            await Promise.all(result[0].types.map(async (type) => {
                if (type.records && Array.isArray(type.records)) {
                    console.log("HIiiiiiii")
                    type.records = await Promise.all(type.records.map(async (record) => {
                        if (record.images && Array.isArray(record.images)) {
                            record.images = await Promise.all(record.images.map(async (image) => {
                                if (image?.fileName) {
                                    try {
                                        const signedUrl = await generateDownloadUrl(image.fileName);
                                        return {
                                            ...(image.toObject ? image.toObject() : image),
                                            tempURL: signedUrl
                                        };
                                    } catch (error) {
                                        console.error(`Error generating URL for ${image.fileName}:`, error);
                                        return {
                                            ...(image.toObject ? image.toObject() : image),
                                            tempURL: null,
                                            error: 'Failed to generate URL'
                                        };
                                    }
                                }
                                return image.toObject ? image.toObject() : image;
                            }));
                        }
                        return record;
                    }));
                }
                return type;
            }));
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
        let result = await newsDataSchema.aggregate(aggregateQuery);

        // Process each category and its news items to add image URLs
        if (result?.length > 0) {
            await Promise.all(result.map(async (category) => {
                if (category.news && Array.isArray(category.news)) {
                    category.news = await Promise.all(category.news.map(async (newsItem) => {
                        if (newsItem.images && Array.isArray(newsItem.images)) {
                            newsItem.images = await Promise.all(newsItem.images.map(async (image) => {
                                if (image?.fileName) {
                                    try {
                                        const signedUrl = await generateDownloadUrl(image.fileName);
                                        return {
                                            ...(image.toObject ? image.toObject() : image),
                                            tempURL: signedUrl
                                        };
                                    } catch (error) {
                                        console.error(`Error generating URL for ${image.fileName}:`, error);
                                        return {
                                            ...(image.toObject ? image.toObject() : image),
                                            tempURL: null,
                                            error: 'Failed to generate URL'
                                        };
                                    }
                                }
                                return image.toObject ? image.toObject() : image;
                            }));
                        }
                        return newsItem;
                    }));
                }
                return category;
            }));
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
        console.log("111")
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
        console.error("1", error)
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

    if(req?.body?.visitorId){
        handleVisitorManagement(req?.body?.visitorId, req?.body?.location, req?.body?.requestTime)
    }
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

        // Process news records to add tempURL for each image
        const processNewsImages = async (records) => {
            if (!Array.isArray(records)) return [];
            
            return await Promise.all(records.map(async (record) => {
                if (record.images && Array.isArray(record.images)) {
                    try {
                        record.images = await Promise.all(record.images.map(async (image) => {
                            if (image?.fileName) {
                                try {
                                    const signedUrl = await generateDownloadUrl(image.fileName);
                                    return {
                                        ...(image.toObject ? image.toObject() : image),
                                        tempURL: signedUrl
                                    };
                                } catch (error) {
                                    console.error(`Error generating URL for ${image.fileName}:`, error);
                                    return {
                                        ...(image.toObject ? image.toObject() : image),
                                        tempURL: null,
                                        error: 'Failed to generate URL'
                                    };
                                }
                            }
                            return image.toObject ? image.toObject() : image;
                        }));
                    } catch (error) {
                        console.error('Error processing images for record:', record.newsId, error);
                        // Continue with original images if there's an error processing
                    }
                }
                return record;
            }));
        };

        // Process all records to add image URLs
        const processedRecords = await processNewsImages(newsInfo[0]?.records || []);

        res.status(200).json({
            status: "success",
            data: {
                records: processedRecords,
                endOfRecords: endOfRecords,
            }
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}


const getTypeCategorizedNewsPaginatedOnly = async (req, res) => {
    // let page starts from zero;
    // let viewersData = await metaDataSchema.updateOne(
    //     { type: 'viewersIp', data: { $nin: [req.ip] } }, // Find documents of the specified type without the target IP
    //     { $addToSet: { data: req.ip } }, // Add the target IP to the array if not already present
    // )

    if(req?.body?.visitorId){
        handleVisitorManagement(req?.body?.visitorId, req?.body?.location, req?.body?.requestTime)
    }
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
                            newsType: req.body.type, // Match the specific category,
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

        // Process news records to add tempURL for each image
        const processNewsImages = async (records) => {
            if (!Array.isArray(records)) return [];
            
            return await Promise.all(records.map(async (record) => {
                if (record.images && Array.isArray(record.images)) {
                    try {
                        record.images = await Promise.all(record.images.map(async (image) => {
                            if (image?.fileName) {
                                try {
                                    const signedUrl = await generateDownloadUrl(image.fileName);
                                    return {
                                        ...(image.toObject ? image.toObject() : image),
                                        tempURL: signedUrl
                                    };
                                } catch (error) {
                                    console.error(`Error generating URL for ${image.fileName}:`, error);
                                    return {
                                        ...(image.toObject ? image.toObject() : image),
                                        tempURL: null,
                                        error: 'Failed to generate URL'
                                    };
                                }
                            }
                            return image.toObject ? image.toObject() : image;
                        }));
                    } catch (error) {
                        console.error('Error processing images for record:', record.newsId, error);
                        // Continue with original images if there's an error processing
                    }
                }
                return record;
            }));
        };

        // Process all records to add image URLs
        const processedRecords = await processNewsImages(newsInfo[0]?.records || []);

        res.status(200).json({
            status: "success",
            data: {
                records: processedRecords,
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

    if(req?.body?.visitorId){
        handleVisitorManagement(req?.body?.visitorId, req?.body?.location, req?.body?.requestTime)
    }
    
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

    // Process recentRecords to add tempURL for each image
    const processNewsImages = async (newsArray) => {
        if (!Array.isArray(newsArray)) return [];
        
        return await Promise.all(newsArray.map(async (newsItem) => {
            if (newsItem.images && Array.isArray(newsItem.images)) {
                newsItem.images = await Promise.all(newsItem.images.map(async (image) => {
                    if (image?.fileName) {
                        try {
                            const signedUrl = await generateDownloadUrl(image.fileName);
                            return {
                                ...(image.toObject ? image.toObject() : image),
                                tempURL: signedUrl
                            };
                        } catch (error) {
                            console.error(`Error generating URL for ${image.fileName}:`, error);
                            return {
                                ...(image.toObject ? image.toObject() : image),
                                tempURL: null,
                                error: 'Failed to generate URL'
                            };
                        }
                    }
                    return image.toObject ? image.toObject() : image;
                }));
            }
            return newsItem;
        }));
    };

    // Process both recentRecords and specificRecord
    const [processedRecentRecords, processedSpecificRecord] = await Promise.all([
        processNewsImages(newsInfo[0]?.recentRecords || []),
        processNewsImages(newsInfo[0]?.specificRecord || [])
    ]);

    // Process reporter's profile picture if exists
    if (processedSpecificRecord?.[0]?.reportedBy?.profilePicture?.fileName) {
        try {
            const profilePicUrl = await generateDownloadUrl(processedSpecificRecord[0].reportedBy.profilePicture.fileName);
            processedSpecificRecord[0].reportedBy.profilePicture.tempURL = profilePicUrl;
        } catch (error) {
            console.error('Error generating profile picture URL:', error);
            processedSpecificRecord[0].reportedBy.profilePicture.tempURL = null;
            processedSpecificRecord[0].reportedBy.profilePicture.error = 'Failed to generate URL';
        }
    }

    const responseData = {
        recentRecords: processedRecentRecords,
        specificRecord: processedSpecificRecord,
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
        if(req?.body?.visitorId){
            handleVisitorManagement(req?.body?.visitorId, req?.body?.location, req?.body?.requestTime)
        }
        
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
        if(req?.body?.visitorId){
            handleVisitorManagement(req?.body?.visitorId, req?.body?.location, req?.body?.requestTime)
        }


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
    getLatestNews, getIndividualNewsInfo, getMetaData, getNewsTypeCategorizedNews, getNewsCategoryCategorizedNews,getTypeCategorizedNewsPaginatedOnly,  getCategoryNewsPaginatedOnly, getCategoryWiseCount, employeeTraceCheck, getVisitorsCount
}