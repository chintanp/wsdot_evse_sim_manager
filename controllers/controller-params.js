const logger = require('./../utils/logger');
const paramsModel = require('./../models/model-params');

module.exports.getSeed = async (analysis_id) => {
    try {
        let result = await paramsModel.getSeed(analysis_id);
        logger.info("getSeed in controller returned : " + result.rows.length + " rows")
        return result.rows;
        // res.status(200).json(result.rows);
    } catch (error) {
        logger.error(`getSeed error in controller: ${error.message}`);

    }
}