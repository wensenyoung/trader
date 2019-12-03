const {Direct} = require("../Common/const")
const Ring = require("../Common/Ring")
const Engine = require("../framework")
const config = require("../config")
const logger = require("../framework/logger")()


// 主要用于设置止损, 也可用于追涨杀跌。
class Stop_loss {
    constructor() {
        this.engine = new Engine(config.apiKey, config.apiSecret)
        this.latestKlines = new Ring(240);
        this.latestPrices = new Ring(600);

        // 空仓延迟标记
        this.constant_lower_times = 0;

        // 多仓delay标记
        this.constant_higher_times = 0;

        // 多仓命令集 [price, amount, delay] price 价格阈值，
        // amount正值表示开仓数量，负值表示减仓
        // delay 表示价格连续超过阈值多少次后才执行操作
        this.long_comands = [];

        // 多仓命令集 [price, amount, delay] price 价格阈值，
        // amount正值表示开仓数量，负值表示减仓
        // delay 表示价格连续低于阈值多少次后才执行操作
        this.short_comands = [];
    }


    monitor(data) {
        this._cache_kline(data);

        const latestKline = this.latestKlines.get(0);

        let close_price = latestKline.close;

        // 取出多仓命令集中价格最低的命令
        let long_command = this.long_comands[0];

        // 如果多仓命令存在则检查
        if (long_command) {

            let [price, amount, delay] = long_command;

            // logger.info(`[STOP_LOSS] check command of `, price, amount, delay);
            // 判断当前价格是否高于设定的价格
            if (close_price > price) {

                // 如果高于设定的价格，标记加1
                this.constant_higher_times += 1;

                logger.info(`[STOP_LOSS] add command flag of command `, price, amount, delay, this.constant_higher_times);

                // 如果价格持续高于设定的价格并且连续低于设定的延迟次数，执行命令
                if (this.constant_higher_times > delay) {

                    logger.info(`[STOP_LOSS] start execute command of `, price, amount, delay);

                    if (amount < 0) {
                        // 如果开仓数量小于零，则执行减仓操作
                        this.engine.fast_close_buy(close_price, -amount);

                        // 减仓后重置，次数标记重置
                        this.constant_higher_times = 0;

                        // 从命令行队列中移除该命令
                        this.long_comands.shift();

                    } else if (amount > 0) {
                        // 如果开仓数量打于零，则执行加仓操作
                        this.engine.fast_open_buy(close_price, amount);
                    }
                }
            } else {
                // 如果低于设定的价格，标记重置
                this.constant_higher_times = 0;
                logger.info(`[STOP_LOSS] reset delay command of `, price, amount, delay);
            }
        }

        // 去除空仓命令集中价格最低的命令
        let short_command = this.short_comands[0];
        // 如果空仓命令存在则检查
        if (short_command) {
            let [price, amount, delay] = short_command;

            // 判断当前价格是否低于设定的价格
            if (close_price < price) {

                // 如果低于设定的价格，标记加1
                this.constant_lower_times += 1;
                logger.info(`[STOP_LOSS] add command flag of command `, price, amount, delay, this.constant_higher_times);

                // 如果价格持续低于设定的价格并且连续低于设定的延迟次数，执行命令
                if (this.constant_lower_times > delay) {

                    logger.info(`[STOP_LOSS] start execute command of `, price, amount, delay);

                    if (amount < 0) {
                        // 如果开仓数量小于零，则执行减仓操作
                        this.engine.fast_close_sell(close_price, -amount);

                        // 减仓后重置，次数标记重置
                        this.constant_lower_times = 0;

                        // 从命令行队列中移除该命令
                        this.short_comands.shift();

                    } else if (amount > 0) {
                        // 如果开仓数量大于零，则执行加仓操作
                        this.engine.fast_close_sell(close_price, amount);
                    }
                }
            } else {
                // 如果低于设定的价格，标记重置
                this.constant_higher_times = 0;
                logger.info(`[STOP_LOSS] reset delay command of `, price, amount, delay);

            }
        }

    }

    addLongCommand(command) {
        this.long_comands.push(command);
        this.long_comands = this.long_comands.sort();
    }


    addShortCommand(command) {
        this.short_comands.push(command);
        this.short_comands = this.short_comands.sort();
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

    async run() {
        await this.engine.start()
        this.engine.subKline(data => {
            this.monitor(data)
        })

        this.engine.subDepth(data => {
            this.process_depth(data)
        })
    }
}

module.exports = Swing