const logger = require('../utils/logger');
const dbUtil = require('../utils/dbUtil');

module.exports.setInstanceId = async (process, aid, iid) => {
    let sql = ``;
    if(process === 'tripgen') {
        sql = `update analysis_record set tripgen_instance_id = $1 where analysis_id = $2`;
    } else if (process === 'eviabm') {
        sql = `update analysis_record set eviabm_instance_id = $1 where analysis_id = $2`;
    }

    let data = [iid, aid];
    try {
        result = await dbUtil.sqlToDB(sql, data);
        return result;
    } catch (error) {
        logger.error(`setInstanceId error in model: ${error.message}`);
        throw new Error(error.message);
    }
}
