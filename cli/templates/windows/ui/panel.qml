import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true

    Column {
        anchors.centerIn: parent
        spacing: 12

        Label {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Counter = " + (Store.counter ?? 0)
            font.pixelSize: 28
            font.bold: true
        }

        Row {
            spacing: 8
            anchors.horizontalCenter: parent.horizontalCenter

            Button {
                text: "+1 too"
                onClicked: Pulsar.emit("increment", {})
            }

            Button {
                text: "Close me"
                onClicked: Pulsar.call("window", {
                    label: "panel",
                    action: "close"
                })
            }
        }
    }
}
