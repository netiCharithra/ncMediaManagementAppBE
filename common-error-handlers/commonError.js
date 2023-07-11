class CommonApiError extends Error{
    constructor(message,errorCode){
        console.log(message,errorCode)
        super(message)
        this.errorCode = errorCode;
     }
     
}

module.exports = CommonApiError;
