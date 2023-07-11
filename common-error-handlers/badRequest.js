const CommonApiError = require("./commonError");

class BadRequest extends CommonApiError{
    constructor(message,errorCode){
        super(message)
        this.errorCode = errorCode;
     }
}

module.exports = BadRequest;
