const Stop_Loss = require("./strategy/stop_loss");
const logger = require("./framework/logger")();

const stop_loss = new Stop_Loss(8000)
stop_loss.run()


process.on('uncaughtException', function (e) {
    logger.error('uncaughtException', e.message);
});

process.on("SIGINT", function () {
    logger.error("SIGINT", `===================== SERVER STOP ========================`);
    setTimeout(() => {
        process.exit(0)
    }, 50);
});
