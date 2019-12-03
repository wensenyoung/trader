const CryptoJS = require('crypto-js');
const moment = require('moment');
const HmacSHA256 = require('crypto-js/hmac-sha256')
const http = require('./framework/httpClient');
const url = require('url')


class RestClient {
    constructor(apiKey, apiSecret){
        this.url_prefix = "https://api.hbdm.com"
        this.apiKey = apiKey || "c9359879-2cc9886b-d5689c97-b1rkuf4drg"
        this.apiSecret = apiSecret
        this.default_headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36"
        }

    }

    _sign_sha(method, url_path, data) {
        let pars = [];
        let baseBody = this._get_body();

        for(let key in baseBody){
            pars.push(key + "=" + encodeURIComponent(baseBody[key]));
        }
        for (let key in data) {
            pars.push(key + "=" + encodeURIComponent(data[key]));
        }
        let p = pars.sort().join("&");
        let host = url.parse(url_path).host;
        let cpath = url.parse(url_path).path;
        let meta = [method, host, cpath, p].join('\n');
        let hash = HmacSHA256(meta, this.apiSecret);
        let Signature = encodeURIComponent(CryptoJS.enc.Base64.stringify(hash));
        p += `&Signature=${Signature}`;
        return p;
    }

    _get_body() {
        return {
            AccessKeyId: this.apiKey,
            SignatureMethod: "HmacSHA256",
            SignatureVersion: 2,
            Timestamp: moment.utc().format('YYYY-MM-DDTHH:mm:ss'),
        };
    }

    _call_get(path){
        return http.get(path, {
            timeout: 1000,
            headers: this.default_headers
        })
    }

    _call_post(path, body) {
        let payload = this._sign_sha("POST", path, body)
        let payloadPath = `${path}?${payload}`;
        return http.post(payloadPath, body, {
            timeout: 1000,
            headers: this.default_headers
        })
    }

    getContractInfo(){
        let url = this.url_prefix + "/api/v1/contract_contract_info"
        return this._call_get(url)
    }

    getContractIndex(){
        let url = this.url_prefix + "/api/v1/contract_index"
        return this._call_get(url)
    }

    getPriceLimit(symbol, contractType){
        let url = this.url_prefix + `/api/v1/contract_price_limit?symbol=${symbol}&contract_type=${contractType}`
        return this._call_get(url)
    }

    getOpenInterest(){
        let url = this.url_prefix + `/api/v1/contract_open_interest`
        return this._call_get(url)
    }

    getMarketDepth(symbol, type){
        let url = this.url_prefix + `/market/depth?symbol=${symbol}&type=${type}`
        return this._call_get(url)
    }

    getHistoryKline(symbol, period, size){
        let url = this.url_prefix + `/market/history/kline?symbol=${symbol}&period=${period}&size=${size}`
        return this._call_get(url)
    }

    getMergeDetail(symbol){
        let url = this.url_prefix + `/market/detail/merged?symbol=${symbol}`
        return this._call_get(url)
    }

    getLatestTrade(symbol){
        let url = this.url_prefix + `/market/trade?symbol=${symbol}`
        return this._call_get(url)
    }

    /**
     *
     * @param symbol BTC_CQ BTC_CW BTC_NW
     * @param size
     * @returns {*}
     */
    getHistoryTrade(symbol, size){
        let url = this.url_prefix + `/market/history/trade?symbol=${symbol}&size=${size}`
        return this._call_get(url)
    }


    /**
     *
     * @param symbol BTC ETH
     * @returns {*}
     */
    getAccountInfo(symbol){
        let url = this.url_prefix + `/api/v1/contract_account_info`
        let body = {
            symbol: symbol
        }
        return this._call_post(url, body)
    }

    /**
     *
     * @param symbol BTC
     * @returns {*}
     */
    getPositionInfo(symbol){
        let url = this.url_prefix + `/api/v1/contract_position_info`
        let body = {
            symbol: symbol
        }
        return this._call_post(url, body)
    }

    /**
     *
     * @param symbol
     * @param contract_type
     * @param contract_code
     * @param price
     * @param volume
     * @param direction
     * @param offset
     * @param lever_rate
     * @param order_type
     * @param client_order_id
     * @returns {*}
     */
    createOrder(symbol, contract_type, contract_code, price, volume, direction, offset, lever_rate, order_type, client_order_id = ""){
        let url = this.url_prefix + `/api/v1/contract_order`
        let body = {
            symbol: symbol,
            contract_type: contract_type,
            client_order_id: client_order_id,
            contract_code: contract_code,
            price: price,
            volume: volume,
            direction: direction,
            offset: offset,
            lever_rate: lever_rate,
            order_price_type: order_type
        }
        return this._call_post(url, body)
    }


    createBatchOrder(orderList){
        let url = this.url_prefix + `/api/v1/contract_batchorder`
        let body = {
            orders_data: orderList
        }
        return this._call_post(url, body)
    }

    cancelOrder(symbol, orderId, clientId){
        let url = this.url_prefix + `/api/v1/contract_cancel`
        let body = {
            symbol: symbol,
            client_order_id: clientId || ""
        }
        return this._call_post(url, body)
    }


    cancelAllOrder(symbol){
        let url = this.url_prefix + `/api/v1/contract_cancelall`
        let body = {
            symbol: symbol,
        }
        return this._call_post(url, body)
    }


    getOrderInfo(symbol, orderId){
        let url = this.url_prefix + `/api/v1/contract_order_info`
        let body = {
            symbol: symbol,
            order_id: orderId
        }
        return this._call_post(url, body)
    }

    getOrderDetail(symbol, orderId){
        let url = this.url_prefix + `/api/v1/contract_order_detail`
        let body = {
            symbol: symbol,
            order_id: orderId
        }
        return this._call_post(url, body)
    }

    getOpenOrders(symbol){
        let url = this.url_prefix + `/api/v1/contract_openorders`
        let body = {
            symbol: symbol
        }
        return this._call_post(url, body)
    }

    getHistoryOrders(symbol, trade_type, type, status, create_date){
        let url = this.url_prefix + `/api/v1/contract_hisorders`
        let body = {
            symbol: symbol,
            trade_type: trade_type,
            type: type,
            status: status,
            create_date: create_date
        }
        return this._call_post(url, body)
    }
}


module.exports = RestClient