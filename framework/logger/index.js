const fs = require('fs');
const moment = require('moment')
const config = require("../../config")

class Logger {
    constructor(storePath) {
        if (!fs.existsSync(storePath)) {
            fs.mkdirSync(storePath);
        }

        this.storePath = storePath
        this.setWriter()
        this.cache = ""
        this.ready = false;
    }

    info(remark, ...chars) {
        this.ensureWriter();
        if (this.ready) {
            this.writer.write(`[Info ] [${moment.utc().format("YYYY-MM-DDTHH:mm:ss")}] [${remark}] ${chars.join(" ")}\n`);
        } else {
            this.cache += `[Info ] [${moment.utc().format("YYYY-MM-DDTHH:mm:ss")}] [${remark}] ${chars.join(" ")}\n`;
        }
    }

    warn(remark, ...chars) {
        this.ensureWriter();
        if (this.ready) {
            this.writer.write(`[Warn ] [${moment.utc().format("YYYY-MM-DDTHH:mm:ss")}] [${remark}] ${chars.join(" ")}\n`);
        } else {
            this.cache += `[Warn ] [${moment.utc().format("YYYY-MM-DDTHH:mm:ss")}] [${remark}] ${chars.join(" ")}\n`;
        }
    }

    error(remark, ...chars) {
        this.ensureWriter();
        if (this.ready) {
            this.writer.write(`[Error] [${moment.utc().format("YYYY-MM-DDTHH:mm:ss")}] [${remark}] ${chars.join(" ")}\n`);
        } else {
            this.cache += `[Error] [${moment.utc().format("YYYY-MM-DDTHH:mm:ss")}] [${remark}] ${chars.join(" ")}\n`;
        }
    }

    ensureWriter() {
        let time = moment.utc().date();
        if (time !== this.utcDate) {
            this.writer.end();
            this.setWriter();
        }
    }

    setWriter() {
        let file = moment.utc().format("YYYY-MM-DD") + ".log"
        this.utcDate = moment.utc().date()
        this.writer = fs.createWriteStream(`${this.storePath}/${file}`, {flags: 'a'})
        this.writer.on("open", () => {
            if (this.cache) {
                this.writer.write(this.cache);
                this.cache = "";
            }
            this.ready = true;
        })
    }
}

const Loggers = [];

function getLogger(storePath){
    storePath = storePath || config.log_path;
    let logger = Loggers.find(x => x && x[0] === storePath);
    if(!logger) {
        logger = new Logger(storePath);
        Loggers.push([storePath, logger]);
        return logger
    }else{
        return logger[1];
    }
}

module.exports = getLogger