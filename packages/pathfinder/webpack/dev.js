const merge = require('webpack-merge');
const commonConfig = require('./common');
const StartServerPlugin = require("start-server-webpack-plugin");

module.exports = merge(commonConfig, {

    mode: 'development',

    /***********************************************
     * Additional Plugins
     ***********************************************/

    optimization: {
        minimize: false
    },

    plugins : [
        new StartServerPlugin({
            name: "server.js"
        }),
    ]
});

