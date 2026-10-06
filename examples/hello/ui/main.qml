import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    width: 640
    height: 480
    title: "Hello Pulsar"

    Column {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 8

        Label { text: Store.greeting || "" }
        Label { text: Store.error || ""; color: "red" }

        Row {
            spacing: 8
            TextField { id: nameField; text: "Riclud"; width: 300 }
            Button {
                text: "Greet"
                onClicked: Pulsar.emit("greet", { name: nameField.text })
            }
        }
    }

    Component.onCompleted: {
        Pulsar.ready.connect(function () {
            Pulsar.emit("greet", { name: "World" });
        });
    }
}
