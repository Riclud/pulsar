import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    width: 320
    height: 200
    title: "Lifecycle"

    Component.onCompleted: Pulsar.emit("ping", {})

    Column {
        anchors.centerIn: parent
        spacing: 8

        Label { text: "Lifecycle" }
        Label { text: (Store.overlay ?? false) ? "overlay open" : "overlay closed" }
        Label { text: Store.event ?? "" }
    }
}
