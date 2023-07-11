const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const userSchema =  new mongoose.Schema({
    name:{
        type:String,
        required :[true,'name should be specified']
    },
    mail:{
        type:String,
        required:[true,'please provide mail'],
        match:[/^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(\.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/],
        unique:true
    },
    password:{
        type:String,
        required:[true,'please provide password']
    }
})


userSchema.pre('save',async function(next){  // hashing password
    const salt = await bcrypt.genSalt(10);
   this.password = await bcrypt.hash(this.password,salt)
    next() 
})  

userSchema.methods.createJwt = function(){  //generating token by custom methods(we can get the token in the body)
    return jwt.sign({name:this.name,mail:this.mail},process.env.AUTHENTICATION_KEY,{expiresIn:'1d'})
    //expires in ===> examples 120 = "120ms","2 days","10h","7d" 
}
userSchema.methods.compare = async function(password){  //verifying the password    
    pass = this.password;
    return await bcrypt.compare(password, this.password)
}

module.exports = mongoose.model('testt',userSchema)