const CommonApiError = require("./commonError")

const ErrorHandler = (err,req,res,next)=>{
    let errorCode = err.errorCode || 400;  //default error code 
    let message = err.message || "something went wrong"; //default message
    // if(err instanceof CommonApiError){
    //     errorCode = err.errorCode;
    //     message = err.message;
    // }
    if(err.code && err.code === Number(11000)){  //for duplicate entries
        errorCode = 400;
        message = 'duplicate value entered';
    }
    return res.status(errorCode).send({msg:message})
}

module.exports = ErrorHandler;