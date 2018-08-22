const path = require('path');
const NodeExternals = require('webpack-node-externals');
const webpack = require('webpack');

const OUTPUT_PATH = path.resolve(__dirname, '../bin');

module.exports = {


    /***********************************************
     * Generic Configuration Options
     ***********************************************/


    entry: [
        path.resolve(__dirname, '../src/server.ts'),
    ],
    output: {
        path: OUTPUT_PATH,
        filename: 'server.js'
    },

    resolve: {
        extensions: ['.ts'],
    },


    /***********************************************
     * Node.js Configuration Options
     ***********************************************/

    externals: [
        NodeExternals(),
        NodeExternals({
            modulesDir: path.resolve(__dirname, "../../../node_modules")
        }
    )],
    target: "node",
    node: {
        __dirname: true
    },


    /***********************************************
     * File Loaders
     ***********************************************/

    module: {
        rules: [
            {
                test: /\.node$/,
                use: {
                    loader: 'node-loader',
                },

            },

            {
                test: /\.(ts)?$/,
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        cacheDirectory: true,
                        babelrc: false,
                        presets: [
                            "@babel/typescript",
                        ],
                        plugins: [
                            "@babel/plugin-transform-runtime",
                            "transform-decorators-legacy",
                            "transform-class-properties",
                        ]
                    }
                }
            },

        ]
    },

    /***********************************************
     * Plugins
     ***********************************************/

    plugins : [
        new webpack.NoEmitOnErrorsPlugin(),
        new webpack.DefinePlugin({
            "process.env": {
                "BUILD_TARGET": JSON.stringify('server')
            }
        })
    ]
};

