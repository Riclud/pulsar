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
            text: Store.greeting || ""
            font.pixelSize: 20
        }

        Button {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Greet"
            onClicked: Pulsar.emit("greet", { name: "World" })
        }
    }
}
