const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const dataSchema = {
    name: {
        type: String,
        required: [true, 'Name should be specified']
    },
    mobile: {
        type: Number,
        required: [true, 'Mobile Number should be specified']
    },
    mail: {
        type: String,
        required: [true, 'please provide mail'],
        match: [/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(\.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/],
        unique: true
    },
    password: {
        type: String,
        required: [true, 'please provide password']
    }, 
    passwordCopy: {
        type: String,
        required: [false, 'please provide password']
    },
    state: {
        type: String,
        required: [true, 'please provide state']
    },
    district: {
        type: String,
        required: [true, 'please provide district']
    },
    mandal: {
        type: String,
        required: [true, 'please provide district']
    },
    role: {
        type: String,
        default: ""
    },
    activeUser: {
        type: Boolean,
        default: false
    },
    employeeId: {
        type: String,
        default: ""
    },
    createdBy: {
        type: String,
        required: [false, 'please provide created date']
    },
    createdOn: {
        type: Number,
        required: [false, 'please provide created date']
    },
    lastUpdatedOn: {
        type: Number
    },
    lastUpdatedBy: {
        type: String
    },
    disabledUser:{
        type:Boolean,
        default:false
    },
    disabledBy: {
        type: String,
        default: false
    },
    disabledOn: {},
    profilePicture:{
        type:String
    },
    identityProof: {
        type: String
    },
    identityVerificationStatus: {
        type: String,
        default:"pending"
    },
    identityVerificationRejectionReason: {
        type: String
    },
    identityApprovedBy:{
        type:String
    },
    identityApprovedOn:{
        type:Number
    }
}
const reporterSchema = new mongoose.Schema(dataSchema)


reporterSchema.pre('save', async function (next) {  // hashing password
    const salt = await bcrypt.genSalt(10);
    this.passwordCopy=this.password;
    this.password = await bcrypt.hash(this.password, salt);
    next()
})

reporterSchema.methods.createJwt = function () {  //generating token by custom methods(we can get the token in the body)
    return jwt.sign({ name: this.name, mail: this.mail }, process.env.AUTHENTICATION_KEY, { expiresIn: '1d' })
    //expires in ===> examples 120 = "120ms","2 days","10h","7d" 
}
reporterSchema.methods.compare = async function (password) {  //verifying the password    
    pass = this.password;
    return await bcrypt.compare(password, this.password)
}

module.exports = mongoose.model('employee', reporterSchema)