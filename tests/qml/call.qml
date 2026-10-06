// Headless test for the promise-based capability API: Pulsar.call(), plus the
// native clipboard convenience.
import QtQuick
import Pulsar 1.0

Item {
    Component.onCompleted: {
        Pulsar.call("fs.exists", {
            path: "."
        }).then(function (result) {
            console.log("CALLRESULT " + result);
        }).catch(function (error) {
            console.log("CALLERROR " + JSON.stringify(error));
        });

        Pulsar.clipboardWrite("hi pulsar");
        console.log("CALLCLIP " + Pulsar.clipboardText());
    }
}
