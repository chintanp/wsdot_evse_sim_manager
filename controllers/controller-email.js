// this is a controller for email service
const logger = require('./../utils/logger');
const emailModel = require('./../models/model-email');

// sample controller using transaction
module.exports.sendEmail = async (resview_url, a_id, sim_date_time, userid) => {
    try {
        // body = JSON.stringify(report)
        url = `${resview_url}?userid=${userid}`
        body = `The analysis results are ready for analysis ID: ${a_id}, submitted at: ${sim_date_time}. Please visit ${url} and select the ${sim_date_time} from the dropdown.`
        // get the emails for the relevant ms_ids
        let email_result = await emailModel.getEmail(userid);
        email_result_arr = email_result.rows;
        attachment = ""
        var send_email_result = await emailModel.sendEmail(email_result_arr[0], body, attachment);
        return send_email_result;
    } catch (error) {
        logger.error(`sendEmail error in controller: ${error.message}`);
        return error;
    }
}