import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    width: 320
    height: 200
    title: "Embedded"

    Component.onCompleted: {
        Pulsar.emit("ping", {});
        Pulsar.call("fs.exists", { path: "." }).then(function (result) {
            console.log("CALLRESULT " + result);
        });
    }

    Column {
        anchors.centerIn: parent
        spacing: 8

        Label { text: Store.greeting ?? "" }
        Label { text: (Store.pong ?? false) ? "pong" : "" }
    }
}
