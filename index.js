// This is the main file that will manage the simulation execution. 

// The role of this NodeJS is server is to continuously listen for changes to the 
// database table "analysis_record" and upon a new insert start and execution process. 
// Upon successful completion of the simulation, the status in the table needs to be updated. 

require('dotenv').config()
const pg = require('pg');
const path = require('path');
const spawn = require("child_process").spawn;
const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PWD}@${process.env.DB_HOST}:5432/wsdot_evse_main`;

console.log(connectionString)

const pgClient = new pg.Client(connectionString);
pgClient.connect();
const query = pgClient.query('LISTEN new_order')

// this is the path to the r text mining cript. It's more or less
// hardcoded here but could be a cmdline arg in a more elaborate setup
const rscript_update_dc = path.resolve("update_states", "update_dc.R");

const callR = (path, rargs) => {
    return new Promise((resolve, reject) => {
        let err = false;
        const child = spawn(process.env.RSCRIPT,
            [
                path, "--args", rargs
            ], {
                cwd: "C:\\temp\\nodeapps\\wsdot_evse_sim_manager\\update_states"
            });
        child.stderr.on("data", (data) => {
            console.log(data.toString());
        });
        child.stdout.on("data", (data) => {
            console.log(data.toString());
        });
        child.on('error', (error) => {
            err = true;
            reject(error);
        });
        child.on('exit', () => {
            if (err) return; // debounce - already rejected
            resolve("done."); // TODO: check exit code and resolve/reject accordingly
        });
    });
}

pgClient.on('notification', async (data) => {
    const payload = JSON.parse(data.payload);
    console.log('row added!', payload)
    const userid = payload.user_id;
    const simdatetime = payload.sim_date_time;
    const status = payload.status;
    const a_id = payload.analysis_id;

    if (status == 'inserted') {
        console.log("Row inserted successfully - begin the process")
        console.log("Invoking R script... at:", rscript_update_dc);
        callR(rscript_update_dc, a_id)
            .then(result => {
                console.log("finished with result:", result);
            })
            .catch(error => {
                console.log("Finished with error:", error);
            });
    }
})