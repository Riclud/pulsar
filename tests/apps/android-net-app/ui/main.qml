import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    width: 320
    height: 200
    title: "Net"

    Column {
        anchors.centerIn: parent
        spacing: 8

        Label { text: "text: " + (Store.text ?? "") }
        Label { text: "binary: " + (Store.binary ?? "") }
        Label { text: "error: " + (Store.error ?? "") }
    }
}
