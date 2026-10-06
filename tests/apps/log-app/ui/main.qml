import QtQuick
import Pulsar 1.0

Item {
    Component.onCompleted: console.log("from-qml")

    Connections {
        target: Pulsar
        function onLog(level, message, source) {
            if (source === "js" && String(message).indexOf("from-js-log") >= 0)
                Pulsar.emit("jsLogSeen", {})
        }
    }
}
