const pako = require('pako')
const WebSocket = require('ws')
const moment = require('moment')
const CryptoJS = require('crypto-js');
const HmacSHA256 = require('crypto-js/hmac-sha256')
const uuid = require("uuid")
const url = require("url")
const logger = require("../logger")();

class ContractClient {
    constructor(apiKey, apiSecret) {
        this.apiKey = apiKey
        this.apiSecret = apiSecret
        this.listeners = new Map()
        this.requsetQueue = []
        this.notificationURL = "wss://api.hbdm.com/notification"
        this.subscribeURL = "wss://www.hbdm.com/ws"
        this.subHistory = []
        this.notify_sub_histroy = []
        this.client_reconnect = 0;
        this.notify_reconnect = 0;
    }

    connectNotification() {
        return new Promise((resolve, reject) => {
            this.notify_client = new WebSocket(this.notificationURL)

            this.notify_client.on('close', async () => {
                logger.warn("socket_status", "notify_client", "start to reconnect")
                await this.connectNotification()
            })

            this.notify_client.on('error', error => reject(error))

            this.notify_client.on("open", () => {
                logger.info("socket_status", "notify_client connected!", "reconnect times:", this.notify_reconnect)
                this.notify_reconnect += 1
                this.auth()
                resolve()
            })

            this.notify_client.on('message', data => {
                let text = pako.inflate(data, {to: 'string'})
                let msg = JSON.parse(text)

                if (msg.op === "ping") {

                    this.notify_client.send(JSON.stringify({op: "pong", ts: msg.ping}))

                } else if (msg.op === "notify") {
                    let channel = msg.topic
                    let listeners = this.listeners.get(channel)
                    if (listeners && listeners.length) {
                        for (let temp of listeners) {
                            temp(msg)
                        }
                    }
                } else if (msg.op === "sub" || msg.op === "unsub") {
                    if (msg['err-code'] === 0) {
                        logger.info("sub_status", `sub ${msg.topic} success!`)
                    } else {
                        logger.warn("sub_status", `sub ${msg.topic} filed, err-msg: ${msg['err-msg']}`)
                    }
                } else if(msg.op === "auth") {
                    if(msg["err-code"] === 0){
                        logger.info("auth_ret", msg.data["user-id"], "success!")
                        if(this.notify_reconnect > 1){
                            for(let msg of this.notify_sub_histroy){
                                this.notify_client.send(msg)
                            }
                        }
                    }else{
                        logger.warn("auth_ret", msg["err-code"], msg["err-msg"])
                    }
                }

            })
        })

    }

    connect() {
        return new Promise((resolve, reject) => {
            this.client = new WebSocket(this.subscribeURL)

            this.client.on('close', async () => {
                logger.warn("socket_status", "sub_client close", "start to reconnect")
                await this.connect()
            });

            this.client.on('error', error => reject(error))

            this.client.on('open', () => {
                logger.info("socket_status", "sub_client connected!", "reconnect times:", this.client_reconnect)
                if(this.client_reconnect > 0){
                    for(let msg of this.subHistory){
                        this.client.send(msg)
                    }
                }
                this.client_reconnect += 1
                resolve()
            })

            this.client.on('message', data => {
                let text = pako.inflate(data, {to: 'string'})
                let msg = JSON.parse(text)

                if (msg.ping) {

                    this.client.send(JSON.stringify({pong: msg.ping}))

                } else if (msg.status === "ok") {

                    if (msg.rep) {
                        let index = this.requsetQueue.findIndex(x => x.id === msg.id)
                        if (index >= 0) {
                            let temp = this.requsetQueue.splice(index, 1)[0]
                            temp.resolve(msg.tick)
                        }
                    }else if(msg.subbed){
                        logger.info("sub_status", "sub", msg.subbed, "success")
                    }

                } else if (msg.ch) {
                    let listeners = this.listeners.get(msg.ch)
                    if (listeners && listeners.length) {
                        for (let listener of listeners) {
                            listener(msg.tick)
                        }
                    }
                } else if (msg.status === "error") {
                    logger.error('sub_status', msg["err-code"], msg["err-msg"])
                }

            })
        })
    }

