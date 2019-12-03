const fs = require('fs');
const moment = require('moment')


class Recorder {
    constructor(type, storePath) {
        if (!fs.existsSync(storePath)) {
            fs.mkdirSync(storePath);
        }

        this.type = type
        this.storePath = storePath
        this.setWriter()
        this.cache = []
        this.ready = false;
    }

    recordKline(data) {
        let data_date = moment.unix(data.id).date()
        if(this.utcDate !== data_date){
            this.setWriter()
        }

        let buffer = kline2Struct(data)
        this.write(buffer)
    }


    write(buffer){
        if (this.ready) {
            this.writer.write(buffer)
        } else {
            this.cache.push(buffer)
        }
    }

    setWriter() {
        this.ready = false
        let file = `${this.type}_${moment.utc().format("YYYY-MM-DD")}.dat`
        this.utcDate = moment.utc().date()
        this.writer = fs.createWriteStream(`${this.storePath}/${file}`, {flags: 'a'})
        this.writer.on("open", () => {
            if (this.cache) {
                for (let item of this.cache) {
                    this.writer.write(item);
                }
                this.cache = []
            }
            this.ready = true;
        })
    }
}

// kline 数据结构 [id: uint32, close: float32, vol: uint32, count: uint16, amount: float32]
function kline2Struct(data) {
    let buffer = Buffer.alloc(18)
    buffer.writeUInt32BE(data.id, 0)
    buffer.writeUInt32BE(data.close, 4)
    buffer.writeUInt32BE(data.vol, 8)
    buffer.writeUInt16BE(data.count, 12)
    buffer.writeUInt32BE(data.amount, 14)

    return buffer
}


module.exports = Recorder