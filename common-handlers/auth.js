// const BadRequest = require("../common-error-handlers/badRequest");
const jwt = require('jsonwebtoken')


const auth = (req, res, next) => { //if token coming in cookie
    const token = req.headers.cookie;
    if(token){
        const checkToken = token.split('tokens=')[1]
        try {
            const verifyToken = jwt.verify(checkToken,process.env.AUTHENTICATION_KEY)
            const { name, mail } = verifyToken;
            req.user = { name, mail }
            next();
        } catch (err) {
            console.error(err)
        }

    }
}
// const auth = (req,res,next) =>{ //if token coming in response
//     const token = req.headers.authorization;
//     if(!token || !token.startsWith('Bearer ')){
//            throw new BadRequest('authentication failedssss',500)
//         }
//         const checkToken = token.split(' ')[1]
//         try{
//         const verifyToken = jwt.verify(checkToken,process.env.AUTHENTICATION_KEY)
//         const {name,mail} = verifyToken;
//         req.user = {name,mail}
//         next();
//     } catch(err){
//         throw new BadRequest(err,500)
//     }
// }

module.exports = auth