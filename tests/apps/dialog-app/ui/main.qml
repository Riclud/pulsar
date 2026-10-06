import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    title: "Dialog"

    Label {
        anchors.centerIn: parent
        text: Store.picked ? ("picked: " + Store.picked) : "no file"
    }
}
