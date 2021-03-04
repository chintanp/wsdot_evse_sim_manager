const logger = require('../utils/logger');
const dbUtil = require('../utils/dbUtil');

module.exports.setInstanceSpecs = async (process, aid, iid, ip) => {
    let sql = ``;
    if(process === 'tripgen') {
        sql = `update analysis_record set tripgen_instance_id = $1, tripgen_ip = $2 where analysis_id = $3`;
    } else if (process === 'eviabm') {
        sql = `update analysis_record set eviabm_instance_id = $1, eviabm_ip = $2 where analysis_id = $3`;
    }

    let data = [iid, ip, aid];
    try {
        result = await dbUtil.sqlToDB(sql, data);
        return result;
    } catch (error) {
        logger.error(`setInstanceSpecs error in model: ${error.message}`);
        throw new Error(error.message);
    }
}
