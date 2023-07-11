const mongo = require('mongoose')

const connectToMongoDB = (url) =>{
    return mongo.connect(url,{
        useNewUrlParser:true,
        useUnifiedTopology:true,
    })
}

module.exports = connectToMongoDB