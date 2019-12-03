exports.precision = function (num, pre) {
    return parseFloat(num.toFixed(pre))
}


exports.negative = function (item) {
    let ret = ""
    switch (item){
        case "buy":
            ret = "sell"
            break
        case "sell":
            ret = "buy"
            break
        case "open":
            ret = "close"
            break
        case "close":
            ret = "open"
            break
    }
    return ret;
}
