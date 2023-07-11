const mongoose = require('mongoose');

const dataSchema = {
    type: {
        type: String
    },
    data: {},
 
}
const metaDataSchema = new mongoose.Schema(dataSchema)

module.exports = mongoose.model('metaData', metaDataSchema)