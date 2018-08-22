const merge = require('webpack-merge');
const commonConfig = require('./common');

module.exports = merge(commonConfig, {

    mode: 'production',

    /***********************************************
     * Additional Plugins
     ***********************************************/

    optimization: {
        minimize: true
    }
});

