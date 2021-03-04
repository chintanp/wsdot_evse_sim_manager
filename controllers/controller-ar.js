const logger = require('../utils/logger');
const analysisModel = require('./../models/model-ar');

module.exports.setInstanceSpecs = async (process, aid, iid, ip) => {
    try {
        let result = await analysisModel.setInstanceSpecs(process, aid, iid, ip);
        logger.info("setInstanceSpecs in controller returned : " + result.rows.length + " rows");
        return result.rows;
        // res.status(200).json(result.rows);
    } catch (error) {
        logger.error(`setInstanceSpecs error in controller: ${error.message}`);

    }
}