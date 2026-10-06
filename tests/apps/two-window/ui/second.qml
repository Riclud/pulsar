import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    title: "Second Window"

    Component.onCompleted: console.log("window-second-ready")

    Label {
        anchors.centerIn: parent
        text: "second: " + (Store.greeting || "")
    }
}
