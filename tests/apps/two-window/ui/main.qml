import QtQuick
import QtQuick.Controls
import Pulsar 1.0

ApplicationWindow {
    visible: true
    title: "Main Window"

    Component.onCompleted: console.log("window-main-ready")

    Label {
        anchors.centerIn: parent
        text: "main: " + (Store.greeting || "")
    }
}
