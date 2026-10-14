import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    title: "System"

    Label {
        anchors.centerIn: parent
        text: "scheme: " + Pulsar.colorScheme
    }
}
