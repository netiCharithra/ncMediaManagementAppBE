class CommonApiError extends Error{
    constructor(message,errorCode){
        super(message)
        this.errorCode = errorCode;
     }
     
}

module.exports = CommonApiError;
