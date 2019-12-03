const {Direct} = require("../Common/const")
const Ring = require("../Common/Ring")
const Engine = require("../framework")
const config = require("../config")
const logger = require("../framework/logger")()

const DELAY_TIMES = 3
const OPEN_MOUNT = 1

class Swing {
    constructor(open_limit, close_limit, stop_limit) {
        this.open_limit = open_limit
        this.close_limit = close_limit
        this.stop_limit = stop_limit
        this.engine = new Engine(config.apiKey, config.apiSecret)
        this.latestKlines = new Ring(240)
        this.latestPrices = new Ring(600)
        this.open_forbiden = false
        this.open_kline_id = 0
        this.long = false
        this.delayTimes = DELAY_TIMES
        this.latestCommand = undefined;
    }

    drive(data) {
        const order = this.judge(data)
        const latestPrice = this.latestPrices.get(0)

        if (order !== undefined && order !== Direct.wait) {
            if (this.latestCommand !== undefined) {
                logger.warn("order_change", `due to previous order command haven't done! this command will not valid`,
                    "previous", Direct[this.latestCommand], "this", Direct[order])
            } else {
                logger.warn("order_command", `create order ${Direct[order]} command at price`,
                            `bid: ${latestPrice.bids[0][0]}`,
                            `ask: ${latestPrice.asks[0][0]}`)
                this.latestCommand = order
            }
        }
        // if (latestPrice) {
        //     const bidPrice = latestPrice.bids[0][0]
        //     const askPrice = latestPrice.asks[0][0]
        //
        //     if (order === Direct.open_buy) {
        //         this.engine.open_buy(bidPrice, OPEN_MOUNT)
        //     } else if (order === Direct.open_sell) {
        //         this.engine.open_sell(askPrice, OPEN_MOUNT)
        //     } else if (order === Direct.close_sell) {
        //         this.engine.close_sell(askPrice, OPEN_MOUNT)
        //     } else if (order === Direct.close_buy) {
        //         this.engine.close_buy(bidPrice, OPEN_MOUNT)
        //     }
        // }

    }

    judge(data) {
        this._cache_kline(data)
        logger.info("kline", data.id, data.close)
        if (this.open_kline_id !== data.id) {
            if (this.open_forbiden) {
                if (!this.long && this._close_buy(data)) {
                    this.open_forbiden = false
                    this.open_kline_id = 0
                    return Direct.close_buy
                }

                if (this.long && this._close_sell(data)) {
                    this.open_forbiden = false
                    this.open_kline_id = 0
                    return Direct.close_sell
                }
            } else {
                if (this._open_buy(data)) {
                    this.open_forbiden = true
                    this.long = true
                    this.open_kline_id = data.id
                    return Direct.open_buy
                }

                if (this._open_sell(data)) {
                    this.open_forbiden = true
                    this.long = false
                    this.open_kline_id = data.id
                    return Direct.open_sell
                }
            }
        } else {
            let ret = this._check_boom()
            if (ret !== 0) {
                logger.warn("Boom", ret, data.id, data.open, data.close, data.high, data.low)
            }
        }

    }

    _cache_kline(data) {
        let latest_kline = this.latestKlines.get(0) || {}
        if (latest_kline.id !== data.id) {
            this.latestKlines.unshift(data)
        } else {
            this.latestKlines.set(0, data)
        }
    }

    _cache_prices(data) {
        this.latestPrices.unshift(data)
    }

    process_depth(data) {
        this._cache_prices(data)
        this.optimize_price()
    }

    _open_buy(data) {
        return (data.close - data.open) / data.open < -this.open_limit
    }

    _close_sell(data) {
        return (data.close - data.high) / data.open < -this.close_limit
    }

    _open_sell(data) {
        return (data.close - data.open) / data.open > this.open_limit
    }

    _close_buy(data) {
        return (data.close - data.low) / data.open > this.close_limit
    }

    _check_boom() {
        const k3 = this.latestKlines.slice(0, 3)
        const [p0, p1, p2] = k3.map(t => (t.close - t.open) / t.open)

        if (p2 < p1 && p1 < p0 && p0 < -this.open_limit) {
            return -1
        } else if (p0 > p1 && p1 > p2 && p0 > this.open_limit) {
            return 1
        } else {
            return 0
        }
    }

    /**
     * 按照最近的成交方向做一个缓冲
     */
    optimize_price() {
        if(this.latestPrices.length < 2) return

        const previous = this.latestPrices.get(1)
        const current = this.latestPrices.get(0)
        const pre_bid_price = previous.bids[0][0]
        const cur_bid_price = current.bids[0][0]
        const pre_ask_price = previous.asks[0][0]
        const cur_ask_price = current.asks[0][0]

        if (this.latestCommand === Direct.open_buy || this.latestCommand === Direct.close_buy) {
            if (cur_bid_price <= pre_bid_price) {
                this.delayTimes = DELAY_TIMES
            } else {
                this.delayTimes--
            }

            if (this.delayTimes === 0) {
                if (this.latestCommand === Direct.open_buy) {
                    this.engine.open_buy(cur_bid_price, OPEN_MOUNT)
                } else {
                    this.engine.close_buy(cur_bid_price, OPEN_MOUNT)
                }

                logger.warn("order_command", `execute order command ${Direct[this.latestCommand]} at price`,
                    `bid: ${cur_bid_price}`,
                    `ask: ${cur_ask_price}`)

                this.latestCommand = undefined
                this.delayTimes = DELAY_TIMES
            }
        } else if (this.latestCommand === Direct.open_sell || this.latestCommand === Direct.close_sell) {
            if (cur_ask_price >= pre_ask_price) {
                this.delayTimes = DELAY_TIMES
            } else {
                this.delayTimes--
            }

            if (this.delayTimes === 0) {
                if (this.latestCommand === Direct.open_sell) {
                    this.engine.open_sell(cur_ask_price, OPEN_MOUNT)
                } else {
                    this.engine.close_sell(cur_ask_price, OPEN_MOUNT)
                }

                logger.warn("order_command", `execute order command ${Direct[this.latestCommand]} at price`,
                    `bid: ${cur_bid_price}`,
                    `ask: ${cur_ask_price}`)

                this.latestCommand = undefined
                this.delayTimes = DELAY_TIMES
            }
        }
    }

    async run() {
        await this.engine.start()
        this.engine.subKline(data => {
            this.drive(data)
        })

        this.engine.subDepth(data => {
            this.process_depth(data)
        })
    }
}

module.exports = Swing