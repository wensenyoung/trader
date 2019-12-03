const RestClient = require("./RestClient")
const ContractClient = require("./ContractClient")
const config = require("../config")
const Logger = new (require("./logger"))(config.run_log)
const {precision, negative} = require("../Common/util")


const OrderState = {
    commit: 3,
    part: 4,
    part_cancel: 5,
    done: 6,
    cancel: 7
}

class Controller {
    constructor(apiKey, apiSecret, options = {}) {
        this.restclient = new RestClient(apiKey, apiSecret)
        this.subclient = new ContractClient(apiKey, apiSecret)
        this.lever_rate = options.lever_rate || 20
        this.symbol = options.symbol || "BTC"
        this.contract_type = options.contract_type || "quarter"
        this.kline_step = options.k_step || "step6"
        this.kline_type = options.k_type || "1min"
        this.timeout = options.timeout || 120000
        // this.recorder = new Recorder(this._symbol, "../Data")
        this.getContractCode()
        this.msgQueue = []
    }

    get _symbol() {
        if (this.contract_type === "quarter") {
            return this.symbol + "_CQ"
        } else if (this.contract_type === "this_week") {
            return this.symbol + "_CW"
        } else if (this.contract_type === "next_week") {
            return this.symbol + "_NW"
        }
    }

    async getContractCode() {
        let ret = await this.restclient.getContractInfo()
        for (let item of ret.data) {
            if (item.symbol === this.symbol && item.contract_type === this.contract_type) {
                this.contract_code = item.contract_code
            }
        }
    }

    async _wrapper(direct, type, price, amount, order_type = "post_only") {
        const clientId = Date.now()
        try {
            const promise = new Promise((resolve, reject) => {
                this.msgQueue.push({id: clientId, resolve: resolve, reject: reject})
                this.create_order(price, amount, direct, type, clientId, order_type)
            })

            return await Promise.race([promise, this.getTimeout()])
        } catch (e) {
            Logger.info("order_state", 'canceling', clientId, '-', e.message)
            let ret = await this.cancelOrder(clientId)
            Logger.info("order_state", 'canceled ', ret.data.successes, JSON.stringify(ret.data.errors))
            return undefined
        }
    }

    open_buy(price, amount) {
        return this._wrapper("buy", "open", price, amount)
    }

    open_sell(price, amount) {
        return this._wrapper("sell", "open", price, amount)
    }

    close_buy(price, amount) {
        return this._wrapper("buy", "close", price, amount)
    }

    close_sell(price, amount) {
        return this._wrapper("sell", "close", price, amount)
    }

    fast_open_buy(price, amount) {
        return this._wrapper("buy", "open", price, amount, "optimal_10")
    }

    fast_open_sell(price, amount) {
        return this._wrapper("sell", "open", price, amount, "optimal_10")
    }

    fast_close_buy(price, amount) {
        return this._wrapper("buy", "close", price, amount, "optimal_10")
    }

    fast_close_sell(price, amount) {
        return this._wrapper("sell", "close", price, amount, "optimal_10")
    }

    open_buy_with_stop_loss(price, amount, stop_loss) {
        return this.create_order_with_stopLoss(price, amount, "buy", "open", stop_loss, Date.now())
    }

    close_buy_with_stop_loss(price, amount, stop_loss) {
        return this.create_order_with_stopLoss(price, amount, "buy", "close", stop_loss, Date.now())
    }

    open_sell_with_stop_loss(price, amount, stop_loss) {
        return this.create_order_with_stopLoss(price, amount, "sell", "open", stop_loss, Date.now())
    }

    close_sell_with_stop_loss(price, amount, stop_loss) {
        return this.create_order_with_stopLoss(price, amount, "sell", "close", stop_loss, Date.now())
    }

    get_order_createInfo(clientId, price, amount, direct, offset, order_type) {
        return {
            symbol: this._symbol,
            contract_type: this.contract_type,
            client_order_id: clientId,
            contract_code: this.contract_code,
            price: price,
            volume: amount,
            direction: direct,
            offset: offset,
            lever_rate: this.lever_rate,
            order_price_type: order_type
        }
    }

    async create_order(price, amount, direct, offset, clientId, order_type) {
        Logger.info("order", clientId, this.symbol, this.contract_type,
            this.contract_code, price, amount, direct, offset)

        const ret = await this.restclient.createOrder(this.symbol, this.contract_type, this.contract_code,
            price, amount, direct, offset, this.lever_rate, order_type, clientId)

        Logger.info("create_order_ret", ret.status, ret.data.order_id || "-",
            ret.data.client_order_id || "-", ret.err_code || '-', ret.err_msg || "-")

        return ret.data.client_order_id
    }

    async create_order_with_stopLoss(price, amount, direct, offset, stop_loss, clientId, order_type = "post_only") {
        let clientId1 = clientId
        let clientId2 = clientId + 1
        let direct2 = negative(direct)
        let offset2 = negative(offset)
        stop_loss = direct === "buy" ? -stop_loss : stop_loss
        let stop_price = precision(price * (1 + stop_loss))
        let order1 = this.get_order_createInfo(clientId1, price, amount, direct, offset, order_type)
        let order2 = this.get_order_createInfo(clientId2, stop_price, amount, direct2, offset2, order_type)

        Logger.info("batch_order", clientId, this.symbol, this.contract_type, this.contract_code, price, amount, direct, offset)
        Logger.info("batch_order", clientId, this.symbol, this.contract_type, this.contract_code, stop_price, amount, direct2, offset2)
        let ret = this.restclient.createBatchOrder([order1, order2])
        for (let item of ret.errors) {
            Logger.info("batch_order_ret", item.index, item.err_code, item.err_msg)
        }

        for (let item of ret.success) {
            Logger.info("batch_order_ret", item.index, item.order_id, item.client_order_id)
        }
    }

    cancelOrder(client_orderId) {
        return this.restclient.cancelOrder(this.symbol, '', client_orderId)
    }

    subOrderNotify(func) {
        let channel = this.subclient.subOrderNotify(this.symbol.toLowerCase())
        this.subclient.on(channel, data => {
            Logger.info("order state", data.contract_code, data.client_order_id || "-", data.volume, data.price,
                data.direction, data.offset, data.status, data.fee, data.profit)

            if (data.status === OrderState.done) {
                let orderId = data.client_order_id
                let index = this.msgQueue.findIndex(x => x.id === orderId)
                if (index >= 0) {
                    let temp = this.msgQueue.splice(index, 1)[0]
                    temp.resolve()
                }
            }

            if (func) func(data)
        })
    }

    subAssetsNotify(func) {
        let channel = this.subclient.subAccountNotify(this.symbol.toLowerCase())
        this.subclient.on(channel, data => {
            Logger.info("assets update", data.contract_code, data.client_order_id || "-", data.volume, data.price,
                data.direction, data.offset, data.status, data.fee, data.profit)
            if (func) func(data)
        })
    }

    subKline(func) {
        let channel = this.subclient.subKline(this._symbol, this.kline_type)
        this.subclient.on(channel, data => {
            // this.recorder.recordKline(data)
            if (func) func(data)
        })
    }

    subDepth(func) {
        let channel = this.subclient.subDepth(this._symbol, this.kline_step)
        this.subclient.on(channel, data => {
            if (func) func(data)
        })
    }

    getTimeout() {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                reject("create_order timeout!")
            }, this.timeout)
        })
    }

    async start() {
        await this.subclient.start()
        this.subOrderNotify()
    }
}


module.exports = Controller