const logger = require('../utils/logger');
const emailUtil = require('../utils/emailUtil');
const dbUtil = require('../utils/dbUtil')

/* 
 * get Emails
 * @return 
 */
module.exports.getEmail = async (userid) => {
    // if the city does not have a city_id, then consider it 'Generic'
    let get_email_sql = `select email_id from user_details where user_id = $1`;
    let get_email_data = [userid];

    try {
        get_email_result = await dbUtil.sqlToDB(get_email_sql, get_email_data);
        // email_result_arr = email_result.rows;
        return get_email_result;
    } catch (error) {
        logger.error(`getEmail error in model: ${error.message}`);
        throw new Error(error.message);
    }
}

module.exports.sendEmail = async (email, body, attachment) => {
    try {
        var send_email_result = await emailUtil.sendEmail(email, body, attachment);
        return send_email_result;
    } catch (error) {
        logger.error(`sendEmail error in model: ${error.message}`);
        throw new Error(error.message);
    }
}