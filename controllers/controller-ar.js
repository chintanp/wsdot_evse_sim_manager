const logger = require('../utils/logger');
const analysisModel = require('./../models/model-ar');

module.exports.setInstanceId = async (process, aid, iid) => {
    try {
        let result = await analysisModel.setInstanceId(process, aid, iid);
        logger.info("setInstanceId in controller returned : " + result.rows.length + " rows");
        return result.rows;
        // res.status(200).json(result.rows);
    } catch (error) {
        logger.error(`setInstanceId error in controller: ${error.message}`);

    }
}