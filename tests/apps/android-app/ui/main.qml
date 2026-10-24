import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    width: 320
    height: 200
    title: "Android"

    Component.onCompleted: Pulsar.emit("ping", {})

    Column {
        anchors.centerIn: parent
        spacing: 8

        Label { text: Store.greeting ?? "" }
        Label { text: (Store.pong ?? false) ? "pong" : "" }
    }
}
