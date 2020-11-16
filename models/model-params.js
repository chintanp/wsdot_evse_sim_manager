const logger = require('../utils/logger');
const dbUtil = require('../utils/dbUtil');

module.exports.getSeed = async (analysis_id) => {
    let sql = `select ap.param_id, sp.param_name, ap.param_value from analysis_params ap
    join sim_params sp on sp.param_id = ap.param_id
    where ap.analysis_id = $1 and sp.param_type IN ('global') and
    param_name = 'global_seed';;`;
    let data = [analysis_id];
    try {
        result = await dbUtil.sqlToDB(sql, data);
        return result;
    } catch (error) {
        logger.error(`getSeed error in model: ${error.message}`);
        throw new Error(error.message);
    }
}
