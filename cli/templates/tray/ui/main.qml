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
            text: "Count: " + (Store.count ?? 0)
            font.pixelSize: 20
        }

        Button {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Bump"
            onClicked: Pulsar.emit("bump", {})
        }
    }
}
