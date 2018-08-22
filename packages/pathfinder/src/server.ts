import * as WebSocket from "ws";

import {Pathfinder} from "./pathfinder";

const wss = new WebSocket.Server({
    host: "0.0.0.0",
    port: 3008,
});

const pf = new Pathfinder();

pf.init().then(() => {

    // set up the websocket paths
    wss.on("connection", (ws) => {

        // public api
        ws.on("message", async (message) => {
            const req = JSON.parse(message.toString());

            switch (req.method) {
                case "getPath":

                    if (!req.params.destinationAsset) {
                        ws.send(JSON.stringify({err: "[getPath]: params.destinationAsset not specified"}));
                    } else if (!req.params.sourceAsset) {
                        ws.send(JSON.stringify({err: "[getPath]: params.sourceAsset not specified"}));
                    } else if (!req.params.destinationAmount) {
                        ws.send(JSON.stringify({err: "[getPath]: params.destinationAmount not specified"}));
                    }

                    try {
                        ws.send(JSON.stringify(await pf.getPath(req.params)));
                    } catch (e) {
                        ws.send(JSON.stringify({err: e.message}));
                    }

                    break;
            }
        });

    });
    console.log("Microservice ready!");

}).catch((err) => {
    console.log("Microservice failed!");
    console.log(err);
    process.exit(1);
});