    getSign(data) {
        let str = "";
        let keys = ['AccessKeyId', 'SignatureMethod', 'SignatureVersion', 'Timestamp']
        keys.forEach(k => {
            str += `${k}=${encodeURIComponent(data[k])}&`
        })
        str = str.slice(0, -1)
        let host = url.parse(this.notificationURL).host
        let cpath = url.parse(this.notificationURL).path
        let meta = ["GET", host, cpath, str].join('\n')
        let hash = HmacSHA256(meta, this.apiSecret)
        return CryptoJS.enc.Base64.stringify(hash)
    }

    auth() {
        let data = {
            op: "auth",
            type: "api",
            AccessKeyId: this.apiKey,
            SignatureMethod: "HmacSHA256",
            SignatureVersion: "2",
            Timestamp: moment.utc().format("YYYY-MM-DDTHH:mm:ss"),
            Signature: ""
        }

        data.Signature = this.getSign(data);
        this.notify_client.send(JSON.stringify(data))
    }


    on(channel, func) {
        let temp = this.listeners.get(channel)
        if (!temp) {
            temp = []
            this.listeners.set(channel, temp)
        }
        temp.push(func)
    }

    removeListener(channel) {
        this.listeners.delete(channel)
    }


    subKline(symbol, period) {
        let data = JSON.stringify({
            sub: `market.${symbol}.kline.${period}`,
            id: Date.now().toString()
        })
        this.client.send(data)
        this.subHistory.push(data)
        return `market.${symbol}.kline.${period}`
    }

    reqKline(symbol, period, from, to) {
        return new Promise((resolve, reject) => {
            const id = uuid.v1()
            this.requsetQueue.push({
                id: id,
                resolve: resolve,
                reject: reject
            })

            this.client.send(JSON.stringify({
                req: `market.${symbol}.kline.${period}`,
                id: id,
                from: from,
                to: to
            }))
        })
    }

    subDepth(symbol, type) {
        let data = JSON.stringify({
            sub: `market.${symbol}.depth.${type}`,
            id: uuid.v1()
        })
        this.client.send(data)
        this.subHistory.push(data)
        return `market.${symbol}.depth.${type}`
    }

    subMarketDetail(symbol) {
        let data = JSON.stringify({
            sub: `market.${symbol}.detail`,
            id: uuid.v1()
        })
        this.client.send(data)
        this.subHistory.push(data)
        return `market.${symbol}.detail`
    }

    reqTradeDetail(symbol) {
        return new Promise((resolve, reject) => {
            const id = uuid.v1()
            this.requsetQueue.push({
                id: id,
                resolve: resolve,
                reject: reject
            })

            this.client.send(JSON.stringify({
                req: `market.${symbol}.trade.detail`,
                id: id,
            }))
        })
    }

    subTradeDetail(symbol) {
        const id = uuid.v1()
        const data = JSON.stringify({
            sub: `market.${symbol}.trade.detail`,
            id: id,
        })
        this.client.send(data)
        this.subHistory.push(data)
        return `market.${symbol}.trade.detail`
    }


    subOrderNotify(symbol) {
        const data = JSON.stringify({
            op: "sub",
            cid: uuid.v1(),
            topic: `orders.${symbol}`
        })
        this.notify_client.send(data)
        this.notify_sub_histroy.push(data)
        return `orders.${symbol}`
    }

    subAccountNotify(symbol) {
        const data = JSON.stringify({
            op: "sub",
            cid: uuid.v1(),
            topic: `accounts.${symbol}`
        })
        this.notify_client.send(data)
        this.notify_sub_histroy.push(data)
        return `accounts.${symbol}`
    }

    subPositionNotify(symbol) {
        const data = JSON.stringify({
            op: "sub",
            cid: uuid.v1(),
            topic: `positions.${symbol}`
        })
        this.notify_client.send(data)
        this.notify_sub_histroy.push(data)
        return `positions.${symbol}`
    }

    async start(){
        await this.connect()
        await this.connectNotification()
    }
}

module.exports = ContractClient

